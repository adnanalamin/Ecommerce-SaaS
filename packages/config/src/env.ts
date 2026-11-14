/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * Centralized Environment Configuration & Zod Validator (Production-Hardened)
 */

import { z } from 'zod';

const DEFAULT_DEV_JWT_ACCESS = 'nexora_dev_jwt_access_secret_32_characters_minimum';
const DEFAULT_DEV_JWT_REFRESH = 'nexora_dev_jwt_refresh_secret_32_characters_minimum';
const DEFAULT_DEV_COOKIE = 'nexora_dev_cookie_signing_secret_32_chars_min';
const DEFAULT_DEV_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z
    .string()
    .optional()
    .transform((val) => (!val || val.trim() === '' ? 'http://localhost:3000' : val.trim())),

  // Database
  MONGODB_URI: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || typeof val !== 'string' || val.trim() === '') {
        return 'mongodb://127.0.0.1:27017/nexora_dev';
      }
      const trimmed = val.trim();
      if (!trimmed.startsWith('mongodb://') && !trimmed.startsWith('mongodb+srv://')) {
        return 'mongodb://127.0.0.1:27017/nexora_dev';
      }
      return trimmed;
    }),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(50),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().positive().default(5),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Secrets & Cryptography
  JWT_ACCESS_SECRET: z.string().min(32).default(DEFAULT_DEV_JWT_ACCESS),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEFAULT_DEV_JWT_REFRESH),
  COOKIE_SECRET: z.string().min(32).default(DEFAULT_DEV_COOKIE),
  ENCRYPTION_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_MASTER_KEY must be a 64-character hex string (256-bit AES key)')
    .default(DEFAULT_DEV_ENCRYPTION_KEY),
  CSRF_SECRET: z.string().min(32).default('nexora_dev_csrf_hmac_secret_32_characters_minimum'),

  // CORS & Domains
  CORS_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((val) => (!val || val.trim() === '' ? 'http://localhost:3000,http://127.0.0.1:3000' : val.trim())),
  PLATFORM_DOMAIN: z
    .string()
    .optional()
    .transform((val) => (!val || val.trim() === '' ? 'nexora.shop' : val.trim())),

  // Security Limits & Controls
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(15),
  MAX_REQUEST_BODY_SIZE: z.string().default('1mb'),
  MAX_JSON_DEPTH: z.coerce.number().int().positive().default(20),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),

  // File Upload Guardrails
  MAX_UPLOAD_FILE_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024), // 5 MB

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function validateProductionSecrets(config: EnvConfig): void {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  const weakChecks: Array<{ name: string; failed: boolean }> = [
    { name: 'JWT_ACCESS_SECRET', failed: config.JWT_ACCESS_SECRET === DEFAULT_DEV_JWT_ACCESS || config.JWT_ACCESS_SECRET.includes('nexora_dev') },
    { name: 'JWT_REFRESH_SECRET', failed: config.JWT_REFRESH_SECRET === DEFAULT_DEV_JWT_REFRESH || config.JWT_REFRESH_SECRET.includes('nexora_dev') },
    { name: 'COOKIE_SECRET', failed: config.COOKIE_SECRET === DEFAULT_DEV_COOKIE || config.COOKIE_SECRET.includes('nexora_dev') },
    { name: 'ENCRYPTION_MASTER_KEY', failed: config.ENCRYPTION_MASTER_KEY === DEFAULT_DEV_ENCRYPTION_KEY },
    { name: 'CSRF_SECRET', failed: config.CSRF_SECRET.includes('nexora_dev') },
  ];

  const violations = weakChecks.filter((c) => c.failed).map((c) => c.name);
  if (violations.length > 0) {
    throw new Error(
      `[FATAL SECURITY ERROR] Production boot aborted. Default development secrets detected for: ${violations.join(', ')}. Generate unique 256-bit cryptographically random secrets.`
    );
  }
}

export function loadAndValidateEnv(): EnvConfig {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`[FATAL] Environment Configuration Validation Failed:\n${errorDetails}`);
    throw new Error(`Environment validation failed. Review your .env file:\n${errorDetails}`);
  }

  validateProductionSecrets(result.data);

  return result.data;
}

export const env = loadAndValidateEnv();
