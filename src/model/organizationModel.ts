import { isPrismaError, prisma } from "../lib/prisma";
import { OrganizationInvitationStatus } from "../prisma/generated/prisma/client";
import { UpdateOrganizationSettingsInput } from "../schemas/organization.schema";
import { OrgContext } from "../types/express";
import { ok, fail } from "../types/serviceResponse";

export const ORG_ROLES = {
  ADMIN: "org:admin",
  MEMBER: "org:member",
} as const;

export const findActiveMembership = async (
  organizationId: string,
  userId: string,
): Promise<OrgContext | null> => {
  const membership = await prisma.membership.findFirst({
    where: {
      organizationId,
      userId,
      deletedAt: null,
      organization: { deletedAt: null },
    },
    select: { id: true, role: true },
  });

  if (!membership) return null;

  return {
    organizationId,
    membershipId: membership.id,
    role: membership.role,
  };
};

export const listUserOrganizationsService = async (userId: string) => {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      deletedAt: null,
      organization: { deletedAt: null },
    },
    select: {
      role: true,
      createdAt: true,
      organization: {
        select: { id: true, name: true, slug: true, imageUrl: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return ok(
    memberships.map(({ organization, role, createdAt }) => ({
      ...organization,
      role,
      joinedAt: createdAt,
    })),
  );
};

export const getOrganizationService = async (org: OrgContext) => {
  const organization = await prisma.organization.findFirst({
    where: { id: org.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      incidentGroupingWindowMinutes: true,
      autoInvestigateEnabled: true,
      investigationLevel: true,
      conversationLevel: true,
      webSearchToolEnabled: true,
      maxModelCalls: true,
      createdAt: true,
      _count: {
        select: { memberships: { where: { deletedAt: null } } },
      },
    },
  });

  if (!organization) {
    return fail(404, "ORGANIZATION_NOT_FOUND", "Organization not found");
  }

  const { _count, ...rest } = organization;
  return ok({
    ...rest,
    memberCount: _count.memberships,
    currentUserRole: org.role,
  });
};

export const updateOrganizationSettingsService = async (
  org: OrgContext,
  input: UpdateOrganizationSettingsInput,
) => {
  try {
    const settings = await prisma.organization.update({
      where: { id: org.organizationId, deletedAt: null },
      data: input,
      select: {
        incidentGroupingWindowMinutes: true,
        autoInvestigateEnabled: true,
        investigationLevel: true,
        conversationLevel: true,
        webSearchToolEnabled: true,
        maxModelCalls: true,
      },
    });

    return ok(settings);
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return fail(404, "ORGANIZATION_NOT_FOUND", "Organization not found");
    }
    throw error;
  }
};

export const listMembershipsService = async (org: OrgContext) => {
  const memberships = await prisma.membership.findMany({
    where: {
      organizationId: org.organizationId,
      deletedAt: null,
      user: { deletedAt: null },
    },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          imageUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return ok(
    memberships.map(({ id, role, createdAt, user }) => ({
      id,
      role,
      joinedAt: createdAt,
      user,
    })),
  );
};

export const listInvitationsService = async (org: OrgContext) => {
  const invitations = await prisma.organizationInvitation.findMany({
    where: { organizationId: org.organizationId },
    select: {
      id: true,
      emailAddress: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      clerkCreatedAt: true,
    },
    orderBy: { clerkCreatedAt: "desc" },
  });

  const now = new Date();
  return ok(
    invitations.map(({ clerkCreatedAt, ...invitation }) => ({
      ...invitation,
      status:
        invitation.status === OrganizationInvitationStatus.PENDING &&
        invitation.expiresAt < now
          ? OrganizationInvitationStatus.EXPIRED
          : invitation.status,
      createdAt: clerkCreatedAt,
    })),
  );
};
