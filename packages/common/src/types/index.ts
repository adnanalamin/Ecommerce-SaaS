/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Shared TypeScript Types & Contracts
 */

export type UserRole =
  | 'PLATFORM_SUPER_ADMIN'
  | 'PLATFORM_ADMIN'
  | 'STORE_OWNER'
  | 'STORE_STAFF'
  | 'CUSTOMER';

export type TenantStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'ARCHIVED';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentStatus =
  | 'UNPAID'
  | 'AUTHORIZED'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'FAILED';

export type PaymentGatewayType =
  | 'BKASH'
  | 'NAGAD'
  | 'ROCKET'
  | 'SSLCOMMERZ'
  | 'STRIPE'
  | 'PAYPAL'
  | 'BANK_TRANSFER'
  | 'COD';

export interface ApiResponseMeta {
  page?: number;
  pageSize?: number;
  totalCount?: number;
  totalPages?: number;
  timestamp: string;
  traceId?: string;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  traceId?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiResponseMeta;
}

export interface ServiceHealthStatus {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  responseTimeMs?: number;
  message?: string;
}

export interface HealthCheckResponse {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  timestamp: string;
  uptimeSeconds: number;
  environment: 'development' | 'test' | 'production';
  version: string;
  services: {
    database: ServiceHealthStatus;
    memory: {
      rssMB: number;
      heapTotalMB: number;
      heapUsedMB: number;
    };
  };
}
