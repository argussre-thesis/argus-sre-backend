import { isPrismaError, prisma } from "../lib/prisma";
import { CreateClusterInput } from "../schemas/cluster.schema";
import { OrgContext } from "../types/express";
import { ok, fail } from "../types/serviceResponse";
import { generateToken, hashToken, RUNNER_TOKEN_PREFIX } from "../utils/token";

const clusterSelect = {
  id: true,
  name: true,
  lastConnectedAt: true,
  createdAt: true,
} as const;

const clusterNotFound = () =>
  fail(404, "CLUSTER_NOT_FOUND", "Cluster not found");

export const listClustersService = async (org: OrgContext) => {
  const clusters = await prisma.cluster.findMany({
    where: { organizationId: org.organizationId },
    select: clusterSelect,
    orderBy: { createdAt: "asc" },
  });

  return ok(clusters);
};

export const createClusterService = async (
  org: OrgContext,
  input: CreateClusterInput,
) => {
  const { token, tokenHash } = generateToken(RUNNER_TOKEN_PREFIX);

  try {
    const cluster = await prisma.cluster.create({
      data: { organizationId: org.organizationId, name: input.name, tokenHash },
      select: clusterSelect,
    });

    return ok({ cluster, token });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      return fail(
        409,
        "CLUSTER_NAME_TAKEN",
        `A cluster named "${input.name}" already exists`,
      );
    }
    throw error;
  }
};

export const rotateClusterTokenService = async (
  org: OrgContext,
  clusterId: string,
) => {
  const { token, tokenHash } = generateToken(RUNNER_TOKEN_PREFIX);
  const { count } = await prisma.cluster.updateMany({
    where: { id: clusterId, organizationId: org.organizationId },
    data: { tokenHash },
  });

  if (count === 0) return clusterNotFound();
  return ok({ token });
};

export const deleteClusterService = async (
  org: OrgContext,
  clusterId: string,
) => {
  // shortcut: hard delete, switch to soft delete once incidents reference clusters
  const { count } = await prisma.cluster.deleteMany({
    where: { id: clusterId, organizationId: org.organizationId },
  });

  if (count === 0) return clusterNotFound();
  return ok(null);
};

export const verifyRunnerTokenService = async (token: string) => {
  try {
    const cluster = await prisma.cluster.update({
      where: {
        tokenHash: hashToken(token),
        organization: { deletedAt: null },
      },
      data: { lastConnectedAt: new Date() },
      select: { id: true, name: true, organizationId: true },
    });

    return ok({
      tenantId: cluster.organizationId,
      clusterId: cluster.id,
      clusterName: cluster.name,
    });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return fail(
        401,
        "INVALID_RUNNER_TOKEN",
        "Runner token is invalid or revoked",
      );
    }
    throw error;
  }
};
