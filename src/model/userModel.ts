import { prisma } from "../lib/prisma";
import { Prisma, User } from "../prisma/generated/prisma/client";
import { UpdateProfileInput } from "../schemas/profile.schema";
import { ServiceResult, ok, fail } from "../types/serviceResponse";

export const profileDataService = async (
  clerkUserId: string,
): Promise<ServiceResult<User>> => {
  try {
    const profile = await prisma.user.findUnique({
      where: { id: clerkUserId },
    });

    if (!profile) return fail(404, "PROFILE_NOT_FOUND", "Profile not found");

    return ok(profile);
  } catch (error) {
    throw error;
  }
};

export const updateProfileService = async (
  userId: string,
  data: UpdateProfileInput,
): Promise<ServiceResult<User>> => {
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined),
  ) as Prisma.UserUpdateInput;

  try {
    const updatedProfile = await prisma.user.update({
      where: { id: userId },
      data: cleanData,
    });

    return ok(updatedProfile);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return fail(404, "PROFILE_NOT_FOUND", "Profile not found");
      }
    }
    throw error;
  }
};
