export type ServiceError = {
  success: false;
  status: 400 | 401 | 403 | 404 | 409 | 500 | 503;
  code: string;
  message: string;
  details: unknown | null;
};

export type ServiceSuccess<T> = {
  success: true;
  data: T;
};

export type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

export const ok = <T>(data: T): ServiceSuccess<T> => ({
  success: true,
  data,
});

export const fail = (
  status: ServiceError["status"],
  code: string,
  message: string,
  details: unknown | null = null,
): ServiceError => ({
  success: false,
  status,
  code,
  message,
  details,
});
