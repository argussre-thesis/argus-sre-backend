import { createHash } from "node:crypto";
import { isPrismaError, prisma } from "../lib/prisma";
import { autoInvestigateIncident } from "./incidentModel";
import { Prisma } from "../prisma/generated/prisma/client";
import { AlertWebhookInput, WebhookAlert } from "../schemas/alertWebhook.schema";
import { ok, fail } from "../types/serviceResponse";
import { hashToken } from "../utils/token";

const findAlertSource = (token: string) =>
  prisma.alertSource.findUnique({
    where: { tokenHash: hashToken(token), organization: { deletedAt: null } },
    select: {
      id: true,
      organizationId: true,
      clusterLabel: true,
      clusters: { select: { cluster: { select: { id: true, name: true } } } },
      organization: { select: { incidentGroupingWindowMinutes: true, autoInvestigateEnabled: true } },
    },
  });

type AlertSourceContext = NonNullable<Awaited<ReturnType<typeof findAlertSource>>>;

export const resolveClusterId = (
  source: Pick<AlertSourceContext, "clusterLabel" | "clusters">,
  labels: Record<string, string>,
) => {
  const label = labels[source.clusterLabel];
  // No cluster label: use the only cluster. An unknown label stays unknown.
  if (label === undefined && source.clusters.length === 1) return source.clusters[0]!.cluster.id;
  return source.clusters.find(({ cluster }) => cluster.name === label)?.cluster.id ?? null; 
};

// Older Grafana omits the fingerprint.
export const alertFingerprint = (alert: Pick<WebhookAlert, "fingerprint" | "labels">) =>
  alert.fingerprint ||
  createHash("sha256")
    .update(JSON.stringify(Object.entries(alert.labels).sort()))
    .digest("hex")
    .slice(0, 16);

// Grafana's contact point "Test" button.
export const isGrafanaTestAlert = (labels: Record<string, string>) =>
  labels.alertname === "TestAlert" && labels.instance === "Grafana";

// Held until the transaction ends.
export const lockClusterIncidents = (
  tx: Prisma.TransactionClient,
  organizationId: string,
  clusterId: string | null,
) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${clusterId ?? ""}))`;

const resolveIncidentIfDone =(incidentId: string, now: Date) =>
  prisma.incident.updateMany({
    where: { id: incidentId, status: "OPEN", alerts: { none: { status: "FIRING" } } },
    data: { status: "RESOLVED", resolvedAt: now },
  });

const receiveAlert = async (
  source: AlertSourceContext,
  alert: WebhookAlert,
  now: Date,
) => {
  const fingerprint = alertFingerprint(alert);
  const resolved = alert.status === "resolved";

  try {
    // if the alert exists already
    const { incidentId } = await prisma.alert.update({
      where: {
        organizationId_fingerprint_startsAt: {
          organizationId: source.organizationId,
          fingerprint,
          startsAt: alert.startsAt,
        },
      },      
      data: {
        lastReceivedAt: now,
        ...(resolved && { status: "RESOLVED", endsAt: alert.endsAt ?? now }),
      },
      select: { incidentId: true },
    });
    if (resolved) await resolveIncidentIfDone(incidentId, now);
    return;
  } catch (error) {
    // Alert doesn't exist
    if (!isPrismaError(error, "P2025")) throw error;
  }

  if (resolved) return;

  const clusterId = resolveClusterId(source, alert.labels);
  const alertData = {
    organizationId: source.organizationId,
    alertSourceId: source.id,
    fingerprint,
    startsAt: alert.startsAt,
    labels: alert.labels,
    annotations: alert.annotations,
    generatorUrl: alert.generatorURL || null,
    lastReceivedAt: now,
  };

  const windowMs = source.organization.incidentGroupingWindowMinutes * 60_000;
  const isTest = isGrafanaTestAlert(alert.labels);

  try {
    const incidentId = await prisma.$transaction(async (tx) => {
      // Parallel requests for one cluster would each open an incident.
      await lockClusterIncidents(tx, source.organizationId, clusterId);

      const openIncident = !isTest && await tx.incident.findFirst({
        where: {
          organizationId: source.organizationId,
          clusterId,
          status: "OPEN",
          isTest: false,
          createdAt: { gte: new Date(now.getTime() - windowMs) },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (openIncident) {
        await tx.alert.create({ data: { ...alertData, incidentId: openIncident.id } });
        return openIncident.id;
      }
      const incident = await tx.incident.create({
        data: {
          organizationId: source.organizationId,
          clusterId,
          isTest,
          title: alert.annotations.summary ?? alert.labels.alertname ?? "Unnamed alert",
          alerts: { create: alertData },
        },
        select: { id: true },
      });
      return incident.id;
    });
    // Test and unknown-cluster incidents are never investigated.
    return isTest || !clusterId ? undefined : incidentId;
  } catch (error) {
    if (!isPrismaError(error, "P2002")) throw error;
  }
};

export const receiveAlertsService = async (
  token: string | undefined,
  input: AlertWebhookInput,
) => {
  const source = token ? await findAlertSource(token) : null;
  if (!source) {
    return fail(401, "INVALID_ALERT_TOKEN", "Alert webhook token is invalid or revoked");
  }
  const now = new Date();
  // One at a time so alerts in one payload join the same incident.
  // shortcut: 2-3 queries per alert, batch them if large alert groups make the webhook slow
  const toInvestigate = new Set<string>();
  for (const alert of input.alerts) {
    const incidentId = await receiveAlert(source, alert, now);
    if (incidentId) toInvestigate.add(incidentId);
  }

  await prisma.alertSource.update({
    where: { id: source.id },
    data: { lastReceivedAt: now },
  });

  // After the loop so the run sees every alert. Awaited: serverless freezes after the reply.
  if (source.organization.autoInvestigateEnabled) {
    for (const incidentId of toInvestigate) await autoInvestigateIncident(source.organizationId, incidentId);
  }

  return ok({ received: input.alerts.length });
};
