import { NextFunction, Response, Request } from "express";
import { errorResponse } from "../utils/responseHandler";
import { findOrCreateUser } from "../model/syncUserModel";
import { AuthenticatedRequest } from "../types/express";

export const syncUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { clerkUserId } = req as AuthenticatedRequest;
    const syncStatus = await findOrCreateUser(clerkUserId);
    if (syncStatus) {
      next();
    } else {
      return errorResponse(
        res,
        400,
        "USER_SYNC_FAILED",
        "User syncing failed",
      );
    }
  } catch (error) {
    next(error);
  }
};
