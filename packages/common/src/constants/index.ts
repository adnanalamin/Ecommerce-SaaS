/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * System-wide Constants
 */

export const RESERVED_SUBDOMAINS = [
  'api',
  'app',
  'admin',
  'superadmin',
  'dashboard',
  'portal',
  'store',
  'shop',
  'official',
  'billing',
  'webhook',
  'status',
  'mail',
  'dev',
  'staging',
  'test',
  'help',
  'support',
  'docs',
  'assets',
  'cdn',
  'auth',
  'login',
] as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const OFFICIAL_STORE_TENANT_ID = 'T_NEXORA_OFFICIAL';

export const SUPPORTED_CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
