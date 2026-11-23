import { NextFunction, Request, Response } from "express";
import {
  createMcpServerService,
  deleteMcpServerService,
  listMcpServersService,
  updateMcpServerService,
} from "../model/mcpServerModel";
import { OrgScopedRequest } from "../types/express";
import { errorResponse, successResponse } from "../utils/responseHandler";

export const listMcpServers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await listMcpServersService(org);

    return successResponse(
      res,
      200,
      "MCP servers fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const createMcpServer = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await createMcpServerService(org, req.body);

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(res, 201, "MCP server added", result.data);
  } catch (error) {
    next(error);
  }
};

export const updateMcpServer = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await updateMcpServerService(
      org,
      req.params.mcpServerId as string,
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

    return successResponse(res, 200, "MCP server updated", result.data);
  } catch (error) {
    next(error);
  }
};

export const deleteMcpServer = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await deleteMcpServerService(
      org,
      req.params.mcpServerId as string,
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

    return successResponse(res, 200, "MCP server deleted", result.data);
  } catch (error) {
    next(error);
  }
};
