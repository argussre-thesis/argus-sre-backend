/// <reference types="node" />
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import errorHandling from "../src/middleware/error/errorHandler";
import { env } from "../src/utils/env";

test("500 messages are only sent in development", async () => {
  process.env.SHOW_LOGS = "false";
  const original = env.NODE_ENV;
  const app = express();
  app.get("/", () => { throw new Error("db connection failed"); });
  app.use(errorHandling);
  const server = app.listen(0);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const messageIn = async (nodeEnv: typeof env.NODE_ENV) => {
    env.NODE_ENV = nodeEnv;
    const res = await fetch(url);
    assert.equal(res.status, 500);
    return (await res.json()).error.message;
  };

  try {
    assert.equal(await messageIn("production"), "Internal Server Error");
    assert.equal(await messageIn("staging"), "Internal Server Error");
    assert.equal(await messageIn("development"), "db connection failed");
  } finally {
    env.NODE_ENV = original;
    server.close();
  }
});

test("body parser errors are 4xx, not 500", async () => {
  process.env.SHOW_LOGS = "false";
  const app = express();
  app.post("/", express.json({ limit: "20b" }), (_req, res) => { res.json({}); });
  app.use(errorHandling);
  const server = app.listen(0);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const post = (body: string) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });

  try {
    const tooLarge = await post(JSON.stringify({ alerts: "x".repeat(50) }));
    assert.equal(tooLarge.status, 413);
    assert.equal((await tooLarge.json()).error.code, "PAYLOAD_TOO_LARGE");

    const malformed = await post("{nope");
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "INVALID_REQUEST_BODY");
  } finally {
    server.close();
  }
});
