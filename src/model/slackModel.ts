import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isPrismaError, prisma } from "../lib/prisma";
import { escapeSlack, postSlackMessage, slack, slackReport } from "../lib/slack";
import { InvestigationEndedInput } from "../schemas/incident.schema";
import { OrgContext } from "../types/express";
import { fail, ok } from "../types/serviceResponse";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { decryptSecret, encryptSecret } from "../utils/token";

const signState = (payload: string) =>
  createHmac("sha256", env.SLACK_STATE_SECRET).update(payload).digest("base64url");

// The Slack redirect carries no Clerk token, so the state says which org and admin started the install.
export const createInstallState = (organizationId: string, userId: string) => {
  const payload = `${organizationId}.${userId}.${Date.now() + 10 * 60_000}`;
  return `${payload}.${signState(payload)}`;
};

export const getSlackStatusService = async (org: OrgContext) => {
  const installation = await prisma.slackInstallation.findUnique({
    where: { organizationId: org.organizationId },
    select: { teamName: true, channelName: true, updatedAt: true },
  });
  if (!installation) return ok({ connected: false });
  return ok({
    connected: true,
    teamName: installation.teamName,
    channelName: installation.channelName,
    installedAt: installation.updatedAt,
  });
};

export const createSlackInstallUrlService = (org: OrgContext, userId: string) => {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: "chat:write,incoming-webhook,channels:join,app_mentions:read,channels:history,groups:history",
    redirect_uri: env.SLACK_REDIRECT_URL,
    state: createInstallState(org.organizationId, userId),
  });
  return ok({ url: `https://slack.com/oauth/v2/authorize?${params}` });
};

export const disconnectSlackService = async (org: OrgContext) => {
  const installation = await prisma.slackInstallation.findUnique({
    where: { organizationId: org.organizationId },
    select: { encryptedToken: true },
  });
  if (!installation) return fail(404, "SLACK_NOT_CONNECTED", "Slack is not connected");

  try {
    await slack.apps.uninstall({
      token: decryptSecret(installation.encryptedToken),
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
    });
  } catch (err) {
    logger.warn({ err, organizationId: org.organizationId }, "Slack uninstall failed");
  }
  await prisma.slackInstallation.deleteMany({ where: { organizationId: org.organizationId } });
  return ok({ connected: false });
};

