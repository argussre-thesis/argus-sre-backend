import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

export const RUNNER_TOKEN_PREFIX = "argus_rt_";
export const ALERT_TOKEN_PREFIX = "argus_wh_";

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const generateToken = (prefix: string) => {
  const token = prefix + randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
};

// Used for Slack bot
// shortcut: one key, no rotation; changing it makes every stored token unreadable (each org reinstalls). Move to KMS if that matters.
const encryptionKey = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
export const encryptSecret = (plaintext: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
};
export const decryptSecret = (stored: Uint8Array) => {
  const data = Buffer.from(stored);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
};
