/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Standardized API Response Builders
 */

import { Response } from 'express';
import { ApiResponse, ApiResponseMeta, ApiErrorDetail } from '../../../packages/common/src/index.ts';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Omit<ApiResponseMeta, 'timestamp'>
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      ...meta,
      timestamp: new Date().toISOString(),
    },
  };
  return res.status(statusCode).json(response);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  page: number,
  pageSize: number,
  totalCount: number
): Response {
  const totalPages = Math.ceil(totalCount / pageSize);
  return sendSuccess(res, data, 200, {
    page,
    pageSize,
    totalCount,
    totalPages,
  });
}

export function sendError(
  res: Response,
  statusCode = 500,
  code = 'INTERNAL_ERROR',
  message = 'An unexpected error occurred',
  details?: ApiErrorDetail[],
  traceId?: string
): Response {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details,
      traceId,
    },
    meta: {
      timestamp: new Date().toISOString(),
      traceId,
    },
  };
  return res.status(statusCode).json(response);
}
