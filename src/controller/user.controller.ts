import { Response, Request, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/express";
import {
  profileDataService,
  updateProfileService,
} from "../model/userModel";
import { errorResponse, successResponse } from "../utils/responseHandler";
import { UpdateProfileInput } from "../schemas/profile.schema";

export const returnProfileData = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { clerkUserId } = req as AuthenticatedRequest;
    const result = await profileDataService(clerkUserId);

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(
      res,
      200,
      "Profile data fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const updateProfileData = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { clerkUserId } = req as AuthenticatedRequest;
    const result = await updateProfileService(
      clerkUserId,
      req.body as UpdateProfileInput,
    );

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(
      res,
      200,
      "Profile updated successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};
