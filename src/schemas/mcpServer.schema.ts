import { z } from "zod";

const mcpServerFields = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,20}$/, "Use up to 20 lowercase letters, numbers or hyphens"),
    url: z.string().trim().min(1).max(2048),
    token: z.string().trim().regex(/^\S+$/, "Enter the token without spaces").max(8192),
    headers: z
      .record(
        z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, "Use up to 100 letters, numbers, hyphens or underscores in a header name"),
        z.string().trim().regex(/^[\x20-\x7E]+$/, "Enter the header value in plain ASCII on one line").max(8192),
      )
      .refine((headers) => {
        const count = Object.keys(headers).length;
        return count >= 1 && count <= 20;
      }, "Send 1 to 20 headers")
      .refine((headers) => {
        const names = Object.keys(headers).map((name) => name.toLowerCase());
        return new Set(names).size === names.length;
      }, "Header names must differ by more than case")
      .refine(
        (headers) =>
          !Object.keys(headers).some((name) =>
            ["host", "connection", "content-length", "transfer-encoding", "content-type", "accept", "mcp-session-id", "mcp-protocol-version"].includes(name.toLowerCase()),
          ),
        "That header is set automatically and can't be changed",
      ),
  })
  .strict();

export const createMcpServerSchema = mcpServerFields
  .partial({ token: true, headers: true })
  .refine((body) => !body.token !== !body.headers, "Send either token or headers");
export type CreateMcpServerInput = z.infer<typeof createMcpServerSchema>;

export const updateMcpServerSchema = mcpServerFields
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to update")
  .refine((body) => !(body.token && body.headers), "Send either token or headers");
export type UpdateMcpServerInput = z.infer<typeof updateMcpServerSchema>;