export const verifyInstallState = (state: string) => {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [organizationId, userId, expiresAt, signature] = parts as [string, string, string, string];

  const expected = Buffer.from(signState(`${organizationId}.${userId}.${expiresAt}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (!(Number(expiresAt) > Date.now())) return null;
  return { organizationId, userId };
};

// The SDK types every field as optional.
const oauthAccessSchema = z.object({
  access_token: z.string(),
  bot_user_id: z.string(),
  team: z.object({ id: z.string(), name: z.string() }),
  incoming_webhook: z.object({ channel_id: z.string(), channel: z.string() }),
});

// Returns the `slack` query value Settings shows when the browser comes back.
export const completeSlackInstallService = async (query: {
  code: string | undefined;
  state: string | undefined;
  error: string | undefined;
}) => {
  // state holds the org and user ID that made the install request
  const install = query.state ? verifyInstallState(query.state) : null;
  if (!install) return "error";
  if (query.error) return "cancelled"; // User clicked Cancel.
  if (!query.code) return "error";

  const access = oauthAccessSchema.parse(
    await slack.oauth.v2.access({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code: query.code,
      redirect_uri: env.SLACK_REDIRECT_URL,
    }),
  );

  const data = {
    teamId: access.team.id,
    teamName: access.team.name,
    channelId: access.incoming_webhook.channel_id,
    channelName: access.incoming_webhook.channel,
    botUserId: access.bot_user_id,
    encryptedToken: encryptSecret(access.access_token),
    installedBy: install.userId,
  };
  try {
    await prisma.slackInstallation.upsert({
      where: { organizationId: install.organizationId },
      create: { organizationId: install.organizationId, ...data },
      update: data,
    });
  } catch (error) {
    // teamId is unique: the workspace is connected to another org.
    if (isPrismaError(error, "P2002")) return "workspace_taken";
    throw error;
  }

  try {
    await slack.conversations.join({ token: access.access_token, channel: data.channelId });
    await slack.chat.postMessage({
      token: access.access_token,
      channel: data.channelId,
      text: "Argus is connected. New incidents will be posted here.",
    });
  } catch (err) {
    logger.warn({ err, organizationId: install.organizationId }, "Slack test message failed");
    return "cannot_post";
  }
  return "connected";
};

// Splitting report into 2 sections
export const splitSlackReport = (report: string) => {
  const sections = report.split(/^(?=##\s)/m);
  const inReply = (section: string) => /^##\s+(evidence|not checked)\s*$/im.test(section);
  return {
    main: slackReport(sections.filter((s) => !inReply(s)).join("").trim()),
    reply: slackReport(sections.filter(inReply).join("").trim()),
  };
};

export const incidentSlackHeader = (incident: {
  id: string;
  title: string;
  cluster: { name: string } | null;
  alerts: { labels: unknown; annotations: unknown; generatorUrl: string | null }[];
  _count: { alerts: number };
}) => {
  const count = incident._count.alerts;
  const alertLines = incident.alerts.map((alert) => {
    const name = escapeSlack((alert.labels as Record<string, string>).alertname ?? "Unnamed alert");
    const summary = (alert.annotations as Record<string, string>).summary;
    const link = alert.generatorUrl ? `<${escapeSlack(alert.generatorUrl)}|${name}>` : name;
    return summary ? `• ${link}: ${escapeSlack(summary)}` : `• ${link}`;
  });
  return [
    `:rotating_light: *<${env.FRONTEND_URL}/incidents/${incident.id}|${escapeSlack(incident.title)}>*`,
    `Cluster \`${incident.cluster?.name ?? "unknown"}\` · ${count} alert${count === 1 ? "" : "s"}`,
    ...alertLines,
    ...(count > incident.alerts.length ? [`and ${count - incident.alerts.length} more`] : []),
  ].join("\n");
};

export const postInvestigationEndedService = async (ended: InvestigationEndedInput) => {
  const incident = await prisma.incident.findFirst({
    where: { id: ended.incidentId, organizationId: ended.tenantId },
    select: {
      id: true,
      title: true,
      slackChannelId: true,
      slackTs: true,
      cluster: { select: { name: true } },
      alerts: {
        orderBy: { startsAt: "asc" },
        take: 5,
        select: { labels: true, annotations: true, generatorUrl: true },
      },
      _count: { select: { alerts: true } },
    },
  });
  if (!incident) return fail(404, "INCIDENT_NOT_FOUND", "Incident not found");

  const installation = await prisma.slackInstallation.findUnique({
    where: { organizationId: ended.tenantId },
    select: { channelId: true, encryptedToken: true },
  });
  if (!installation) return ok({ posted: false });

  const post = (message: { channel: string; text: string; thread_ts?: string }) =>
    postSlackMessage(installation.encryptedToken, message, {
      organizationId: ended.tenantId,
      incidentId: incident.id,
      investigationId: ended.investigationId,
    });
  const failed = `Investigation failed: ${escapeSlack(ended.error ?? "unknown error")}`;

  // Thread exists
  if (incident.slackChannelId && incident.slackTs) {
    const text = ended.status === "done" ? slackReport(ended.report ?? "") : failed;
    const posted = await post({ channel: incident.slackChannelId, thread_ts: incident.slackTs, text });
    return ok({ posted: posted !== null });
  }

  // No thread
  const { main, reply } =
    ended.status === "done" ? splitSlackReport(ended.report ?? "") : { main: failed, reply: "" };
  const posted = await post({ channel: installation.channelId, text: `${incidentSlackHeader(incident)}\n\n${main}` });
  if (!posted) return ok({ posted: false });

  await prisma.incident.update({
    where: { id: incident.id },
    data: { slackChannelId: installation.channelId, slackTs: posted.ts ?? null },
  });
  if (reply && posted.ts) await post({ channel: installation.channelId, thread_ts: posted.ts, text: reply });
  return ok({ posted: true });
};
