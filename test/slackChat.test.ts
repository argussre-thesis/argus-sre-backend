import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { slack, verifySlackSignature } from "../src/lib/slack";
import { conversationText, handleSlackMentionService } from "../src/model/slackChatModel";
import { SlackMention } from "../src/schemas/conversation.schema";
import { env } from "../src/utils/env";
import { encryptSecret } from "../src/utils/token";

const BOT = "UBOT";
const inThread: SlackMention = { type: "app_mention", channel: "C1", ts: "103.0", thread_ts: "100.0", user: "U1", text: "why?" };
const topLevel: SlackMention = { type: "app_mention", channel: "C1", ts: "103.0", user: "U1", text: "why?" };

test("a signature is accepted only for this body, this timestamp and our secret, within 5 minutes", () => {
  const now = String(Math.floor(Date.now() / 1000));
  const body = Buffer.from('{"a":1}');
  const sign = (timestamp: string, signed: Buffer | string = body, secret = env.SLACK_SIGNING_SECRET) =>
    `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${signed}`).digest("hex")}`;

  assert.equal(verifySlackSignature(body, now, sign(now)), true);
  assert.equal(verifySlackSignature(Buffer.from('{"a":2}'), now, sign(now)), false);
  assert.equal(verifySlackSignature(body, now, sign(now, body, "not-our-secret")), false);
  assert.equal(verifySlackSignature(body, now, "v0=short"), false);
  assert.equal(verifySlackSignature(body, undefined, sign(now)), false);
  assert.equal(verifySlackSignature(body, now, undefined), false);

  const stale = String(Number(now) - 6 * 60);
  assert.equal(verifySlackSignature(body, stale, sign(stale)), false);
  assert.equal(verifySlackSignature(body, "soon", sign("soon")), false);
});

test("the model gets one line per message, ours marked, messages with no text skipped", () => {
  const messages = [
    { user: "U2", text: "it's down", ts: "100.0" },
    { user: BOT, text: "The pods crashed.", ts: "101.0" },
    { user: "U3", ts: "101.5" },
    { text: "deploy finished", ts: "102.0" },
    { user: "U1", text: "why?", ts: "103.0" },
  ];

  assert.equal(
    conversationText(messages, inThread, BOT),
    "U2: it's down\nargus (you): The pods crashed.\nbot: deploy finished\nU1: why?",
  );
});

test("with no readable messages, or a read that misses the mention, the model gets the mention and is told", () => {
  const onlyTheMention = "(Earlier messages could not be read.)\nU1: why?";

  assert.equal(conversationText(null, inThread, BOT), onlyTheMention);
  assert.equal(conversationText([], inThread, BOT), onlyTheMention);
  assert.equal(conversationText([{ user: "U2", text: "older", ts: "100.0" }], inThread, BOT), onlyTheMention);
});

// The flow, with the database, Slack and the agent service all faked.
const agentCalls: { url: string | undefined; body: Record<string, unknown> }[] = [];
let agentStatus = 202;
const agent = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    agentCalls.push({ url: req.url, body: JSON.parse(body) });
    const answer = agentStatus === 202 ? { success: true, message: "ok", data: null } : { success: false };
    res.writeHead(agentStatus, { "content-type": "application/json" }).end(JSON.stringify(answer));
  });
});

type Fakes = {
  installation?: unknown;
  incident?: unknown;
  replies?: () => Promise<unknown>;
  mcpServers?: unknown[];
};
const reads: { method: string; args: unknown }[] = [];
const posts: unknown[] = [];

const fake = ({ installation, incident = null, replies, mcpServers = [] }: Fakes) => {
  const db = prisma as unknown as Record<string, unknown>;
  db.mcpServer = { findMany: async () => mcpServers };
  db.slackInstallation = { findUnique: async () => installation };
  db.cluster = { findMany: async () => [{ name: "civo-fra1" }, { name: "aws-eu" }] };
  db.incident = { findFirst: async () => incident };
  const read = (method: string, answer?: () => Promise<unknown>) => async (args: unknown) => {
    reads.push({ method, args });
    return answer?.();
  };
  Object.assign(slack.conversations, { replies: read("replies", replies), history: read("history") });
  Object.assign(slack.chat, {
    postMessage: async (message: unknown) => {
      posts.push(message);
      return { ts: "200.0" };
    },
  });
};

const installed = {
  organizationId: "org_1",
  botUserId: BOT,
  encryptedToken: encryptSecret("xoxb-fake"),
  organization: { conversationLevel: "high" },
};
const alerts = [{ status: "FIRING", startsAt: "2026-11-04T10:00:00.000Z", endsAt: null, labels: {}, annotations: {} }];

before(async () => {
  await new Promise<void>((resolve) => agent.listen(0, "127.0.0.1", resolve));
  env.AGENT_SERVICE_URL = `http://127.0.0.1:${(agent.address() as AddressInfo).port}`;
  env.SLACK_THREAD_MESSAGES = 5;
});
after(() => agent.close());
beforeEach(() => {
  agentCalls.length = 0;
  reads.length = 0;
  posts.length = 0;
  agentStatus = 202;
});

