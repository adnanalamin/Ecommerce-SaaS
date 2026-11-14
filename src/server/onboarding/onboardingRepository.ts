/**
 * NEXORA Automatic Tenant Store Creation — Dual-Mode Repository
 *
 * Implements transaction-safe, idempotent store provisioning across MongoDB
 * (Mongoose sessions + compensating rollback) and the isolated Sandbox Engine.
 * Also provisions the segregated NEXORA Official Store as a platform-owned
 * business entity that NEVER shares platform administration permissions.
 */

import mongoose, { Types } from 'mongoose';
import { isDatabaseConnected } from '../config/database.ts';
import { hashPassword } from '../security/password.ts';
import { authRepository } from '../auth/authRepository.ts';
import {
  PlanModel,
  TenantModel,
  StoreModel,
  SubscriptionModel,
  ThemeModel,
  BrandingSettingModel,
  ShippingMethodModel,
  OnboardingSessionModel,
  RoleModel,
  StoreMembershipModel,
  type OnboardingStep,
  type OnboardingSessionStatus,
  type StoreOwnershipType,
  type TenantStatus,
} from '../db/models.ts';
import {
  rbacRepository,
  ensureRbacBootstrapped,
  DEMO_TENANT_A_ID,
  DEMO_TENANT_B_ID,
} from '../rbac/rbacRepository.ts';
import { ROLE_DEFINITIONS } from '../rbac/permissions.ts';
import {
  NEXORA_PLANS_CATALOG,
  CURRENCY_LOCALE_DEFAULTS,
  resolveThemePreset,
  type SupportedCurrency,
} from './storeDefaults.ts';

export const OFFICIAL_STORE_TENANT_ID = '6730a840e6c1e95819e91000';
export const OFFICIAL_STORE_ID = '6730a840e6c1e95819e91001';
export const OFFICIAL_STORE_SLUG = 'nexora-official-flagship';
export const OFFICIAL_STORE_OWNER_EMAIL = 'officialstore@nexora.shop';

export type ProvisioningFailurePoint =
  | 'ASSIGN_FREE_PLAN'
  | 'CREATE_TENANT'
  | 'CREATE_STORE_AND_SETTINGS'
  | 'ASSIGN_DEFAULT_THEME'
  | 'CREATE_SUBSCRIPTION'
  | 'CREATE_ROLES_AND_OWNER_MEMBERSHIP';

export interface PlanRecord {
  id: string;
  code: 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
  name: string;
  description: string;
  priceMonthlyUSD: number;
  priceMonthlyBDT: number;
  maxProducts: number;
  maxStaffUsers: number;
  maxStorageMB: number;
  transactionFeePercent: number;
  customDomainAllowed: boolean;
}

export interface OnboardingSessionRecord {
  id: string;
  userId: string;
  email: string;
  status: OnboardingSessionStatus;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  businessInfo?: {
    legalBusinessName: string;
    category: string;
    phone?: string;
    contactEmail: string;
    country: string;
    currency: SupportedCurrency;
    locale: string;
    timezone: string;
  };
  storeDraft?: {
    storeName: string;
    storeSlug: string;
    themeCode: string;
  };
  lastIdempotencyKey?: string;
  provisionedTenantId?: string;
  provisionedStoreId?: string;
  provisionedSlug?: string;
  lastError?: string;
  updatedAt: Date;
}

export interface ProvisionedTenantRecord {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  ownerUserId: string;
  tier: 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
  status: TenantStatus;
  storeOwnershipType: StoreOwnershipType;
  isOfficialStore: boolean;
  currentPlanId: string;
  contactEmail: string;
  contactPhone?: string;
  currency: SupportedCurrency;
  locale: string;
  timezone: string;
  storageQuotaMB: number;
  businessInfo?: {
    legalName?: string;
    category?: string;
    country?: string;
    addressLine?: string;
  };
  onboardingProgress: {
    currentStep: OnboardingStep;
    completedSteps: OnboardingStep[];
    startedAt: Date;
    completedAt?: Date;
  };
  idempotencyKey?: string;
  suspendedAt?: Date;
  suspendedReason?: string;
  activatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProvisionedStoreRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone?: string;
  currency: SupportedCurrency;
  locale: string;
  timezone: string;
  status: 'PENDING_SETUP' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  defaultThemeCode: string;
  businessCategory?: string;
  isOfficialStore: boolean;
  createdAt: Date;
}

