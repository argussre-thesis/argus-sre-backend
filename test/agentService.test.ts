import assert from "node:assert/strict";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { agentServiceRequest } from "../src/lib/agentService";
import { prisma } from "../src/lib/prisma";
import { getInvestigationMessagesService, getInvestigationService, investigateIncidentService } from "../src/model/incidentModel";
import { env } from "../src/utils/env";
import { encryptSecret } from "../src/utils/token";

// A fake agent service: records each request and answers with the last `answer`.
let reply = { status: 200, body: "" };
const answer = (status: number, body: unknown) => {
  reply = { status, body: typeof body === "string" ? body : JSON.stringify(body) };
};
const requests: { method: string | undefined; url: string | undefined; authorization: string | undefined; body: string }[] = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body });
    res.writeHead(reply.status, { "content-type": "application/json" }).end(reply.body);
  });
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  env.AGENT_SERVICE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test("sends the method, path, token and JSON body; a success becomes its data", async () => {
  answer(202, { success: true, message: "Investigation started", data: { id: "inv_1" } });
  const result = await agentServiceRequest("POST", "/tenants/org_1/investigations", { incidentId: "inc_1" });

  assert.deepEqual(result, { success: true, data: { id: "inv_1" } });
  assert.deepEqual(requests.at(-1), {
    method: "POST",
    url: "/api/v1/tenants/org_1/investigations",
    authorization: `Bearer ${env.BACKEND_AGENT_SERVICE_TOKEN}`,
    body: '{"incidentId":"inc_1"}',
  });
});

test("a GET sends no body", async () => {
  answer(200, { success: true, message: "ok", data: { investigations: [] } });
  await agentServiceRequest("GET", "/tenants/org_1/investigations?incidentId=inc_1");

  assert.equal(requests.at(-1)?.url, "/api/v1/tenants/org_1/investigations?incidentId=inc_1");
  assert.equal(requests.at(-1)?.body, "");
});

test("expected errors pass through, anything else is SERVICE_UNAVAILABLE", async () => {
  const error = (code: string, details: unknown = null) => ({
    success: false,
    error: { code, message: `${code} message`, details },
  });
  const cases: [status: number, body: unknown, expected: [number, string]][] = [
    [409, error("INVESTIGATION_RUNNING", { id: "inv_1" }), [409, "INVESTIGATION_RUNNING"]],
    [404, error("INVESTIGATION_NOT_FOUND"), [404, "INVESTIGATION_NOT_FOUND"]],
    // A wrong AGENT_SERVICE_URL path, not a missing investigation.
    [404, error("ROUTE_NOT_FOUND"), [503, "SERVICE_UNAVAILABLE"]],
    [401, error("INVALID_INTERNAL_TOKEN"), [503, "SERVICE_UNAVAILABLE"]],
    [400, error("VALIDATION_ERROR"), [503, "SERVICE_UNAVAILABLE"]],
    [500, error("INTERNAL_SERVER_ERROR"), [503, "SERVICE_UNAVAILABLE"]],
    [502, "<html>Bad Gateway</html>", [503, "SERVICE_UNAVAILABLE"]],
    [200, { success: false }, [503, "SERVICE_UNAVAILABLE"]],
  ];
  for (const [status, body, [expectedStatus, expectedCode]] of cases) {
    answer(status, body);
    const result = await agentServiceRequest("GET", "/tenants/org_1/investigations/inv_1");
    assert.ok(!result.success);
    assert.deepEqual([result.status, result.code], [expectedStatus, expectedCode], JSON.stringify(body));
  }

  answer(409, error("INVESTIGATION_RUNNING", { id: "inv_1" }));
  assert.deepEqual(await agentServiceRequest("POST", "/tenants/org_1/investigations", {}), {
    success: false,
    status: 409,
    code: "INVESTIGATION_RUNNING",
    message: "INVESTIGATION_RUNNING message",
    details: { id: "inv_1" },
  });
});

test("an unreachable agent service is SERVICE_UNAVAILABLE", async () => {
  const closed = createServer();
  await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const { port } = closed.address() as AddressInfo;
  await new Promise((resolve) => closed.close(resolve));

  const url = env.AGENT_SERVICE_URL;
  env.AGENT_SERVICE_URL = `http://127.0.0.1:${port}`;
  try {
    const result = await agentServiceRequest("GET", "/tenants/org_1/investigations/inv_1");
    assert.ok(!result.success);
    assert.deepEqual([result.status, result.code], [503, "SERVICE_UNAVAILABLE"]);
  } finally {
    env.AGENT_SERVICE_URL = url;
  }
});

test("starting an investigation sends the org's MCP servers; a refused one doesn't read them", async () => {
  const org = { organizationId: "org_1", membershipId: "m_1", role: "org:member" };
  const incident = {
    title: "API down",
    isTest: false,
    organization: { investigationLevel: "medium" },
    cluster: { name: "civo-fra1" },
    alerts: [],
  };
  let serverReads = 0;
  const fake = (found: unknown) =>
    Object.assign(prisma as unknown as Record<string, unknown>, {
      incident: { findFirst: async () => found, updateMany: async () => ({ count: 1 }) },
      mcpServer: {
        findMany: async () => {
          serverReads++;
          return [{ name: "grafana", url: "https://mcp.example.com/", encryptedToken: encryptSecret("mcp-token") }];
        },
      },
    });

  answer(202, { success: true, message: "Investigation started", data: { id: "inv_1" } });
  fake(incident);
  assert.ok((await investigateIncidentService(org, "inc_1")).success);
  assert.equal(requests.at(-1)?.url, "/api/v1/tenants/org_1/investigations");
  assert.deepEqual(JSON.parse(requests.at(-1)!.body), {
    incidentId: "inc_1",
    cluster: "civo-fra1",
    title: "API down",
    alerts: [],
    mcpServers: [{ name: "grafana", url: "https://mcp.example.com/", token: "mcp-token" }],
    level: "medium",
  });
  assert.equal(serverReads, 1);

  const sent = requests.length;
  fake({ ...incident, isTest: true });
  assert.ok(!(await investigateIncidentService(org, "inc_1")).success);
  assert.deepEqual([serverReads, requests.length], [1, sent]);
});

test("an investigation id can't leave the org's tenant path", async () => {
  answer(200, { success: true, message: "ok", data: { messages: [] } });
  const org = { organizationId: "org_1", membershipId: "m_1", role: "org:member" };
  await getInvestigationService(org, "../../org_2/investigations/inv_2");
  assert.equal(requests.at(-1)?.url, "/api/v1/tenants/org_1/investigations/..%2F..%2Forg_2%2Finvestigations%2Finv_2");
  await getInvestigationMessagesService(org, "../../org_2/investigations/inv_2");
  assert.equal(requests.at(-1)?.url, "/api/v1/tenants/org_1/investigations/..%2F..%2Forg_2%2Finvestigations%2Finv_2/messages");
});
