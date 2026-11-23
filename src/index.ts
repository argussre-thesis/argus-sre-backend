import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { requireAuth } from "./middleware/authUser";
import { syncUser } from "./middleware/syncUser";
import errorHandling from "./middleware/error/errorHandler";
import userRoutes from "./routes/user.route";
import organizationRoutes from "./routes/organization.route";
import clerkWebhookRoutes from "./routes/clerkWebhook.route";
import internalRoutes from "./routes/internal.route";
import alertWebhookRoutes from "./routes/alertWebhook.route";
import slackRoutes from "./routes/slack.route";
import { env } from "./utils/env";
import { errorResponse, successResponse } from "./utils/responseHandler";
import { prisma } from "./lib/prisma";
import { logger, httpLogger } from "./utils/logger";
const app = express();

app.set("trust proxy", 1);
app.use(httpLogger);
app.use(helmet());
app.use(
  cors({
    origin: [
      env.FRONTEND_URL
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: { success: false, message: "Too many requests, please try again later." }
});

app.use("/api/v1/webhooks/clerk", clerkWebhookRoutes);
app.use("/webhooks/v1", webhookLimiter, express.json({ limit: "1mb" }), alertWebhookRoutes);
// No express.json(): Slack signs the raw body.
app.use("/slack/v1", webhookLimiter, slackRoutes);

app.use(express.json());
app.use("/internal/v1", internalRoutes);

app.use(clerkMiddleware());

app.get("/", async (req: Request, res: Response) => {
  successResponse(res, 200, "Service is healthy", { status: "up" });
});

app.get("/health", async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    successResponse(res, 200, "Service is healthy", { status: "up", db: "connected" });
  } catch (error) {
    errorResponse(res, 503, "SERVICE_UNAVAILABLE", "Service unavailable", { db: "disconnected" });
  }
});

app.use("/api/v1/", requireAuth, syncUser);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/organizations", organizationRoutes);

const PORT = env.PORT;
app.use((req: Request, res: Response) => {
  errorResponse(res, 404, "ROUTE_NOT_FOUND", "Route not found");
});
app.use(errorHandling);
const server = app.listen(PORT, (error) => {
  if (error) {
    logger.error({ err: error }, "Server failed to start");
    process.exit(1);
  }
  logger.info(`Server running on http://localhost:${PORT}`);
});

process.on("SIGTERM", async () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  server.close(async () => {
    logger.info("HTTP server closed");
    await prisma.$disconnect();
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  logger.info("SIGINT signal received: closing HTTP server");
  server.close(async () => {
    logger.info("HTTP server closed");
    await prisma.$disconnect();
    process.exit(0);
  });
});