test("a mention in an incident's thread sends the thread's latest messages, the clusters and the incident", async () => {
  const older = Array.from({ length: 6 }, (_, i) => ({ user: "U2", text: `m${i}`, ts: `10${i}.0` }));
  fake({
    installation: installed,
    incident: { id: "inc_1", title: "API down", cluster: { name: "civo-fra1" }, alerts },
    replies: async () => ({ messages: [...older, { user: "U1", text: "why?", ts: "103.0" }], has_more: false }),
    mcpServers: [{ name: "grafana", url: "https://mcp.example.com/", encryptedToken: encryptSecret("mcp-token") }],
  });

  await handleSlackMentionService("T1", inThread);

  assert.deepEqual(reads, [
    { method: "replies", args: { token: "xoxb-fake", channel: "C1", latest: "103.0", inclusive: true, ts: "100.0", limit: 200 } },
  ]);
  assert.deepEqual(agentCalls, [
    {
      url: "/api/v1/tenants/org_1/conversations/messages",
      body: {
        externalId: "C1:100.0",
        text: "U2: m2\nU2: m3\nU2: m4\nU2: m5\nU1: why?",
        clusters: ["civo-fra1", "aws-eu"],
        mcpServers: [{ name: "grafana", url: "https://mcp.example.com/", token: "mcp-token" }],
        level: "high",
        incident: { incidentId: "inc_1", cluster: "civo-fra1", title: "API down", alerts },
      },
    },
  ]);
  assert.deepEqual(posts, []);
});

test("a top-level mention sends only the mention, reads nothing from Slack, and its reply goes under the mention", async () => {
  fake({ installation: installed });

  await handleSlackMentionService("T1", topLevel);

  assert.deepEqual(reads, []);
  assert.deepEqual(agentCalls[0]?.body, { externalId: "C1:103.0", text: "U1: why?", clusters: ["civo-fra1", "aws-eu"], mcpServers: [], level: "high" });
});

test("a thread too long to read, or a refused read, still runs on the mention", async () => {
  const onlyTheMention = "(Earlier messages could not be read.)\nU1: why?";

  fake({ installation: installed, replies: async () => ({ messages: [{ user: "U2", text: "first", ts: "100.0" }], has_more: true }) });
  await handleSlackMentionService("T1", inThread);
  assert.equal(agentCalls.at(-1)?.body.text, onlyTheMention);

  fake({ installation: installed, replies: () => Promise.reject(new Error("ratelimited")) });
  await handleSlackMentionService("T1", inThread);
  assert.equal(agentCalls.at(-1)?.body.text, onlyTheMention);
});

test("an incident whose cluster was deleted runs without the incident", async () => {
  fake({
    installation: installed,
    incident: { id: "inc_1", title: "API down", cluster: null, alerts },
    replies: async () => ({ messages: [{ user: "U1", text: "why?", ts: "103.0" }] }),
  });

  await handleSlackMentionService("T1", inThread);

  assert.equal("incident" in (agentCalls[0]?.body ?? {}), false);
});

test("when the agent service can't take the mention, a short line goes in the thread", async () => {
  agentStatus = 500;
  fake({ installation: installed, replies: async () => ({ messages: [{ user: "U1", text: "why?", ts: "103.0" }] }) });

  await handleSlackMentionService("T1", inThread);

  assert.deepEqual(posts, [
    { token: "xoxb-fake", channel: "C1", thread_ts: "100.0", text: "Sorry, I couldn't answer that. Please try again." },
  ]);
});

test("a workspace with no installation is ignored", async () => {
  fake({ installation: null });

  await handleSlackMentionService("T_unknown", inThread);

  assert.deepEqual([reads, agentCalls, posts], [[], [], []]);
});
