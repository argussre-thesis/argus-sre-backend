/// <reference types="node" />
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import {
  createMcpServerService,
  deleteMcpServerService,
  listMcpServersService,
  mcpServersForAgent,
  updateMcpServerService,
} from "../src/model/mcpServerModel";
import { Prisma } from "../src/prisma/generated/prisma/client";
import { createMcpServerSchema, updateMcpServerSchema } from "../src/schemas/mcpServer.schema";
import { OrgContext } from "../src/types/express";
import { decryptSecret, encryptSecret } from "../src/utils/token";

const valid = { name: "prod-grafana", url: "https://mcp.example.com/mcp", token: "abc.def_1" };

test("MCP server input is trimmed, and its name and token are checked", () => {
  assert.deepEqual(
    createMcpServerSchema.parse({
      name: " prod-grafana ",
      url: " https://mcp.example.com/mcp ",
      token: " abc.def_1 ",
    }),
    valid,
  );

  for (const body of [
    { ...valid, name: "" },
    { ...valid, name: "Grafana" },
    { ...valid, name: "my grafana" },
    { ...valid, name: "my_grafana" },
    { ...valid, name: "a".repeat(21) },
    { ...valid, url: " " },
    { ...valid, url: `https://example.com/${"a".repeat(2048)}` },
    { ...valid, token: " " },
    { ...valid, token: "a b" },
    { ...valid, token: "a\r\nX-Injected: yes" },
    { ...valid, token: "a".repeat(8193) },
    { name: valid.name, url: valid.url },
    { ...valid, organizationId: "org_other" },
    { ...valid, encryptedToken: "x" },
  ]) {
    assert.equal(createMcpServerSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test("MCP server takes headers instead of a token, and header names and values are checked", () => {
  const { token: _token, ...noToken } = valid;
  const withHeaders = { ...noToken, headers: { "api-key": "abc", Authorization: "Token abc" } };
  assert.deepEqual(createMcpServerSchema.parse(withHeaders), withHeaders);
  assert.deepEqual(createMcpServerSchema.parse({ ...noToken, headers: { "api-key": " abc " } }).headers, { "api-key": "abc" });
  assert.deepEqual(updateMcpServerSchema.parse({ headers: { "api-key": "abc" } }), { headers: { "api-key": "abc" } });

  for (const headers of [
    {},
    { "bad name": "x" },
    { "bad:name": "x" },
    { "api-key": "" },
    { "api-key": " " },
    { "api-key": "a\r\nX-Injected: yes" },
    { "api-key": "é" },
    { "api-key": "a".repeat(8193) },
    { "api-key": "x", "API-KEY": "y" },
    { Host: "169.254.169.254" },
    { "content-length": "0" },
    { "Mcp-Session-Id": "x" },
    Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`h${i}`, "x"])),
  ]) {
    assert.equal(createMcpServerSchema.safeParse({ ...noToken, headers }).success, false, JSON.stringify(headers));
  }

  assert.equal(createMcpServerSchema.safeParse({ ...valid, headers: { "api-key": "x" } }).success, false);
  assert.equal(updateMcpServerSchema.safeParse({ token: "x", headers: { "api-key": "x" } }).success, false);
});

test("MCP server update takes any subset of fields but not none", () => {
  assert.deepEqual(updateMcpServerSchema.parse({ url: valid.url }), { url: valid.url });

  for (const body of [{}, { token: "" }, { name: "Grafana" }, { encryptedToken: "x" }]) {
    assert.equal(updateMcpServerSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

const org = { organizationId: "org_1" } as OrgContext;
const PUBLIC_URL = "https://8.8.8.8/mcp";
const OTHER_PUBLIC_URL = "https://1.1.1.1/mcp";
const stored = { id: "mcp_1", name: "prod-grafana", url: PUBLIC_URL };

type Args = { where?: unknown; data?: Record<string, unknown>; select?: Record<string, unknown> };
const calls: { method: string; args: Args }[] = [];
const argsOf = (method: string) => calls.find((call) => call.method === method)?.args;

const fake = (current: unknown, deleted = 1, writeError?: Error) => {
  const answer = (method: string, result: unknown) => async (args: Args) => {
    calls.push({ method, args });
    if (writeError && (method === "create" || method === "update")) throw writeError;
    return result;
  };
  (prisma as unknown as Record<string, unknown>).mcpServer = {
    findMany: answer("findMany", [stored]),
    findFirst: answer("findFirst", current),
    create: answer("create", stored),
    update: answer("update", stored),
    deleteMany: answer("deleteMany", { count: deleted }),
  };
};

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("failed", { code, clientVersion: "test" });

beforeEach(() => {
  calls.length = 0;
});

test("the agent gets the org's servers with their tokens, and an unreadable token skips only that server", async () => {
  const wheres: unknown[] = [];
  const corrupt = encryptSecret("old-token");
  corrupt[20] = corrupt[20]! ^ 1;
  (prisma as unknown as Record<string, unknown>).mcpServer = {
    findMany: async ({ where }: Args) => {
      wheres.push(where);
      return [
        { name: "broken", url: PUBLIC_URL, encryptedToken: corrupt },
        { name: "good", url: OTHER_PUBLIC_URL, encryptedToken: encryptSecret("good-token") },
      ];
    },
  };

  assert.deepEqual(await mcpServersForAgent("org_1"), [{ name: "good", url: OTHER_PUBLIC_URL, token: "good-token" }]);
  assert.deepEqual(wheres, [{ organizationId: "org_1" }]);
});

test("the agent gets headers for a server stored with headers", async () => {
  (prisma as unknown as Record<string, unknown>).mcpServer = {
    findMany: async () => [
      { name: "newrelic", url: PUBLIC_URL, encryptedToken: null, encryptedHeaders: encryptSecret('{"api-key":"secret"}') },
    ],
  };

  assert.deepEqual(await mcpServersForAgent("org_1"), [{ name: "newrelic", url: PUBLIC_URL, headers: { "api-key": "secret" } }]);
});

test("no query selects the token, and every query is scoped to the org", async () => {
  fake(stored);
  await listMcpServersService(org);
  await createMcpServerService(org, { ...valid, url: PUBLIC_URL });
  await updateMcpServerService(org, "mcp_1", { name: "new-name" });
  await deleteMcpServerService(org, "mcp_1");

  for (const { method, args } of calls) {
    assert.equal(args.select?.encryptedToken, undefined, method);
    assert.equal(args.select?.encryptedHeaders, undefined, method);
    if (method !== "create") {
      assert.equal((args.where as { organizationId: string }).organizationId, "org_1", method);
    }
  }
  assert.equal(argsOf("create")?.data?.organizationId, "org_1");
});

test("adding a server stores the token encrypted", async () => {
  fake(null);
  const result = await createMcpServerService(org, { ...valid, url: PUBLIC_URL });

  assert.deepEqual(result, { success: true, data: stored });
  const { encryptedToken, ...data } = argsOf("create")?.data ?? {};
  assert.deepEqual(data, { organizationId: "org_1", name: "prod-grafana", url: PUBLIC_URL, encryptedHeaders: null, headerNames: [] });
  assert.equal(decryptSecret(encryptedToken as Uint8Array), "abc.def_1");
});

test("adding a server with headers stores them encrypted and keeps their names readable", async () => {
  fake(null);
  await createMcpServerService(org, { name: valid.name, url: PUBLIC_URL, headers: { "api-key": "secret" } });

  const { encryptedHeaders, ...data } = argsOf("create")?.data ?? {};
  assert.deepEqual(data, { organizationId: "org_1", name: "prod-grafana", url: PUBLIC_URL, encryptedToken: null, headerNames: ["api-key"] });
  assert.equal(decryptSecret(encryptedHeaders as Uint8Array), '{"api-key":"secret"}');
});

test("adding a server with a bad URL or a taken name is refused", async () => {
  fake(null);
  for (const url of ["http://8.8.8.8/mcp", "https://10.0.0.1/mcp", "https://169.254.169.254/"]) {
    const result = await createMcpServerService(org, { ...valid, url });
    assert.equal(result.success === false && result.code, "INVALID_MCP_URL", url);
  }
  assert.equal(argsOf("create"), undefined);

  fake(null, 1, prismaError("P2002"));
  const taken = await createMcpServerService(org, { ...valid, url: PUBLIC_URL });
  assert.equal(taken.success === false && taken.code, "MCP_SERVER_NAME_TAKEN");
});

test("changing the URL needs the token again, and a new URL is checked", async () => {
  fake(stored);

  const noToken = await updateMcpServerService(org, "mcp_1", { url: OTHER_PUBLIC_URL });
  assert.equal(noToken.success === false && noToken.code, "MCP_TOKEN_REQUIRED");

  const nameOnly = await updateMcpServerService(org, "mcp_1", { url: OTHER_PUBLIC_URL, name: "new-name" });
  assert.equal(nameOnly.success === false && nameOnly.code, "MCP_TOKEN_REQUIRED");

  const privateUrl = await updateMcpServerService(org, "mcp_1", { url: "https://10.0.0.1/mcp", token: "new" });
  assert.equal(privateUrl.success === false && privateUrl.code, "INVALID_MCP_URL");
  assert.equal(argsOf("update"), undefined);

  const changed = await updateMcpServerService(org, "mcp_1", { url: OTHER_PUBLIC_URL, token: "new" });
  assert.equal(changed.success, true);
  assert.equal(argsOf("update")?.data?.url, OTHER_PUBLIC_URL);
  assert.equal(decryptSecret(argsOf("update")?.data?.encryptedToken as Uint8Array), "new");

  calls.length = 0;
  const withHeaders = await updateMcpServerService(org, "mcp_1", { url: OTHER_PUBLIC_URL, headers: { "api-key": "new" } });
  assert.equal(withHeaders.success, true);
  assert.equal(decryptSecret(argsOf("update")?.data?.encryptedHeaders as Uint8Array), '{"api-key":"new"}');
});

test("sending one kind of credential clears the other", async () => {
  fake(stored);

  await updateMcpServerService(org, "mcp_1", { headers: { "api-key": "new" } });
  assert.equal(argsOf("update")?.data?.encryptedToken, null);
  assert.deepEqual(argsOf("update")?.data?.headerNames, ["api-key"]);

  calls.length = 0;
  await updateMcpServerService(org, "mcp_1", { token: "new" });
  assert.equal(argsOf("update")?.data?.encryptedHeaders, null);
  assert.deepEqual(argsOf("update")?.data?.headerNames, []);
});

test("other edits keep the stored token", async () => {
  fake(stored);

  for (const input of [{ name: "new-name" }, { url: PUBLIC_URL }, { url: PUBLIC_URL, name: "new-name" }]) {
    calls.length = 0;
    const result = await updateMcpServerService(org, "mcp_1", input);
    assert.equal(result.success, true, JSON.stringify(input));
    assert.deepEqual(argsOf("update")?.data, input);
  }

  calls.length = 0;
  await updateMcpServerService(org, "mcp_1", { token: "rotated" });
  assert.equal(decryptSecret(argsOf("update")?.data?.encryptedToken as Uint8Array), "rotated");
});

test("updating or deleting a server that isn't in the org answers 404", async () => {
  fake(null, 0);

  const updated = await updateMcpServerService(org, "mcp_other", { name: "new-name" });
  assert.equal(updated.success === false && updated.code, "MCP_SERVER_NOT_FOUND");
  assert.equal(argsOf("update"), undefined);

  const deleted = await deleteMcpServerService(org, "mcp_other");
  assert.equal(deleted.success === false && deleted.code, "MCP_SERVER_NOT_FOUND");

  fake(stored, 1, prismaError("P2025"));
  const gone = await updateMcpServerService(org, "mcp_1", { name: "new-name" });
  assert.equal(gone.success === false && gone.code, "MCP_SERVER_NOT_FOUND");
});

test("renaming to a taken name answers 409", async () => {
  fake(stored, 1, prismaError("P2002"));
  const result = await updateMcpServerService(org, "mcp_1", { name: "taken" });
  assert.equal(result.success === false && result.code, "MCP_SERVER_NAME_TAKEN");
});
