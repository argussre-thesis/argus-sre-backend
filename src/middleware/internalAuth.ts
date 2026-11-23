import { createHash, timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { errorResponse } from "../utils/responseHandler";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export const requireInternalToken = (token: string) => {
  const expected = sha256(`Bearer ${token}`);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!timingSafeEqual(sha256(req.headers.authorization ?? ""), expected)) {
      return errorResponse(
        res,
        401,
        "INVALID_INTERNAL_TOKEN",
        "Missing or invalid internal API token",
      );
    }
    next();
  };
};
