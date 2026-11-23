import { NextFunction, Request, Response } from "express";
import {
  completeSlackInstallService,
  createSlackInstallUrlService,
  disconnectSlackService,
  getSlackStatusService,
  postInvestigationEndedService,
} from "../model/slackModel";
import { handleSlackMentionService, postConversationEndedService } from "../model/slackChatModel";
import { slackEventSchema } from "../schemas/conversation.schema";
import { verifySlackSignature } from "../lib/slack";
import { OrgScopedRequest } from "../types/express";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { errorResponse, successResponse } from "../utils/responseHandler";

export const getSlackStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await getSlackStatusService(org);

    return successResponse(res, 200, "Slack status fetched successfully", result.data);
  } catch (error) {
    next(error);
  }
};

export const createSlackInstallUrl = (req: Request, res: Response) => {
  const { org, clerkUserId } = req as OrgScopedRequest;
  const result = createSlackInstallUrlService(org, clerkUserId);

  return successResponse(res, 200, "Slack install URL created", result.data);
};

export const disconnectSlack = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await disconnectSlackService(org);

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(res, 200, "Slack disconnected", result.data);
  } catch (error) {
    next(error);
  }
};

export const postInvestigationEnded = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await postInvestigationEndedService(req.body);

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(res, 200, "Investigation end received", result.data);
  } catch (error) {
    next(error);
  }
};

export const postConversationEnded = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await postConversationEndedService(req.body);

    return successResponse(res, 200, "Conversation end received", result.data);
  } catch (error) {
    next(error);
  }
};

// Call the agent service before answering: serverless freezes after the reply.
export const handleSlackEvent = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signed = verifySlackSignature(
      rawBody,
      req.header("x-slack-request-timestamp"),
      req.header("x-slack-signature"),
    );
    if (!signed) {
      return errorResponse(res, 401, "INVALID_SLACK_SIGNATURE", "Slack signature verification failed");
    }

    const parsed = slackEventSchema.safeParse(JSON.parse(rawBody.toString()));
    if (parsed.success && parsed.data.type === "url_verification") {
      return res.json({ challenge: parsed.data.challenge });
    }

    // Slack retries after a timeout; answering the retry would reply twice.
    const isTimeoutRetry = req.header("x-slack-retry-reason") === "http_timeout";
    if (parsed.success && parsed.data.type === "event_callback" && !isTimeoutRetry && !parsed.data.event.bot_id) {
      await handleSlackMentionService(parsed.data.team_id, parsed.data.event);
    }

    return successResponse(res, 200, "Event received", null);
  } catch (error) {
    next(error);
  }
};

// redirect to frontend
export const slackOAuthCallback = async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const outcome = await completeSlackInstallService({
    code: typeof code === "string" ? code : undefined,
    state: typeof state === "string" ? state : undefined,
    error: typeof error === "string" ? error : undefined,
  }).catch((err: unknown) => {
    logger.error({ err }, "Slack install failed");
    return "error";
  });

  logger.info({ outcome }, "Slack install callback");
  res.redirect(`${env.FRONTEND_URL}/settings?slack=${outcome}`);
};
