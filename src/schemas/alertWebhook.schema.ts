import { z } from "zod";

// Alertmanager webhook payload. Grafana sends the same shape plus extra fields, which are dropped.
export const alertWebhookSchema = z.object({
  alerts: z
    .array(
      z.object({
        status: z.enum(["firing", "resolved"]),
        labels: z.record(z.string(), z.string()),
        annotations: z.record(z.string(), z.string()).default({}),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date().optional(),
        generatorURL: z.string().optional(),
        fingerprint: z.string().optional(),
      }),
    )
    .max(1000),
});
export type AlertWebhookInput = z.infer<typeof alertWebhookSchema>;
export type WebhookAlert = AlertWebhookInput["alerts"][number];
