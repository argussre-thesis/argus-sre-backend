import { z } from "zod";

// DNS-1123 label: the name goes into the gateway's ops URL and must equal the runner's CLUSTER_NAME.
export const createClusterSchema = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/,
        "Use 1-63 lowercase letters, digits or '-', starting and ending with a letter or digit",
      ),
  })
  .strict();
export type CreateClusterInput = z.infer<typeof createClusterSchema>;

export const verifyRunnerTokenSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();
