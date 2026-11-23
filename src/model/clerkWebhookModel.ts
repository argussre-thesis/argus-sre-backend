import { clerkClient } from "@clerk/express";
import type { WebhookEvent } from "@clerk/express/webhooks";
import {
  OrganizationInvitationStatus,
  Prisma,
} from "../prisma/generated/prisma/client";
import { prisma } from "../lib/prisma";

type ClerkWebhookEnvelope = WebhookEvent & {
  instance_id?: string;
  timestamp?: number;
};

type UserJSON = Extract<
  WebhookEvent,
  { type: "user.created" | "user.updated" }
>["data"];
type OrganizationJSON = Extract<
  WebhookEvent,
  { type: "organization.created" | "organization.updated" }
>["data"];
type OrganizationMembershipJSON = Extract<
  WebhookEvent,
  {
    type:
      | "organizationMembership.created"
      | "organizationMembership.updated"
      | "organizationMembership.deleted";
  }
>["data"];
type OrganizationInvitationJSON = Extract<
  WebhookEvent,
  {
    type:
      | "organizationInvitation.created"
      | "organizationInvitation.revoked"
      | "organizationInvitation.accepted";
  }
>["data"];

export type ClerkWebhookMetadata = {
  eventId: string;
  eventTimestamp: Date;
  instanceId?: string;
};

export type ClerkWebhookResult = {
  duplicate: boolean;
  handled: boolean;
};

const getPrimaryEmail = (user: UserJSON): string => {
  const primaryEmail = user.email_addresses.find(
    (email) => email.id === user.primary_email_address_id,
  )?.email_address;
  const email = primaryEmail ?? user.email_addresses[0]?.email_address;

  if (!email) {
    throw new Error(`Clerk user ${user.id} does not have an email address`);
  }

  return email;
};

const getDisplayName = (
  firstName: string | null,
  lastName: string | null,
  username: string | null,
  email: string,
): string =>
  `${firstName ?? ""} ${lastName ?? ""}`.trim() ||
  username ||
  email.split("@")[0] ||
  "User";

const isStale = (
  storedTimestamp: Date | null | undefined,
  incomingTimestamp: Date,
): boolean => Boolean(storedTimestamp && storedTimestamp > incomingTimestamp);

const syncUserFromWebhook = async (user: UserJSON): Promise<void> => {
  const clerkUpdatedAt = new Date(user.updated_at);
  const existing = await prisma.user.findUnique({ where: { id: user.id } });

  if (isStale(existing?.clerkUpdatedAt, clerkUpdatedAt)) return;

  const email = getPrimaryEmail(user);
  const now = new Date();

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email,
      displayName: getDisplayName(
        user.first_name,
        user.last_name,
        user.username,
        email,
      ),
      imageUrl: user.image_url,
      isBanned: user.banned,
      clerkUpdatedAt,
      syncedAt: now,
    },
    update: {
      firstName: user.first_name,
      lastName: user.last_name,
      email,
      imageUrl: user.image_url,
      isBanned: user.banned,
      clerkUpdatedAt,
      syncedAt: now,
      deletedAt: null,
    },
  });
};

const ensureUserExists = async (userId: string): Promise<void> => {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing && !existing.deletedAt) return;

  const user = await clerkClient.users.getUser(userId);
  const email =
    user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error(`Clerk user ${user.id} does not have an email address`);
  }

  const clerkUpdatedAt = new Date(user.updatedAt);
  const now = new Date();

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email,
      displayName: getDisplayName(
        user.firstName,
        user.lastName,
        user.username,
        email,
      ),
      imageUrl: user.imageUrl,
      isBanned: user.banned,
      clerkUpdatedAt,
      syncedAt: now,
    },
    update: {
      firstName: user.firstName,
      lastName: user.lastName,
      email,
      imageUrl: user.imageUrl,
      isBanned: user.banned,
      clerkUpdatedAt,
      syncedAt: now,
      deletedAt: null,
    },
  });
};

const syncOrganization = async (
  organization: OrganizationJSON,
): Promise<void> => {
  const clerkUpdatedAt = new Date(organization.updated_at);
  const existing = await prisma.organization.findUnique({
    where: { id: organization.id },
  });

  if (isStale(existing?.clerkUpdatedAt, clerkUpdatedAt)) return;

  const createdBy = organization.created_by ?? existing?.createdBy;
  if (!createdBy) {
    throw new Error(
      `Clerk organization ${organization.id} does not have a creator`,
    );
  }

  await ensureUserExists(createdBy);
  const now = new Date();

  await prisma.organization.upsert({
    where: { id: organization.id },
    create: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdBy,
      imageUrl: organization.image_url ?? null,
      clerkUpdatedAt,
      syncedAt: now,
    },
    update: {
      name: organization.name,
      slug: organization.slug,
      createdBy,
      imageUrl: organization.image_url ?? null,
      clerkUpdatedAt,
      syncedAt: now,
      deletedAt: null,
    },
  });
};