export interface ProvisionedSubscriptionRecord {
  id: string;
  tenantId: string;
  planId: string;
  planCode: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
  billingCycle: 'MONTHLY' | 'YEARLY';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface ProvisionedThemeRecord {
  id: string;
  tenantId: string;
  themeCode: string;
  themeName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  activeVersion: number;
  publishedAt: Date;
}

export interface ProvisionedBundle {
  tenant: ProvisionedTenantRecord;
  store: ProvisionedStoreRecord;
  plan: PlanRecord;
  subscription: ProvisionedSubscriptionRecord;
  theme: ProvisionedThemeRecord;
  defaultShippingMethod: {
    id: string;
    code: string;
    name: string;
    baseRate: number;
    currency: SupportedCurrency;
  };
  rolesCount: number;
  ownerMembership: {
    id: string;
    userId: string;
    roleSlug: string;
    status: string;
  };
  dashboardUrl: string;
}

// ==========================================
// SANDBOX IN-MEMORY STORAGE
// ==========================================
const sandboxPlans = new Map<string, PlanRecord>(); // key: code
const sandboxOnboardingSessions = new Map<string, OnboardingSessionRecord>(); // key: userId
const sandboxTenants = new Map<string, ProvisionedTenantRecord>(); // key: tenantId
const sandboxStores = new Map<string, ProvisionedStoreRecord>(); // key: tenantId
const sandboxSubscriptions = new Map<string, ProvisionedSubscriptionRecord>(); // key: tenantId
const sandboxThemes = new Map<string, ProvisionedThemeRecord>(); // key: tenantId
const sandboxShippingMethods = new Map<string, { id: string; tenantId: string; code: string; name: string; baseRate: number; currency: SupportedCurrency }>(); // key: tenantId
const sandboxIdempotencyIndex = new Map<string, string>(); // key: `${userId}:${idempotencyKey}` -> tenantId
const activeProvisioningLocks = new Set<string>();

let onboardingBootstrapPromise: Promise<void> | null = null;
let onboardingBootstrapped = false;

export async function ensureOnboardingBootstrapped(): Promise<void> {
  if (onboardingBootstrapped) return;
  if (onboardingBootstrapPromise) return onboardingBootstrapPromise;

  onboardingBootstrapPromise = (async () => {
    await ensureRbacBootstrapped();

    // 1. Seed global subscription plans
    for (const p of NEXORA_PLANS_CATALOG) {
      if (isDatabaseConnected()) {
        const doc: any = await PlanModel.findOneAndUpdate(
          { code: p.code },
          { $setOnInsert: { ...p, isActive: true } },
          { upsert: true, returnDocument: 'after' }
        ).lean();
        sandboxPlans.set(p.code, {
          id: doc._id.toString(),
          code: doc.code,
          name: doc.name,
          description: doc.description,
          priceMonthlyUSD: doc.priceMonthlyUSD,
          priceMonthlyBDT: doc.priceMonthlyBDT,
          maxProducts: doc.maxProducts,
          maxStaffUsers: doc.maxStaffUsers,
          maxStorageMB: doc.maxStorageMB,
          transactionFeePercent: doc.transactionFeePercent,
          customDomainAllowed: Boolean(doc.customDomainAllowed),
        });
      } else {
        sandboxPlans.set(p.code, {
          id: new Types.ObjectId().toString(),
          code: p.code,
          name: p.name,
          description: p.description,
          priceMonthlyUSD: p.priceMonthlyUSD,
          priceMonthlyBDT: p.priceMonthlyBDT,
          maxProducts: p.maxProducts,
          maxStaffUsers: p.maxStaffUsers,
          maxStorageMB: p.maxStorageMB,
          transactionFeePercent: p.transactionFeePercent,
          customDomainAllowed: p.customDomainAllowed,
        });
      }
    }

    const starterPlan = sandboxPlans.get('STARTER')!;

    // 2. Ensure dedicated NEXORA Official Store Merchant Account (NOT a Platform Super Admin!)
    let officialOwner = await authRepository.findUserByEmail(OFFICIAL_STORE_OWNER_EMAIL);
    if (!officialOwner) {
      const pwHash = await hashPassword('NexoraDemo!2026');
      officialOwner = await authRepository.createUser({
        email: OFFICIAL_STORE_OWNER_EMAIL,
        fullName: 'NEXORA Official Store Manager',
        passwordHash: pwHash,
        userType: 'MERCHANT', // Strictly MERCHANT, never PLATFORM_SUPER_ADMIN
        status: 'ACTIVE',
      });
      await authRepository.updateUser(officialOwner.id, {
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      });
    }

    // 3. Provision segregated NEXORA Official Store (PLATFORM_OWNED_OFFICIAL)
    await seedInitialStoreRecord({
      tenantId: OFFICIAL_STORE_TENANT_ID,
      storeId: OFFICIAL_STORE_ID,
      name: 'NEXORA Official Store',
      slug: OFFICIAL_STORE_SLUG,
      ownerUserId: officialOwner.id,
      ownerEmail: officialOwner.email,
      ownerFullName: officialOwner.fullName,
      storeOwnershipType: 'PLATFORM_OWNED_OFFICIAL',
      isOfficialStore: true,
      currency: 'BDT',
      locale: 'en-BD',
      timezone: 'Asia/Dhaka',
      category: 'Official Branded Hardware & Apparel',
      themeCode: 'nexora-minimal-studio',
      plan: starterPlan,
    });

    // 4. Sync Phase 07 demo tenants into Phase 08 store registry
    const ownerA = await authRepository.findUserByEmail('owner@urbanwear.nexora.shop');
    if (ownerA) {
      await seedInitialStoreRecord({
        tenantId: DEMO_TENANT_A_ID,
        storeId: '6730a840e6c1e95819e93001',
        name: 'UrbanWear BD',
        slug: 'urbanwear',
        ownerUserId: ownerA.id,
        ownerEmail: ownerA.email,
        ownerFullName: ownerA.fullName,
        storeOwnershipType: 'INDEPENDENT_TENANT',
        isOfficialStore: false,
        currency: 'BDT',
        locale: 'en-BD',
        timezone: 'Asia/Dhaka',
        category: 'Fashion & Apparel',
        themeCode: 'nexora-atelier',
        plan: starterPlan,
      });
    }

    const ownerB = await authRepository.findUserByEmail('owner@luxethread.nexora.shop');
    if (ownerB) {
      await seedInitialStoreRecord({
        tenantId: DEMO_TENANT_B_ID,
        storeId: '6730a840e6c1e95819e93002',
        name: 'LuxeThread Studio',
        slug: 'luxethread',
        ownerUserId: ownerB.id,
        ownerEmail: ownerB.email,
        ownerFullName: ownerB.fullName,
        storeOwnershipType: 'INDEPENDENT_TENANT',
        isOfficialStore: false,
        currency: 'BDT',
        locale: 'en-BD',
        timezone: 'Asia/Dhaka',
        category: 'Luxury Menswear & Silk',
        themeCode: 'nexora-dhaka-craft',
        plan: starterPlan,
      });
    }

    onboardingBootstrapped = true;
  })();

  await onboardingBootstrapPromise;
}

async function seedInitialStoreRecord(spec: {
  tenantId: string;
  storeId: string;
  name: string;
  slug: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerFullName: string;
  storeOwnershipType: StoreOwnershipType;
  isOfficialStore: boolean;
  currency: SupportedCurrency;
  locale: string;
  timezone: string;
  category: string;
  themeCode: string;
  plan: PlanRecord;
}) {
  const themePreset = resolveThemePreset(spec.themeCode);
  const now = new Date();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  if (isDatabaseConnected()) {
    const existingTenant = await TenantModel.findById(spec.tenantId).lean();
    if (!existingTenant) {
      await TenantModel.create({
        _id: new Types.ObjectId(spec.tenantId),
        name: spec.name,
        slug: spec.slug,
        subdomain: spec.slug,
        ownerUserId: new Types.ObjectId(spec.ownerUserId),
        tier: 'STARTER',
        status: 'ACTIVE',
        storeOwnershipType: spec.storeOwnershipType,
        isOfficialStore: spec.isOfficialStore,
        currentPlanId: new Types.ObjectId(spec.plan.id),
        contactEmail: spec.ownerEmail,
        currency: spec.currency,
        locale: spec.locale,
        timezone: spec.timezone,
        storageQuotaMB: spec.plan.maxStorageMB,
        businessInfo: {
          legalName: spec.name,
          category: spec.category,
          country: 'Bangladesh',
        },
        onboardingProgress: {
          currentStep: 'COMPLETED',
          completedSteps: [
            'REGISTERED',
            'EMAIL_VERIFIED',
            'BUSINESS_INFO_SAVED',
            'STORE_IDENTITY_SELECTED',
            'PLAN_ASSIGNED',
            'THEME_ASSIGNED',
            'SETTINGS_CREATED',
            'OWNER_MEMBERSHIP_CREATED',
            'COMPLETED',
          ],
          startedAt: now,
          completedAt: now,
        },
      });

      await StoreModel.create({
        _id: new Types.ObjectId(spec.storeId),
        tenantId: new Types.ObjectId(spec.tenantId),
        name: spec.name,
        slug: spec.slug,
        contactEmail: spec.ownerEmail,
        currency: spec.currency,
        locale: spec.locale,
        timezone: spec.timezone,
        status: 'ACTIVE',
        defaultThemeCode: themePreset.code,
        businessCategory: spec.category,
        isOfficialStore: spec.isOfficialStore,
      });

      await SubscriptionModel.create({
        tenantId: new Types.ObjectId(spec.tenantId),
        planId: new Types.ObjectId(spec.plan.id),
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      });

      await ThemeModel.create({
        tenantId: new Types.ObjectId(spec.tenantId),
        activeVersion: 1,
        publishedSnapshot: { themeCode: themePreset.code, layoutMode: themePreset.layoutMode },
        draftSnapshot: { themeCode: themePreset.code, layoutMode: themePreset.layoutMode },
        publishedAt: now,
      });

      await BrandingSettingModel.create({
        tenantId: new Types.ObjectId(spec.tenantId),
        primaryColor: themePreset.primaryColor,
        secondaryColor: themePreset.secondaryColor,
        accentColor: themePreset.accentColor,
        fontHeading: themePreset.fontHeading,
        fontBody: themePreset.fontBody,
        borderRadius: themePreset.borderRadius,
      });

      for (const def of ROLE_DEFINITIONS.filter((r) => r.scope === 'TENANT')) {
        await rbacRepository.upsertTenantRole({
          tenantId: spec.tenantId,
          name: def.name,
          slug: def.slug,
          description: def.description,
          permissionCodes: [...def.permissionCodes],
          hierarchyRank: def.hierarchyRank,
          isSystemDefault: true,
        });
      }
      const ownerRole = await rbacRepository.findTenantRole(spec.tenantId, 'store_owner');
      if (ownerRole) {
        await rbacRepository.upsertMembership({
          tenantId: spec.tenantId,
          storeId: spec.storeId,
          userId: spec.ownerUserId,
          userEmail: spec.ownerEmail,
          userFullName: spec.ownerFullName,
          roleId: ownerRole.id,
          roleSlug: 'store_owner',
        });
      }
    }
    return;
  }

  // Sandbox Mode
  sandboxTenants.set(spec.tenantId, {
    id: spec.tenantId,
    name: spec.name,
    slug: spec.slug,
    subdomain: spec.slug,
    ownerUserId: spec.ownerUserId,
    tier: 'STARTER',
    status: 'ACTIVE',
    storeOwnershipType: spec.storeOwnershipType,
    isOfficialStore: spec.isOfficialStore,
    currentPlanId: spec.plan.id,
    contactEmail: spec.ownerEmail,
    currency: spec.currency,
    locale: spec.locale,
    timezone: spec.timezone,
    storageQuotaMB: spec.plan.maxStorageMB,
    businessInfo: {
      legalName: spec.name,
      category: spec.category,
      country: 'Bangladesh',
    },
    onboardingProgress: {
      currentStep: 'COMPLETED',
      completedSteps: [
        'REGISTERED',
        'EMAIL_VERIFIED',
        'BUSINESS_INFO_SAVED',
        'STORE_IDENTITY_SELECTED',
        'PLAN_ASSIGNED',
        'THEME_ASSIGNED',
        'SETTINGS_CREATED',
        'OWNER_MEMBERSHIP_CREATED',
        'COMPLETED',
      ],
      startedAt: now,
      completedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  });

  sandboxStores.set(spec.tenantId, {
    id: spec.storeId,
    tenantId: spec.tenantId,
    name: spec.name,
    slug: spec.slug,
    contactEmail: spec.ownerEmail,
    currency: spec.currency,
    locale: spec.locale,
    timezone: spec.timezone,
    status: 'ACTIVE',
    defaultThemeCode: themePreset.code,
    businessCategory: spec.category,
    isOfficialStore: spec.isOfficialStore,
    createdAt: now,
  });

  sandboxSubscriptions.set(spec.tenantId, {
    id: new Types.ObjectId().toString(),
    tenantId: spec.tenantId,
    planId: spec.plan.id,
    planCode: spec.plan.code,
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
  });

  sandboxThemes.set(spec.tenantId, {
    id: new Types.ObjectId().toString(),
    tenantId: spec.tenantId,
    themeCode: themePreset.code,
    themeName: themePreset.name,
    primaryColor: themePreset.primaryColor,
    secondaryColor: themePreset.secondaryColor,
    accentColor: themePreset.accentColor,
    fontHeading: themePreset.fontHeading,
    fontBody: themePreset.fontBody,
    activeVersion: 1,
    publishedAt: now,
  });

  const defaults = CURRENCY_LOCALE_DEFAULTS[spec.currency];
  sandboxShippingMethods.set(spec.tenantId, {
    id: new Types.ObjectId().toString(),
    tenantId: spec.tenantId,
    code: 'STANDARD',
    name: defaults.shippingZone,
    baseRate: defaults.flatRate,
    currency: spec.currency,
  });

  // Register official store inside RBAC sandbox registry too, strictly isolated
  if (spec.isOfficialStore) {
    rbacRepository.registerSandboxTenant({
      id: spec.tenantId,
      name: spec.name,
      slug: spec.slug,
      subdomain: spec.slug,
      storeId: spec.storeId,
      ownerUserId: spec.ownerUserId,
      status: 'ACTIVE',
      isOfficialStore: true,
    });
    for (const def of ROLE_DEFINITIONS.filter((r) => r.scope === 'TENANT')) {
      await rbacRepository.upsertTenantRole({
        tenantId: spec.tenantId,
        name: def.name,
        slug: def.slug,
        description: def.description,
        permissionCodes: [...def.permissionCodes],
        hierarchyRank: def.hierarchyRank,
        isSystemDefault: true,
      });
    }
    const ownerRole = await rbacRepository.findTenantRole(spec.tenantId, 'store_owner');
    if (ownerRole) {
      await rbacRepository.upsertMembership({
        tenantId: spec.tenantId,
        storeId: spec.storeId,
        userId: spec.ownerUserId,
        userEmail: spec.ownerEmail,
        userFullName: spec.ownerFullName,
        roleId: ownerRole.id,
        roleSlug: 'store_owner',
      });
    }
  }
}

function mapTenantDoc(doc: any): ProvisionedTenantRecord {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    subdomain: doc.subdomain,
    ownerUserId: doc.ownerUserId.toString(),
    tier: doc.tier || 'STARTER',
    status: doc.status,
    storeOwnershipType: doc.storeOwnershipType || (doc.isOfficialStore ? 'PLATFORM_OWNED_OFFICIAL' : 'INDEPENDENT_TENANT'),
    isOfficialStore: Boolean(doc.isOfficialStore),
    currentPlanId: doc.currentPlanId?.toString() || '',
    contactEmail: doc.contactEmail || '',
    contactPhone: doc.contactPhone,
    currency: doc.currency || 'BDT',
    locale: doc.locale || 'en-BD',
    timezone: doc.timezone || 'Asia/Dhaka',
    storageQuotaMB: doc.storageQuotaMB || 1024,
    businessInfo: doc.businessInfo,
    onboardingProgress: {
      currentStep: doc.onboardingProgress?.currentStep || 'COMPLETED',
      completedSteps: doc.onboardingProgress?.completedSteps || [],
      startedAt: doc.onboardingProgress?.startedAt || doc.createdAt,
      completedAt: doc.onboardingProgress?.completedAt,
    },
    idempotencyKey: doc.idempotencyKey,
    suspendedAt: doc.suspendedAt,
    suspendedReason: doc.suspendedReason,
    activatedAt: doc.activatedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const onboardingRepository = {
  async getStarterPlan(): Promise<PlanRecord> {
    await ensureOnboardingBootstrapped();
    const cached = sandboxPlans.get('STARTER');
    if (cached) return { ...cached };
    if (isDatabaseConnected()) {
      const doc: any = await PlanModel.findOne({ code: 'STARTER' }).lean();
      if (doc) {
        return {
          id: doc._id.toString(),
          code: doc.code,
          name: doc.name,
          description: doc.description,
          priceMonthlyUSD: doc.priceMonthlyUSD,
          priceMonthlyBDT: doc.priceMonthlyBDT,
          maxProducts: doc.maxProducts,
          maxStaffUsers: doc.maxStaffUsers,
          maxStorageMB: doc.maxStorageMB,
          transactionFeePercent: doc.transactionFeePercent,
          customDomainAllowed: Boolean(doc.customDomainAllowed),
        };
      }
    }
    throw new Error('Starter Free plan is unavailable.');
  },

  async listPlans(): Promise<PlanRecord[]> {
    await ensureOnboardingBootstrapped();
    return Array.from(sandboxPlans.values());
  },

  async isSlugTaken(slug: string): Promise<boolean> {
    await ensureOnboardingBootstrapped();
    const normalized = slug.trim().toLowerCase();
    if (isDatabaseConnected()) {
      const exists = await TenantModel.exists({ slug: normalized, isDeleted: { $ne: true } });
      return Boolean(exists);
    }
    for (const t of sandboxTenants.values()) {
      if (t.slug.toLowerCase() === normalized) return true;
    }
    const inRbac = await rbacRepository.findTenantBySlug(normalized);
    return Boolean(inRbac);
  },

  async getOnboardingSession(userId: string): Promise<OnboardingSessionRecord | null> {
    await ensureOnboardingBootstrapped();
    if (isDatabaseConnected()) {
      if (!Types.ObjectId.isValid(userId)) return null;
      const doc: any = await OnboardingSessionModel.findOne({ userId: new Types.ObjectId(userId) }).lean();
      if (!doc) return null;
      return {
        id: doc._id.toString(),
        userId: doc.userId.toString(),
        email: doc.email,
        status: doc.status,
        currentStep: doc.currentStep,
        completedSteps: doc.completedSteps || [],
        businessInfo: doc.businessInfo,
        storeDraft: doc.storeDraft,
        lastIdempotencyKey: doc.lastIdempotencyKey,
        provisionedTenantId: doc.provisionedTenantId?.toString(),
        provisionedStoreId: doc.provisionedStoreId?.toString(),
        provisionedSlug: doc.provisionedSlug,
        lastError: doc.lastError,
        updatedAt: doc.updatedAt,
      };
    }
    const existing = sandboxOnboardingSessions.get(userId);
    return existing ? { ...existing } : null;
  },

  async upsertOnboardingSession(
    userId: string,
    email: string,
    patch: Partial<Omit<OnboardingSessionRecord, 'id' | 'userId' | 'email' | 'updatedAt'>>
  ): Promise<OnboardingSessionRecord> {
    await ensureOnboardingBootstrapped();
    if (isDatabaseConnected()) {
      const doc: any = await OnboardingSessionModel.findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        {
          $set: {
            email: email.toLowerCase(),
            ...patch,
            ...(patch.provisionedTenantId
              ? { provisionedTenantId: new Types.ObjectId(patch.provisionedTenantId) }
              : {}),
            ...(patch.provisionedStoreId
              ? { provisionedStoreId: new Types.ObjectId(patch.provisionedStoreId) }
              : {}),
          },
        },
        { upsert: true, returnDocument: 'after' }
      ).lean();

      return {
        id: doc._id.toString(),
        userId: doc.userId.toString(),
        email: doc.email,
        status: doc.status,
        currentStep: doc.currentStep,
        completedSteps: doc.completedSteps || [],
        businessInfo: doc.businessInfo,
        storeDraft: doc.storeDraft,
        lastIdempotencyKey: doc.lastIdempotencyKey,
        provisionedTenantId: doc.provisionedTenantId?.toString(),
        provisionedStoreId: doc.provisionedStoreId?.toString(),
        provisionedSlug: doc.provisionedSlug,
        lastError: doc.lastError,
        updatedAt: doc.updatedAt,
      };
    }

    const existing = sandboxOnboardingSessions.get(userId);
    const merged: OnboardingSessionRecord = {
      id: existing?.id || new Types.ObjectId().toString(),
      userId,
      email: email.toLowerCase(),
      status: patch.status || existing?.status || 'IN_PROGRESS',
      currentStep: patch.currentStep || existing?.currentStep || 'REGISTERED',
      completedSteps: patch.completedSteps || existing?.completedSteps || ['REGISTERED'],
      businessInfo: patch.businessInfo ?? existing?.businessInfo,
      storeDraft: patch.storeDraft ?? existing?.storeDraft,
      lastIdempotencyKey: patch.lastIdempotencyKey ?? existing?.lastIdempotencyKey,
      provisionedTenantId: patch.provisionedTenantId ?? existing?.provisionedTenantId,
      provisionedStoreId: patch.provisionedStoreId ?? existing?.provisionedStoreId,
      provisionedSlug: patch.provisionedSlug ?? existing?.provisionedSlug,
      lastError: patch.lastError,
      updatedAt: new Date(),
    };
    sandboxOnboardingSessions.set(userId, merged);
    return { ...merged };
  },

  async findTenantById(tenantId: string): Promise<ProvisionedTenantRecord | null> {
    await ensureOnboardingBootstrapped();
    if (isDatabaseConnected()) {
      if (!Types.ObjectId.isValid(tenantId)) return null;
      const doc = await TenantModel.findById(tenantId).lean();
      return doc ? mapTenantDoc(doc) : null;
    }
    const t = sandboxTenants.get(tenantId);
    return t ? { ...t } : null;
  },

  async findTenantBySlug(slug: string): Promise<ProvisionedTenantRecord | null> {
    await ensureOnboardingBootstrapped();
    const normalized = slug.trim().toLowerCase();
    if (isDatabaseConnected()) {
      const doc = await TenantModel.findOne({ slug: normalized, isDeleted: { $ne: true } }).lean();
      return doc ? mapTenantDoc(doc) : null;
    }
    for (const t of sandboxTenants.values()) {
      if (t.slug.toLowerCase() === normalized) return { ...t };
    }
    return null;
  },

  async findProvisionedByIdempotencyKey(
    ownerUserId: string,
    idempotencyKey: string
  ): Promise<ProvisionedBundle | null> {
    await ensureOnboardingBootstrapped();
    if (isDatabaseConnected()) {
      if (!Types.ObjectId.isValid(ownerUserId)) return null;
      const doc: any = await TenantModel.findOne({
        ownerUserId: new Types.ObjectId(ownerUserId),
        idempotencyKey,
        isDeleted: { $ne: true },
      }).lean();
      if (!doc) return null;
      return this.getProvisionedBundle(doc._id.toString());
    }
    const existingTenantId = sandboxIdempotencyIndex.get(`${ownerUserId}:${idempotencyKey}`);
    if (!existingTenantId) return null;
    return this.getProvisionedBundle(existingTenantId);
  },

  async getProvisionedBundle(tenantId: string): Promise<ProvisionedBundle | null> {
    await ensureOnboardingBootstrapped();
    const tenant = await this.findTenantById(tenantId);
    if (!tenant) return null;

    const plan = await this.getStarterPlan();

    if (isDatabaseConnected()) {
      const tObjId = new Types.ObjectId(tenantId);
      const [storeDoc, subDoc, themeDoc, brandingDoc, shipDoc, rolesCount, membership]: any[] = await Promise.all([
        StoreModel.findOne({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true }).lean(),
        SubscriptionModel.findOne({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true }).lean(),
        ThemeModel.findOne({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true }).lean(),
        BrandingSettingModel.findOne({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true }).lean(),
        ShippingMethodModel.findOne({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true }).lean(),
        RoleModel.countDocuments({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true }),
        StoreMembershipModel.findOne({ tenantId: tObjId, userId: new Types.ObjectId(tenant.ownerUserId) })
          .setOptions({ bypassTenantCheck: true })
          .lean(),
      ]);

      const themePreset = resolveThemePreset(storeDoc?.defaultThemeCode);
      return {
        tenant,
        store: {
          id: storeDoc?._id.toString() || '',
          tenantId,
          name: storeDoc?.name || tenant.name,
          slug: storeDoc?.slug || tenant.slug,
          contactEmail: storeDoc?.contactEmail || tenant.contactEmail,
          contactPhone: storeDoc?.contactPhone,
          currency: (storeDoc?.currency || tenant.currency) as SupportedCurrency,
          locale: storeDoc?.locale || tenant.locale,
          timezone: storeDoc?.timezone || tenant.timezone,
          status: storeDoc?.status || 'ACTIVE',
          defaultThemeCode: storeDoc?.defaultThemeCode || themePreset.code,
          businessCategory: storeDoc?.businessCategory,
          isOfficialStore: Boolean(storeDoc?.isOfficialStore),
          createdAt: storeDoc?.createdAt || tenant.createdAt,
        },
        plan,
        subscription: {
          id: subDoc?._id.toString() || '',
          tenantId,
          planId: subDoc?.planId?.toString() || plan.id,
          planCode: plan.code,
          status: subDoc?.status || 'ACTIVE',
          billingCycle: subDoc?.billingCycle || 'MONTHLY',
          currentPeriodStart: subDoc?.currentPeriodStart || tenant.createdAt,
          currentPeriodEnd: subDoc?.currentPeriodEnd || tenant.createdAt,
        },
        theme: {
          id: themeDoc?._id.toString() || '',
          tenantId,
          themeCode: themePreset.code,
          themeName: themePreset.name,
          primaryColor: brandingDoc?.primaryColor || themePreset.primaryColor,
          secondaryColor: brandingDoc?.secondaryColor || themePreset.secondaryColor,
          accentColor: brandingDoc?.accentColor || themePreset.accentColor,
          fontHeading: brandingDoc?.fontHeading || themePreset.fontHeading,
          fontBody: brandingDoc?.fontBody || themePreset.fontBody,
          activeVersion: themeDoc?.activeVersion || 1,
          publishedAt: themeDoc?.publishedAt || tenant.createdAt,
        },
        defaultShippingMethod: {
          id: shipDoc?._id?.toString() || 'std',
          code: shipDoc?.code || 'STANDARD',
          name: shipDoc?.name || 'Standard Delivery',
          baseRate: shipDoc?.baseRateBDT ?? 80,
          currency: tenant.currency,
        },
        rolesCount,
        ownerMembership: {
          id: membership?._id.toString() || '',
          userId: tenant.ownerUserId,
          roleSlug: membership?.roleSlug || 'store_owner',
          status: membership?.status || 'ACTIVE',
        },
        dashboardUrl: `/dashboard/stores/${tenant.slug}`,
      };
    }

    const store = sandboxStores.get(tenantId);
    const sub = sandboxSubscriptions.get(tenantId);
    const theme = sandboxThemes.get(tenantId);
    const ship = sandboxShippingMethods.get(tenantId);
    const roles = await rbacRepository.listTenantRoles(tenantId);
    const membership = await rbacRepository.findMembership(tenantId, tenant.ownerUserId);

    if (!store || !sub || !theme || !membership) return null;

    return {
      tenant,
      store: { ...store },
      plan,
      subscription: { ...sub },
      theme: { ...theme },
      defaultShippingMethod: {
        id: ship?.id || 'std',
        code: ship?.code || 'STANDARD',
        name: ship?.name || 'Standard Delivery',
        baseRate: ship?.baseRate ?? 80,
        currency: tenant.currency,
      },
      rolesCount: roles.length,
      ownerMembership: {
        id: membership.id,
        userId: membership.userId,
        roleSlug: membership.roleSlug,
        status: membership.status,
      },
      dashboardUrl: `/dashboard/stores/${tenant.slug}`,
    };
  },

  async listAllStores(): Promise<Array<{ tenant: ProvisionedTenantRecord; store: ProvisionedStoreRecord; planCode: string }>> {
    await ensureOnboardingBootstrapped();
    if (isDatabaseConnected()) {
      const tenants = await TenantModel.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
      const stores = await StoreModel.find({ isDeleted: { $ne: true } }).setOptions({ bypassTenantCheck: true }).lean();
      const storeMap = new Map(stores.map((s) => [s.tenantId.toString(), s]));
      return tenants.map((t) => {
        const s: any = storeMap.get(t._id.toString());
        const mappedTenant = mapTenantDoc(t);
        return {
          tenant: mappedTenant,
          store: {
            id: s?._id.toString() || t._id.toString(),
            tenantId: mappedTenant.id,
            name: s?.name || mappedTenant.name,
            slug: s?.slug || mappedTenant.slug,
            contactEmail: s?.contactEmail || mappedTenant.contactEmail,
            contactPhone: s?.contactPhone,
            currency: (s?.currency || mappedTenant.currency) as SupportedCurrency,
            locale: s?.locale || mappedTenant.locale,
            timezone: s?.timezone || mappedTenant.timezone,
            status: s?.status || (mappedTenant.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
            defaultThemeCode: s?.defaultThemeCode || 'nexora-atelier',
            businessCategory: s?.businessCategory,
            isOfficialStore: Boolean(mappedTenant.isOfficialStore),
            createdAt: s?.createdAt || mappedTenant.createdAt,
          },
          planCode: mappedTenant.tier || 'STARTER',
        };
      });
    }

    const out: Array<{ tenant: ProvisionedTenantRecord; store: ProvisionedStoreRecord; planCode: string }> = [];
    for (const t of sandboxTenants.values()) {
      const s = sandboxStores.get(t.id);
      const sub = sandboxSubscriptions.get(t.id);
      if (s) {
        out.push({
          tenant: { ...t },
          store: { ...s },
          planCode: sub?.planCode || t.tier || 'STARTER',
        });
      }
    }
    return out.sort((a, b) => b.tenant.createdAt.getTime() - a.tenant.createdAt.getTime());
  },

  async updateTenantLifecycleStatus(
    tenantId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    actorUserId: string,
    reason?: string
  ): Promise<ProvisionedTenantRecord | null> {
    await ensureOnboardingBootstrapped();
    const now = new Date();
    if (isDatabaseConnected()) {
      const update: Record<string, any> = { status };
      if (status === 'SUSPENDED') {
        update.suspendedAt = now;
        update.suspendedReason = reason || 'Suspended by platform administration';
        update.suspendedByUserId = new Types.ObjectId(actorUserId);
      } else {
        update.activatedAt = now;
        update.activatedByUserId = new Types.ObjectId(actorUserId);
      }
      const doc = await TenantModel.findByIdAndUpdate(
        tenantId,
        { $set: update },
        { returnDocument: 'after' }
      ).lean();
      if (!doc) return null;
      await StoreModel.updateMany(
        { tenantId: new Types.ObjectId(tenantId) },
        { $set: { status: status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE' } }
      ).setOptions({ bypassTenantCheck: true });
      return mapTenantDoc(doc);
    }

    const tenant = sandboxTenants.get(tenantId);
    if (!tenant) return null;
    const updated: ProvisionedTenantRecord = {
      ...tenant,
      status,
      updatedAt: now,
      ...(status === 'SUSPENDED'
        ? { suspendedAt: now, suspendedReason: reason || 'Suspended by platform administration' }
        : { activatedAt: now, suspendedReason: undefined }),
    };
    sandboxTenants.set(tenantId, updated);

    const store = sandboxStores.get(tenantId);
    if (store) {
      sandboxStores.set(tenantId, {
        ...store,
        status: status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      });
    }
    rbacRepository.updateSandboxTenantStatus(tenantId, status);
    return { ...updated };
  },

  /**
   * Transaction-Safe Atomic Store Provisioning with Compensating Rollback
   */
  async provisionTenantStoreAtomically(input: {
    ownerUserId: string;
    ownerEmail: string;
    ownerFullName: string;
    storeName: string;
    normalizedSlug: string;
    businessInfo: {
      legalBusinessName: string;
      category: string;
      phone?: string;
      contactEmail: string;
      country: string;
      currency: SupportedCurrency;
      locale: string;
      timezone: string;
    };
    themeCode: string;
    idempotencyKey: string;
    simulateFailureAtStep?: ProvisioningFailurePoint;
  }): Promise<ProvisionedBundle> {
    await ensureOnboardingBootstrapped();

    const lockKey = `${input.ownerUserId}:${input.normalizedSlug}`;
    if (activeProvisioningLocks.has(lockKey)) {
      throw new Error('CONCURRENT_PROVISIONING_IN_PROGRESS');
    }
    activeProvisioningLocks.add(lockKey);

    const tenantId = new Types.ObjectId().toString();
    const storeId = new Types.ObjectId().toString();
    const createdArtifacts = {
      tenantCreated: false,
      storeCreated: false,
      subscriptionCreated: false,
      themeCreated: false,
      brandingCreated: false,
      shippingCreated: false,
      rolesCreated: false,
      membershipCreated: false,
      rbacSynced: false,
    };

    const rollbackAll = async () => {
      if (isDatabaseConnected()) {
        const tObjId = new Types.ObjectId(tenantId);
        await Promise.allSettled([
          createdArtifacts.membershipCreated
            ? StoreMembershipModel.deleteMany({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true })
            : Promise.resolve(),
          createdArtifacts.rolesCreated
            ? RoleModel.deleteMany({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true })
            : Promise.resolve(),
          createdArtifacts.shippingCreated
            ? ShippingMethodModel.deleteMany({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true })
            : Promise.resolve(),
          createdArtifacts.brandingCreated
            ? BrandingSettingModel.deleteMany({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true })
            : Promise.resolve(),
          createdArtifacts.themeCreated
            ? ThemeModel.deleteMany({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true })
            : Promise.resolve(),
          createdArtifacts.subscriptionCreated
            ? SubscriptionModel.deleteMany({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true })
            : Promise.resolve(),
          createdArtifacts.storeCreated
            ? StoreModel.deleteMany({ tenantId: tObjId }).setOptions({ bypassTenantCheck: true })
            : Promise.resolve(),
          createdArtifacts.tenantCreated ? TenantModel.deleteOne({ _id: tObjId }) : Promise.resolve(),
        ]);
      } else {
        sandboxTenants.delete(tenantId);
        sandboxStores.delete(tenantId);
        sandboxSubscriptions.delete(tenantId);
        sandboxThemes.delete(tenantId);
        sandboxShippingMethods.delete(tenantId);
        sandboxIdempotencyIndex.delete(`${input.ownerUserId}:${input.idempotencyKey}`);
        rbacRepository.removeSandboxTenant(tenantId);
      }
    };

    const maybeFail = (step: ProvisioningFailurePoint) => {
      if (input.simulateFailureAtStep === step) {
        throw new Error(`SIMULATED_PARTIAL_FAILURE_AT_${step}`);
      }
    };

    const executePipeline = async (dbSession?: mongoose.ClientSession): Promise<ProvisionedBundle> => {
      const now = new Date();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const themePreset = resolveThemePreset(input.themeCode);
      const currencyDefaults = CURRENCY_LOCALE_DEFAULTS[input.businessInfo.currency];
      const completedSteps: OnboardingStep[] = [
        'REGISTERED',
        'EMAIL_VERIFIED',
        'BUSINESS_INFO_SAVED',
        'STORE_IDENTITY_SELECTED',
        'PLAN_ASSIGNED',
        'THEME_ASSIGNED',
        'SETTINGS_CREATED',
        'OWNER_MEMBERSHIP_CREATED',
        'COMPLETED',
      ];

      // Step 6: Assign Free STARTER Plan
      maybeFail('ASSIGN_FREE_PLAN');
      const freePlan = await this.getStarterPlan();

      // Step 7: Create Tenant
      maybeFail('CREATE_TENANT');
      if (isDatabaseConnected()) {
        await TenantModel.create(
          [
            {
              _id: new Types.ObjectId(tenantId),
              name: input.storeName,
              slug: input.normalizedSlug,
              subdomain: input.normalizedSlug,
              ownerUserId: new Types.ObjectId(input.ownerUserId),
              tier: 'STARTER',
              status: 'ACTIVE',
              storeOwnershipType: 'INDEPENDENT_TENANT',
              isOfficialStore: false,
              currentPlanId: new Types.ObjectId(freePlan.id),
              contactEmail: input.businessInfo.contactEmail,
              contactPhone: input.businessInfo.phone,
              currency: input.businessInfo.currency,
              locale: input.businessInfo.locale,
              timezone: input.businessInfo.timezone,
              storageQuotaMB: freePlan.maxStorageMB,
              businessInfo: {
                legalName: input.businessInfo.legalBusinessName,
                category: input.businessInfo.category,
                country: input.businessInfo.country,
              },
              onboardingProgress: {
                currentStep: 'COMPLETED',
                completedSteps,
                startedAt: now,
                completedAt: now,
              },
              idempotencyKey: input.idempotencyKey,
            },
          ],
          dbSession ? { session: dbSession } : undefined
        );
      } else {
        sandboxTenants.set(tenantId, {
          id: tenantId,
          name: input.storeName,
          slug: input.normalizedSlug,
          subdomain: input.normalizedSlug,
          ownerUserId: input.ownerUserId,
          tier: 'STARTER',
          status: 'ACTIVE',
          storeOwnershipType: 'INDEPENDENT_TENANT',
          isOfficialStore: false,
          currentPlanId: freePlan.id,
          contactEmail: input.businessInfo.contactEmail,
          contactPhone: input.businessInfo.phone,
          currency: input.businessInfo.currency,
          locale: input.businessInfo.locale,
          timezone: input.businessInfo.timezone,
          storageQuotaMB: freePlan.maxStorageMB,
          businessInfo: {
            legalName: input.businessInfo.legalBusinessName,
            category: input.businessInfo.category,
            country: input.businessInfo.country,
          },
          onboardingProgress: {
            currentStep: 'COMPLETED',
            completedSteps,
            startedAt: now,
            completedAt: now,
          },
          idempotencyKey: input.idempotencyKey,
          createdAt: now,
          updatedAt: now,
        });
      }
      createdArtifacts.tenantCreated = true;

      // Step 8: Create Store & Default Settings
      maybeFail('CREATE_STORE_AND_SETTINGS');
      const shipId = new Types.ObjectId().toString();
      if (isDatabaseConnected()) {
        await StoreModel.create(
          [
            {
              _id: new Types.ObjectId(storeId),
              tenantId: new Types.ObjectId(tenantId),
              name: input.storeName,
              slug: input.normalizedSlug,
              contactEmail: input.businessInfo.contactEmail,
              contactPhone: input.businessInfo.phone,
              currency: input.businessInfo.currency,
              locale: input.businessInfo.locale,
              timezone: input.businessInfo.timezone,
              status: 'ACTIVE',
              defaultThemeCode: themePreset.code,
              businessCategory: input.businessInfo.category,
              isOfficialStore: false,
            },
          ],
          dbSession ? { session: dbSession } : undefined
        );
        createdArtifacts.storeCreated = true;

        await ShippingMethodModel.create(
          [
            {
              _id: new Types.ObjectId(shipId),
              tenantId: new Types.ObjectId(tenantId),
              name: currencyDefaults.shippingZone,
              code: 'standard',
              baseRateBDT: currencyDefaults.flatRate,
              estimatedDeliveryDays: '2-4 business days',
              isDefault: true,
              isActive: true,
            },
          ],
          dbSession ? { session: dbSession } : undefined
        );
        createdArtifacts.shippingCreated = true;
      } else {
        sandboxStores.set(tenantId, {
          id: storeId,
          tenantId,
          name: input.storeName,
          slug: input.normalizedSlug,
          contactEmail: input.businessInfo.contactEmail,
          contactPhone: input.businessInfo.phone,
          currency: input.businessInfo.currency,
          locale: input.businessInfo.locale,
          timezone: input.businessInfo.timezone,
          status: 'ACTIVE',
          defaultThemeCode: themePreset.code,
          businessCategory: input.businessInfo.category,
          isOfficialStore: false,
          createdAt: now,
        });
        createdArtifacts.storeCreated = true;

        sandboxShippingMethods.set(tenantId, {
          id: shipId,
          tenantId,
          code: 'STANDARD',
          name: currencyDefaults.shippingZone,
          baseRate: currencyDefaults.flatRate,
          currency: input.businessInfo.currency,
        });
        createdArtifacts.shippingCreated = true;
      }

      // Step 9: Assign Default Theme & Branding
      maybeFail('ASSIGN_DEFAULT_THEME');
      const themeId = new Types.ObjectId().toString();
      if (isDatabaseConnected()) {
        await ThemeModel.create(
          [
            {
              _id: new Types.ObjectId(themeId),
              tenantId: new Types.ObjectId(tenantId),
              activeVersion: 1,
              publishedSnapshot: { themeCode: themePreset.code, layoutMode: themePreset.layoutMode },
              draftSnapshot: { themeCode: themePreset.code, layoutMode: themePreset.layoutMode },
              publishedAt: now,
            },
          ],
          dbSession ? { session: dbSession } : undefined
        );
        createdArtifacts.themeCreated = true;

        await BrandingSettingModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              primaryColor: themePreset.primaryColor,
              secondaryColor: themePreset.secondaryColor,
              accentColor: themePreset.accentColor,
              fontHeading: themePreset.fontHeading,
              fontBody: themePreset.fontBody,
              borderRadius: themePreset.borderRadius,
            },
          ],
          dbSession ? { session: dbSession } : undefined
        );
        createdArtifacts.brandingCreated = true;
      } else {
        sandboxThemes.set(tenantId, {
          id: themeId,
          tenantId,
          themeCode: themePreset.code,
          themeName: themePreset.name,
          primaryColor: themePreset.primaryColor,
          secondaryColor: themePreset.secondaryColor,
          accentColor: themePreset.accentColor,
          fontHeading: themePreset.fontHeading,
          fontBody: themePreset.fontBody,
          activeVersion: 1,
          publishedAt: now,
        });
        createdArtifacts.themeCreated = true;
      }

      // Step 10a: Subscription Association
      maybeFail('CREATE_SUBSCRIPTION');
      const subId = new Types.ObjectId().toString();
      if (isDatabaseConnected()) {
        await SubscriptionModel.create(
          [
            {
              _id: new Types.ObjectId(subId),
              tenantId: new Types.ObjectId(tenantId),
              planId: new Types.ObjectId(freePlan.id),
              status: 'ACTIVE',
              billingCycle: 'MONTHLY',
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
          ],
          dbSession ? { session: dbSession } : undefined
        );
      } else {
        sandboxSubscriptions.set(tenantId, {
          id: subId,
          tenantId,
          planId: freePlan.id,
          planCode: freePlan.code,
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        });
      }
      createdArtifacts.subscriptionCreated = true;

      // Step 10b: Tenant Roles & Store Owner Membership
      maybeFail('CREATE_ROLES_AND_OWNER_MEMBERSHIP');
      const tenantRoles = ROLE_DEFINITIONS.filter((r) => r.scope === 'TENANT');
      let ownerRoleId = '';
      if (isDatabaseConnected()) {
        const roleDocs = await RoleModel.create(
          tenantRoles.map((def) => ({
            tenantId: new Types.ObjectId(tenantId),
            name: def.name,
            slug: def.slug,
            description: def.description,
            permissionCodes: [...def.permissionCodes],
            hierarchyRank: def.hierarchyRank,
            isSystemDefault: true,
          })),
          dbSession ? { session: dbSession } : undefined
        );
        createdArtifacts.rolesCreated = true;
        const ownerRoleDoc = roleDocs.find((r: any) => r.slug === 'store_owner');
        ownerRoleId = ownerRoleDoc!._id.toString();

        const membershipDocs = await StoreMembershipModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              storeId: new Types.ObjectId(storeId),
              userId: new Types.ObjectId(input.ownerUserId),
              roleId: new Types.ObjectId(ownerRoleId),
              roleSlug: 'store_owner',
              status: 'ACTIVE',
              joinedAt: now,
            },
          ],
          dbSession ? { session: dbSession } : undefined
        );
        createdArtifacts.membershipCreated = true;

        const bundle = await this.getProvisionedBundle(tenantId);
        if (bundle) return bundle;

        return {
          tenant: mapTenantDoc({
            _id: new Types.ObjectId(tenantId),
            name: input.storeName,
            slug: input.normalizedSlug,
            subdomain: input.normalizedSlug,
            ownerUserId: new Types.ObjectId(input.ownerUserId),
            tier: 'STARTER',
            status: 'ACTIVE',
            storeOwnershipType: 'INDEPENDENT_TENANT',
            isOfficialStore: false,
            currentPlanId: new Types.ObjectId(freePlan.id),
            contactEmail: input.businessInfo.contactEmail,
            contactPhone: input.businessInfo.phone,
            currency: input.businessInfo.currency,
            locale: input.businessInfo.locale,
            timezone: input.businessInfo.timezone,
            storageQuotaMB: freePlan.maxStorageMB,
            businessInfo: {
              legalName: input.businessInfo.legalBusinessName,
              category: input.businessInfo.category,
              country: input.businessInfo.country,
            },
            onboardingProgress: {
              currentStep: 'COMPLETED',
              completedSteps,
              startedAt: now,
              completedAt: now,
            },
            idempotencyKey: input.idempotencyKey,
            createdAt: now,
            updatedAt: now,
          }),
          store: {
            id: storeId,
            tenantId,
            name: input.storeName,
            slug: input.normalizedSlug,
            contactEmail: input.businessInfo.contactEmail,
            contactPhone: input.businessInfo.phone,
            currency: input.businessInfo.currency,
            locale: input.businessInfo.locale,
            timezone: input.businessInfo.timezone,
            status: 'ACTIVE',
            defaultThemeCode: themePreset.code,
            businessCategory: input.businessInfo.category,
            isOfficialStore: false,
            createdAt: now,
          },
          plan: freePlan,
          subscription: {
            id: subId,
            tenantId,
            planId: freePlan.id,
            planCode: freePlan.code,
            status: 'ACTIVE',
            billingCycle: 'MONTHLY',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          theme: {
            id: themeId,
            tenantId,
            themeCode: themePreset.code,
            themeName: themePreset.name,
            primaryColor: themePreset.primaryColor,
            secondaryColor: themePreset.secondaryColor,
            accentColor: themePreset.accentColor,
            fontHeading: themePreset.fontHeading,
            fontBody: themePreset.fontBody,
            activeVersion: 1,
            publishedAt: now,
          },
          defaultShippingMethod: {
            id: shipId,
            code: 'STANDARD',
            name: currencyDefaults.shippingZone,
            baseRate: currencyDefaults.flatRate,
            currency: input.businessInfo.currency,
          },
          rolesCount: tenantRoles.length,
          ownerMembership: {
            id: membershipDocs[0]._id.toString(),
            userId: input.ownerUserId,
            roleSlug: 'store_owner',
            status: 'ACTIVE',
          },
          dashboardUrl: `/dashboard/stores/${input.normalizedSlug}`,
        };
      }

      // Sandbox RBAC sync
      rbacRepository.registerSandboxTenant({
        id: tenantId,
        name: input.storeName,
        slug: input.normalizedSlug,
        subdomain: input.normalizedSlug,
        storeId,
        ownerUserId: input.ownerUserId,
        status: 'ACTIVE',
        isOfficialStore: false,
      });
      createdArtifacts.rbacSynced = true;

      for (const def of tenantRoles) {
        const r = await rbacRepository.upsertTenantRole({
          tenantId,
          name: def.name,
          slug: def.slug,
          description: def.description,
          permissionCodes: [...def.permissionCodes],
          hierarchyRank: def.hierarchyRank,
          isSystemDefault: true,
        });
        if (def.slug === 'store_owner') ownerRoleId = r.id;
      }
      createdArtifacts.rolesCreated = true;

      const membership = await rbacRepository.upsertMembership({
        tenantId,
        storeId,
        userId: input.ownerUserId,
        userEmail: input.ownerEmail,
        userFullName: input.ownerFullName,
        roleId: ownerRoleId,
        roleSlug: 'store_owner',
      });
      createdArtifacts.membershipCreated = true;
      sandboxIdempotencyIndex.set(`${input.ownerUserId}:${input.idempotencyKey}`, tenantId);

      return {
        tenant: { ...sandboxTenants.get(tenantId)! },
        store: { ...sandboxStores.get(tenantId)! },
        plan: freePlan,
        subscription: { ...sandboxSubscriptions.get(tenantId)! },
        theme: { ...sandboxThemes.get(tenantId)! },
        defaultShippingMethod: {
          id: shipId,
          code: 'STANDARD',
          name: currencyDefaults.shippingZone,
          baseRate: currencyDefaults.flatRate,
          currency: input.businessInfo.currency,
        },
        rolesCount: tenantRoles.length,
        ownerMembership: {
          id: membership.id,
          userId: membership.userId,
          roleSlug: membership.roleSlug,
          status: membership.status,
        },
        dashboardUrl: `/dashboard/stores/${input.normalizedSlug}`,
      };
    };

    try {
      if (isDatabaseConnected()) {
        const session = await mongoose.startSession();
        try {
          let txResult: ProvisionedBundle | null = null;
          try {
            await session.withTransaction(async () => {
              txResult = await executePipeline(session);
            });
            return txResult!;
          } catch (txErr: any) {
            // Standalone MongoDB servers don't support replica-set multi-doc transactions;
            // execute with explicit compensating rollback if transaction API isn't supported.
            const msg = String(txErr?.message || '');
            if (msg.includes('Transaction numbers are only allowed on a replica set') || msg.includes('replica set')) {
              await rollbackAll();
              return await executePipeline();
            }
            throw txErr;
          }
        } finally {
          await session.endSession();
        }
      }

      return await executePipeline();
    } catch (err) {
      await rollbackAll();
      throw err;
    } finally {
      activeProvisioningLocks.delete(lockKey);
    }
  },

  async inspectOrphansBySlug(slug: string): Promise<{
    tenants: number;
    stores: number;
    subscriptions: number;
    themes: number;
  }> {
    await ensureOnboardingBootstrapped();
    const normalized = slug.trim().toLowerCase();
    if (isDatabaseConnected()) {
      const tenantDocs = await TenantModel.find({ slug: normalized }).lean();
      const tenantIds = tenantDocs.map((t) => t._id);
      const [stores, subs, themes] = await Promise.all([
        StoreModel.countDocuments({ slug: normalized }).setOptions({ bypassTenantCheck: true }),
        tenantIds.length > 0
          ? SubscriptionModel.countDocuments({ tenantId: { $in: tenantIds } }).setOptions({ bypassTenantCheck: true })
          : 0,
        tenantIds.length > 0
          ? ThemeModel.countDocuments({ tenantId: { $in: tenantIds } }).setOptions({ bypassTenantCheck: true })
          : 0,
      ]);
      return { tenants: tenantDocs.length, stores, subscriptions: subs, themes };
    }

    const matchingTenants = Array.from(sandboxTenants.values()).filter((t) => t.slug === normalized);
    const matchingStores = Array.from(sandboxStores.values()).filter((s) => s.slug === normalized);
    let subs = 0;
    let themes = 0;
    for (const t of matchingTenants) {
      if (sandboxSubscriptions.has(t.id)) subs += 1;
      if (sandboxThemes.has(t.id)) themes += 1;
    }
    return {
      tenants: matchingTenants.length,
      stores: matchingStores.length,
      subscriptions: subs,
      themes,
    };
  },
};
