import { NextFunction, Request, Response } from "express";
import {
  createClusterService,
  deleteClusterService,
  listClustersService,
  rotateClusterTokenService,
  verifyRunnerTokenService,
} from "../model/clusterModel";
import { OrgScopedRequest } from "../types/express";
import { errorResponse, successResponse } from "../utils/responseHandler";

export const listClusters = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await listClustersService(org);

    return successResponse(
      res,
      200,
      "Clusters fetched successfully",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const createCluster = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await createClusterService(org, req.body);

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
      "Cluster created. Store the runner token now, it is not shown again",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const rotateClusterToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await rotateClusterTokenService(
      org,
      req.params.clusterId as string,
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
      "Runner token rotated. Store the new token now, it is not shown again",
      result.data,
    );
  } catch (error) {
    next(error);
  }
};

export const deleteCluster = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { org } = req as OrgScopedRequest;
    const result = await deleteClusterService(
      org,
      req.params.clusterId as string,
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

    return successResponse(res, 200, "Cluster deleted", result.data);
  } catch (error) {
    next(error);
  }
};

export const verifyRunnerToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await verifyRunnerTokenService(req.body.token);

    if (!result.success) {
      return errorResponse(
        res,
        result.status,
        result.code,
        result.message,
        result.details,
      );
    }

    return successResponse(res, 200, "Runner token is valid", result.data);
  } catch (error) {
    next(error);
  }
};
