import { NextFunction, Response, Request } from "express";
import { getAuth } from "@clerk/express";
import { AuthenticatedRequest } from "../types/express";
import { errorResponse } from "../utils/responseHandler";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return errorResponse(
        res,
        401,
        "UNAUTHORIZED",
        "Authentication is required",
      );
    }
    (req as AuthenticatedRequest).clerkUserId = userId;
    next();
  } catch (error) {
    next(error);
  }
};