const syncMembership = async (
  membership: OrganizationMembershipJSON,
): Promise<void> => {
  const userId = membership.public_user_data.user_id;
  const organizationId = membership.organization.id;
  const clerkUpdatedAt = new Date(membership.updated_at);

  await ensureUserExists(userId);
  await syncOrganization(membership.organization);

  const existing = await prisma.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
  });

  if (isStale(existing?.clerkUpdatedAt, clerkUpdatedAt)) return;

  const now = new Date();

  await prisma.membership.upsert({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    create: {
      clerkMembershipId: membership.id,
      organizationId,
      userId,
      role: membership.role,
      clerkUpdatedAt,
      syncedAt: now,
    },
    update: {
      clerkMembershipId: membership.id,
      role: membership.role,
      clerkUpdatedAt,
      syncedAt: now,
      deletedAt: null,
    },
  });
};

const softDeleteMembership = async (
  membership: OrganizationMembershipJSON,
  eventTimestamp: Date,
): Promise<void> => {
  const existing = await prisma.membership.findUnique({
    where: { clerkMembershipId: membership.id },
  });
  if (!existing) return;

  const clerkUpdatedAt = eventTimestamp;
  if (isStale(existing.clerkUpdatedAt, clerkUpdatedAt)) return;

  const now = new Date();
  await prisma.membership.update({
    where: { id: existing.id },
    data: {
      clerkUpdatedAt,
      syncedAt: now,
      deletedAt: now,
    },
  });
};

const isClerkNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  error.status === 404;

const ensureOrganizationExists = async (
  organizationId: string,
): Promise<boolean> => {
  const existing = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { deletedAt: true },
  });
  if (existing) return !existing.deletedAt;

  try {
    const organization = await clerkClient.organizations.getOrganization({
      organizationId,
    });
    if (!organization.raw) {
      throw new Error(`Clerk organization ${organizationId} has no raw payload`);
    }
    await syncOrganization(organization.raw);
    return true;
  } catch (error) {
    if (isClerkNotFound(error)) return false;
    throw error;
  }
};

const TERMINAL_INVITATION_STATUSES: ReadonlySet<OrganizationInvitationStatus> =
  new Set([
    OrganizationInvitationStatus.ACCEPTED,
    OrganizationInvitationStatus.REVOKED,
  ]);

const syncOrganizationInvitation = async (
  invitation: OrganizationInvitationJSON,
  status: OrganizationInvitationStatus,
): Promise<void> => {
  const clerkUpdatedAt = new Date(invitation.updated_at);
  const existing = await prisma.organizationInvitation.findUnique({
    where: { id: invitation.id },
  });

  if (isStale(existing?.clerkUpdatedAt, clerkUpdatedAt)) return;
  
  // Accepted/revoked are final; a late `created` must not reopen the invite.
  if (
    existing &&
    TERMINAL_INVITATION_STATUSES.has(existing.status) &&
    !TERMINAL_INVITATION_STATUSES.has(status)
  ) {
    return;
  }

  if (!(await ensureOrganizationExists(invitation.organization_id))) return;

  const userId = "user_id" in invitation ? invitation.user_id : undefined;
  const data = {
    organizationId: invitation.organization_id,
    emailAddress: invitation.email_address,
    role: invitation.role,
    status,
    expiresAt: new Date(invitation.expires_at),
    clerkUpdatedAt,
    syncedAt: new Date(),
    ...(userId && { userId }),
    ...(status === OrganizationInvitationStatus.ACCEPTED && {
      acceptedAt: clerkUpdatedAt,
    }),
    ...(status === OrganizationInvitationStatus.REVOKED && {
      revokedAt: clerkUpdatedAt,
    }),
  };

  await prisma.organizationInvitation.upsert({
    where: { id: invitation.id },
    create: {
      id: invitation.id,
      clerkCreatedAt: new Date(invitation.created_at),
      ...data,
    },
    update: data,
  });
};

