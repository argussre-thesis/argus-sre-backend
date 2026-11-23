import express from "express";
import { handleSlackEvent, slackOAuthCallback } from "../controller/slack.controller";

const slackRoutes = express.Router();

slackRoutes.get("/oauth/callback", slackOAuthCallback);
slackRoutes.post("/events", express.raw({ type: "application/json" }), handleSlackEvent);

export default slackRoutes;
