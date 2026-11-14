/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Centralized Structured Logger with Automatic Secret Redaction & Correlation IDs
 */

import { env } from '../../../packages/config/src/index.ts';
import { redactSensitiveData, redactString } from '../security/redaction.ts';
import { getRequestContext } from '../middleware/requestContext.ts';

type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

function shouldLog(level: LogLevel): boolean {
  const configuredPriority = LOG_LEVEL_PRIORITIES[env.LOG_LEVEL as LogLevel] ?? 2;
  const messagePriority = LOG_LEVEL_PRIORITIES[level];
  return messagePriority <= configuredPriority;
}

export function formatLogEntry(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const safeMessage = redactString(message);
  const ctx = getRequestContext();

  const mergedMeta = redactSensitiveData({
    ...(ctx ? { requestId: ctx.requestId, correlationId: ctx.correlationId } : {}),
    ...(meta || {}),
  });

  const hasMeta = Object.keys(mergedMeta).length > 0;

  if (env.NODE_ENV === 'production') {
    return JSON.stringify({
      timestamp,
      level: level.toUpperCase(),
      message: safeMessage,
      ...(hasMeta ? { meta: mergedMeta } : {}),
    });
  }

  const colors = {
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[36m',
    http: '\x1b[35m',
    debug: '\x1b[90m',
    reset: '\x1b[0m',
  };

  const color = colors[level] || colors.reset;
  const metaString = hasMeta ? ` ${JSON.stringify(mergedMeta)}` : '';
  return `${colors.reset}[${timestamp}] ${color}[${level.toUpperCase()}]${colors.reset} ${safeMessage}${metaString}`;
}

export const logger = {
  error(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('error')) {
      console.error(formatLogEntry('error', message, meta));
    }
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('warn')) {
      console.warn(formatLogEntry('warn', message, meta));
    }
  },
  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('info')) {
      console.info(formatLogEntry('info', message, meta));
    }
  },
  http(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('http')) {
      console.log(formatLogEntry('http', message, meta));
    }
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('debug')) {
      console.debug(formatLogEntry('debug', message, meta));
    }
  },
};
