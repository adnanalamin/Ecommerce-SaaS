/**
 * NEXORA Security Foundation
 * NoSQL Injection & Prototype Pollution Defense
 *
 * Enforces Mandatory Rules:
 * - Never use unsafe MongoDB operators from user input.
 * - Blocks $-prefixed MongoDB operators, dotted key path injection, and prototype pollution.
 */

const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface NoSqlScanResult {
  safe: boolean;
  violations: string[];
  maxDepthExceeded: boolean;
}

/**
 * Escapes special regex metacharacters to safely pass user search queries to MongoDB $regex.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inspects an untrusted payload recursively for MongoDB operator injection ($gt, $where, $ne, etc.),
 * dotted key injection (e.g. "password.$ne"), prototype pollution keys, and excessive JSON nesting.
 */
export function scanForNoSqlInjection(
  payload: unknown,
  maxDepth = 20,
  currentDepth = 0,
  pathPrefix = 'root'
): NoSqlScanResult {
  const violations: string[] = [];
  let maxDepthExceeded = false;

  if (currentDepth > maxDepth) {
    return {
      safe: false,
      violations: [`Nesting depth exceeded maximum allowed (${maxDepth}) at ${pathPrefix}`],
      maxDepthExceeded: true,
    };
  }

  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return { safe: true, violations: [], maxDepthExceeded: false };
  }

  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      const child = scanForNoSqlInjection(payload[i], maxDepth, currentDepth + 1, `${pathPrefix}[${i}]`);
      if (!child.safe) {
        violations.push(...child.violations);
        if (child.maxDepthExceeded) maxDepthExceeded = true;
      }
    }
    return { safe: violations.length === 0, violations, maxDepthExceeded };
  }

  // Own keys + check explicitly if __proto__ was injected via JSON.parse
  const keys = Object.keys(payload as Record<string, unknown>);
  if (Object.prototype.hasOwnProperty.call(payload, '__proto__')) {
    keys.push('__proto__');
  }

  for (const key of keys) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
      violations.push(`Prototype pollution key "${key}" at ${pathPrefix}`);
      continue;
    }

    if (key.startsWith('$')) {
      violations.push(`Prohibited MongoDB operator "${key}" at ${pathPrefix}`);
      continue;
    }

    if (key.includes('.')) {
      violations.push(`Prohibited dotted key path "${key}" at ${pathPrefix}`);
      continue;
    }

    const val = (payload as Record<string, unknown>)[key];
    const child = scanForNoSqlInjection(val, maxDepth, currentDepth + 1, `${pathPrefix}.${key}`);
    if (!child.safe) {
      violations.push(...child.violations);
      if (child.maxDepthExceeded) maxDepthExceeded = true;
    }
  }

  return {
    safe: violations.length === 0,
    violations,
    maxDepthExceeded,
  };
}

/**
 * Recursively strips any $-prefixed, dotted, or prototype-pollution keys from an object.
 */
export function stripUnsafeNoSqlKeys<T>(input: T, depth = 0): T {
  if (depth > 20 || input === null || input === undefined || typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => stripUnsafeNoSqlKeys(item, depth + 1)) as unknown as T;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key) || key.startsWith('$') || key.includes('.')) {
      continue;
    }
    clean[key] = stripUnsafeNoSqlKeys(val, depth + 1);
  }
  return clean as T;
}
