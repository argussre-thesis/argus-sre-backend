import { z } from "zod";

const url = z.string().url().nullable().optional();

export const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional()
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
