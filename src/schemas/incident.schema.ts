import { z } from "zod";

export const listIncidentsQuerySchema = z
  .object({
    status: z.enum(["OPEN", "RESOLVED"]).optional(),
    // A cluster id, or "unknown".
    clusterId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    // Id of the last incident on the previous page.
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;

export const investigationEndedSchema = z
  .object({
    tenantId: z.string().min(1),
    incidentId: z.string().min(1),
    investigationId: z.string().min(1),
    status: z.enum(["done", "failed"]),
    report: z.string().nullable(),
    error: z.string().nullable(),
  })
  .strict();
export type InvestigationEndedInput = z.infer<typeof investigationEndedSchema>;
