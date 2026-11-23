import { createHmac, timingSafeEqual } from "node:crypto";
import { WebClient } from "@slack/web-api";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { decryptSecret } from "../utils/token";

// Default retries and rate-limit waits outlast a serverless request.
export const slack = new WebClient(undefined, { retryConfig: { retries: 1 }, rejectRateLimitedCalls: true });

// The timestamp check stops replays.
export const verifySlackSignature = (rawBody: Buffer, timestamp: string | undefined, signature: string | undefined) => {
  if (!timestamp || !signature) return false;
  if (!(Math.abs(Date.now() / 1000 - Number(timestamp)) <= 5 * 60)) return false;

  const hmac = createHmac("sha256", env.SLACK_SIGNING_SECRET).update(`v0:${timestamp}:`).update(rawBody).digest("hex");
  const expected = Buffer.from(`v0=${hmac}`);
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

// Returns null when Slack refuses; the error is logged with the caller's ids.
export const postSlackMessage = (
  encryptedToken: Uint8Array,
  message: { channel: string; text: string; thread_ts?: string },
  logContext: Record<string, unknown>,
) =>
  slack.chat.postMessage({ token: decryptSecret(encryptedToken), ...message }).catch((err: unknown) => {
    logger.warn({ err, ...logContext }, "Slack post failed");
    return null;
  });

// Alerts and reports can quote anything, e.g. <!channel> or <url|text>.
export const escapeSlack = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Markdown to Slack: **bold** and headings become *bold*.
export const slackReport = (report: string) =>
  escapeSlack(report).replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
