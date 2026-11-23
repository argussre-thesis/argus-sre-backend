import { isPrismaError, prisma } from "../lib/prisma";
import { Prisma } from "../prisma/generated/prisma/client";
import {
  CreateAlertSourceInput,
  UpdateAlertSourceInput,
} from "../schemas/alertSource.schema";
import { OrgContext } from "../types/express";
import { ok, fail } from "../types/serviceResponse";
import { ALERT_TOKEN_PREFIX, generateToken } from "../utils/token";

const alertSourceSelect = {
  id: true,
  name: true,
  clusterLabel: true,
  lastReceivedAt: true,
  createdAt: true,
  clusters: { select: { cluster: { select: { id: true, name: true } } } },
} as const;

const flattenClusters = ({
  clusters,
  ...source
}: Prisma.AlertSourceGetPayload<{ select: typeof alertSourceSelect }>) => ({
  ...source,
  clusters: clusters.map(({ cluster }) => cluster),
});

const alertSourceNotFound = () =>
  fail(404, "ALERT_SOURCE_NOT_FOUND", "Alert source not found");

const alertSourceNameTaken = (name: string) =>
  fail(409, "ALERT_SOURCE_NAME_TAKEN", `An alert source named "${name}" already exists`);

const findForeignClusters = async (org: OrgContext, clusterIds: string[]) => {
  const owned = await prisma.cluster.count({
    where: { id: { in: clusterIds }, organizationId: org.organizationId },
  });

  return owned === clusterIds.length
    ? null
    : fail(400, "INVALID_CLUSTER_IDS", "Some clusters do not exist in this organization");
};

export const listAlertSourcesService = async (org: OrgContext) => {
  const sources = await prisma.alertSource.findMany({
    where: { organizationId: org.organizationId },
    select: alertSourceSelect,
    orderBy: { createdAt: "asc" },
  });

  return ok(sources.map(flattenClusters));
};

export const createAlertSourceService = async (
  org: OrgContext,
  input: CreateAlertSourceInput,
) => {
  const invalid = await findForeignClusters(org, input.clusterIds);
  if (invalid) return invalid;

  const { token, tokenHash } = generateToken(ALERT_TOKEN_PREFIX);

  try {
    const alertSource = await prisma.alertSource.create({
      data: {
        organizationId: org.organizationId,
        name: input.name,
        ...(input.clusterLabel && { clusterLabel: input.clusterLabel }),
        tokenHash,
        clusters: { create: input.clusterIds.map((clusterId) => ({ clusterId })) },
      },
      select: alertSourceSelect,
    });

    return ok({ alertSource: flattenClusters(alertSource), token });
  } catch (error) {
    if (isPrismaError(error, "P2002")) return alertSourceNameTaken(input.name);
    throw error;
  }
};

export const updateAlertSourceService = async (
  org: OrgContext,
  alertSourceId: string,
  input: UpdateAlertSourceInput,
) => {
  if (input.clusterIds) {
    const invalid = await findForeignClusters(org, input.clusterIds);
    if (invalid) return invalid;
  }

  try {
    const alertSource = await prisma.alertSource.update({
      where: { id: alertSourceId, organizationId: org.organizationId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.clusterLabel && { clusterLabel: input.clusterLabel }),
        ...(input.clusterIds && {
          clusters: {
            deleteMany: {},
            create: input.clusterIds.map((clusterId) => ({ clusterId })),
          },
        }),
      },
      select: alertSourceSelect,
    });

    return ok(flattenClusters(alertSource));
  } catch (error) {
    if (isPrismaError(error, "P2025")) return alertSourceNotFound();
    if (isPrismaError(error, "P2002") && input.name) {
      return alertSourceNameTaken(input.name);
    }
    throw error;
  }
};

export const rotateAlertSourceTokenService = async (
  org: OrgContext,
  alertSourceId: string,
) => {
  const { token, tokenHash } = generateToken(ALERT_TOKEN_PREFIX);
  const { count } = await prisma.alertSource.updateMany({
    where: { id: alertSourceId, organizationId: org.organizationId },
    data: { tokenHash },
  });

  if (count === 0) return alertSourceNotFound();
  return ok({ token });
};

export const deleteAlertSourceService = async (
  org: OrgContext,
  alertSourceId: string,
) => {
  const { count } = await prisma.alertSource.deleteMany({
    where: { id: alertSourceId, organizationId: org.organizationId },
  });

  if (count === 0) return alertSourceNotFound();
  return ok(null);
};
