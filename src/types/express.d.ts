import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  clerkUserId: string;
}

export interface OrgContext {
  organizationId: string;
  membershipId: string;
  role: string;
}
export interface OrgScopedRequest extends AuthenticatedRequest {
  org: OrgContext;
}
