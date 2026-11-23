import { NextFunction, Request, Response } from "express";
import { receiveAlertsService } from "../model/alertWebhookModel";
import { errorResponse, successResponse } from "../utils/responseHandler";

export const receiveAlerts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    const result = await receiveAlertsService(token, req.body);

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(res, 200, "Alerts received", result.data);
  } catch (error) {
    next(error);
  }
};
