import { agentServiceRequest } from "../lib/agentService";
import { prisma } from "../lib/prisma";
import { postSlackMessage, slack, slackReport } from "../lib/slack";
import { ConversationEndedInput, SlackMention } from "../schemas/conversation.schema";
import { ok } from "../types/serviceResponse";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { decryptSecret } from "../utils/token";
import { mcpServersForAgent } from "./mcpServerModel";

// Generic: the real error can name internal hosts, and the whole channel reads this.
const TURN_FAILED = "Sorry, I couldn't answer that. Please try again.";

type SlackMessage = { user?: string | undefined; text?: string | undefined; ts?: string | undefined };

// Oldest first, ending at the mention. Null when the newest messages are out of reach.
const readLatestMessages = async (token: string, mention: SlackMention) => {
  const { channel, ts, thread_ts } = mention;
  const upToMention = { token, channel, latest: ts, inclusive: true };
  // Off for now: unrelated channel messages read as one conversation, and earlier questions as still unanswered.
  // if (!thread_ts) {
  //   const { messages = [] } = await slack.conversations.history({ ...upToMention, limit: env.SLACK_THREAD_MESSAGES });
  //   return messages.toReversed();
  // }
  if (!thread_ts) return [mention];
  // Replies come oldest first with no way to reverse them, so the latest take a full read.
  const { messages = [], has_more } = await slack.conversations.replies({ ...upToMention, ts: thread_ts, limit: 200 });
  return has_more ? null : messages.slice(-env.SLACK_THREAD_MESSAGES);
};

export const conversationText = (messages: SlackMessage[] | null, mention: SlackMention, botUserId: string) => {
  const line = ({ user, text }: SlackMessage) => `${user === botUserId ? "argus (you)" : (user ?? "bot")}: ${text}`;
  // The prompt tells the model that the last message is the one addressed to it.
  return messages?.at(-1)?.ts === mention.ts
    ? messages.filter((m) => m.text).map(line).join("\n")
    : `(Earlier messages could not be read.)\n${line(mention)}`;
};

// Hands the mention to the agent service, which answers later through /conversations/ended.
export const handleSlackMentionService = async (teamId: string, mention: SlackMention) => {
  const installation = await prisma.slackInstallation.findUnique({
    where: { teamId },
    select: {
      organizationId: true,
      botUserId: true,
      encryptedToken: true,
      organization: { select: { conversationLevel: true, webSearchToolEnabled: true, maxModelCalls: true } },
    },
  });
  if (!installation) {
    logger.warn({ teamId }, "Slack mention from a workspace with no installation");
    return;
  }

  const { organizationId, botUserId, encryptedToken, organization } = installation;
  const thread_ts = mention.thread_ts ?? mention.ts;
  const externalId = `${mention.channel}:${thread_ts}`;
  const logContext = { organizationId, externalId };

  const [messages, clusters, incident, mcpServers] = await Promise.all([
    readLatestMessages(decryptSecret(encryptedToken), mention).catch((err: unknown) => {
      logger.warn({ err, ...logContext }, "Slack read failed");
      return null;
    }),
    prisma.cluster.findMany({ where: { organizationId }, select: { name: true } }),
    prisma.incident.findFirst({
      where: { organizationId, slackChannelId: mention.channel, slackTs: thread_ts },
      select: {
        id: true,
        title: true,
        cluster: { select: { name: true } },
        alerts: {
          orderBy: { startsAt: "asc" },
          select: { status: true, startsAt: true, endsAt: true, labels: true, annotations: true },
        },
      },
    }),
    mcpServersForAgent(organizationId),
  ]);

  const started = await agentServiceRequest<null>("POST", `/tenants/${organizationId}/conversations/messages`, {
    externalId,
    text: conversationText(messages, mention, botUserId),
    clusters: clusters.map((cluster) => cluster.name),
    mcpServers,
    level: organization.conversationLevel,
    webSearch: organization.webSearchToolEnabled,
    maxModelCalls: organization.maxModelCalls,
    // if cluster exists add incident, else nothing
    ...(incident?.cluster && {
      incident: {
        incidentId: incident.id,
        cluster: incident.cluster.name,
        title: incident.title,
        alerts: incident.alerts,
      },
    }),
  });
  if (!started.success) {
    await postSlackMessage(encryptedToken, { channel: mention.channel, thread_ts, text: TURN_FAILED }, logContext);
  }
};

export const conversationSlackMessage = ({ externalId, status, reply }: ConversationEndedInput) => {
  const colon = externalId.indexOf(":");
  return {
    channel: externalId.slice(0, colon),
    thread_ts: externalId.slice(colon + 1),
    text: status === "done" && reply ? slackReport(reply) : TURN_FAILED,
  };
};

export const postConversationEndedService = async (ended: ConversationEndedInput) => {
  const installation = await prisma.slackInstallation.findUnique({
    where: { organizationId: ended.tenantId },
    select: { encryptedToken: true },
  });
  if (!installation) return ok({ posted: false });

  const posted = await postSlackMessage(installation.encryptedToken, conversationSlackMessage(ended), {
    organizationId: ended.tenantId,
    externalId: ended.externalId,
  });
  return ok({ posted: posted !== null });
};
