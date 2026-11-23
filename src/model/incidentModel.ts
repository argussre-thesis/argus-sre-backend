import { agentServiceRequest } from "../lib/agentService";
import { mcpServersForAgent } from "./mcpServerModel";
import { prisma } from "../lib/prisma";
import { listIncidentsQuerySchema } from "../schemas/incident.schema";
import { OrgContext } from "../types/express";
import { ok, fail } from "../types/serviceResponse";
import { logger } from "../utils/logger";
import { parseQuery } from "../utils/parseQuery";
import { lockClusterIncidents } from "./alertWebhookModel";

const incidentSelect = {
  id: true,
  title: true,
  status: true,
  isTest: true,
  createdAt: true,
  resolvedAt: true,
  cluster: { select: { id: true, name: true } },
} as const;

const incidentNotFound = () =>
  fail(404, "INCIDENT_NOT_FOUND", "Incident not found");

export const listIncidentsService = async (org: OrgContext, query: unknown) => {
  const parsed = parseQuery(listIncidentsQuerySchema, query);
  if (!parsed.success) return parsed;
  const { status, clusterId, limit, cursor } = parsed.data;

  const rows = await prisma.incident.findMany({
    where: {
      organizationId: org.organizationId,
      ...(status && { status }),
      ...(clusterId && { clusterId: clusterId === "unknown" ? null : clusterId }),
      ...(cursor && { id: { not: cursor } }),
    },
    ...(cursor && { cursor: { id: cursor } }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      ...incidentSelect,
      _count: { select: { alerts: { where: { status: "FIRING" } } } },
    },
  });

  const page = rows.slice(0, limit);
  return ok({
    incidents: page.map(({ _count, ...incident }) => ({
      ...incident,
      firingAlertCount: _count.alerts,
    })),
    nextCursor: rows.length > limit ? page.at(-1)!.id : null,
  });
};

export const getIncidentService = async (org: OrgContext, incidentId: string) => {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId: org.organizationId },
    select: {
      ...incidentSelect,
      alerts: {
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          status: true,
          fingerprint: true,
          startsAt: true,
          endsAt: true,
          lastReceivedAt: true,
          labels: true,
          annotations: true,
          generatorUrl: true,
          alertSource: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!incident) return incidentNotFound();
  return ok(incident);
};

export const resolveIncidentService = async (org: OrgContext, incidentId: string) => {
  const now = new Date();

  const found = await prisma.$transaction(async (tx) => {
    const incident = await tx.incident.findFirst({
      where: { id: incidentId, organizationId: org.organizationId },
      select: { clusterId: true },
    });
    if (!incident) return false;

    await lockClusterIncidents(tx, org.organizationId, incident.clusterId);
    await tx.alert.updateMany({
      where: { incidentId, status: "FIRING" },
      data: { status: "RESOLVED", endsAt: now },
    });
    await tx.incident.updateMany({
      where: { id: incidentId, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: now },
    });
    return true;
  });

  if (!found) return incidentNotFound();
  return getIncidentService(org, incidentId);
};

// The manual "Investigate" and the alert webhook both start here.
const startInvestigation = async (organizationId: string, incidentId: string) => {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
    select: {
      title: true,
      isTest: true,
      organization: { select: { investigationLevel: true, webSearchToolEnabled: true, maxModelCalls: true } },
      cluster: { select: { name: true } },
      alerts: {
        orderBy: { startsAt: "asc" },
        select: { status: true, startsAt: true, endsAt: true, labels: true, annotations: true },
      },
    },
  });

  if (!incident) return incidentNotFound();
  if (incident.isTest) {
    return fail(409, "TEST_INCIDENT", "Test incidents are not investigated");
  }
  if (!incident.cluster) {
    return fail(409, "UNKNOWN_CLUSTER", "The incident's cluster is unknown, so there is no runner to investigate it");
  }

  // shortcut: sends every alert; thousands would pass the agent service's 1 MB body limit
  return agentServiceRequest<{ id: string }>("POST", `/tenants/${organizationId}/investigations`, {
    incidentId,
    cluster: incident.cluster.name,
    title: incident.title,
    alerts: incident.alerts,
    mcpServers: await mcpServersForAgent(organizationId),
    level: incident.organization.investigationLevel,
    webSearch: incident.organization.webSearchToolEnabled,
    maxModelCalls: incident.organization.maxModelCalls,
  });
};

export const investigateIncidentService = async (org: OrgContext, incidentId: string) => {
  const started = await startInvestigation(org.organizationId, incidentId);
  // Claims the incident too, so an alert joining it later doesn't start another run.
  if (started.success) {
    await prisma.incident.updateMany({
      where: { id: incidentId, investigationStartedAt: null },
      data: { investigationStartedAt: new Date() },
    });
  }
  return started;
};

export const autoInvestigateIncident = async (organizationId: string, incidentId: string) => {
  const claimed = await prisma.incident.updateMany({
    where: { id: incidentId, investigationStartedAt: null },
    data: { investigationStartedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const started = await startInvestigation(organizationId, incidentId);
  // INVESTIGATION_RUNNING: a manual run started in between, so the claim holds.
  if (started.success || started.code === "INVESTIGATION_RUNNING") return;

  logger.error({ organizationId, incidentId, code: started.code }, "Automatic investigation not started");
  // Released, so the next alert joining the incident tries again.
  await prisma.incident.updateMany({
    where: { id: incidentId },
    data: { investigationStartedAt: null },
  });
};

export const listIncidentInvestigationsService = (org: OrgContext, incidentId: string) =>
  agentServiceRequest<{ investigations: unknown[] }>(
    "GET",
    `/tenants/${org.organizationId}/investigations?${new URLSearchParams({ incidentId })}`,
  );

export const getInvestigationService = (org: OrgContext, investigationId: string) =>
  agentServiceRequest<unknown>(
    "GET",
    `/tenants/${org.organizationId}/investigations/${encodeURIComponent(investigationId)}`,
  );

export const getInvestigationMessagesService = (org: OrgContext, investigationId: string) =>
  agentServiceRequest<{ messages: unknown[] }>(
    "GET",
    `/tenants/${org.organizationId}/investigations/${encodeURIComponent(investigationId)}/messages`,
  );
