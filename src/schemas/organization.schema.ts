import { z } from "zod";

export const updateOrganizationSettingsSchema = z
  .object({
    incidentGroupingWindowMinutes: z.number().int().min(0).max(1440),
    autoInvestigateEnabled: z.boolean(),
    investigationLevel: z.enum(["low", "medium", "high"]),
    conversationLevel: z.enum(["low", "medium", "high"]),
    webSearchToolEnabled: z.boolean(),
    maxModelCalls: z.number().int().min(5).max(100),
  })
  .strict();
export type UpdateOrganizationSettingsInput = z.infer<
  typeof updateOrganizationSettingsSchema
>;
