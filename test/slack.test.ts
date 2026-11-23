import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { slackReport } from "../src/lib/slack";
import { conversationSlackMessage } from "../src/model/slackChatModel";
import { createInstallState, incidentSlackHeader, splitSlackReport, verifyInstallState } from "../src/model/slackModel";
import { conversationEndedSchema } from "../src/schemas/conversation.schema";
import { env } from "../src/utils/env";

test("the incident message links the incident and alerts, counts the rest, and escapes Slack's control characters", () => {
  const header = incidentSlackHeader({
    id: "inc_1",
    title: "CPU <!channel> & co",
    cluster: { name: "prod-eu" },
    alerts: [
      { labels: { alertname: "HighCPU" }, annotations: { summary: "CPU > 90%" }, generatorUrl: "https://grafana/x?a=1&b=2" },
      { labels: { alertname: "PodRestarting" }, annotations: {}, generatorUrl: null },
    ],
    _count: { alerts: 7 },
  });

  assert.equal(
    header,
    [
      `:rotating_light: *<${env.FRONTEND_URL}/incidents/inc_1|CPU &lt;!channel&gt; &amp; co>*`,
      "Cluster `prod-eu` · 7 alerts",
      "• <https://grafana/x?a=1&amp;b=2|HighCPU>: CPU &gt; 90%",
      "• PodRestarting",
      "and 5 more",
    ].join("\n"),
  );
});

test("the report's **bold** becomes Slack's *bold*, still escaped", () => {
  assert.equal(
    slackReport("**Root cause:** the **api** pod & <!channel>, `a*b`"),
    "*Root cause:* the *api* pod &amp; &lt;!channel&gt;, `a*b`",
  );
});

test("Summary, Root cause and Suggested fix stay on top, Evidence and Not checked go in the reply, headings bold", () => {
  const report = [
    "## Summary", "API down.",
    "## Root cause", "Bad **image**.",
    "## Evidence", "- pod crashed `list_pods {}`",
    "### Detail", "x",
    "## Suggested fix", "Roll back.",
    "## Not checked", "Logs.",
  ].join("\n");

  assert.deepEqual(splitSlackReport(report), {
    main: "*Summary*\nAPI down.\n*Root cause*\nBad *image*.\n*Suggested fix*\nRoll back.",
    reply: "*Evidence*\n- pod crashed `list_pods {}`\n*Detail*\nx\n*Not checked*\nLogs.",
  });
});

test("a report without an Evidence heading stays whole on top", () => {
  assert.deepEqual(splitSlackReport("No headings here."), { main: "No headings here.", reply: "" });
});

const turn = { tenantId: "org_abc", externalId: "C123:1730.456", status: "done" as const, reply: "ok", error: null };

test("a chat reply goes to the thread in externalId, formatted and escaped for Slack", () => {
  assert.deepEqual(conversationSlackMessage({ ...turn, reply: "## Pods\n**api** is down <!channel>" }), {
    channel: "C123",
    thread_ts: "1730.456",
    text: "*Pods*\n*api* is down &lt;!channel&gt;",
  });
});

test("a failed or empty chat turn posts a fixed line, never the error", () => {
  const failed = { ...turn, status: "failed" as const, reply: null, error: "connect ECONNREFUSED 10.0.0.5:8081" };

  for (const ended of [failed, { ...turn, reply: "" }, { ...turn, reply: null }]) {
    assert.equal(conversationSlackMessage(ended).text, "Sorry, I couldn't answer that. Please try again.");
  }
});

test("an externalId that isn't <channel>:<thread_ts> is refused", () => {
  assert.equal(conversationEndedSchema.safeParse(turn).success, true);
  for (const externalId of ["", "C123", "C123:", ":1730.456"]) {
    assert.equal(conversationEndedSchema.safeParse({ ...turn, externalId }).success, false);
  }
});

test("install state names the org and admin that started it", () => {
  const state = createInstallState("org_abc", "user_xyz");

  assert.deepEqual(verifyInstallState(state), { organizationId: "org_abc", userId: "user_xyz" });
});

test("install state is refused when edited, malformed, or older than 10 minutes", () => {
  const state = createInstallState("org_abc", "user_xyz");

  assert.equal(verifyInstallState(state.replace("org_abc", "org_evil")), null);
  assert.equal(verifyInstallState(`${state}x`), null);
  for (const bad of ["", "a.b.c", "a.b.c.d.e", state.split(".").slice(0, 3).join(".")]) {
    assert.equal(verifyInstallState(bad), null);
  }

  mock.timers.enable({ apis: ["Date"], now: Date.now() + 11 * 60_000 });
  try {
    assert.equal(verifyInstallState(state), null);
  } finally {
    mock.timers.reset();
  }
});
