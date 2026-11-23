import { Request, Response, NextFunction } from "express";
import { AppError } from "../../Error/appError";
import { env } from "../../utils/env";
import { getEnvVarOrDefault } from "../../utils/getEnvVar";
import { errorResponse } from "../../utils/responseHandler";

const errorHandling = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const isAppError = err instanceof AppError;

  if (getEnvVarOrDefault("SHOW_LOGS", "true") !== "false") {
    console.error("Error: ", err);
  }

  if (isAppError) {
    return errorResponse(
      res,
      err.statusCode,
      err.code,
      err.message,
      err.details,
    );
  }

  const { status, expose } = err as { status?: unknown; expose?: unknown };
  if (typeof status === "number" && status >= 400 && status < 500 && expose === true) {
    return errorResponse(
      res,
      status,
      status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST_BODY",
      err.message,
    );
  }

  return errorResponse(
    res,
    500,
    "INTERNAL_SERVER_ERROR",
    env.NODE_ENV === "development" ? err.message : "Internal Server Error",
  );
};

export default errorHandling;
