import { NextFunction, Request, Response } from "express";
import {
  getOrganizationService,
  listInvitationsService,
  listMembershipsService,
  listUserOrganizationsService,
  updateOrganizationSettingsService,
} from "../model/organizationModel";
import { AuthenticatedRequest, OrgScopedRequest } from "../types/express";
import { errorResponse, successResponse } from "../utils/responseHandler";

export const listMyOrganizations = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { clerkUserId } = req as AuthenticatedRequest;
    const result = await listUserOrganizationsService(clerkUserId);

    return successResponse(
      res,
      200,
      "Organizations fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const getOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await getOrganizationService(org);

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
      "Organization fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const listMemberships = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await listMembershipsService(org);

    return successResponse(
      res,
      200,
      "Memberships fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const listInvitations = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await listInvitationsService(org);

    return successResponse(
      res,
      200,
      "Invitations fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const updateOrganizationSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await updateOrganizationSettingsService(org, req.body);

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
      "Organization settings updated",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};
