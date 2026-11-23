export class AppError extends Error {
  statusCode: number;
  code: string;
  details: unknown | null;

  constructor(
    statusCode = 500,
    message = "Internal Server Error",
    code = "INTERNAL_SERVER_ERROR",
    details: unknown | null = null,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}
