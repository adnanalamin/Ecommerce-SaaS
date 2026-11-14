/**
 * NEXORA Phase 10 — Tenant Store Owner Dashboard Repository (Dual-Mode)
 *
 * Strictly enforces tenantId isolation on every read, write, and delete operation.
 * Seeds two distinct, non-overlapping tenant store datasets:
 *  - Tenant A: UrbanWear BD (DEMO_TENANT_A_ID)
 *  - Tenant B: LuxeThread Studio (DEMO_TENANT_B_ID)
 * Also initializes default store resources lazily for any newly onboarded store.
 */

import { Types } from 'mongoose';
import { isDatabaseConnected } from '../config/database.ts';
import { ForbiddenError, NotFoundError } from '../utils/errors.ts';
import {
  DEMO_TENANT_A_ID,
  DEMO_TENANT_B_ID,
  ensureRbacBootstrapped,
  rbacRepository,
} from '../rbac/rbacRepository.ts';
import {
  ensureOnboardingBootstrapped,
  onboardingRepository,
} from '../onboarding/onboardingRepository.ts';
import { authRepository } from '../auth/authRepository.ts';
import {
  SystemSettingModel,
  type PaymentGateway,
} from '../db/models.ts';

export interface TenantCategoryRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  parentCategoryId?: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: Date;
}

export interface TenantBrandRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  originCountry: string;
  websiteUrl: string;
  isFeatured: boolean;
  isActive: boolean;
  updatedAt: Date;
}

export interface TenantProductImageRecord {
  url: string;
  altText: string;
  isPrimary: boolean;
  displayOrder: number;
}

