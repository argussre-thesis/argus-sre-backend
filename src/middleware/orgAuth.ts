import { NextFunction, Request, Response } from "express";
import { findActiveMembership } from "../model/organizationModel";
import { AuthenticatedRequest, OrgScopedRequest } from "../types/express";
import { errorResponse } from "../utils/responseHandler";

const CLERK_ORG_ID = /^org_[A-Za-z0-9]+$/;

const respondOrgNotFound = (res: Response) =>
  errorResponse(res, 404, "ORGANIZATION_NOT_FOUND", "Organization not found");


export const requireOrgMembership = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { organizationId } = req.params;
    if (typeof organizationId !== "string" || !CLERK_ORG_ID.test(organizationId)) {
      return respondOrgNotFound(res);
    }

    const { clerkUserId } = req as AuthenticatedRequest;
    const org = await findActiveMembership(organizationId, clerkUserId);
    if (!org) return respondOrgNotFound(res);

    (req as OrgScopedRequest).org = org;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireOrgRole =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const { org } = req as OrgScopedRequest;

    if (!org) {
      return next(
        new Error("requireOrgRole used without requireOrgMembership"),
      );
    }

    if (!roles.includes(org.role)) {
      return errorResponse(
        res,
        403,
        "INSUFFICIENT_ORG_ROLE",
        "You do not have permission to perform this action",
        { requiredRoles: roles },
      );
    }

    next();
  };
