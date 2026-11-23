import express from "express";
import { verifyRunnerToken } from "../controller/cluster.controller";
import { postConversationEnded, postInvestigationEnded } from "../controller/slack.controller";
import { requireInternalToken } from "../middleware/internalAuth";
import { validateBody } from "../middleware/validateSchema";
import { verifyRunnerTokenSchema } from "../schemas/cluster.schema";
import { conversationEndedSchema } from "../schemas/conversation.schema";
import { investigationEndedSchema } from "../schemas/incident.schema";
import { env } from "../utils/env";

const internalRoutes = express.Router();

internalRoutes.post(
  "/runner-tokens/verify",
  requireInternalToken(env.GATEWAY_BACKEND_TOKEN),
  validateBody(verifyRunnerTokenSchema),
  verifyRunnerToken,
);
internalRoutes.post(
  "/investigations/ended",
  requireInternalToken(env.BACKEND_AGENT_SERVICE_TOKEN),
  validateBody(investigationEndedSchema),
  postInvestigationEnded,
);
internalRoutes.post(
  "/conversations/ended",
  requireInternalToken(env.BACKEND_AGENT_SERVICE_TOKEN),
  validateBody(conversationEndedSchema),
  postConversationEnded,
);

export default internalRoutes;
