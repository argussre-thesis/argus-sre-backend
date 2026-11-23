import { NextFunction, Request, Response } from "express";
import {
  createAlertSourceService,
  deleteAlertSourceService,
  listAlertSourcesService,
  rotateAlertSourceTokenService,
  updateAlertSourceService,
} from "../model/alertSourceModel";
import { OrgScopedRequest } from "../types/express";
import { errorResponse, successResponse } from "../utils/responseHandler";

export const listAlertSources = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await listAlertSourcesService(org);

    return successResponse(
      res,
      200,
      "Alert sources fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const createAlertSource = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await createAlertSourceService(org, req.body);

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(
      res,
      201,
      "Alert source created. Store the webhook token now, it is not shown again",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const updateAlertSource = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await updateAlertSourceService(
      org,
      req.params.alertSourceId as string,
      req.body,
    );

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(
      res,
      200,
      "Alert source updated",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const rotateAlertSourceToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await rotateAlertSourceTokenService(
      org,
      req.params.alertSourceId as string,
    );

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(
      res,
      200,
      "Webhook token rotated. Store the new token now, it is not shown again",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const deleteAlertSource = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await deleteAlertSourceService(
      org,
      req.params.alertSourceId as string,
    );

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(res, 200, "Alert source deleted", result.data);
  } catch (error) {
    next(error);
  }
};
