/**
 * NEXORA Default Store Configuration, Free Plan, Theme & Locale Presets
 */

import type { PlanCode } from '../db/schemas/global/plans.ts';

export type SupportedCurrency = 'BDT' | 'USD' | 'EUR' | 'GBP';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  description: string;
  priceMonthlyUSD: number;
  priceMonthlyBDT: number;
  priceYearlyUSD: number;
  priceYearlyBDT: number;
  maxProducts: number;
  maxStaffUsers: number;
  maxStorageMB: number;
  customDomainAllowed: boolean;
  adSenseAllowed: boolean;
  transactionFeePercent: number;
  hasDedicatedDatabase: boolean;
}

export const NEXORA_PLANS_CATALOG: PlanDefinition[] = [
  {
    code: 'STARTER',
    name: 'Starter Free',
    description: 'Automatic zero-cost plan assigned to new independent merchant stores.',
    priceMonthlyUSD: 0,
    priceMonthlyBDT: 0,
    priceYearlyUSD: 0,
    priceYearlyBDT: 0,
    maxProducts: 50,
    maxStaffUsers: 2,
    maxStorageMB: 1024,
    customDomainAllowed: false,
    adSenseAllowed: false,
    transactionFeePercent: 2.0,
    hasDedicatedDatabase: false,
  },
  {
    code: 'GROWTH',
    name: 'Growth Commerce',
    description: 'For scaling storefronts needing custom domains, higher product limits, and team seats.',
    priceMonthlyUSD: 19,
    priceMonthlyBDT: 1990,
    priceYearlyUSD: 190,
    priceYearlyBDT: 19900,
    maxProducts: 1000,
    maxStaffUsers: 8,
    maxStorageMB: 10240,
    customDomainAllowed: true,
    adSenseAllowed: true,
    transactionFeePercent: 1.0,
    hasDedicatedDatabase: false,
  },
  {
    code: 'PRO',
    name: 'Pro Studio',
    description: 'Zero transaction fees, unlimited catalog growth, and multi-warehouse automation.',
    priceMonthlyUSD: 49,
    priceMonthlyBDT: 4990,
    priceYearlyUSD: 490,
    priceYearlyBDT: 49900,
    maxProducts: 10000,
    maxStaffUsers: 25,
    maxStorageMB: 51200,
    customDomainAllowed: true,
    adSenseAllowed: true,
    transactionFeePercent: 0,
    hasDedicatedDatabase: false,
  },
];

export interface DefaultThemePreset {
  code: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  borderRadius: string;
  layoutMode: 'EDITORIAL_GRID' | 'MINIMAL_CATALOG' | 'HERITAGE_ATELIER';
}

export const DEFAULT_STORE_THEMES: DefaultThemePreset[] = [
  {
    code: 'nexora-atelier',
    name: 'Nexora Atelier',
    description: 'Clean enterprise storefront layout with crisp hairline grids and balanced product cards.',
    primaryColor: '#4F46E5',
    secondaryColor: '#F8FAFC',
    accentColor: '#0284C7',
    fontHeading: 'Plus Jakarta Sans',
    fontBody: 'Plus Jakarta Sans',
    borderRadius: '0.5rem',
    layoutMode: 'EDITORIAL_GRID',
  },
  {
    code: 'nexora-minimal-studio',
    name: 'Minimal Studio',
    description: 'High-contrast monochrome editorial showcase designed for apparel and industrial goods.',
    primaryColor: '#0F172A',
    secondaryColor: '#F1F5F9',
    accentColor: '#2563EB',
    fontHeading: 'Manrope',
    fontBody: 'Plus Jakarta Sans',
    borderRadius: '0.375rem',
    layoutMode: 'MINIMAL_CATALOG',
  },
  {
    code: 'nexora-dhaka-craft',
    name: 'Dhaka Craft',
    description: 'Warm commercial retail preset optimized for local craftsmanship, BDT pricing, and fast checkout.',
    primaryColor: '#047857',
    secondaryColor: '#F8FAFC',
    accentColor: '#D97706',
    fontHeading: 'Outfit',
    fontBody: 'Plus Jakarta Sans',
    borderRadius: '0.75rem',
    layoutMode: 'HERITAGE_ATELIER',
  },
];

export const CURRENCY_LOCALE_DEFAULTS: Record<
  SupportedCurrency,
  { locale: string; timezone: string; shippingZone: string; flatRate: number }
> = {
  BDT: { locale: 'en-BD', timezone: 'Asia/Dhaka', shippingZone: 'Inside Dhaka Standard', flatRate: 80 },
  USD: { locale: 'en-US', timezone: 'America/New_York', shippingZone: 'Domestic Standard Ground', flatRate: 8 },
  GBP: { locale: 'en-GB', timezone: 'Europe/London', shippingZone: 'UK Royal Standard', flatRate: 5 },
  EUR: { locale: 'en-EU', timezone: 'Europe/Berlin', shippingZone: 'EU Standard Parcel', flatRate: 7 },
};

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidLocaleTag(locale: string): boolean {
  if (!locale || typeof locale !== 'string') return false;
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(locale.trim());
}

export function resolveThemePreset(code?: string): DefaultThemePreset {
  return DEFAULT_STORE_THEMES.find((t) => t.code === code) || DEFAULT_STORE_THEMES[0];
}
