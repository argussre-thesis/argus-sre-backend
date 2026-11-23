import express from "express";
import { receiveAlerts } from "../controller/alertWebhook.controller";
import { validateBody } from "../middleware/validateSchema";
import { alertWebhookSchema } from "../schemas/alertWebhook.schema";

const alertWebhookRoutes = express.Router();

alertWebhookRoutes.post("/alerts", validateBody(alertWebhookSchema), receiveAlerts);

export default alertWebhookRoutes;
