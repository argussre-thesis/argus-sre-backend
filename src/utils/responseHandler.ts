import { Response } from "express";
import {
  ApiErrorResponse,
  ApiSuccessResponse,
} from "../types/apiResponse";

export const successResponse = <T>(
  res: Response,
  status: number,
  message: string,
  data: T,
): void => {
  const response: ApiSuccessResponse<T> = {
    success: true,
    message,
    data,
  };

  res.status(status).json(response);
};

export const errorResponse = (
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown | null = null,
): void => {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };

  res.status(status).json(response);
};
