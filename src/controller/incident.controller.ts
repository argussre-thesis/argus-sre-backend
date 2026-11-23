import { NextFunction, Request, Response } from "express";
import {
  getIncidentService,
  getInvestigationMessagesService,
  getInvestigationService,
  investigateIncidentService,
  listIncidentInvestigationsService,
  listIncidentsService,
  resolveIncidentService,
} from "../model/incidentModel";
import { OrgScopedRequest } from "../types/express";
import { errorResponse, successResponse } from "../utils/responseHandler";

export const listIncidents = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await listIncidentsService(org, req.query);

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
      "Incidents fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const getIncident = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await getIncidentService(
      org,
      req.params.incidentId as string,
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
      "Incident fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const resolveIncident = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await resolveIncidentService(
      org,
      req.params.incidentId as string,
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

    return successResponse(res, 200, "Incident resolved", result.data);
  } catch (error) {
    next(error);
  }
};

export const investigateIncident = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await investigateIncidentService(
      org,
      req.params.incidentId as string,
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

    return successResponse(res, 202, "Investigation started", result.data);
  } catch (error) {
    next(error);
  }
};

export const listIncidentInvestigations = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await listIncidentInvestigationsService(
      org,
      req.params.incidentId as string,
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
      "Investigations fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const getInvestigation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await getInvestigationService(
      org,
      req.params.investigationId as string,
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
      "Investigation fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const getInvestigationMessages = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await getInvestigationMessagesService(
      org,
      req.params.investigationId as string,
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
      "Investigation messages fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};
