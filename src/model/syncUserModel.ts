import { clerkClient } from "@clerk/express";
import { prisma } from "../lib/prisma";

export const findOrCreateUser = async (clerkId: string): Promise<boolean> => {
  try {
    const now = new Date();
    const existingUser = await prisma.user.findUnique({
      where: { id: clerkId },
    });

    if (existingUser && !existingUser.deletedAt) {
      await prisma.user.update({
        where: { id: clerkId },
        data: { lastSeenAt: now },
      });
      return true;
    }

    const clerkUser = await clerkClient.users.getUser(clerkId);
    const email = clerkUser.emailAddresses.find(
      (address) => address.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (!email) return false;

    await prisma.user.upsert({
      where: { id: clerkId },
      create: {
        id: clerkId,
        email,
        displayName:
          `${clerkUser.firstName} ${clerkUser.lastName}`.trim() ||
          clerkUser.username ||
          email.split("@")[0] ||
          "User",
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
        isBanned: clerkUser.banned,
        lastSeenAt: now,
        clerkUpdatedAt: new Date(clerkUser.updatedAt),
        syncedAt: now,
      },
      update: {
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
        isBanned: clerkUser.banned,
        lastSeenAt: now,
        clerkUpdatedAt: new Date(clerkUser.updatedAt),
        syncedAt: now,
        deletedAt: null,
      },
    });

    return true;
  } catch (error) {
    throw error;
  }
};
