/**
 * NEXORA Security Foundation
 * Recursive Sensitive Data & Secret Redaction Engine
 *
 * Enforces Mandatory Security Rules:
 * - Never expose secrets in logs.
 * - Never log passwords, tokens, payment credentials, or sensitive personal data.
 */

const SENSITIVE_KEY_PATTERN =
  /^(password|pass|pwd|passwordhash|newpassword|currentpassword|secret|jwt|token|accesstoken|refreshtoken|idtoken|apikey|api_key|privatekey|private_key|authorization|cookie|set-cookie|x-csrf-token|mfasecret|mfasecretencrypted|backupcodes|mfabackupcodeshashed|card|cardnumber|cvv|cvc|pin|otp|trxsecret|signature|encryptionkey|masterkey|dedicateddburi|sessionsecret|client_secret|clientsecret)$/i;

const SENSITIVE_SUBSTRING_PATTERN =
  /(password|secret|token|apikey|api_key|private_key|privatekey|cvv|cvc|authorization|cookie|cardnumber|mfasecret|encryption_key)/i;

const JWT_REGEX = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_REGEX = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const MONGO_URI_CREDS_REGEX = /(mongodb(?:\+srv)?:\/\/)([^:@\s]+):([^@\s]+)@/gi;
const BASIC_AUTH_URI_REGEX = /(https?:\/\/)([^:@\s]+):([^@\s]+)@/gi;

export const REDACTED_VALUE = '[REDACTED]';

export function redactString(input: string): string {
  return input
    .replace(MONGO_URI_CREDS_REGEX, '$1[REDACTED]:[REDACTED]@')
    .replace(BASIC_AUTH_URI_REGEX, '$1[REDACTED]:[REDACTED]@')
    .replace(BEARER_REGEX, 'Bearer [REDACTED]')
    .replace(JWT_REGEX, '[REDACTED_JWT]');
}

export function isSensitiveKey(key: string): boolean {
  const normalized = key.trim();
  return SENSITIVE_KEY_PATTERN.test(normalized) || SENSITIVE_SUBSTRING_PATTERN.test(normalized);
}

export function redactSensitiveData<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (depth > 15) {
    return '[MAX_DEPTH_TRUNCATED]' as unknown as T;
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value) as unknown as T;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    } as unknown as T;
  }

  if (seen.has(value as object)) {
    return '[CIRCULAR_REF]' as unknown as T;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1, seen)) as unknown as T;
  }

  const output: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      output[k] = REDACTED_VALUE;
    } else {
      output[k] = redactSensitiveData(v, depth + 1, seen);
    }
  }
  return output as T;
}
