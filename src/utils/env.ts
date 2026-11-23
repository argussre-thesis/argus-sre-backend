import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ override: true });

const envSchema = z.object({
  PORT: z.string().default("5000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1, "CLERK_WEBHOOK_SIGNING_SECRET is required"),
  GATEWAY_BACKEND_TOKEN: z.string().min(32, "GATEWAY_BACKEND_TOKEN must be at least 32 characters"),
  AGENT_SERVICE_URL: z.string().url("AGENT_SERVICE_URL must be a valid URL"),
  BACKEND_AGENT_SERVICE_TOKEN: z.string().min(32, "BACKEND_AGENT_SERVICE_TOKEN must be at least 32 characters"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)"),
  SLACK_CLIENT_ID: z.string().min(1, "SLACK_CLIENT_ID is required"),
  SLACK_CLIENT_SECRET: z.string().min(1, "SLACK_CLIENT_SECRET is required"),
  SLACK_STATE_SECRET: z.string().min(32, "SLACK_STATE_SECRET must be at least 32 characters"),
  // Must match a Redirect URL on the Slack app (OAuth & Permissions).
  SLACK_REDIRECT_URL: z.url("SLACK_REDIRECT_URL must be a valid URL"),
  SLACK_SIGNING_SECRET: z.string().min(1, "SLACK_SIGNING_SECRET is required"),
  // How many of a thread's latest messages the agent gets, the mention included.
  SLACK_THREAD_MESSAGES: z.coerce.number().int().min(1).max(200).default(5),
  NODE_ENV: z.enum(["development", "staging", "production"]),
  LOG_LEVEL: z.string().default("info"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("Invalid environment variables:", _env.error.format());
  throw new Error("Invalid environment variables");
}

export const env = _env.data;
