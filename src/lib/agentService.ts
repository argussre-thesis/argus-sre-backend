import { ApiResponse } from "../types/apiResponse";
import { fail, ok, ServiceError, ServiceResult } from "../types/serviceResponse";
import { env } from "../utils/env";
import { logger } from "../utils/logger";

const TIMEOUT_MS = 10_000;

const PASSED_THROUGH = new Set(["INVESTIGATION_NOT_FOUND", "INVESTIGATION_RUNNING"]);
const UNAVAILABLE = fail(503, "SERVICE_UNAVAILABLE", "The service is currently unavailable. Try again later.");

export const agentServiceRequest = async <T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<ServiceResult<T>> => {
  const res = await fetch(new URL(`/api/v1${path}`, env.AGENT_SERVICE_URL), {
    method,
    headers: {
      authorization: `Bearer ${env.BACKEND_AGENT_SERVICE_TOKEN}`,
      "content-type": "application/json",
    },
    body: body === undefined ? null : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err: unknown) => {
    logger.error({ err, method, path }, "Agent service unreachable");
    return null;
  });
  if (!res) return UNAVAILABLE;

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json?.success === true) return ok(json.data);
  if (json?.success === false && PASSED_THROUGH.has(json.error?.code)) {
    return fail(
      res.status as ServiceError["status"],
      json.error.code,
      json.error.message,
      json.error.details,
    );
  }

  logger.error({ method, path, status: res.status, response: json }, "Agent service error");
  return UNAVAILABLE;
};
