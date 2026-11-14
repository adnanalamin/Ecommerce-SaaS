/**
 * NEXORA Store Slug Normalization, Reserved Protection & Collision Engine
 */

export const RESERVED_STORE_SLUGS = new Set<string>([
  'admin',
  'administrator',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'blog',
  'cdn',
  'checkout',
  'cloud',
  'console',
  'dashboard',
  'dev',
  'developer',
  'docs',
  'ftp',
  'help',
  'imap',
  'internal',
  'localhost',
  'login',
  'logout',
  'mail',
  'media',
  'merchant',
  'merchants',
  'nexora',
  'nexora-admin',
  'nexora-cloud',
  'nexora-official',
  'nexora-platform',
  'nexora-shop',
  'nexora-store',
  'official',
  'official-store',
  'owner',
  'pay',
  'payments',
  'platform',
  'pop',
  'portal',
  'pricing',
  'register',
  'root',
  'security',
  'settings',
  'shop',
  'signup',
  'smtp',
  'sso',
  'staging',
  'static',
  'status',
  'store',
  'stores',
  'superadmin',
  'support',
  'system',
  'tenant',
  'tenants',
  'verify',
  'webhook',
  'webhooks',
  'www',
]);

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeStoreSlug(rawInput: string): string {
  const normalized = (rawInput || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // Strip Unicode combining diacritics
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.slice(0, 48).replace(/-+$/g, '');
}

export interface SlugValidationResult {
  normalizedSlug: string;
  isValidFormat: boolean;
  isReserved: boolean;
  reason?: string;
}

export function validateSlugPolicy(rawInput: string): SlugValidationResult {
  const normalizedSlug = normalizeStoreSlug(rawInput);

  if (normalizedSlug.length < 3) {
    return {
      normalizedSlug,
      isValidFormat: false,
      isReserved: false,
      reason: 'Store slug must contain at least 3 alphanumeric characters after normalization.',
    };
  }

  if (normalizedSlug.length > 48 || !SLUG_REGEX.test(normalizedSlug)) {
    return {
      normalizedSlug,
      isValidFormat: false,
      isReserved: false,
      reason: 'Store slug may only use lowercase letters, digits, and single internal hyphens (3–48 chars).',
    };
  }

  if (RESERVED_STORE_SLUGS.has(normalizedSlug)) {
    return {
      normalizedSlug,
      isValidFormat: true,
      isReserved: true,
      reason: `The slug "${normalizedSlug}" is reserved for NEXORA platform infrastructure or official operations.`,
    };
  }

  return {
    normalizedSlug,
    isValidFormat: true,
    isReserved: false,
  };
}

export async function generateUniqueSlugCandidates(
  baseInput: string,
  isTaken: (slug: string) => Promise<boolean>,
  limit = 4
): Promise<string[]> {
  const base = normalizeStoreSlug(baseInput);
  const safeBase = base.length >= 3 ? base.slice(0, 36) : `store-${base || 'shop'}`;
  const suffixes = ['shop', 'bd', 'store', 'hub', 'co', 'studio', '2', '3', '4', '5', '6'];
  const candidates: string[] = [];

  for (const suffix of suffixes) {
    if (candidates.length >= limit) break;
    const candidate = normalizeStoreSlug(`${safeBase}-${suffix}`);
    if (candidate.length < 3 || RESERVED_STORE_SLUGS.has(candidate)) continue;
    if (!(await isTaken(candidate))) {
      candidates.push(candidate);
    }
  }

  // Fallback random numeric suffix if common ones are taken
  let attempt = 10;
  while (candidates.length < limit && attempt < 40) {
    const candidate = normalizeStoreSlug(`${safeBase}-${attempt}`);
    if (!RESERVED_STORE_SLUGS.has(candidate) && !(await isTaken(candidate))) {
      candidates.push(candidate);
    }
    attempt += 1;
  }

  return candidates;
}
