import { z } from "zod";

export const conversationEndedSchema = z
  .object({
    tenantId: z.string().min(1),
    // <channel>:<thread_ts>
    externalId: z.string().regex(/^[^:]+:.+$/),
    status: z.enum(["done", "failed"]),
    reply: z.string().nullable(),
    error: z.string().nullable(),
  })
  .strict();
export type ConversationEndedInput = z.infer<typeof conversationEndedSchema>;

const slackMentionSchema = z.object({
  type: z.literal("app_mention"),
  channel: z.string(),
  ts: z.string(),
  text: z.string(),
  user: z.string().optional(),
  thread_ts: z.string().optional(),
  bot_id: z.string().optional(),
});
export type SlackMention = z.infer<typeof slackMentionSchema>;

// The events we act on; any other parses as a failure and is ignored.
export const slackEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url_verification"), challenge: z.string() }),
  z.object({ type: z.literal("event_callback"), team_id: z.string(), event: slackMentionSchema }),
]);
