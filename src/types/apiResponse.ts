export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown | null;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