export interface TenantProductVariantRecord {
  id: string;
  tenantId: string;
  productId: string;
  title: string;
  sku: string;
  barcode?: string;
  priceBDT: number;
  compareAtPriceBDT?: number;
  costBDT: number;
  stockQty: number;
  color?: string;
  size?: string;
  material?: string;
  weightGrams?: number;
  imageUrl?: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface TenantProductSeoRecord {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  canonicalSlug: string;
}

export interface TenantProductCustomAttribute {
  key: string;
  value: string;
}

export interface TenantCatalogProductRecord {
  id: string;
  tenantId: string;
  title: string;
  sku: string;
  barcode?: string;
  slug: string;
  description: string;
  categoryId: string;
  brandId: string;
  priceBDT: number;
  compareAtPriceBDT?: number;
  costBDT: number;
  stockQty: number;
  lowStockThreshold: number;
  unitsSold: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  requiresShipping: boolean;
  weightGrams: number;
  dimensions: {
    lengthCm: number;
    widthCm: number;
    heightCm: number;
  };
  color?: string;
  size?: string;
  material?: string;
  customAttributes: TenantProductCustomAttribute[];
  tags: string[];
  images: TenantProductImageRecord[];
  hasVariants: boolean;
  variants: TenantProductVariantRecord[];
  seo: TenantProductSeoRecord;
  createdByUserId: string;
  updatedAt: Date;
}

export interface TenantSearchLogRecord {
  id: string;
  tenantId: string;
  sessionKey: string;
  query: string;
  normalizedQuery: string;
  mode: 'AUTO' | 'FULLTEXT' | 'PARTIAL' | 'EXACT' | 'LOOKUP';
  resultCount: number;
  latencyMs: number;
  didYouMeanUsed: boolean;
  createdAt: Date;
}

export interface TenantInventoryLogRecord {
  id: string;
  tenantId: string;
  productId: string;
  sku: string;
  productTitle: string;
  previousQty: number;
  deltaQty: number;
  newQty: number;
  reason: string;
  actorEmail: string;
  createdAt: Date;
}

export type TenantOrderStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface TenantStoreOrderRecord {
  id: string;
  tenantId: string;
  orderNumber: string;
  customerId: string;
  customerUserId: string;
  customerName: string;
  customerEmail: string;
  items: Array<{
    productId: string;
    sku: string;
    title: string;
    qty: number;
    unitPriceBDT: number;
  }>;
  itemsSummary: string;
  subtotalBDT: number;
  discountBDT: number;
  shippingBDT: number;
  totalBDT: number;
  paymentGateway: PaymentGateway;
  paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED';
  status: TenantOrderStatus;
  shippingCity: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantCustomerRecord {
  id: string;
  tenantId: string;
  userId?: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  segment: 'VIP' | 'RETURNING' | 'NEW' | 'AT_RISK';
  ordersCount: number;
  totalSpentBDT: number;
  notes: string;
  status: 'ACTIVE' | 'BLOCKED';
  lastOrderAt?: Date;
  createdAt: Date;
}

export interface TenantCouponRecord {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  discountType: 'PERCENTAGE' | 'FIXED_BDT' | 'FREE_SHIPPING';
  discountValue: number;
  minOrderBDT: number;
  maxDiscountBDT?: number;
  usageLimit: number;
  usedCount: number;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  updatedAt: Date;
}

export interface TenantDiscountRecord {
  id: string;
  tenantId: string;
  name: string;
  campaignType: 'FLASH_SALE' | 'BULK_TIER' | 'CATEGORY_OFFER' | 'FIRST_ORDER';
  discountType: 'PERCENTAGE' | 'FIXED_BDT';
  discountValue: number;
  targetCategoryId?: string;
  minQty: number;
  stackable: boolean;
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  redemptionsCount: number;
  revenueImpactBDT: number;
  updatedAt: Date;
}

export interface TenantStoreSettings {
  tenantId: string;
  storeName: string;
  storeSlug: string;
  supportEmail: string;
  supportPhone: string;
  currency: 'BDT' | 'USD' | 'EUR' | 'GBP';
  locale: string;
  timezone: string;
  taxRatePct: number;
  taxInclusivePricing: boolean;
  lowStockAlertThreshold: number;
  autoArchiveOutOfStock: boolean;
  orderNumberPrefix: string;
  guestCheckoutEnabled: boolean;
  customDomain: string;
  updatedAt: string;
}

export interface TenantStoreBranding {
  tenantId: string;
  themeCode: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  headerAnnouncement: string;
  heroHeadline: string;
  heroSubheadline: string;
  footerText: string;
  showPoweredByNexora: boolean;
  updatedAt: string;
}

export interface TenantPaymentGatewayConfig {
  id: string;
  tenantId: string;
  gateway: PaymentGateway;
  displayName: string;
  mode: 'SANDBOX' | 'LIVE';
  isEnabled: boolean;
  merchantAccountMasked: string;
  hasSecretConfigured: boolean;
  settlementCycle: string;
  feePct: number;
  updatedAt: string;
}

export interface TenantShippingMethodRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  zoneName: string;
  carrier: string;
  baseRateBDT: number;
  freeShippingThresholdBDT: number;
  estimatedDays: string;
  codSupported: boolean;
  isActive: boolean;
  updatedAt: Date;
}

export interface TenantFunnelStats {
  tenantId: string;
  storefrontSessions: number;
  productViews: number;
  cartAdditions: number;
  checkoutInitiated: number;
  dailySeries: Array<{
    dateLabel: string;
    sessions: number;
    orders: number;
    revenueBDT: number;
  }>;
}

// ==========================================
// TENANT-KEYED ISOLATED SANDBOX STORES
// ==========================================
const sandboxCategories = new Map<string, TenantCategoryRecord>();
const sandboxBrands = new Map<string, TenantBrandRecord>();
const sandboxCatalogProducts = new Map<string, TenantCatalogProductRecord>();
const sandboxInventoryLogs = new Map<string, TenantInventoryLogRecord>();
const sandboxStoreOrders = new Map<string, TenantStoreOrderRecord>();
const sandboxCustomers = new Map<string, TenantCustomerRecord>();
const sandboxCoupons = new Map<string, TenantCouponRecord>();
const sandboxDiscounts = new Map<string, TenantDiscountRecord>();
const sandboxStoreSettings = new Map<string, TenantStoreSettings>();
const sandboxStoreBranding = new Map<string, TenantStoreBranding>();
const sandboxPaymentConfigs = new Map<string, TenantPaymentGatewayConfig[]>(); // key: tenantId
const sandboxShippingMethods = new Map<string, TenantShippingMethodRecord>();
const sandboxFunnelStats = new Map<string, TenantFunnelStats>();
const sandboxSearchLogs: TenantSearchLogRecord[] = [];

let tenantBootstrapDone = false;
let tenantBootstrapPromise: Promise<void> | null = null;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function assertTenantOwnership<T extends { tenantId: string }>(
  entity: T | undefined | null,
  expectedTenantId: string,
  resourceLabel: string
): T {
  if (!entity) {
    throw new NotFoundError(`${resourceLabel} not found.`);
  }
  if (entity.tenantId !== expectedTenantId) {
    throw new ForbiddenError(
      `Cross-tenant access denied: ${resourceLabel} belongs to another store.`,
      'CROSS_TENANT_ACCESS_DENIED'
    );
  }
  return entity;
}

function defaultPaymentConfigs(tenantId: string, storeSlug: string): TenantPaymentGatewayConfig[] {
  const now = new Date().toISOString();
  const isLuxe = tenantId === DEMO_TENANT_B_ID;
  return [
    {
      id: `${tenantId}_pay_bkash`,
      tenantId,
      gateway: 'BKASH',
      displayName: 'bKash Merchant Checkout',
      mode: 'LIVE',
      isEnabled: true,
      merchantAccountMasked: isLuxe ? '017••••8821' : '018••••4410',
      hasSecretConfigured: true,
      settlementCycle: 'T+1 Business Day',
      feePct: 1.5,
      updatedAt: now,
    },
    {
      id: `${tenantId}_pay_sslcommerz`,
      tenantId,
      gateway: 'SSLCOMMERZ',
      displayName: 'SSLCommerz Cards & NetBanking',
      mode: 'LIVE',
      isEnabled: true,
      merchantAccountMasked: `${storeSlug}_ssl_••••92`,
      hasSecretConfigured: true,
      settlementCycle: 'T+2 Business Days',
      feePct: 2.2,
      updatedAt: now,
    },
    {
      id: `${tenantId}_pay_nagad`,
      tenantId,
      gateway: 'NAGAD',
      displayName: 'Nagad Digital Wallet',
      mode: 'SANDBOX',
      isEnabled: !isLuxe,
      merchantAccountMasked: '016••••3390',
      hasSecretConfigured: !isLuxe,
      settlementCycle: 'T+1 Business Day',
      feePct: 1.4,
      updatedAt: now,
    },
    {
      id: `${tenantId}_pay_cod`,
      tenantId,
      gateway: 'COD',
      displayName: 'Cash on Delivery (Pathao / Steadfast)',
      mode: 'LIVE',
      isEnabled: true,
      merchantAccountMasked: 'COD-SETTLEMENT-ACTIVE',
      hasSecretConfigured: true,
      settlementCycle: 'Weekly Courier Remittance',
      feePct: 1.0,
      updatedAt: now,
    },
    {
      id: `${tenantId}_pay_stripe`,
      tenantId,
      gateway: 'STRIPE',
      displayName: 'Stripe International Cards',
      mode: isLuxe ? 'LIVE' : 'SANDBOX',
      isEnabled: isLuxe,
      merchantAccountMasked: isLuxe ? 'acct_1Q9Luxe••••82' : 'Not configured',
      hasSecretConfigured: isLuxe,
      settlementCycle: 'T+3 Business Days',
      feePct: 2.9,
      updatedAt: now,
    },
  ];
}

async function ensureTenantDefaultsInitialized(tenantId: string): Promise<void> {
  if (!sandboxStoreSettings.has(tenantId)) {
    const bundle = await onboardingRepository.getProvisionedBundle(tenantId);
    const tenant = await rbacRepository.findTenantById(tenantId);
    const storeName = bundle?.store.name || tenant?.name || 'NEXORA Store';
    const storeSlug = bundle?.store.slug || tenant?.slug || 'store';

    sandboxStoreSettings.set(tenantId, {
      tenantId,
      storeName,
      storeSlug,
      supportEmail: bundle?.store.contactEmail || `support@${storeSlug}.nexora.shop`,
      supportPhone: bundle?.store.contactPhone || '+880 1700-000000',
      currency: (bundle?.store.currency as any) || 'BDT',
      locale: bundle?.store.locale || 'en-BD',
      timezone: bundle?.store.timezone || 'Asia/Dhaka',
      taxRatePct: 5,
      taxInclusivePricing: true,
      lowStockAlertThreshold: 10,
      autoArchiveOutOfStock: false,
      orderNumberPrefix: storeSlug.slice(0, 2).toUpperCase(),
      guestCheckoutEnabled: true,
      customDomain: `${storeSlug}.nexora.shop`,
      updatedAt: new Date().toISOString(),
    });

    sandboxStoreBranding.set(tenantId, {
      tenantId,
      themeCode: bundle?.theme.themeCode || 'ATELIER_MINIMAL',
      primaryColor: bundle?.theme.primaryColor || '#4F46E5',
      secondaryColor: bundle?.theme.secondaryColor || '#0F172A',
      accentColor: bundle?.theme.accentColor || '#10B981',
      fontHeading: bundle?.theme.fontHeading || 'Plus Jakarta Sans',
      fontBody: bundle?.theme.fontBody || 'Inter',
      headerAnnouncement: `Welcome to ${storeName} — Nationwide Express Delivery`,
      heroHeadline: `${storeName} New Season Collection`,
      heroSubheadline: 'Curated craftsmanship, verified materials, fast doorstep shipping.',
      footerText: `© 2026 ${storeName}. Powered by NEXORA.`,
      showPoweredByNexora: true,
      updatedAt: new Date().toISOString(),
    });

    if (!sandboxPaymentConfigs.has(tenantId)) {
      sandboxPaymentConfigs.set(tenantId, defaultPaymentConfigs(tenantId, storeSlug));
    }

    if (!sandboxFunnelStats.has(tenantId)) {
      sandboxFunnelStats.set(tenantId, {
        tenantId,
        storefrontSessions: 640,
        productViews: 410,
        cartAdditions: 96,
        checkoutInitiated: 42,
        dailySeries: [
          { dateLabel: 'Day 1', sessions: 82, orders: 2, revenueBDT: 4800 },
          { dateLabel: 'Day 2', sessions: 94, orders: 3, revenueBDT: 6950 },
          { dateLabel: 'Day 3', sessions: 88, orders: 2, revenueBDT: 5100 },
          { dateLabel: 'Day 4', sessions: 106, orders: 4, revenueBDT: 9800 },
          { dateLabel: 'Day 5', sessions: 98, orders: 3, revenueBDT: 7400 },
          { dateLabel: 'Day 6', sessions: 112, orders: 5, revenueBDT: 12100 },
          { dateLabel: 'Today', sessions: 60, orders: 2, revenueBDT: 4950 },
        ],
      });
    }
  }
}

export async function ensureTenantDashboardBootstrapped(): Promise<void> {
  if (tenantBootstrapDone) return;
  if (tenantBootstrapPromise) return tenantBootstrapPromise;

  tenantBootstrapPromise = (async () => {
    await ensureRbacBootstrapped();
    await ensureOnboardingBootstrapped();

    const ownerA = await authRepository.findUserByEmail('owner@urbanwear.nexora.shop');
    const prodMgrA = await authRepository.findUserByEmail('catalog@urbanwear.nexora.shop');
    const ownerB = await authRepository.findUserByEmail('owner@luxethread.nexora.shop');
    const buyer1 = await authRepository.findUserByEmail('buyer1@nexora.shop');
    const buyer2 = await authRepository.findUserByEmail('buyer2@nexora.shop');

    const now = Date.now();
    const day = 86_400_000;

    // =====================================================
    // TENANT A SEED: UrbanWear BD (DEMO_TENANT_A_ID)
    // =====================================================
    const catA1: TenantCategoryRecord = {
      id: 'cat_uw_outerwear',
      tenantId: DEMO_TENANT_A_ID,
      name: 'Overshirts & Jackets',
      slug: 'overshirts-jackets',
      description: 'Breathable Dhaka cotton and linen outerwear layers.',
      sortOrder: 1,
      isActive: true,
      updatedAt: new Date(now - 5 * day),
    };
    const catA2: TenantCategoryRecord = {
      id: 'cat_uw_denim',
      tenantId: DEMO_TENANT_A_ID,
      name: 'Selvedge Denim & Cargo',
      slug: 'selvedge-denim-cargo',
      description: 'Heavyweight tapered denim and utility trousers.',
      sortOrder: 2,
      isActive: true,
      updatedAt: new Date(now - 4 * day),
    };
    const catA3: TenantCategoryRecord = {
      id: 'cat_uw_tees',
      tenantId: DEMO_TENANT_A_ID,
      name: 'Heavyweight Tees',
      slug: 'heavyweight-tees',
      description: '260 GSM combed cotton everyday streetwear tees.',
      sortOrder: 3,
      isActive: true,
      updatedAt: new Date(now - 3 * day),
    };

    const brandA1: TenantBrandRecord = {
      id: 'brd_uw_origin',
      tenantId: DEMO_TENANT_A_ID,
      name: 'UrbanWear Originals',
      slug: 'urbanwear-originals',
      originCountry: 'Bangladesh',
      websiteUrl: 'https://urbanwear.nexora.shop',
      isFeatured: true,
      isActive: true,
      updatedAt: new Date(now - 5 * day),
    };
    const brandA2: TenantBrandRecord = {
      id: 'brd_uw_nomad',
      tenantId: DEMO_TENANT_A_ID,
      name: 'Dhaka Loom Co.',
      slug: 'dhaka-loom-co',
      originCountry: 'Bangladesh',
      websiteUrl: 'https://dhakaloom.example.com',
      isFeatured: false,
      isActive: true,
      updatedAt: new Date(now - 2 * day),
    };

    const prodA: TenantCatalogProductRecord[] = [
      {
        id: 'prod_uw_101',
        tenantId: DEMO_TENANT_A_ID,
        title: 'Dhaka Heritage Linen Overshirt',
        sku: 'UW-LIN-101',
        barcode: '8941101001011',
        slug: 'dhaka-heritage-linen-overshirt',
        description:
          'Tailored breathable Dhaka cotton-linen overshirt featuring geometric tonal weave, corozo buttons, and dual chest utility pockets engineered for humid monsoon evenings.',
        categoryId: catA1.id,
        brandId: brandA1.id,
        priceBDT: 2450,
        compareAtPriceBDT: 2950,
        costBDT: 1180,
        stockQty: 42,
        lowStockThreshold: 12,
        unitsSold: 128,
        status: 'PUBLISHED',
        requiresShipping: true,
        weightGrams: 340,
        dimensions: { lengthCm: 36, widthCm: 28, heightCm: 4 },
        color: 'Slate Navy',
        size: 'M–XL',
        material: '70% Linen / 30% Combed Dhaka Cotton',
        customAttributes: [
          { key: 'Fabric GSM', value: '195 GSM Breathable Weave' },
          { key: 'Collar Style', value: 'Structured Camp Point Collar' },
          { key: 'Care Instruction', value: 'Cold gentle wash, line dry in shade' },
        ],
        tags: ['linen', 'overshirt', 'dhaka', 'monsoon', 'breathable', 'jacket'],
        images: [
          {
            url: '/src/assets/images/product_linen_overshirt_1794669437948.jpg',
            altText: 'Dhaka Heritage Linen Overshirt in Slate Navy on travertine',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
        hasVariants: true,
        variants: [
          {
            id: 'var_uw_101_m',
            tenantId: DEMO_TENANT_A_ID,
            productId: 'prod_uw_101',
            title: 'Slate Navy / M',
            sku: 'UW-LIN-101-NVY-M',
            barcode: '8941101001012',
            priceBDT: 2450,
            compareAtPriceBDT: 2950,
            costBDT: 1180,
            stockQty: 18,
            color: 'Slate Navy',
            size: 'M',
            material: 'Cotton-Linen',
            weightGrams: 330,
            imageUrl: '/src/assets/images/product_linen_overshirt_1794669437948.jpg',
            isDefault: true,
            isActive: true,
          },
          {
            id: 'var_uw_101_l',
            tenantId: DEMO_TENANT_A_ID,
            productId: 'prod_uw_101',
            title: 'Slate Navy / L',
            sku: 'UW-LIN-101-NVY-L',
            barcode: '8941101001013',
            priceBDT: 2450,
            compareAtPriceBDT: 2950,
            costBDT: 1180,
            stockQty: 14,
            color: 'Slate Navy',
            size: 'L',
            material: 'Cotton-Linen',
            weightGrams: 345,
            imageUrl: '/src/assets/images/product_linen_overshirt_1794669437948.jpg',
            isDefault: false,
            isActive: true,
          },
          {
            id: 'var_uw_101_xl',
            tenantId: DEMO_TENANT_A_ID,
            productId: 'prod_uw_101',
            title: 'Slate Navy / XL',
            sku: 'UW-LIN-101-NVY-XL',
            barcode: '8941101001014',
            priceBDT: 2550,
            compareAtPriceBDT: 3050,
            costBDT: 1210,
            stockQty: 10,
            color: 'Slate Navy',
            size: 'XL',
            material: 'Cotton-Linen',
            weightGrams: 360,
            imageUrl: '/src/assets/images/product_linen_overshirt_1794669437948.jpg',
            isDefault: false,
            isActive: true,
          },
        ],
        seo: {
          metaTitle: 'Dhaka Heritage Linen Overshirt | UrbanWear BD',
          metaDescription: 'Shop breathable 195 GSM Dhaka cotton-linen overshirts with fast nationwide delivery across Bangladesh.',
          keywords: ['linen overshirt', 'dhaka streetwear', 'mens overshirt bd'],
          canonicalSlug: 'dhaka-heritage-linen-overshirt',
        },
        createdByUserId: prodMgrA?.id || ownerA?.id || 'system',
        updatedAt: new Date(now - 2 * day),
      },
      {
        id: 'prod_uw_102',
        tenantId: DEMO_TENANT_A_ID,
        title: 'Mirpur Indigo Cargo Trouser',
        sku: 'UW-CRG-102',
        barcode: '8941101001021',
        slug: 'mirpur-indigo-cargo-trouser',
        description:
          'Tapered ripstop indigo cargo trouser with reinforced knee articulation, bellowed snap pockets, and double-needle felled seams.',
        categoryId: catA2.id,
        brandId: brandA1.id,
        priceBDT: 3150,
        compareAtPriceBDT: 3600,
        costBDT: 1550,
        stockQty: 6, // LOW STOCK
        lowStockThreshold: 12,
        unitsSold: 94,
        status: 'PUBLISHED',
        requiresShipping: true,
        weightGrams: 520,
        dimensions: { lengthCm: 38, widthCm: 30, heightCm: 5 },
        color: 'Deep Indigo',
        size: '30–34',
        material: '100% Twill Ripstop Cotton',
        customAttributes: [
          { key: 'Fit Profile', value: 'Relaxed Tapered Utility' },
          { key: 'Pocket Count', value: '6 Functional Pockets' },
        ],
        tags: ['cargo', 'trouser', 'indigo', 'denim', 'streetwear', 'pants'],
        images: [
          {
            url: '/src/assets/images/product_cargo_trouser_1794669438113.jpg',
            altText: 'Mirpur Indigo Cargo Trouser flat lay studio view',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
        hasVariants: true,
        variants: [
          {
            id: 'var_uw_102_30',
            tenantId: DEMO_TENANT_A_ID,
            productId: 'prod_uw_102',
            title: 'Deep Indigo / 30',
            sku: 'UW-CRG-102-IND-30',
            barcode: '8941101001022',
            priceBDT: 3150,
            compareAtPriceBDT: 3600,
            costBDT: 1550,
            stockQty: 2,
            color: 'Deep Indigo',
            size: '30',
            material: 'Ripstop Cotton',
            weightGrams: 500,
            imageUrl: '/src/assets/images/product_cargo_trouser_1794669438113.jpg',
            isDefault: true,
            isActive: true,
          },
          {
            id: 'var_uw_102_32',
            tenantId: DEMO_TENANT_A_ID,
            productId: 'prod_uw_102',
            title: 'Deep Indigo / 32',
            sku: 'UW-CRG-102-IND-32',
            barcode: '8941101001023',
            priceBDT: 3150,
            compareAtPriceBDT: 3600,
            costBDT: 1550,
            stockQty: 4,
            color: 'Deep Indigo',
            size: '32',
            material: 'Ripstop Cotton',
            weightGrams: 520,
            imageUrl: '/src/assets/images/product_cargo_trouser_1794669438113.jpg',
            isDefault: false,
            isActive: true,
          },
        ],
        seo: {
          metaTitle: 'Mirpur Indigo Cargo Trouser | UrbanWear BD',
          metaDescription: 'Heavyweight tapered ripstop cargo trousers crafted in Dhaka.',
          keywords: ['cargo trouser', 'indigo pants', 'urbanwear cargo'],
          canonicalSlug: 'mirpur-indigo-cargo-trouser',
        },
        createdByUserId: ownerA?.id || 'system',
        updatedAt: new Date(now - 1 * day),
      },
      {
        id: 'prod_uw_103',
        tenantId: DEMO_TENANT_A_ID,
        title: 'Boxy 260GSM Ash Street Tee',
        sku: 'UW-TEE-103',
        barcode: '8941101001031',
        slug: 'boxy-260gsm-ash-street-tee',
        description:
          'Drop-shoulder 260 GSM combed ring-spun cotton jersey tee pre-shrunk with thick ribbed collar binding.',
        categoryId: catA3.id,
        brandId: brandA2.id,
        priceBDT: 1190,
        costBDT: 520,
        stockQty: 4, // LOW STOCK
        lowStockThreshold: 15,
        unitsSold: 186,
        status: 'PUBLISHED',
        requiresShipping: true,
        weightGrams: 280,
        dimensions: { lengthCm: 30, widthCm: 24, heightCm: 3 },
        color: 'Ash Grey',
        size: 'L',
        material: '100% Combed Ring-Spun Cotton',
        customAttributes: [
          { key: 'Fabric GSM', value: '260 GSM Heavy Jersey' },
          { key: 'Pre-Shrunk', value: 'Enzyme Washed Zero-Shrink' },
        ],
        tags: ['tee', 'tshirt', '260gsm', 'boxy', 'cotton', 'ash'],
        images: [
          {
            url: '/src/assets/images/product_linen_overshirt_1794669437948.jpg',
            altText: 'Heavyweight cotton streetwear folded preview',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
        hasVariants: false,
        variants: [],
        seo: {
          metaTitle: 'Boxy 260GSM Ash Street Tee | Dhaka Loom Co.',
          metaDescription: '260 GSM heavyweight combed cotton tee engineered for structured drape.',
          keywords: ['260gsm tee', 'heavyweight t-shirt', 'streetwear bd'],
          canonicalSlug: 'boxy-260gsm-ash-street-tee',
        },
        createdByUserId: prodMgrA?.id || 'system',
        updatedAt: new Date(now - 12 * 3600_000),
      },
      {
        id: 'prod_uw_104',
        tenantId: DEMO_TENANT_A_ID,
        title: 'Monsoon Technical Field Parka',
        sku: 'UW-PRK-104',
        barcode: '8941101001041',
        slug: 'monsoon-technical-field-parka',
        description:
          'Water-repellent 3-layer DWR coated field parka with taped storm seams and hidden ventilation yoke.',
        categoryId: catA1.id,
        brandId: brandA1.id,
        priceBDT: 4850,
        compareAtPriceBDT: 5400,
        costBDT: 2400,
        stockQty: 27,
        lowStockThreshold: 8,
        unitsSold: 53,
        status: 'PUBLISHED',
        requiresShipping: true,
        weightGrams: 680,
        dimensions: { lengthCm: 44, widthCm: 34, heightCm: 6 },
        color: 'Charcoal Olive',
        size: 'L',
        material: '3-Layer DWR Ripstop Nylon',
        customAttributes: [
          { key: 'Water Resistance', value: '8,000mm Hydrostatic Head' },
          { key: 'Seam Construction', value: 'Heat-Sealed Storm Tape' },
        ],
        tags: ['parka', 'raincoat', 'monsoon', 'jacket', 'outerwear', 'waterproof'],
        images: [
          {
            url: '/src/assets/images/product_cargo_trouser_1794669438113.jpg',
            altText: 'Monsoon Technical Field Parka textile detail',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
        hasVariants: false,
        variants: [],
        seo: {
          metaTitle: 'Monsoon Technical Field Parka | UrbanWear BD',
          metaDescription: 'Storm-ready waterproof technical field parka for Bangladesh monsoon commutes.',
          keywords: ['field parka', 'rain jacket', 'monsoon outerwear'],
          canonicalSlug: 'monsoon-technical-field-parka',
        },
        createdByUserId: ownerA?.id || 'system',
        updatedAt: new Date(now - 3 * day),
      },
      {
        id: 'prod_uw_105',
        tenantId: DEMO_TENANT_A_ID,
        title: 'Raw Selvedge Work Jacket (Sample)',
        sku: 'UW-JKT-105',
        barcode: '8941101001051',
        slug: 'raw-selvedge-work-jacket-sample',
        description:
          '14oz unsanforized raw selvedge denim chore jacket prototype with copper tack buttons.',
        categoryId: catA1.id,
        brandId: brandA2.id,
        priceBDT: 3900,
        costBDT: 1900,
        stockQty: 14,
        lowStockThreshold: 10,
        unitsSold: 0,
        status: 'DRAFT',
        requiresShipping: true,
        weightGrams: 790,
        dimensions: { lengthCm: 42, widthCm: 32, heightCm: 6 },
        color: 'Raw Indigo',
        size: 'M',
        material: '14oz Selvedge Denim',
        customAttributes: [{ key: 'Denim Weight', value: '14 oz Shuttle Loom Selvedge' }],
        tags: ['selvedge', 'denim', 'jacket', 'chore', 'draft'],
        images: [
          {
            url: '/src/assets/images/product_linen_overshirt_1794669437948.jpg',
            altText: 'Raw Selvedge Work Jacket prototype',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
        hasVariants: false,
        variants: [],
        seo: {
          metaTitle: 'Raw Selvedge Work Jacket | Dhaka Loom Co.',
          metaDescription: 'Limited prototype 14oz selvedge work jacket.',
          keywords: ['selvedge jacket', 'raw denim'],
          canonicalSlug: 'raw-selvedge-work-jacket-sample',
        },
        createdByUserId: prodMgrA?.id || 'system',
        updatedAt: new Date(now - 6 * 3600_000),
      },
    ];

    // =====================================================
    // TENANT B SEED: LuxeThread Studio (DEMO_TENANT_B_ID)
    // =====================================================
    const catB1: TenantCategoryRecord = {
      id: 'cat_lt_silk',
      tenantId: DEMO_TENANT_B_ID,
      name: 'Silk Couture & Kurtas',
      slug: 'silk-couture-kurtas',
      description: 'Handwoven Rajshahi and Sylhet mulberry silk eveningwear.',
      sortOrder: 1,
      isActive: true,
      updatedAt: new Date(now - 5 * day),
    };
    const catB2: TenantCategoryRecord = {
      id: 'cat_lt_jamdani',
      tenantId: DEMO_TENANT_B_ID,
      name: 'Artisan Jamdani Sarees',
      slug: 'artisan-jamdani-sarees',
      description: 'Numbered heritage loom Jamdani editions.',
      sortOrder: 2,
      isActive: true,
      updatedAt: new Date(now - 4 * day),
    };

    const brandB1: TenantBrandRecord = {
      id: 'brd_lt_atelier',
      tenantId: DEMO_TENANT_B_ID,
      name: 'LuxeThread Atelier',
      slug: 'luxethread-atelier',
      originCountry: 'Bangladesh',
      websiteUrl: 'https://luxethread.nexora.shop',
      isFeatured: true,
      isActive: true,
      updatedAt: new Date(now - 5 * day),
    };
    const brandB2: TenantBrandRecord = {
      id: 'brd_lt_rajshahi',
      tenantId: DEMO_TENANT_B_ID,
      name: 'Padma Heritage Weavers',
      slug: 'padma-heritage-weavers',
      originCountry: 'Bangladesh',
      websiteUrl: 'https://padmaweavers.example.com',
      isFeatured: true,
      isActive: true,
      updatedAt: new Date(now - 3 * day),
    };

    const prodB: TenantCatalogProductRecord[] = [
      {
        id: 'prod_lt_201',
        tenantId: DEMO_TENANT_B_ID,
        title: 'Sylhet Silk Evening Kurta',
        sku: 'LT-SLK-201',
        barcode: '8942202002011',
        slug: 'sylhet-silk-evening-kurta',
        description:
          'Champagne ivory pure mulberry silk kurta featuring tonal resham hand-embroidery along the mandarin collar and placket.',
        categoryId: catB1.id,
        brandId: brandB1.id,
        priceBDT: 5800,
        compareAtPriceBDT: 6500,
        costBDT: 2650,
        stockQty: 18,
        lowStockThreshold: 8,
        unitsSold: 76,
        status: 'PUBLISHED',
        requiresShipping: true,
        weightGrams: 310,
        dimensions: { lengthCm: 40, widthCm: 32, heightCm: 5 },
        color: 'Champagne Ivory',
        size: 'M–L',
        material: '100% Pure Mulberry Silk',
        customAttributes: [
          { key: 'Weave Origin', value: 'Rajshahi Silk Guild' },
          { key: 'Embroidery', value: 'Hand-Worked Tonal Resham' },
        ],
        tags: ['silk', 'kurta', 'couture', 'ivory', 'eveningwear', 'rajshahi'],
        images: [
          {
            url: '/src/assets/images/product_silk_kurta_1794669438756.jpg',
            altText: 'Sylhet Silk Evening Kurta folded with atelier hangtag',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
        hasVariants: true,
        variants: [
          {
            id: 'var_lt_201_m',
            tenantId: DEMO_TENANT_B_ID,
            productId: 'prod_lt_201',
            title: 'Champagne Ivory / M',
            sku: 'LT-SLK-201-IVR-M',
            barcode: '8942202002012',
            priceBDT: 5800,
            compareAtPriceBDT: 6500,
            costBDT: 2650,
            stockQty: 10,
            color: 'Champagne Ivory',
            size: 'M',
            material: 'Mulberry Silk',
            weightGrams: 300,
            imageUrl: '/src/assets/images/product_silk_kurta_1794669438756.jpg',
            isDefault: true,
            isActive: true,
          },
          {
            id: 'var_lt_201_l',
            tenantId: DEMO_TENANT_B_ID,
            productId: 'prod_lt_201',
            title: 'Champagne Ivory / L',
            sku: 'LT-SLK-201-IVR-L',
            barcode: '8942202002013',
            priceBDT: 5800,
            compareAtPriceBDT: 6500,
            costBDT: 2650,
            stockQty: 8,
            color: 'Champagne Ivory',
            size: 'L',
            material: 'Mulberry Silk',
            weightGrams: 320,
            imageUrl: '/src/assets/images/product_silk_kurta_1794669438756.jpg',
            isDefault: false,
            isActive: true,
          },
        ],
        seo: {
          metaTitle: 'Sylhet Silk Evening Kurta | LuxeThread Studio',
          metaDescription: 'Hand-embroidered pure mulberry silk kurta crafted in Bangladesh.',
          keywords: ['silk kurta', 'luxury menswear', 'rajshahi silk'],
          canonicalSlug: 'sylhet-silk-evening-kurta',
        },
        createdByUserId: ownerB?.id || 'system',
        updatedAt: new Date(now - 2 * day),
      },
      {
        id: 'prod_lt_202',
        tenantId: DEMO_TENANT_B_ID,
        title: 'Sonargaon Ivory Jamdani Saree',
        sku: 'LT-JMD-202',
        barcode: '8942202002021',
        slug: 'sonargaon-ivory-jamdani-saree',
        description:
          '84-count handloom Sonargaon Jamdani saree woven with fine gold-zari geometric motifs over 28 loom days.',
        categoryId: catB2.id,
        brandId: brandB2.id,
        priceBDT: 14500,
        compareAtPriceBDT: 16200,
        costBDT: 7900,
        stockQty: 3, // LOW STOCK
        lowStockThreshold: 5,
        unitsSold: 41,
        status: 'PUBLISHED',
        requiresShipping: true,
        weightGrams: 460,
        dimensions: { lengthCm: 46, widthCm: 36, heightCm: 6 },
        color: 'Ivory & Antique Gold',
        size: '5.5m + Blouse Piece',
        material: '84-Count Muslin Cotton & Zari Silk',
        customAttributes: [
          { key: 'GI Certification', value: 'Sonargaon Heritage Loom #418' },
          { key: 'Loom Hours', value: '220 Artisan Hours' },
        ],
        tags: ['jamdani', 'saree', 'sonargaon', 'handloom', 'bridal', 'gold'],
        images: [
          {
            url: '/src/assets/images/product_jamdani_saree_1794669440195.jpg',
            altText: 'Sonargaon Ivory Jamdani Saree with woven gold motifs',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
        hasVariants: false,
        variants: [],
        seo: {
          metaTitle: 'Sonargaon Ivory Jamdani Saree | Padma Heritage Weavers',
          metaDescription: 'Authentic 84-count GI-certified Sonargaon Jamdani handloom saree.',
          keywords: ['jamdani saree', 'sonargaon jamdani', 'luxury saree bd'],
          canonicalSlug: 'sonargaon-ivory-jamdani-saree',
        },
        createdByUserId: ownerB?.id || 'system',
        updatedAt: new Date(now - 1 * day),
      },
      {
        id: 'prod_lt_203',
        tenantId: DEMO_TENANT_B_ID,
        title: 'Zari Embroidered Velvet Shawl',
        sku: 'LT-SHW-203',
        barcode: '8942202002031',
        slug: 'zari-embroidered-velvet-shawl',
        description:
          'Plush silk-blend micro-velvet winter shawl finished with antique gold zardozi border work.',
        categoryId: catB1.id,
        brandId: brandB1.id,
        priceBDT: 7900,
        costBDT: 3700,
        stockQty: 11,
        lowStockThreshold: 6,
        unitsSold: 34,
        status: 'PUBLISHED',
        requiresShipping: true,
        weightGrams: 540,
        dimensions: { lengthCm: 44, widthCm: 34, heightCm: 6 },
        color: 'Deep Espresso Gold',
        size: 'Free Size (220cm x 105cm)',
        material: 'Silk-Viscose Micro Velvet',
        customAttributes: [{ key: 'Border Work', value: 'Hand Zardozi Metallic Thread' }],
        tags: ['shawl', 'velvet', 'zari', 'winter', 'couture'],
        images: [
          {
            url: '/src/assets/images/product_jamdani_saree_1794669440195.jpg',
            altText: 'Zari Embroidered Velvet Shawl folded',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
        hasVariants: false,
        variants: [],
        seo: {
          metaTitle: 'Zari Embroidered Velvet Shawl | LuxeThread Studio',
          metaDescription: 'Hand-embroidered zardozi silk velvet evening shawl.',
          keywords: ['velvet shawl', 'zari shawl', 'bridal wrap'],
          canonicalSlug: 'zari-embroidered-velvet-shawl',
        },
        createdByUserId: ownerB?.id || 'system',
        updatedAt: new Date(now - 3 * day),
      },
    ];

    if (sandboxCategories.size === 0) {
      [catA1, catA2, catA3, catB1, catB2].forEach((c) => sandboxCategories.set(c.id, c));
    }
    if (sandboxBrands.size === 0) {
      [brandA1, brandA2, brandB1, brandB2].forEach((b) => sandboxBrands.set(b.id, b));
    }
    if (sandboxCatalogProducts.size === 0) {
      [...prodA, ...prodB].forEach((p) => sandboxCatalogProducts.set(p.id, p));
    }

    // Seed Inventory Adjustment Logs
    if (sandboxInventoryLogs.size === 0) {
      const invLogs: TenantInventoryLogRecord[] = [
        {
          id: 'inv_uw_1',
          tenantId: DEMO_TENANT_A_ID,
          productId: 'prod_uw_102',
          sku: 'UW-CRG-102',
          productTitle: 'Mirpur Indigo Cargo Trouser',
          previousQty: 18,
          deltaQty: -12,
          newQty: 6,
          reason: 'Weekend flash sale batch fulfillment',
          actorEmail: 'owner@urbanwear.nexora.shop',
          createdAt: new Date(now - 18 * 3600_000),
        },
        {
          id: 'inv_uw_2',
          tenantId: DEMO_TENANT_A_ID,
          productId: 'prod_uw_101',
          sku: 'UW-LIN-101',
          productTitle: 'Dhaka Heritage Linen Overshirt',
          previousQty: 22,
          deltaQty: 20,
          newQty: 42,
          reason: 'Narayanganj mill restock intake',
          actorEmail: 'catalog@urbanwear.nexora.shop',
          createdAt: new Date(now - 2 * day),
        },
        {
          id: 'inv_lt_1',
          tenantId: DEMO_TENANT_B_ID,
          productId: 'prod_lt_202',
          sku: 'LT-JMD-202',
          productTitle: 'Sonargaon Ivory Jamdani Saree',
          previousQty: 5,
          deltaQty: -2,
          newQty: 3,
          reason: 'Boutique VIP private reservation',
          actorEmail: 'owner@luxethread.nexora.shop',
          createdAt: new Date(now - 10 * 3600_000),
        },
      ];
      invLogs.forEach((l) => sandboxInventoryLogs.set(l.id, l));
    }

    // Seed Tenant-Isolated Customers
    const custA1: TenantCustomerRecord = {
      id: 'cust_uw_1',
      tenantId: DEMO_TENANT_A_ID,
      userId: buyer1?.id,
      fullName: 'Farhana Akter',
      email: 'buyer1@nexora.shop',
      phone: '+880 1711-223344',
      city: 'Dhaka',
      segment: 'VIP',
      ordersCount: 5,
      totalSpentBDT: 14850,
      notes: 'Prefers Express Steadfast delivery after 4 PM.',
      status: 'ACTIVE',
      lastOrderAt: new Date(now - 1 * day),
      createdAt: new Date(now - 45 * day),
    };
    const custA2: TenantCustomerRecord = {
      id: 'cust_uw_2',
      tenantId: DEMO_TENANT_A_ID,
      userId: buyer2?.id,
      fullName: 'Imran Hossain',
      email: 'buyer2@nexora.shop',
      phone: '+880 1819-556677',
      city: 'Chattogram',
      segment: 'RETURNING',
      ordersCount: 3,
      totalSpentBDT: 8050,
      notes: 'Repeat buyer for cargo trousers and oversized tees.',
      status: 'ACTIVE',
      lastOrderAt: new Date(now - 2 * day),
      createdAt: new Date(now - 30 * day),
    };
    const custA3: TenantCustomerRecord = {
      id: 'cust_uw_3',
      tenantId: DEMO_TENANT_A_ID,
      fullName: 'Nusrat Jahan',
      email: 'nusrat.dhaka@example.com',
      phone: '+880 1912-887766',
      city: 'Sylhet',
      segment: 'NEW',
      ordersCount: 1,
      totalSpentBDT: 4850,
      notes: 'First-order discount redeemed.',
      status: 'ACTIVE',
      lastOrderAt: new Date(now - 6 * 3600_000),
      createdAt: new Date(now - 2 * day),
    };

    const custB1: TenantCustomerRecord = {
      id: 'cust_lt_1',
      tenantId: DEMO_TENANT_B_ID,
      userId: buyer1?.id,
      fullName: 'Farhana Akter',
      email: 'buyer1@nexora.shop',
      phone: '+880 1711-223344',
      city: 'Dhaka (Gulshan)',
      segment: 'VIP',
      ordersCount: 4,
      totalSpentBDT: 34800,
      notes: 'Atelier Jamdani collector — gift box packaging required.',
      status: 'ACTIVE',
      lastOrderAt: new Date(now - 1 * day),
      createdAt: new Date(now - 60 * day),
    };
    const custB2: TenantCustomerRecord = {
      id: 'cust_lt_2',
      tenantId: DEMO_TENANT_B_ID,
      fullName: 'Meher Afroz',
      email: 'meher.atelier@example.com',
      phone: '+880 1755-990011',
      city: 'Rajshahi',
      segment: 'VIP',
      ordersCount: 2,
      totalSpentBDT: 22400,
      notes: 'Requires monogram silk care card.',
      status: 'ACTIVE',
      lastOrderAt: new Date(now - 3 * day),
      createdAt: new Date(now - 25 * day),
    };

    if (sandboxCustomers.size === 0) {
      [custA1, custA2, custA3, custB1, custB2].forEach((c) => sandboxCustomers.set(c.id, c));
    }

    // Seed Store Orders
    if (sandboxStoreOrders.size === 0) {
      const orders: TenantStoreOrderRecord[] = [
        {
          id: 'ord_uw_9001',
          tenantId: DEMO_TENANT_A_ID,
          orderNumber: 'UW-2026-9001',
          customerId: custA1.id,
          customerUserId: buyer1?.id || 'cust_1',
          customerName: 'Farhana Akter',
          customerEmail: 'buyer1@nexora.shop',
          items: [
            {
              productId: 'prod_uw_101',
              sku: 'UW-LIN-101',
              title: 'Dhaka Heritage Linen Overshirt',
              qty: 1,
              unitPriceBDT: 2450,
            },
          ],
          itemsSummary: '1x Dhaka Heritage Linen Overshirt',
          subtotalBDT: 2450,
          discountBDT: 0,
          shippingBDT: 80,
          totalBDT: 2530,
          paymentGateway: 'BKASH',
          paymentStatus: 'PAID',
          status: 'DELIVERED',
          shippingCity: 'Dhaka',
          createdAt: new Date(now - 4 * day),
          updatedAt: new Date(now - 2 * day),
        },
        {
          id: 'ord_uw_9002',
          tenantId: DEMO_TENANT_A_ID,
          orderNumber: 'UW-2026-9002',
          customerId: custA2.id,
          customerUserId: buyer2?.id || 'cust_2',
          customerName: 'Imran Hossain',
          customerEmail: 'buyer2@nexora.shop',
          items: [
            {
              productId: 'prod_uw_102',
              sku: 'UW-CRG-102',
              title: 'Mirpur Indigo Cargo Trouser',
              qty: 1,
              unitPriceBDT: 3150,
            },
            {
              productId: 'prod_uw_103',
              sku: 'UW-TEE-103',
              title: 'Boxy 260GSM Ash Street Tee',
              qty: 2,
              unitPriceBDT: 1190,
            },
          ],
          itemsSummary: '1x Mirpur Indigo Cargo Trouser, 2x Boxy 260GSM Ash Street Tee',
          subtotalBDT: 5530,
          discountBDT: 350,
          shippingBDT: 120,
          totalBDT: 5300,
          paymentGateway: 'SSLCOMMERZ',
          paymentStatus: 'PAID',
          status: 'PROCESSING',
          shippingCity: 'Chattogram',
          createdAt: new Date(now - 1 * day),
          updatedAt: new Date(now - 12 * 3600_000),
        },
        {
          id: 'ord_uw_9003',
          tenantId: DEMO_TENANT_A_ID,
          orderNumber: 'UW-2026-9003',
          customerId: custA3.id,
          customerUserId: 'guest_uw_3',
          customerName: 'Nusrat Jahan',
          customerEmail: 'nusrat.dhaka@example.com',
          items: [
            {
              productId: 'prod_uw_104',
              sku: 'UW-PRK-104',
              title: 'Monsoon Technical Field Parka',
              qty: 1,
              unitPriceBDT: 4850,
            },
          ],
          itemsSummary: '1x Monsoon Technical Field Parka',
          subtotalBDT: 4850,
          discountBDT: 0,
          shippingBDT: 0,
          totalBDT: 4850,
          paymentGateway: 'BKASH',
          paymentStatus: 'PAID',
          status: 'PENDING',
          shippingCity: 'Sylhet',
          createdAt: new Date(now - 5 * 3600_000),
          updatedAt: new Date(now - 5 * 3600_000),
        },
        {
          id: 'ord_uw_9004',
          tenantId: DEMO_TENANT_A_ID,
          orderNumber: 'UW-2026-9004',
          customerId: custA1.id,
          customerUserId: buyer1?.id || 'cust_1',
          customerName: 'Farhana Akter',
          customerEmail: 'buyer1@nexora.shop',
          items: [
            {
              productId: 'prod_uw_101',
              sku: 'UW-LIN-101',
              title: 'Dhaka Heritage Linen Overshirt',
              qty: 2,
              unitPriceBDT: 2450,
            },
          ],
          itemsSummary: '2x Dhaka Heritage Linen Overshirt',
          subtotalBDT: 4900,
          discountBDT: 490,
          shippingBDT: 0,
          totalBDT: 4410,
          paymentGateway: 'COD',
          paymentStatus: 'PAID',
          status: 'SHIPPED',
          shippingCity: 'Dhaka',
          createdAt: new Date(now - 2 * day),
          updatedAt: new Date(now - 1 * day),
        },
        // TENANT B ORDERS (STRICTLY SEPARATE STOREFRONT)
        {
          id: 'ord_lt_8001',
          tenantId: DEMO_TENANT_B_ID,
          orderNumber: 'LT-2026-8001',
          customerId: custB1.id,
          customerUserId: buyer1?.id || 'cust_1',
          customerName: 'Farhana Akter',
          customerEmail: 'buyer1@nexora.shop',
          items: [
            {
              productId: 'prod_lt_202',
              sku: 'LT-JMD-202',
              title: 'Sonargaon Ivory Jamdani Saree',
              qty: 1,
              unitPriceBDT: 14500,
            },
          ],
          itemsSummary: '1x Sonargaon Ivory Jamdani Saree',
          subtotalBDT: 14500,
          discountBDT: 1000,
          shippingBDT: 0,
          totalBDT: 13500,
          paymentGateway: 'STRIPE',
          paymentStatus: 'PAID',
          status: 'DELIVERED',
          shippingCity: 'Dhaka (Gulshan)',
          createdAt: new Date(now - 3 * day),
          updatedAt: new Date(now - 1 * day),
        },
        {
          id: 'ord_lt_8002',
          tenantId: DEMO_TENANT_B_ID,
          orderNumber: 'LT-2026-8002',
          customerId: custB2.id,
          customerUserId: 'cust_lt_2_uid',
          customerName: 'Meher Afroz',
          customerEmail: 'meher.atelier@example.com',
          items: [
            {
              productId: 'prod_lt_201',
              sku: 'LT-SLK-201',
              title: 'Sylhet Silk Evening Kurta',
              qty: 1,
              unitPriceBDT: 5800,
            },
            {
              productId: 'prod_lt_203',
              sku: 'LT-SHW-203',
              title: 'Zari Embroidered Velvet Shawl',
              qty: 1,
              unitPriceBDT: 7900,
            },
          ],
          itemsSummary: '1x Sylhet Silk Evening Kurta, 1x Zari Embroidered Velvet Shawl',
          subtotalBDT: 13700,
          discountBDT: 0,
          shippingBDT: 150,
          totalBDT: 13850,
          paymentGateway: 'SSLCOMMERZ',
          paymentStatus: 'PAID',
          status: 'PROCESSING',
          shippingCity: 'Rajshahi',
          createdAt: new Date(now - 8 * 3600_000),
          updatedAt: new Date(now - 6 * 3600_000),
        },
      ];
      orders.forEach((o) => sandboxStoreOrders.set(o.id, o));
    }

    // Seed Coupons
    if (sandboxCoupons.size === 0) {
      const coupons: TenantCouponRecord[] = [
        {
          id: 'cpn_uw_1',
          tenantId: DEMO_TENANT_A_ID,
          code: 'DHAKA10',
          title: 'Dhaka Streetwear 10% Off',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          minOrderBDT: 2000,
          maxDiscountBDT: 800,
          usageLimit: 250,
          usedCount: 64,
          startsAt: new Date(now - 15 * day),
          endsAt: new Date(now + 30 * day),
          isActive: true,
          updatedAt: new Date(now - 2 * day),
        },
        {
          id: 'cpn_uw_2',
          tenantId: DEMO_TENANT_A_ID,
          code: 'FREESHIP5K',
          title: 'Free Express Shipping Over 5000 BDT',
          discountType: 'FREE_SHIPPING',
          discountValue: 120,
          minOrderBDT: 5000,
          usageLimit: 500,
          usedCount: 19,
          startsAt: new Date(now - 10 * day),
          endsAt: new Date(now + 45 * day),
          isActive: true,
          updatedAt: new Date(now - 4 * day),
        },
        {
          id: 'cpn_lt_1',
          tenantId: DEMO_TENANT_B_ID,
          code: 'ATELIER1500',
          title: 'LuxeThread Couture Privilege 1500 BDT',
          discountType: 'FIXED_BDT',
          discountValue: 1500,
          minOrderBDT: 10000,
          usageLimit: 100,
          usedCount: 22,
          startsAt: new Date(now - 20 * day),
          endsAt: new Date(now + 40 * day),
          isActive: true,
          updatedAt: new Date(now - 3 * day),
        },
      ];
      coupons.forEach((c) => sandboxCoupons.set(c.id, c));
    }

    // Seed Automatic Discounts
    if (sandboxDiscounts.size === 0) {
      const discounts: TenantDiscountRecord[] = [
        {
          id: 'dsc_uw_1',
          tenantId: DEMO_TENANT_A_ID,
          name: 'Weekend Linen & Cargo Bundle (15% Off 2+ Items)',
          campaignType: 'BULK_TIER',
          discountType: 'PERCENTAGE',
          discountValue: 15,
          minQty: 2,
          stackable: false,
          isActive: true,
          startsAt: new Date(now - 7 * day),
          endsAt: new Date(now + 14 * day),
          redemptionsCount: 38,
          revenueImpactBDT: 94200,
          updatedAt: new Date(now - 1 * day),
        },
        {
          id: 'dsc_uw_2',
          tenantId: DEMO_TENANT_A_ID,
          name: 'First-Time Member Welcome Drop (300 BDT Off)',
          campaignType: 'FIRST_ORDER',
          discountType: 'FIXED_BDT',
          discountValue: 300,
          minQty: 1,
          stackable: true,
          isActive: true,
          startsAt: new Date(now - 30 * day),
          endsAt: new Date(now + 60 * day),
          redemptionsCount: 51,
          revenueImpactBDT: 112000,
          updatedAt: new Date(now - 5 * day),
        },
        {
          id: 'dsc_lt_1',
          tenantId: DEMO_TENANT_B_ID,
          name: 'Jamdani Private Trunk Show (10% Category Offer)',
          campaignType: 'CATEGORY_OFFER',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          targetCategoryId: catB2.id,
          minQty: 1,
          stackable: false,
          isActive: true,
          startsAt: new Date(now - 5 * day),
          endsAt: new Date(now + 20 * day),
          redemptionsCount: 14,
          revenueImpactBDT: 185000,
          updatedAt: new Date(now - 1 * day),
        },
      ];
      discounts.forEach((d) => sandboxDiscounts.set(d.id, d));
    }

    // Seed Store Settings & Branding for A & B
    sandboxStoreSettings.set(DEMO_TENANT_A_ID, {
      tenantId: DEMO_TENANT_A_ID,
      storeName: 'UrbanWear BD',
      storeSlug: 'urbanwear',
      supportEmail: 'care@urbanwear.nexora.shop',
      supportPhone: '+880 1712-904411',
      currency: 'BDT',
      locale: 'en-BD',
      timezone: 'Asia/Dhaka',
      taxRatePct: 5,
      taxInclusivePricing: true,
      lowStockAlertThreshold: 12,
      autoArchiveOutOfStock: false,
      orderNumberPrefix: 'UW',
      guestCheckoutEnabled: true,
      customDomain: 'urbanwear.com.bd',
      updatedAt: new Date(now - 2 * day).toISOString(),
    });
    sandboxStoreSettings.set(DEMO_TENANT_B_ID, {
      tenantId: DEMO_TENANT_B_ID,
      storeName: 'LuxeThread Studio',
      storeSlug: 'luxethread',
      supportEmail: 'concierge@luxethread.nexora.shop',
      supportPhone: '+880 1811-778899',
      currency: 'BDT',
      locale: 'en-BD',
      timezone: 'Asia/Dhaka',
      taxRatePct: 7.5,
      taxInclusivePricing: true,
      lowStockAlertThreshold: 6,
      autoArchiveOutOfStock: false,
      orderNumberPrefix: 'LT',
      guestCheckoutEnabled: false,
      customDomain: 'luxethread.com.bd',
      updatedAt: new Date(now - 1 * day).toISOString(),
    });

    sandboxStoreBranding.set(DEMO_TENANT_A_ID, {
      tenantId: DEMO_TENANT_A_ID,
      themeCode: 'URBAN_GRID',
      primaryColor: '#4F46E5',
      secondaryColor: '#0F172A',
      accentColor: '#10B981',
      fontHeading: 'Plus Jakarta Sans',
      fontBody: 'Inter',
      headerAnnouncement: 'Free Express Dhaka Delivery on Orders Above ৳5,000',
      heroHeadline: 'Dhaka Heritage Streetwear Engineered for Monsoon & Heat',
      heroSubheadline: '260 GSM combed cotton, breathable linen overshirts & tapered cargos.',
      footerText: '© 2026 UrbanWear BD • Banani Flagship, Dhaka',
      showPoweredByNexora: true,
      updatedAt: new Date(now - 2 * day).toISOString(),
    });
    sandboxStoreBranding.set(DEMO_TENANT_B_ID, {
      tenantId: DEMO_TENANT_B_ID,
      themeCode: 'ATELIER_LUXE',
      primaryColor: '#0F172A',
      secondaryColor: '#78350F',
      accentColor: '#D97706',
      fontHeading: 'Playfair Display',
      fontBody: 'Inter',
      headerAnnouncement: 'Private Atelier Appointments Open — Gulshan 2 & Worldwide DHL',
      heroHeadline: 'Handwoven Rajshahi Silk & Numbered Sonargaon Jamdani',
      heroSubheadline: 'Heirloom Bangladeshi textiles finished with contemporary couture tailoring.',
      footerText: '© 2026 LuxeThread Studio • Gulshan Avenue, Dhaka',
      showPoweredByNexora: false,
      updatedAt: new Date(now - 1 * day).toISOString(),
    });

    // Seed Payment Gateways per tenant
    sandboxPaymentConfigs.set(DEMO_TENANT_A_ID, defaultPaymentConfigs(DEMO_TENANT_A_ID, 'urbanwear'));
    sandboxPaymentConfigs.set(DEMO_TENANT_B_ID, defaultPaymentConfigs(DEMO_TENANT_B_ID, 'luxethread'));

    // Seed Shipping Methods per tenant
    if (sandboxShippingMethods.size === 0) {
      const shipMethods: TenantShippingMethodRecord[] = [
        {
          id: 'shp_uw_dhaka',
          tenantId: DEMO_TENANT_A_ID,
          code: 'UW-DHK-EXP',
          name: 'Dhaka Metro Same/Next-Day',
          zoneName: 'Dhaka City Corporation',
          carrier: 'Steadfast Express',
          baseRateBDT: 80,
          freeShippingThresholdBDT: 5000,
          estimatedDays: '1-2 business days',
          codSupported: true,
          isActive: true,
          updatedAt: new Date(now - 3 * day),
        },
        {
          id: 'shp_uw_nat',
          tenantId: DEMO_TENANT_A_ID,
          code: 'UW-NAT-STD',
          name: 'Nationwide 64-District Standard',
          zoneName: 'Outside Dhaka',
          carrier: 'Pathao Courier',
          baseRateBDT: 130,
          freeShippingThresholdBDT: 6500,
          estimatedDays: '2-4 business days',
          codSupported: true,
          isActive: true,
          updatedAt: new Date(now - 3 * day),
        },
        {
          id: 'shp_lt_vip',
          tenantId: DEMO_TENANT_B_ID,
          code: 'LT-ATELIER-WC',
          name: 'White-Glove Garment Box Delivery',
          zoneName: 'Dhaka & Chattogram Metro',
          carrier: 'LuxeThread Fleet',
          baseRateBDT: 0,
          freeShippingThresholdBDT: 0,
          estimatedDays: 'Same-day scheduled slot',
          codSupported: false,
          isActive: true,
          updatedAt: new Date(now - 2 * day),
        },
        {
          id: 'shp_lt_intl',
          tenantId: DEMO_TENANT_B_ID,
          code: 'LT-DHL-INTL',
          name: 'DHL Express International Couture',
          zoneName: 'UK, US, EU & UAE',
          carrier: 'DHL Express',
          baseRateBDT: 3200,
          freeShippingThresholdBDT: 45000,
          estimatedDays: '4-6 business days',
          codSupported: false,
          isActive: true,
          updatedAt: new Date(now - 2 * day),
        },
      ];
      shipMethods.forEach((s) => sandboxShippingMethods.set(s.id, s));
    }

    // Seed Measurable Funnel Telemetry per tenant
    sandboxFunnelStats.set(DEMO_TENANT_A_ID, {
      tenantId: DEMO_TENANT_A_ID,
      storefrontSessions: 4820,
      productViews: 3190,
      cartAdditions: 612,
      checkoutInitiated: 284,
      dailySeries: [
        { dateLabel: 'Mon', sessions: 610, orders: 14, revenueBDT: 38400 },
        { dateLabel: 'Tue', sessions: 645, orders: 18, revenueBDT: 46200 },
        { dateLabel: 'Wed', sessions: 590, orders: 15, revenueBDT: 39800 },
        { dateLabel: 'Thu', sessions: 720, orders: 22, revenueBDT: 58900 },
        { dateLabel: 'Fri', sessions: 840, orders: 29, revenueBDT: 76400 },
        { dateLabel: 'Sat', sessions: 790, orders: 25, revenueBDT: 64100 },
        { dateLabel: 'Sun', sessions: 625, orders: 19, revenueBDT: 49200 },
      ],
    });
    sandboxFunnelStats.set(DEMO_TENANT_B_ID, {
      tenantId: DEMO_TENANT_B_ID,
      storefrontSessions: 2150,
      productViews: 1640,
      cartAdditions: 295,
      checkoutInitiated: 148,
      dailySeries: [
        { dateLabel: 'Mon', sessions: 260, orders: 6, revenueBDT: 68500 },
        { dateLabel: 'Tue', sessions: 295, orders: 8, revenueBDT: 92400 },
        { dateLabel: 'Wed', sessions: 310, orders: 7, revenueBDT: 81000 },
        { dateLabel: 'Thu', sessions: 340, orders: 10, revenueBDT: 118500 },
        { dateLabel: 'Fri', sessions: 380, orders: 12, revenueBDT: 146000 },
        { dateLabel: 'Sat', sessions: 325, orders: 9, revenueBDT: 109000 },
        { dateLabel: 'Sun', sessions: 240, orders: 6, revenueBDT: 74200 },
      ],
    });

    // Seed Tenant-Isolated Search History & Popular Searches Telemetry
    if (sandboxSearchLogs.length === 0) {
      const seedSearches: TenantSearchLogRecord[] = [
        {
          id: 'srch_uw_1',
          tenantId: DEMO_TENANT_A_ID,
          sessionKey: 'seed_uw_session',
          query: 'linen overshirt',
          normalizedQuery: 'linen overshirt',
          mode: 'FULLTEXT',
          resultCount: 1,
          latencyMs: 6,
          didYouMeanUsed: false,
          createdAt: new Date(now - 3 * 3600_000),
        },
        {
          id: 'srch_uw_2',
          tenantId: DEMO_TENANT_A_ID,
          sessionKey: 'seed_uw_session',
          query: 'linen overshirt',
          normalizedQuery: 'linen overshirt',
          mode: 'FULLTEXT',
          resultCount: 1,
          latencyMs: 4,
          didYouMeanUsed: false,
          createdAt: new Date(now - 2 * 3600_000),
        },
        {
          id: 'srch_uw_3',
          tenantId: DEMO_TENANT_A_ID,
          sessionKey: 'seed_uw_session',
          query: 'cargo trouser',
          normalizedQuery: 'cargo trouser',
          mode: 'PARTIAL',
          resultCount: 1,
          latencyMs: 5,
          didYouMeanUsed: false,
          createdAt: new Date(now - 90 * 60_000),
        },
        {
          id: 'srch_uw_4',
          tenantId: DEMO_TENANT_A_ID,
          sessionKey: 'seed_uw_session',
          query: 'UW-LIN-101',
          normalizedQuery: 'uw-lin-101',
          mode: 'LOOKUP',
          resultCount: 1,
          latencyMs: 2,
          didYouMeanUsed: false,
          createdAt: new Date(now - 45 * 60_000),
        },
        {
          id: 'srch_uw_5',
          tenantId: DEMO_TENANT_A_ID,
          sessionKey: 'seed_uw_session',
          query: 'winter leather boot',
          normalizedQuery: 'winter leather boot',
          mode: 'AUTO',
          resultCount: 0,
          latencyMs: 7,
          didYouMeanUsed: false,
          createdAt: new Date(now - 25 * 60_000),
        },
        {
          id: 'srch_lt_1',
          tenantId: DEMO_TENANT_B_ID,
          sessionKey: 'seed_lt_session',
          query: 'jamdani saree',
          normalizedQuery: 'jamdani saree',
          mode: 'FULLTEXT',
          resultCount: 1,
          latencyMs: 5,
          didYouMeanUsed: false,
          createdAt: new Date(now - 2 * 3600_000),
        },
        {
          id: 'srch_lt_2',
          tenantId: DEMO_TENANT_B_ID,
          sessionKey: 'seed_lt_session',
          query: 'mulberry silk kurta',
          normalizedQuery: 'mulberry silk kurta',
          mode: 'FULLTEXT',
          resultCount: 1,
          latencyMs: 4,
          didYouMeanUsed: false,
          createdAt: new Date(now - 50 * 60_000),
        },
      ];
      sandboxSearchLogs.push(...seedSearches);
    }

    tenantBootstrapDone = true;
  })();

  try {
    await tenantBootstrapPromise;
  } finally {
    tenantBootstrapPromise = null;
  }
}

export const tenantRepository = {
  // ---------------- CATEGORIES ----------------
  async listCategories(tenantId: string): Promise<TenantCategoryRecord[]> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    return Array.from(sandboxCategories.values())
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((c) => ({ ...c }));
  },

  async createCategory(
    tenantId: string,
    input: { name: string; description: string; sortOrder?: number; isActive?: boolean }
  ): Promise<TenantCategoryRecord> {
    await ensureTenantDashboardBootstrapped();
    const id = `cat_${new Types.ObjectId().toString().slice(-8)}`;
    const rec: TenantCategoryRecord = {
      id,
      tenantId,
      name: input.name.trim(),
      slug: slugify(input.name),
      description: input.description.trim(),
      sortOrder: input.sortOrder ?? 10,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    };
    sandboxCategories.set(id, rec);
    return { ...rec };
  },

  async updateCategory(
    tenantId: string,
    categoryId: string,
    patch: Partial<Pick<TenantCategoryRecord, 'name' | 'description' | 'sortOrder' | 'isActive'>>
  ): Promise<TenantCategoryRecord> {
    await ensureTenantDashboardBootstrapped();
    const existing = assertTenantOwnership(sandboxCategories.get(categoryId), tenantId, 'Category');
    const updated: TenantCategoryRecord = {
      ...existing,
      ...patch,
      slug: patch.name ? slugify(patch.name) : existing.slug,
      updatedAt: new Date(),
    };
    sandboxCategories.set(categoryId, updated);
    return { ...updated };
  },

  async deleteCategory(tenantId: string, categoryId: string): Promise<void> {
    await ensureTenantDashboardBootstrapped();
    assertTenantOwnership(sandboxCategories.get(categoryId), tenantId, 'Category');
    sandboxCategories.delete(categoryId);
  },

  // ---------------- BRANDS ----------------
  async listBrands(tenantId: string): Promise<TenantBrandRecord[]> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    return Array.from(sandboxBrands.values())
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({ ...b }));
  },

  async createBrand(
    tenantId: string,
    input: { name: string; originCountry: string; websiteUrl: string; isFeatured?: boolean; isActive?: boolean }
  ): Promise<TenantBrandRecord> {
    await ensureTenantDashboardBootstrapped();
    const id = `brd_${new Types.ObjectId().toString().slice(-8)}`;
    const rec: TenantBrandRecord = {
      id,
      tenantId,
      name: input.name.trim(),
      slug: slugify(input.name),
      originCountry: input.originCountry.trim(),
      websiteUrl: input.websiteUrl.trim(),
      isFeatured: input.isFeatured ?? false,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    };
    sandboxBrands.set(id, rec);
    return { ...rec };
  },

  async updateBrand(
    tenantId: string,
    brandId: string,
    patch: Partial<Pick<TenantBrandRecord, 'name' | 'originCountry' | 'websiteUrl' | 'isFeatured' | 'isActive'>>
  ): Promise<TenantBrandRecord> {
    await ensureTenantDashboardBootstrapped();
    const existing = assertTenantOwnership(sandboxBrands.get(brandId), tenantId, 'Brand');
    const updated: TenantBrandRecord = {
      ...existing,
      ...patch,
      slug: patch.name ? slugify(patch.name) : existing.slug,
      updatedAt: new Date(),
    };
    sandboxBrands.set(brandId, updated);
    return { ...updated };
  },

  async deleteBrand(tenantId: string, brandId: string): Promise<void> {
    await ensureTenantDashboardBootstrapped();
    assertTenantOwnership(sandboxBrands.get(brandId), tenantId, 'Brand');
    sandboxBrands.delete(brandId);
  },

  // ---------------- PRODUCTS ----------------
  async listProducts(tenantId: string): Promise<TenantCatalogProductRecord[]> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    return Array.from(sandboxCatalogProducts.values())
      .filter((p) => p.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((p) => ({
        ...p,
        dimensions: { ...p.dimensions },
        customAttributes: p.customAttributes.map((a) => ({ ...a })),
        tags: [...p.tags],
        images: p.images.map((i) => ({ ...i })),
        variants: p.variants.map((v) => ({ ...v })),
        seo: { ...p.seo, keywords: [...p.seo.keywords] },
      }));
  },

  async findProduct(tenantId: string, productId: string): Promise<TenantCatalogProductRecord> {
    await ensureTenantDashboardBootstrapped();
    const p = assertTenantOwnership(sandboxCatalogProducts.get(productId), tenantId, 'Product');
    return {
      ...p,
      dimensions: { ...p.dimensions },
      customAttributes: p.customAttributes.map((a) => ({ ...a })),
      tags: [...p.tags],
      images: p.images.map((i) => ({ ...i })),
      variants: p.variants.map((v) => ({ ...v })),
      seo: { ...p.seo, keywords: [...p.seo.keywords] },
    };
  },

  async assertSkuAndBarcodeUnique(
    tenantId: string,
    skus: string[],
    barcodes: string[],
    excludeProductId?: string
  ): Promise<void> {
    await ensureTenantDashboardBootstrapped();
    const tenantProducts = Array.from(sandboxCatalogProducts.values()).filter(
      (p) => p.tenantId === tenantId && p.id !== excludeProductId
    );
    const existingSkus = new Set<string>();
    const existingBarcodes = new Set<string>();
    for (const p of tenantProducts) {
      existingSkus.add(p.sku.toUpperCase());
      if (p.barcode) existingBarcodes.add(p.barcode.trim());
      for (const v of p.variants) {
        existingSkus.add(v.sku.toUpperCase());
        if (v.barcode) existingBarcodes.add(v.barcode.trim());
      }
    }

    const seenBatchSkus = new Set<string>();
    for (const raw of skus) {
      const norm = raw.trim().toUpperCase();
      if (!norm) continue;
      if (seenBatchSkus.has(norm) || existingSkus.has(norm)) {
        const err = new Error(`Duplicate SKU "${norm}" already exists in this store.`);
        (err as any).statusCode = 409;
        (err as any).code = 'DUPLICATE_SKU';
        throw err;
      }
      seenBatchSkus.add(norm);
    }

    const seenBatchBarcodes = new Set<string>();
    for (const raw of barcodes) {
      const norm = raw.trim();
      if (!norm) continue;
      if (seenBatchBarcodes.has(norm) || existingBarcodes.has(norm)) {
        const err = new Error(`Duplicate barcode "${norm}" already exists in this store.`);
        (err as any).statusCode = 409;
        (err as any).code = 'DUPLICATE_BARCODE';
        throw err;
      }
      seenBatchBarcodes.add(norm);
    }
  },

  async createProduct(
    tenantId: string,
    input: {
      title: string;
      sku: string;
      barcode?: string;
      description?: string;
      categoryId: string;
      brandId: string;
      priceBDT: number;
      compareAtPriceBDT?: number;
      costBDT: number;
      stockQty: number;
      lowStockThreshold: number;
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      requiresShipping?: boolean;
      weightGrams?: number;
      dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
      color?: string;
      size?: string;
      material?: string;
      customAttributes?: TenantProductCustomAttribute[];
      tags?: string[];
      images?: TenantProductImageRecord[];
      variants?: Array<Omit<TenantProductVariantRecord, 'id' | 'tenantId' | 'productId'> & { id?: string }>;
      seo?: Partial<TenantProductSeoRecord>;
      createdByUserId: string;
    }
  ): Promise<TenantCatalogProductRecord> {
    await ensureTenantDashboardBootstrapped();
    if (input.categoryId) {
      assertTenantOwnership(sandboxCategories.get(input.categoryId), tenantId, 'Category');
    }
    if (input.brandId) {
      assertTenantOwnership(sandboxBrands.get(input.brandId), tenantId, 'Brand');
    }

    const allSkus = [input.sku, ...(input.variants || []).map((v) => v.sku)];
    const allBarcodes = [
      ...(input.barcode ? [input.barcode] : []),
      ...(input.variants || []).map((v) => v.barcode || '').filter(Boolean),
    ];
    await this.assertSkuAndBarcodeUnique(tenantId, allSkus, allBarcodes);

    const id = `prod_${new Types.ObjectId().toString().slice(-8)}`;
    const slugBase = slugify(input.title) || `product-${id.slice(-4)}`;
    const variants: TenantProductVariantRecord[] = (input.variants || []).map((v, idx) => ({
      id: v.id || `var_${new Types.ObjectId().toString().slice(-8)}_${idx}`,
      tenantId,
      productId: id,
      title: v.title.trim(),
      sku: v.sku.trim().toUpperCase(),
      barcode: v.barcode?.trim() || undefined,
      priceBDT: v.priceBDT,
      compareAtPriceBDT: v.compareAtPriceBDT,
      costBDT: v.costBDT ?? input.costBDT,
      stockQty: v.stockQty,
      color: v.color?.trim(),
      size: v.size?.trim(),
      material: v.material?.trim(),
      weightGrams: v.weightGrams ?? input.weightGrams,
      imageUrl: v.imageUrl,
      isDefault: v.isDefault ?? idx === 0,
      isActive: v.isActive ?? true,
    }));

    const aggregatedStock =
      variants.length > 0 ? variants.reduce((sum, v) => sum + v.stockQty, 0) : input.stockQty;

    const rec: TenantCatalogProductRecord = {
      id,
      tenantId,
      title: input.title.trim(),
      sku: input.sku.trim().toUpperCase(),
      barcode: input.barcode?.trim() || undefined,
      slug: slugBase,
      description: input.description?.trim() || '',
      categoryId: input.categoryId,
      brandId: input.brandId,
      priceBDT: input.priceBDT,
      compareAtPriceBDT: input.compareAtPriceBDT,
      costBDT: input.costBDT,
      stockQty: aggregatedStock,
      lowStockThreshold: input.lowStockThreshold,
      unitsSold: 0,
      status: input.status,
      requiresShipping: input.requiresShipping ?? true,
      weightGrams: input.weightGrams ?? 350,
      dimensions: input.dimensions ?? { lengthCm: 32, widthCm: 24, heightCm: 4 },
      color: input.color?.trim(),
      size: input.size?.trim(),
      material: input.material?.trim(),
      customAttributes: (input.customAttributes || []).map((a) => ({
        key: a.key.trim(),
        value: a.value.trim(),
      })),
      tags: (input.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      images: (input.images || []).map((img, i) => ({
        url: img.url,
        altText: img.altText || input.title.trim(),
        isPrimary: i === 0 ? true : Boolean(img.isPrimary),
        displayOrder: img.displayOrder ?? i,
      })),
      hasVariants: variants.length > 0,
      variants,
      seo: {
        metaTitle: input.seo?.metaTitle?.trim() || input.title.trim(),
        metaDescription: input.seo?.metaDescription?.trim() || input.description?.trim().slice(0, 155) || '',
        keywords: (input.seo?.keywords || []).map((k) => k.trim()).filter(Boolean),
        canonicalSlug: input.seo?.canonicalSlug?.trim() || slugBase,
      },
      createdByUserId: input.createdByUserId,
      updatedAt: new Date(),
    };
    sandboxCatalogProducts.set(id, rec);
    return this.findProduct(tenantId, id);
  },

  async updateProduct(
    tenantId: string,
    productId: string,
    patch: Partial<
      Omit<TenantCatalogProductRecord, 'id' | 'tenantId' | 'createdByUserId' | 'updatedAt' | 'variants'>
    > & {
      variants?: Array<Omit<TenantProductVariantRecord, 'id' | 'tenantId' | 'productId'> & { id?: string }>;
    }
  ): Promise<TenantCatalogProductRecord> {
    await ensureTenantDashboardBootstrapped();
    const existing = assertTenantOwnership(sandboxCatalogProducts.get(productId), tenantId, 'Product');
    if (patch.categoryId) {
      assertTenantOwnership(sandboxCategories.get(patch.categoryId), tenantId, 'Category');
    }
    if (patch.brandId) {
      assertTenantOwnership(sandboxBrands.get(patch.brandId), tenantId, 'Brand');
    }

    const nextSku = patch.sku ? patch.sku.trim().toUpperCase() : existing.sku;
    const nextBarcode = patch.barcode !== undefined ? patch.barcode?.trim() || undefined : existing.barcode;
    const nextVariants: TenantProductVariantRecord[] = patch.variants
      ? patch.variants.map((v, idx) => ({
          id: v.id || `var_${new Types.ObjectId().toString().slice(-8)}_${idx}`,
          tenantId,
          productId,
          title: v.title.trim(),
          sku: v.sku.trim().toUpperCase(),
          barcode: v.barcode?.trim() || undefined,
          priceBDT: v.priceBDT,
          compareAtPriceBDT: v.compareAtPriceBDT,
          costBDT: v.costBDT ?? patch.costBDT ?? existing.costBDT,
          stockQty: v.stockQty,
          color: v.color?.trim(),
          size: v.size?.trim(),
          material: v.material?.trim(),
          weightGrams: v.weightGrams ?? patch.weightGrams ?? existing.weightGrams,
          imageUrl: v.imageUrl,
          isDefault: v.isDefault ?? idx === 0,
          isActive: v.isActive ?? true,
        }))
      : existing.variants;

    await this.assertSkuAndBarcodeUnique(
      tenantId,
      [nextSku, ...nextVariants.map((v) => v.sku)],
      [...(nextBarcode ? [nextBarcode] : []), ...nextVariants.map((v) => v.barcode || '').filter(Boolean)],
      productId
    );

    const aggregatedStock =
      patch.variants !== undefined
        ? nextVariants.length > 0
          ? nextVariants.reduce((sum, v) => sum + v.stockQty, 0)
          : (patch.stockQty ?? existing.stockQty)
        : (patch.stockQty ?? existing.stockQty);

    const updated: TenantCatalogProductRecord = {
      ...existing,
      ...patch,
      sku: nextSku,
      barcode: nextBarcode,
      slug: patch.title ? slugify(patch.title) || existing.slug : existing.slug,
      stockQty: aggregatedStock,
      hasVariants: nextVariants.length > 0,
      variants: nextVariants,
      dimensions: patch.dimensions ? { ...patch.dimensions } : existing.dimensions,
      customAttributes: patch.customAttributes ?? existing.customAttributes,
      tags: patch.tags ?? existing.tags,
      images: patch.images ?? existing.images,
      seo: patch.seo ? { ...existing.seo, ...patch.seo } : existing.seo,
      updatedAt: new Date(),
    };
    sandboxCatalogProducts.set(productId, updated);
    return this.findProduct(tenantId, productId);
  },

  async deleteProduct(tenantId: string, productId: string): Promise<void> {
    await ensureTenantDashboardBootstrapped();
    assertTenantOwnership(sandboxCatalogProducts.get(productId), tenantId, 'Product');
    sandboxCatalogProducts.delete(productId);
  },

  // ---------------- SEARCH LOGS & HISTORY (TENANT SCOPED) ----------------
  async recordSearchLog(entry: Omit<TenantSearchLogRecord, 'id' | 'createdAt'>): Promise<TenantSearchLogRecord> {
    await ensureTenantDashboardBootstrapped();
    const rec: TenantSearchLogRecord = {
      ...entry,
      id: `srch_${new Types.ObjectId().toString().slice(-8)}`,
      createdAt: new Date(),
    };
    sandboxSearchLogs.unshift(rec);
    if (sandboxSearchLogs.length > 1000) {
      sandboxSearchLogs.length = 1000;
    }
    return { ...rec };
  },

  async listSearchLogs(tenantId: string, sessionKey?: string): Promise<TenantSearchLogRecord[]> {
    await ensureTenantDashboardBootstrapped();
    return sandboxSearchLogs
      .filter((l) => l.tenantId === tenantId && (!sessionKey || l.sessionKey === sessionKey))
      .map((l) => ({ ...l }));
  },

  async clearSearchHistory(tenantId: string, sessionKey: string): Promise<number> {
    await ensureTenantDashboardBootstrapped();
    let removed = 0;
    for (let i = sandboxSearchLogs.length - 1; i >= 0; i--) {
      if (sandboxSearchLogs[i].tenantId === tenantId && sandboxSearchLogs[i].sessionKey === sessionKey) {
        sandboxSearchLogs.splice(i, 1);
        removed++;
      }
    }
    return removed;
  },

  // ---------------- INVENTORY ----------------
  async adjustInventory(
    tenantId: string,
    productId: string,
    params: { newQty: number; lowStockThreshold?: number; reason: string; actorEmail: string }
  ): Promise<{ product: TenantCatalogProductRecord; log: TenantInventoryLogRecord }> {
    await ensureTenantDashboardBootstrapped();
    const existing = assertTenantOwnership(sandboxCatalogProducts.get(productId), tenantId, 'Product');
    const previousQty = existing.stockQty;
    const updated: TenantCatalogProductRecord = {
      ...existing,
      stockQty: params.newQty,
      lowStockThreshold: params.lowStockThreshold ?? existing.lowStockThreshold,
      updatedAt: new Date(),
    };
    sandboxCatalogProducts.set(productId, updated);

    const logId = `inv_${new Types.ObjectId().toString().slice(-8)}`;
    const log: TenantInventoryLogRecord = {
      id: logId,
      tenantId,
      productId: existing.id,
      sku: existing.sku,
      productTitle: existing.title,
      previousQty,
      deltaQty: params.newQty - previousQty,
      newQty: params.newQty,
      reason: params.reason.trim(),
      actorEmail: params.actorEmail,
      createdAt: new Date(),
    };
    sandboxInventoryLogs.set(logId, log);
    return { product: { ...updated }, log: { ...log } };
  },

  async listInventoryLogs(tenantId: string): Promise<TenantInventoryLogRecord[]> {
    await ensureTenantDashboardBootstrapped();
    return Array.from(sandboxInventoryLogs.values())
      .filter((l) => l.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((l) => ({ ...l }));
  },

  // ---------------- ORDERS ----------------
  async listOrders(tenantId: string): Promise<TenantStoreOrderRecord[]> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    return Array.from(sandboxStoreOrders.values())
      .filter((o) => o.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((o) => ({ ...o }));
  },

  async updateOrderStatus(
    tenantId: string,
    orderId: string,
    newStatus: TenantOrderStatus
  ): Promise<TenantStoreOrderRecord> {
    await ensureTenantDashboardBootstrapped();
    const existing = assertTenantOwnership(sandboxStoreOrders.get(orderId), tenantId, 'Order');
    const updated: TenantStoreOrderRecord = {
      ...existing,
      status: newStatus,
      paymentStatus: newStatus === 'REFUNDED' ? 'REFUNDED' : existing.paymentStatus,
      updatedAt: new Date(),
    };
    sandboxStoreOrders.set(orderId, updated);
    return { ...updated };
  },

  // ---------------- CUSTOMERS ----------------
  async listCustomers(tenantId: string): Promise<TenantCustomerRecord[]> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    return Array.from(sandboxCustomers.values())
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => b.totalSpentBDT - a.totalSpentBDT)
      .map((c) => ({ ...c }));
  },

  async updateCustomer(
    tenantId: string,
    customerId: string,
    patch: Partial<Pick<TenantCustomerRecord, 'segment' | 'notes' | 'status'>>
  ): Promise<TenantCustomerRecord> {
    await ensureTenantDashboardBootstrapped();
    const existing = assertTenantOwnership(sandboxCustomers.get(customerId), tenantId, 'Customer');
    const updated: TenantCustomerRecord = { ...existing, ...patch };
    sandboxCustomers.set(customerId, updated);
    return { ...updated };
  },

  // ---------------- COUPONS ----------------
  async listCoupons(tenantId: string): Promise<TenantCouponRecord[]> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    return Array.from(sandboxCoupons.values())
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((c) => ({ ...c }));
  },

  async createCoupon(
    tenantId: string,
    input: {
      code: string;
      title: string;
      discountType: TenantCouponRecord['discountType'];
      discountValue: number;
      minOrderBDT: number;
      maxDiscountBDT?: number;
      usageLimit: number;
      daysValid?: number;
    }
  ): Promise<TenantCouponRecord> {
    await ensureTenantDashboardBootstrapped();
    const id = `cpn_${new Types.ObjectId().toString().slice(-8)}`;
    const now = Date.now();
    const rec: TenantCouponRecord = {
      id,
      tenantId,
      code: input.code.trim().toUpperCase(),
      title: input.title.trim(),
      discountType: input.discountType,
      discountValue: input.discountValue,
      minOrderBDT: input.minOrderBDT,
      maxDiscountBDT: input.maxDiscountBDT,
      usageLimit: input.usageLimit,
      usedCount: 0,
      startsAt: new Date(now),
      endsAt: new Date(now + (input.daysValid ?? 30) * 86_400_000),
      isActive: true,
      updatedAt: new Date(),
    };
    sandboxCoupons.set(id, rec);
    return { ...rec };
  },

  async updateCoupon(
    tenantId: string,
    couponId: string,
    patch: Partial<Pick<TenantCouponRecord, 'title' | 'discountValue' | 'minOrderBDT' | 'usageLimit' | 'isActive'>>
  ): Promise<TenantCouponRecord> {
    await ensureTenantDashboardBootstrapped();
    const existing = assertTenantOwnership(sandboxCoupons.get(couponId), tenantId, 'Coupon');
    const updated: TenantCouponRecord = { ...existing, ...patch, updatedAt: new Date() };
    sandboxCoupons.set(couponId, updated);
    return { ...updated };
  },

  async deleteCoupon(tenantId: string, couponId: string): Promise<void> {
    await ensureTenantDashboardBootstrapped();
    assertTenantOwnership(sandboxCoupons.get(couponId), tenantId, 'Coupon');
    sandboxCoupons.delete(couponId);
  },

  // ---------------- AUTOMATIC DISCOUNTS ----------------
  async listDiscounts(tenantId: string): Promise<TenantDiscountRecord[]> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    return Array.from(sandboxDiscounts.values())
      .filter((d) => d.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((d) => ({ ...d }));
  },

  async createDiscount(
    tenantId: string,
    input: {
      name: string;
      campaignType: TenantDiscountRecord['campaignType'];
      discountType: TenantDiscountRecord['discountType'];
      discountValue: number;
      targetCategoryId?: string;
      minQty: number;
      stackable: boolean;
      daysValid?: number;
    }
  ): Promise<TenantDiscountRecord> {
    await ensureTenantDashboardBootstrapped();
    if (input.targetCategoryId) {
      assertTenantOwnership(sandboxCategories.get(input.targetCategoryId), tenantId, 'Category');
    }
    const id = `dsc_${new Types.ObjectId().toString().slice(-8)}`;
    const now = Date.now();
    const rec: TenantDiscountRecord = {
      id,
      tenantId,
      name: input.name.trim(),
      campaignType: input.campaignType,
      discountType: input.discountType,
      discountValue: input.discountValue,
      targetCategoryId: input.targetCategoryId,
      minQty: input.minQty,
      stackable: input.stackable,
      isActive: true,
      startsAt: new Date(now),
      endsAt: new Date(now + (input.daysValid ?? 14) * 86_400_000),
      redemptionsCount: 0,
      revenueImpactBDT: 0,
      updatedAt: new Date(),
    };
    sandboxDiscounts.set(id, rec);
    return { ...rec };
  },

  async updateDiscount(
    tenantId: string,
    discountId: string,
    patch: Partial<Pick<TenantDiscountRecord, 'name' | 'discountValue' | 'minQty' | 'stackable' | 'isActive'>>
  ): Promise<TenantDiscountRecord> {
    await ensureTenantDashboardBootstrapped();
    const existing = assertTenantOwnership(sandboxDiscounts.get(discountId), tenantId, 'Discount');
    const updated: TenantDiscountRecord = { ...existing, ...patch, updatedAt: new Date() };
    sandboxDiscounts.set(discountId, updated);
    return { ...updated };
  },

  async deleteDiscount(tenantId: string, discountId: string): Promise<void> {
    await ensureTenantDashboardBootstrapped();
    assertTenantOwnership(sandboxDiscounts.get(discountId), tenantId, 'Discount');
    sandboxDiscounts.delete(discountId);
  },

  // ---------------- STORE SETTINGS & BRANDING ----------------
  async getStoreSettings(tenantId: string): Promise<TenantStoreSettings> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    if (isDatabaseConnected()) {
      const doc = await SystemSettingModel.findOne({ key: `tenant.${tenantId}.settings` }).lean();
      if (doc?.value) return { ...(doc.value as TenantStoreSettings), tenantId };
    }
    return { ...sandboxStoreSettings.get(tenantId)! };
  },

  async updateStoreSettings(
    tenantId: string,
    patch: Partial<Omit<TenantStoreSettings, 'tenantId' | 'storeSlug' | 'updatedAt'>>
  ): Promise<TenantStoreSettings> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    const current = await this.getStoreSettings(tenantId);
    const next: TenantStoreSettings = {
      ...current,
      ...patch,
      tenantId,
      updatedAt: new Date().toISOString(),
    };
    sandboxStoreSettings.set(tenantId, next);
    if (isDatabaseConnected()) {
      await SystemSettingModel.findOneAndUpdate(
        { key: `tenant.${tenantId}.settings` },
        {
          $set: {
            key: `tenant.${tenantId}.settings`,
            value: next,
            description: `Store operational settings for tenant ${tenantId}`,
            category: 'GENERAL',
            isPublic: false,
          },
        },
        { upsert: true }
      );
    }
    return { ...next };
  },

  async getStoreBranding(tenantId: string): Promise<TenantStoreBranding> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    if (isDatabaseConnected()) {
      const doc = await SystemSettingModel.findOne({ key: `tenant.${tenantId}.branding` }).lean();
      if (doc?.value) return { ...(doc.value as TenantStoreBranding), tenantId };
    }
    return { ...sandboxStoreBranding.get(tenantId)! };
  },

  async updateStoreBranding(
    tenantId: string,
    patch: Partial<Omit<TenantStoreBranding, 'tenantId' | 'updatedAt'>>
  ): Promise<TenantStoreBranding> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    const current = await this.getStoreBranding(tenantId);
    const next: TenantStoreBranding = {
      ...current,
      ...patch,
      tenantId,
      updatedAt: new Date().toISOString(),
    };
    sandboxStoreBranding.set(tenantId, next);
    if (isDatabaseConnected()) {
      await SystemSettingModel.findOneAndUpdate(
        { key: `tenant.${tenantId}.branding` },
        {
          $set: {
            key: `tenant.${tenantId}.branding`,
            value: next,
            description: `Store branding configuration for tenant ${tenantId}`,
            category: 'GENERAL',
            isPublic: false,
          },
        },
        { upsert: true }
      );
    }
    return { ...next };
  },

  // ---------------- PAYMENT SETTINGS (SECRET-SAFE) ----------------
  async listPaymentConfigs(tenantId: string): Promise<TenantPaymentGatewayConfig[]> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    return (sandboxPaymentConfigs.get(tenantId) || []).map((p) => ({ ...p }));
  },

  async updatePaymentConfig(
    tenantId: string,
    gateway: PaymentGateway,
    patch: {
      isEnabled?: boolean;
      mode?: 'SANDBOX' | 'LIVE';
      merchantAccountInput?: string;
      apiSecretProvided?: boolean;
    }
  ): Promise<TenantPaymentGatewayConfig> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    const list = sandboxPaymentConfigs.get(tenantId) || [];
    const idx = list.findIndex((p) => p.gateway === gateway);
    if (idx === -1) {
      throw new NotFoundError(`Payment gateway ${gateway} is not available for this store.`);
    }
    const existing = list[idx];
    let merchantAccountMasked = existing.merchantAccountMasked;
    if (patch.merchantAccountInput && patch.merchantAccountInput.trim().length > 0) {
      const raw = patch.merchantAccountInput.trim();
      const tail = raw.slice(-4);
      merchantAccountMasked = `${raw.slice(0, 3)}••••${tail}`;
    }
    const updated: TenantPaymentGatewayConfig = {
      ...existing,
      isEnabled: patch.isEnabled ?? existing.isEnabled,
      mode: patch.mode ?? existing.mode,
      merchantAccountMasked,
      hasSecretConfigured: patch.apiSecretProvided ? true : existing.hasSecretConfigured,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    sandboxPaymentConfigs.set(tenantId, list);
    return { ...updated };
  },

  // ---------------- SHIPPING SETTINGS ----------------
  async listShippingMethods(tenantId: string): Promise<TenantShippingMethodRecord[]> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    return Array.from(sandboxShippingMethods.values())
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => a.baseRateBDT - b.baseRateBDT)
      .map((s) => ({ ...s }));
  },

  async createShippingMethod(
    tenantId: string,
    input: {
      code: string;
      name: string;
      zoneName: string;
      carrier: string;
      baseRateBDT: number;
      freeShippingThresholdBDT: number;
      estimatedDays: string;
      codSupported: boolean;
    }
  ): Promise<TenantShippingMethodRecord> {
    await ensureTenantDashboardBootstrapped();
    const id = `shp_${new Types.ObjectId().toString().slice(-8)}`;
    const rec: TenantShippingMethodRecord = {
      id,
      tenantId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      zoneName: input.zoneName.trim(),
      carrier: input.carrier.trim(),
      baseRateBDT: input.baseRateBDT,
      freeShippingThresholdBDT: input.freeShippingThresholdBDT,
      estimatedDays: input.estimatedDays.trim(),
      codSupported: input.codSupported,
      isActive: true,
      updatedAt: new Date(),
    };
    sandboxShippingMethods.set(id, rec);
    return { ...rec };
  },

  async updateShippingMethod(
    tenantId: string,
    methodId: string,
    patch: Partial<
      Pick<
        TenantShippingMethodRecord,
        'name' | 'zoneName' | 'carrier' | 'baseRateBDT' | 'freeShippingThresholdBDT' | 'estimatedDays' | 'codSupported' | 'isActive'
      >
    >
  ): Promise<TenantShippingMethodRecord> {
    await ensureTenantDashboardBootstrapped();
    const existing = assertTenantOwnership(sandboxShippingMethods.get(methodId), tenantId, 'Shipping method');
    const updated: TenantShippingMethodRecord = { ...existing, ...patch, updatedAt: new Date() };
    sandboxShippingMethods.set(methodId, updated);
    return { ...updated };
  },

  async deleteShippingMethod(tenantId: string, methodId: string): Promise<void> {
    await ensureTenantDashboardBootstrapped();
    assertTenantOwnership(sandboxShippingMethods.get(methodId), tenantId, 'Shipping method');
    sandboxShippingMethods.delete(methodId);
  },

  // ---------------- FUNNEL / CONVERSION STATS ----------------
  async getFunnelStats(tenantId: string): Promise<TenantFunnelStats> {
    await ensureTenantDashboardBootstrapped();
    await ensureTenantDefaultsInitialized(tenantId);
    const stats = sandboxFunnelStats.get(tenantId)!;
    return {
      ...stats,
      dailySeries: stats.dailySeries.map((d) => ({ ...d })),
    };
  },
};
