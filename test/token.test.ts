import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { requireInternalToken } from "../src/middleware/internalAuth";
import { env } from "../src/utils/env";
import {
  ALERT_TOKEN_PREFIX,
  decryptSecret,
  encryptSecret,
  generateToken,
  hashToken,
  RUNNER_TOKEN_PREFIX,
} from "../src/utils/token";

test("secrets decrypt back, encrypt differently each time, and tampered bytes are refused", () => {
  const stored = encryptSecret("xoxb-secret");

  assert.equal(decryptSecret(stored), "xoxb-secret");
  assert.notDeepEqual(stored, encryptSecret("xoxb-secret"));
  assert.ok(!stored.toString("latin1").includes("xoxb-secret"));

  stored[stored.length - 1]! ^= 1;
  assert.throws(() => decryptSecret(stored));
});

test("tokens are unique, prefixed, and stored only as their hash", () => {
  const a = generateToken(RUNNER_TOKEN_PREFIX);
  const b = generateToken(RUNNER_TOKEN_PREFIX);

  assert.match(a.token, /^argus_rt_[A-Za-z0-9_-]{43}$/);
  assert.match(generateToken(ALERT_TOKEN_PREFIX).token, /^argus_wh_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.tokenHash, hashToken(a.token));
  assert.ok(!a.tokenHash.includes(a.token));
});

const callInternalAuth = (authorization?: string) => {
  let status = 0;
  let nextCalled = false;
  const req = { headers: { authorization } } as Request;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {},
  } as unknown as Response;
  requireInternalToken(env.GATEWAY_BACKEND_TOKEN)(req, res, (() => (nextCalled = true)) as NextFunction);
  return { status, nextCalled };
};

test("internal auth accepts only the exact bearer token", () => {
  assert.deepEqual(callInternalAuth(`Bearer ${env.GATEWAY_BACKEND_TOKEN}`), {
    status: 0,
    nextCalled: true,
  });

  for (const header of [
    undefined,
    "",
    env.GATEWAY_BACKEND_TOKEN,
    `Bearer ${env.GATEWAY_BACKEND_TOKEN}x`,
    `Bearer ${env.BACKEND_AGENT_SERVICE_TOKEN}`,
    "Bearer wrong",
  ]) {
    assert.deepEqual(callInternalAuth(header), { status: 401, nextCalled: false });
  }
});
