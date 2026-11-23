import { z } from "zod";

const clusterIdsSchema = z
  .array(z.string().min(1))
  .min(1, "Pick at least one cluster")
  .max(100)
  .transform((ids) => [...new Set(ids)]);

export const createAlertSourceSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    clusterIds: clusterIdsSchema,
    // The alert label that names the cluster.
    clusterLabel: z
      .string()
      .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Must be a valid Prometheus label name")
      .optional(),
  })
  .strict();
export type CreateAlertSourceInput = z.infer<typeof createAlertSourceSchema>;

export const updateAlertSourceSchema = createAlertSourceSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to update");
export type UpdateAlertSourceInput = z.infer<typeof updateAlertSourceSchema>;
