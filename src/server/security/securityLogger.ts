/**
 * NEXORA Security Foundation
 * Centralized Security Event & Audit Logger
 */

import { logger } from '../utils/logger.ts';
import { getRequestContext } from '../middleware/requestContext.ts';
import { getTenantContext } from '../middleware/tenantContext.ts';
import { redactSensitiveData } from './redaction.ts';

export type SecurityEventType =
  | 'CORS_ORIGIN_REJECTED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'NOSQL_INJECTION_BLOCKED'
  | 'XSS_PAYLOAD_DETECTED'
  | 'CSRF_VALIDATION_FAILED'
  | 'SSRF_ATTEMPT_BLOCKED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_UPLOAD_BLOCKED'
  | 'VALIDATION_FAILURE'
  | 'AUTH_FAILURE'
  | 'FORBIDDEN_ACCESS'
  | 'SECRET_ACCESS_AUDIT';

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SecurityEventRecord {
  id: string;
  timestamp: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  requestId?: string;
  correlationId?: string;
  tenantId?: string;
  clientIp?: string;
  method?: string;
  path?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const MAX_RECENT_EVENTS = 100;
const recentSecurityEvents: SecurityEventRecord[] = [];

export function logSecurityEvent(params: {
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  message: string;
  metadata?: Record<string, unknown>;
}): SecurityEventRecord {
  const reqCtx = getRequestContext();
  const tenantCtx = getTenantContext();

  const record: SecurityEventRecord = {
    id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    eventType: params.eventType,
    severity: params.severity,
    requestId: reqCtx?.requestId,
    correlationId: reqCtx?.correlationId,
    tenantId: tenantCtx?.tenantId,
    clientIp: reqCtx?.clientIp,
    method: reqCtx?.method,
    path: reqCtx?.path,
    message: params.message,
    metadata: params.metadata ? redactSensitiveData(params.metadata) : undefined,
  };

  // Bounded ring buffer for operational security monitoring
  recentSecurityEvents.unshift(record);
  if (recentSecurityEvents.length > MAX_RECENT_EVENTS) {
    recentSecurityEvents.pop();
  }

  const logMeta = {
    securityEvent: record.eventType,
    severity: record.severity,
    clientIp: record.clientIp,
    path: record.path,
    ...(record.metadata || {}),
  };

  if (params.severity === 'CRITICAL' || params.severity === 'HIGH') {
    logger.error(`[SECURITY_ALERT] ${params.message}`, logMeta);
  } else {
    logger.warn(`[SECURITY_EVENT] ${params.message}`, logMeta);
  }

  return record;
}

export function getRecentSecurityEvents(limit = 30): SecurityEventRecord[] {
  return recentSecurityEvents.slice(0, Math.min(limit, MAX_RECENT_EVENTS));
}
