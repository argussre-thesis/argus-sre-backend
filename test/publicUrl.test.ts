/// <reference types="node" />
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { test } from "node:test";
import { publicHttpsUrlProblem } from "../src/utils/publicUrl";

test("a public https address passes, with a path, port or query", async () => {
  for (const url of [
    "https://8.8.8.8/mcp",
    "https://8.8.8.8:8443/mcp?team=a",
    "https://[2001:4860:4860::8888]/mcp",
    "https://[::ffff:8.8.8.8]/mcp",
  ]) {
    assert.equal(await publicHttpsUrlProblem(url), null, url);
  }
});

test("anything but plain https is refused", async () => {
  for (const [url, problem] of [
    ["not a url", /valid URL/],
    ["", /valid URL/],
    ["http://8.8.8.8/mcp", /https/],
    ["ftp://8.8.8.8/mcp", /https/],
    ["https://user:secret@8.8.8.8/mcp", /username or password/],
    ["https://user@8.8.8.8/mcp", /username or password/],
  ] as const) {
    assert.match((await publicHttpsUrlProblem(url)) ?? "passed", problem, url);
  }
});

test("non-public addresses are refused, however they're written", async () => {
  for (const url of [
    "https://0.0.0.0/",
    "https://10.0.0.1/",
    "https://100.64.0.1/",
    "https://127.0.0.1/",
    "https://169.254.169.254/opc/v2/instance/",
    "https://172.16.0.1/",
    "https://192.168.1.1/",
    "https://224.0.0.1/",
    "https://[::]/",
    "https://[::1]/",
    "https://[fd00::1]/",
    "https://[fe80::1]/",
    "https://[ff02::1]/",
    "https://[::ffff:10.0.0.1]/",
    "https://[::ffff:169.254.169.254]/",
    "https://[64:ff9b::a00:1]/",
    "https://[2002:a00:1::]/",
    "https://127.1/",
    "https://2130706433/",
    "https://0x7f.0.0.1/",
    "https://localhost/",
  ]) {
    assert.match((await publicHttpsUrlProblem(url)) ?? "passed", /not a public address/, url);
  }
});

test("a host passes only if every address it returns is public", async (t) => {
  const answer = (...addresses: string[]) =>
    t.mock.method(dns, "lookup", async () =>
      addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
    );

  answer("8.8.8.8", "2001:4860:4860::8888");
  assert.equal(await publicHttpsUrlProblem("https://mcp.example.com/mcp"), null);
  t.mock.restoreAll();

  answer("8.8.8.8", "10.0.0.1");
  assert.match((await publicHttpsUrlProblem("https://mcp.example.com/mcp")) ?? "passed", /not a public address/);
  t.mock.restoreAll();

  answer("8.8.8.8", "::1");
  assert.match((await publicHttpsUrlProblem("https://mcp.example.com/mcp")) ?? "passed", /not a public address/);
});

test("a host that doesn't resolve is refused", async (t) => {
  t.mock.method(dns, "lookup", async () => {
    throw new Error("getaddrinfo ENOTFOUND");
  });

  assert.match((await publicHttpsUrlProblem("https://mcp.example.com/mcp")) ?? "passed", /Could not find the host mcp\.example\.com/);
});
