import express from "express";
import { handleClerkWebhook } from "../controller/clerkWebhook.controller";

const clerkWebhookRoutes = express.Router();

clerkWebhookRoutes.post(
  "/",
  express.raw({ type: "application/json" }),
  handleClerkWebhook,
);

export default clerkWebhookRoutes;
