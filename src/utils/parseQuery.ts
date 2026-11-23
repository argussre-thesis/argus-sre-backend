import { ZodSchema } from "zod";
import { ServiceResult, ok, fail } from "../types/serviceResponse";

export const parseQuery = <T>(
  schema: ZodSchema<T>,
  query: unknown,
): ServiceResult<T> => {
  const result = schema.safeParse(query);

  if (!result.success) {
    const message = result.error.issues
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    return fail(400, "QUERY_VALIDATION_ERROR", message, result.error.flatten());
  }

  return ok(result.data);
};
