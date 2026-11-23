import { NextFunction, Request, Response } from "express";
import { verifyWebhook } from "@clerk/express/webhooks";
import {
  ClerkWebhookMetadata,
  processClerkWebhook,
} from "../model/clerkWebhookModel";
import { errorResponse, successResponse } from "../utils/responseHandler";

type ClerkWebhookEnvelopeMetadata = {
  instance_id?: string;
  timestamp?: number;
};

const getEventTimestamp = (
  event: ClerkWebhookEnvelopeMetadata,
  request: Request,
): Date => {
  if (typeof event.timestamp === "number") return new Date(event.timestamp);

  const svixTimestamp = Number(request.header("svix-timestamp"));
  if (Number.isFinite(svixTimestamp)) return new Date(svixTimestamp * 1000);

  return new Date();
};

export const handleClerkWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let event;

  try {
    event = await verifyWebhook(req);
  } catch {
    return errorResponse(
      res,
      400,
      "INVALID_WEBHOOK_SIGNATURE",
      "Webhook signature verification failed",
    );
  }

  const eventId = req.header("svix-id");
  if (!eventId) {
    return errorResponse(
      res,
      400,
      "MISSING_WEBHOOK_ID",
      "Webhook delivery ID is missing",
    );
  }

  const envelope = event as typeof event & ClerkWebhookEnvelopeMetadata;
  const metadata: ClerkWebhookMetadata = {
    eventId,
    eventTimestamp: getEventTimestamp(envelope, req),
    ...(envelope.instance_id && { instanceId: envelope.instance_id }),
  };

  try {
    const result = await processClerkWebhook(envelope, metadata);
    return successResponse(res, 200, "Webhook received", result);
  } catch (error) {
    next(error);
  }
};