const softDeleteUser = async (
  userId: string,
  eventTimestamp: Date,
): Promise<void> => {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing || isStale(existing.clerkUpdatedAt, eventTimestamp)) return;

  await prisma.$transaction([
    prisma.membership.updateMany({
      where: { userId, deletedAt: null },
      data: {
        clerkUpdatedAt: eventTimestamp,
        syncedAt: new Date(),
        deletedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        clerkUpdatedAt: eventTimestamp,
        syncedAt: new Date(),
        deletedAt: new Date(),
      },
    }),
  ]);
};

const softDeleteOrganization = async (
  organizationId: string,
  eventTimestamp: Date,
): Promise<void> => {
  const existing = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!existing || isStale(existing.clerkUpdatedAt, eventTimestamp)) return;

  const now = new Date();

  await prisma.$transaction([
    prisma.membership.updateMany({
      where: { organizationId, deletedAt: null },
      data: {
        clerkUpdatedAt: eventTimestamp,
        syncedAt: now,
        deletedAt: now,
      },
    }),
    prisma.organizationInvitation.updateMany({
      where: {
        organizationId,
        status: OrganizationInvitationStatus.PENDING,
      },
      data: {
        status: OrganizationInvitationStatus.REVOKED,
        revokedAt: eventTimestamp,
        clerkUpdatedAt: eventTimestamp,
        syncedAt: now,
      },
    }),
    prisma.organization.update({
      where: { id: organizationId },
      data: {
        clerkUpdatedAt: eventTimestamp,
        syncedAt: now,
        deletedAt: now,
      },
    }),
  ]);
};

const beginReceipt = async (
  event: ClerkWebhookEnvelope,
  metadata: ClerkWebhookMetadata,
): Promise<boolean> => {
  try {
    await prisma.clerkWebhookReceipt.create({
      data: {
        id: metadata.eventId,
        eventType: event.type,
        eventTimestamp: metadata.eventTimestamp,
        ...(metadata.instanceId && { instanceId: metadata.instanceId }),
      },
    });
    return true;
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  const updated = await prisma.clerkWebhookReceipt.updateMany({
    where: {
      id: metadata.eventId,
      status: { not: "PROCESSED" },
    },
    data: {
      status: "RECEIVED",
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });

  return updated.count > 0;
};

const handleEvent = async (
  event: ClerkWebhookEnvelope,
  eventTimestamp: Date,
): Promise<boolean> => {
  switch (event.type) {
    case "user.created":
    case "user.updated":
      await syncUserFromWebhook(event.data);
      return true;
    case "user.deleted": {
      if (!event.data.id) throw new Error("Deleted Clerk user has no ID");
      await softDeleteUser(event.data.id, eventTimestamp);
      return true;
    }
    case "organization.created":
    case "organization.updated":
      await syncOrganization(event.data);
      return true;
    case "organization.deleted": {
      if (!event.data.id) throw new Error("Deleted Clerk organization has no ID");
      await softDeleteOrganization(event.data.id, eventTimestamp);
      return true;
    }
    case "organizationMembership.created":
    case "organizationMembership.updated":
      await syncMembership(event.data);
      return true;
    case "organizationMembership.deleted":
      await softDeleteMembership(event.data, eventTimestamp);
      return true;
    case "organizationInvitation.created":
      await syncOrganizationInvitation(
        event.data,
        OrganizationInvitationStatus.PENDING,
      );
      return true;
    case "organizationInvitation.accepted":
      await syncOrganizationInvitation(
        event.data,
        OrganizationInvitationStatus.ACCEPTED,
      );
      return true;
    case "organizationInvitation.revoked":
      await syncOrganizationInvitation(
        event.data,
        OrganizationInvitationStatus.REVOKED,
      );
      return true;
    default:
      return false;
  }
};

export const processClerkWebhook = async (
  event: ClerkWebhookEnvelope,
  metadata: ClerkWebhookMetadata,
): Promise<ClerkWebhookResult> => {
  const shouldProcess = await beginReceipt(event, metadata);
  if (!shouldProcess) return { duplicate: true, handled: true };

  try {
    const handled = await handleEvent(event, metadata.eventTimestamp);
    await prisma.clerkWebhookReceipt.update({
      where: { id: metadata.eventId },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        lastError: null,
      },
    });
    return { duplicate: false, handled };
  } catch (error) {
    const lastError =
      error instanceof Error ? error.message.slice(0, 4000) : "Unknown error";

    await prisma.clerkWebhookReceipt.update({
      where: { id: metadata.eventId },
      data: { status: "FAILED", lastError },
    });
    throw error;
  }
};
