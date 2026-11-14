/**
 * NEXORA Automatic Tenant Store Creation — Orchestration Service
 *
 * Implements the 11-step business owner onboarding workflow with strict
 * server-side identity derivation, slug reservation/normalization,
 * transaction-safe creation, idempotency, store suspension/activation,
 * and segregated NEXORA Official Store handling.
 */

import { env } from '../../../packages/config/src/index.ts';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors.ts';
import { authService } from '../auth/authService.ts';
import { authRepository } from '../auth/authRepository.ts';
import { rbacRepository } from '../rbac/rbacRepository.ts';
import type { OnboardingStep } from '../db/schemas/global/tenants.ts';
import {
  validateSlugPolicy,
  generateUniqueSlugCandidates,
} from './slugPolicy.ts';
import {
  CURRENCY_LOCALE_DEFAULTS,
  DEFAULT_STORE_THEMES,
  isValidIanaTimezone,
  isValidLocaleTag,
  type SupportedCurrency,
} from './storeDefaults.ts';
import {
  onboardingRepository,
  OFFICIAL_STORE_TENANT_ID,
  ensureOnboardingBootstrapped,
  type ProvisionedBundle,
  type ProvisioningFailurePoint,
} from './onboardingRepository.ts';

function mergeCompletedSteps(existing: OnboardingStep[], nextStep: OnboardingStep): OnboardingStep[] {
  const ordered: OnboardingStep[] = [
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
  const set = new Set<OnboardingStep>(existing);
  set.add(nextStep);
  return ordered.filter((s) => set.has(s));
}

export const onboardingService = {
  // Step 1: Business owner registers (always forced to MERCHANT, never platform admin)
  async registerBusinessOwner(input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    await ensureOnboardingBootstrapped();
    const reg = await authService.register({
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      phone: input.phone,
      accountType: 'MERCHANT',
    });

    const session = await onboardingRepository.upsertOnboardingSession(reg.user.id, reg.user.email, {
      status: 'IN_PROGRESS',
      currentStep: 'REGISTERED',
      completedSteps: ['REGISTERED'],
    });

    return {
      ...reg,
      onboarding: session,
      nextStep: 'EMAIL_VERIFIED' as OnboardingStep,
    };
  },

  // Step 2: Email verification
  async verifyOwnerEmail(token: string) {
    await ensureOnboardingBootstrapped();
    const result = await authService.verifyEmail(token);
    const user = await authRepository.findUserByEmail(result.user.email);
    let onboarding = null;
    if (user) {
      const existing = await onboardingRepository.getOnboardingSession(user.id);
      onboarding = await onboardingRepository.upsertOnboardingSession(user.id, user.email, {
        status: existing?.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
        currentStep: existing?.status === 'COMPLETED' ? 'COMPLETED' : 'EMAIL_VERIFIED',
        completedSteps: mergeCompletedSteps(existing?.completedSteps || ['REGISTERED'], 'EMAIL_VERIFIED'),
      });
    }

    return {
      ...result,
      onboarding,
      nextStep: 'BUSINESS_INFO_SAVED' as OnboardingStep,
    };
  },

  // Step 3: Business Information + Currency / Locale / Timezone
  async saveBusinessInformation(
    userId: string,
    input: {
      legalBusinessName: string;
      category: string;
      phone?: string;
      contactEmail?: string;
      country: string;
      currency?: SupportedCurrency;
      locale?: string;
      timezone?: string;
    }
  ) {
    await ensureOnboardingBootstrapped();
    const user = await authRepository.findUserById(userId);
    if (!user) throw new NotFoundError('Account not found.', 'USER_NOT_FOUND');

    if (user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      throw new ForbiddenError(
        'Please verify your email address before saving business onboarding information.',
        'EMAIL_NOT_VERIFIED'
      );
    }

    const currency: SupportedCurrency = input.currency || 'BDT';
    const defaults = CURRENCY_LOCALE_DEFAULTS[currency];
    const locale = input.locale?.trim() || defaults.locale;
    const timezone = input.timezone?.trim() || defaults.timezone;

    if (!isValidLocaleTag(locale)) {
      throw new BadRequestError(`Invalid locale tag "${locale}". Example: en-BD or en-US.`);
    }
    if (!isValidIanaTimezone(timezone)) {
      throw new BadRequestError(`Invalid IANA timezone "${timezone}". Example: Asia/Dhaka or UTC.`);
    }

    const existing = await onboardingRepository.getOnboardingSession(userId);
    const updated = await onboardingRepository.upsertOnboardingSession(userId, user.email, {
      status: existing?.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
      currentStep: existing?.status === 'COMPLETED' ? 'COMPLETED' : 'BUSINESS_INFO_SAVED',
      completedSteps: mergeCompletedSteps(existing?.completedSteps || ['REGISTERED', 'EMAIL_VERIFIED'], 'BUSINESS_INFO_SAVED'),
      businessInfo: {
        legalBusinessName: input.legalBusinessName.trim(),
        category: input.category.trim(),
        phone: input.phone?.trim(),
        contactEmail: (input.contactEmail || user.email).trim().toLowerCase(),
        country: input.country.trim(),
        currency,
        locale,
        timezone,
      },
    });

    return {
      onboarding: updated,
      nextStep: 'STORE_IDENTITY_SELECTED' as OnboardingStep,
    };
  },

  // Steps 4 & 5: Store name selection + unique normalized slug check + reserved protection
  async checkAndReserveSlug(input: {
    storeName: string;
    customSlug?: string;
    themeCode?: string;
    userId?: string;
  }) {
    await ensureOnboardingBootstrapped();
    const rawCandidate = input.customSlug?.trim() || input.storeName;
    const policy = validateSlugPolicy(rawCandidate);
    const isTakenFn = (slug: string) => onboardingRepository.isSlugTaken(slug);

    if (!policy.isValidFormat) {
      const suggestions = await generateUniqueSlugCandidates(input.storeName, isTakenFn);
      return {
        available: false,
        normalizedSlug: policy.normalizedSlug,
        isReserved: false,
        reason: policy.reason,
        suggestions,
      };
    }

    if (policy.isReserved) {
      const suggestions = await generateUniqueSlugCandidates(policy.normalizedSlug, isTakenFn);
      return {
        available: false,
        normalizedSlug: policy.normalizedSlug,
        isReserved: true,
        reason: policy.reason,
        suggestions,
      };
    }

    const taken = await isTakenFn(policy.normalizedSlug);
    if (taken) {
      const suggestions = await generateUniqueSlugCandidates(policy.normalizedSlug, isTakenFn);
      return {
        available: false,
        normalizedSlug: policy.normalizedSlug,
        isReserved: false,
        reason: `The store slug "${policy.normalizedSlug}" is already in use.`,
        suggestions,
      };
    }

    if (input.userId) {
      const user = await authRepository.findUserById(input.userId);
      if (user) {
        const existing = await onboardingRepository.getOnboardingSession(input.userId);
        await onboardingRepository.upsertOnboardingSession(input.userId, user.email, {
          status: existing?.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
          currentStep: existing?.status === 'COMPLETED' ? 'COMPLETED' : 'STORE_IDENTITY_SELECTED',
          completedSteps: mergeCompletedSteps(
            existing?.completedSteps || ['REGISTERED', 'EMAIL_VERIFIED'],
            'STORE_IDENTITY_SELECTED'
          ),
          storeDraft: {
            storeName: input.storeName.trim(),
            storeSlug: policy.normalizedSlug,
            themeCode: input.themeCode || DEFAULT_STORE_THEMES[0].code,
          },
        });
      }
    }

    return {
      available: true,
      normalizedSlug: policy.normalizedSlug,
      subdomainPreview: `${policy.normalizedSlug}.nexora.shop`,
      isReserved: false,
      suggestions: [] as string[],
    };
  },

  // Steps 6–11: Transaction-Safe, Idempotent Automatic Tenant Store Creation
  async provisionStore(
    authenticatedUserId: string,
    input: {
      storeName: string;
      storeSlug?: string;
      legalBusinessName?: string;
      category?: string;
      phone?: string;
      contactEmail?: string;
      country?: string;
      currency?: SupportedCurrency;
      locale?: string;
      timezone?: string;
      themeCode?: string;
      idempotencyKey: string;
      simulateFailureAtStep?: ProvisioningFailurePoint;
    },
    ipAddress: string
  ): Promise<ProvisionedBundle & { idempotentReplay: boolean }> {
    await ensureOnboardingBootstrapped();

    // NEVER trust client-supplied owner/tenant IDs — always resolve from authenticated session
    const owner = await authRepository.findUserById(authenticatedUserId);
    if (!owner) {
      throw new NotFoundError('Authenticated owner account not found.', 'USER_NOT_FOUND');
    }
    if (owner.status !== 'ACTIVE' || !owner.emailVerifiedAt) {
      throw new ForbiddenError(
        'Email verification must be completed before provisioning a store.',
        'EMAIL_NOT_VERIFIED'
      );
    }
    if (owner.userType !== 'MERCHANT' && owner.userType !== 'CUSTOMER') {
      throw new ForbiddenError(
        'Platform administrative accounts cannot provision independent tenant stores directly.',
        'PLATFORM_ACCOUNT_SEGREGATED'
      );
    }

    // 1. Idempotency check FIRST (exact replay returns identical bundle with zero side effects)
    const replayBundle = await onboardingRepository.findProvisionedByIdempotencyKey(
      owner.id,
      input.idempotencyKey
    );
    if (replayBundle) {
      return {
        ...replayBundle,
        idempotentReplay: true,
      };
    }

    // 2. Load prior onboarding session draft if fields omitted
    const session = await onboardingRepository.getOnboardingSession(owner.id);
    const currency: SupportedCurrency =
      input.currency || session?.businessInfo?.currency || 'BDT';
    const defaults = CURRENCY_LOCALE_DEFAULTS[currency];
    const locale = input.locale?.trim() || session?.businessInfo?.locale || defaults.locale;
    const timezone = input.timezone?.trim() || session?.businessInfo?.timezone || defaults.timezone;

    if (!isValidLocaleTag(locale)) {
      throw new BadRequestError(`Invalid locale tag "${locale}".`);
    }
    if (!isValidIanaTimezone(timezone)) {
      throw new BadRequestError(`Invalid IANA timezone "${timezone}".`);
    }

    const storeName = input.storeName.trim();
    const rawSlug = input.storeSlug?.trim() || storeName;
    const policy = validateSlugPolicy(rawSlug);

    if (!policy.isValidFormat) {
      throw new BadRequestError(policy.reason || 'Invalid store slug.');
    }
    if (policy.isReserved) {
      throw new ForbiddenError(
        policy.reason || `Slug "${policy.normalizedSlug}" is reserved.`,
        'RESERVED_STORE_SLUG'
      );
    }

    const slugTaken = await onboardingRepository.isSlugTaken(policy.normalizedSlug);
    if (slugTaken) {
      throw new ConflictError(
        `Store slug "${policy.normalizedSlug}" is already taken by another tenant.`,
        'SLUG_ALREADY_TAKEN'
      );
    }

    const failureStep =
      env.NODE_ENV === 'production' ? undefined : input.simulateFailureAtStep;

    try {
      const bundle = await onboardingRepository.provisionTenantStoreAtomically({
        ownerUserId: owner.id,
        ownerEmail: owner.email,
        ownerFullName: owner.fullName,
        storeName,
        normalizedSlug: policy.normalizedSlug,
        businessInfo: {
          legalBusinessName: input.legalBusinessName?.trim() || session?.businessInfo?.legalBusinessName || storeName,
          category: input.category?.trim() || session?.businessInfo?.category || 'General Retail',
          phone: input.phone?.trim() || session?.businessInfo?.phone || owner.phone,
          contactEmail: (input.contactEmail || session?.businessInfo?.contactEmail || owner.email)
            .trim()
            .toLowerCase(),
          country: input.country?.trim() || session?.businessInfo?.country || 'Bangladesh',
          currency,
          locale,
          timezone,
        },
        themeCode: input.themeCode || session?.storeDraft?.themeCode || DEFAULT_STORE_THEMES[0].code,
        idempotencyKey: input.idempotencyKey,
        simulateFailureAtStep: failureStep,
      });

      await onboardingRepository.upsertOnboardingSession(owner.id, owner.email, {
        status: 'COMPLETED',
        currentStep: 'COMPLETED',
        completedSteps: bundle.tenant.onboardingProgress.completedSteps,
        lastIdempotencyKey: input.idempotencyKey,
        provisionedTenantId: bundle.tenant.id,
        provisionedStoreId: bundle.store.id,
        provisionedSlug: bundle.tenant.slug,
        lastError: undefined,
      });

      await rbacRepository.recordAdminActivity({
        scope: 'TENANT',
        tenantId: bundle.tenant.id,
        actorUserId: owner.id,
        actorEmail: owner.email,
        actorRole: 'store_owner',
        action: 'STORE_PROVISIONED',
        resourceType: 'TenantStore',
        resourceId: bundle.tenant.id,
        outcome: 'ALLOWED',
        reason: `Provisioned independent store "${bundle.store.name}" (${bundle.tenant.slug}) on STARTER Free plan.`,
        ipAddress,
        metadata: {
          planCode: bundle.plan.code,
          themeCode: bundle.theme.themeCode,
          currency: bundle.store.currency,
          locale: bundle.store.locale,
          timezone: bundle.store.timezone,
          idempotencyKey: input.idempotencyKey,
        },
      });

      return {
        ...bundle,
        idempotentReplay: false,
      };
    } catch (err: any) {
      await onboardingRepository.upsertOnboardingSession(owner.id, owner.email, {
        status: 'FAILED_ROLLED_BACK',
        lastIdempotencyKey: input.idempotencyKey,
        lastError: err?.message || 'Atomic store provisioning rolled back.',
      });
      throw err;
    }
  },

  async getOnboardingState(userId: string) {
    await ensureOnboardingBootstrapped();
    const user = await authRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found.', 'USER_NOT_FOUND');

    const session = await onboardingRepository.getOnboardingSession(userId);
    const myStores = await this.getMyStoresDashboard(userId);
    const plans = await onboardingRepository.listPlans();

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        userType: user.userType,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
      onboarding: session || {
        userId: user.id,
        email: user.email,
        status: 'IN_PROGRESS',
        currentStep: user.emailVerifiedAt ? 'EMAIL_VERIFIED' : 'REGISTERED',
        completedSteps: user.emailVerifiedAt ? ['REGISTERED', 'EMAIL_VERIFIED'] : ['REGISTERED'],
      },
      myStores,
      availableThemes: DEFAULT_STORE_THEMES,
      plans,
    };
  },

  // Strictly derives tenant stores from server-side StoreMembership for authenticated userId
  async getMyStoresDashboard(userId: string): Promise<Array<ProvisionedBundle & { myRoleSlug: string }>> {
    await ensureOnboardingBootstrapped();
    const memberships = await rbacRepository.listMembershipsByUser(userId);
    const bundles: Array<ProvisionedBundle & { myRoleSlug: string }> = [];

    for (const m of memberships) {
      const bundle = await onboardingRepository.getProvisionedBundle(m.tenantId);
      if (bundle) {
        bundles.push({
          ...bundle,
          myRoleSlug: m.roleSlug,
        });
      }
    }

    return bundles;
  },

  async getOfficialStoreSummary() {
    await ensureOnboardingBootstrapped();
    const bundle = await onboardingRepository.getProvisionedBundle(OFFICIAL_STORE_TENANT_ID);
    return {
      officialStore: bundle,
      isolationContract: {
        ownershipModel: 'PLATFORM_OWNED_OFFICIAL',
        sharesPlatformAdminPermissions: false,
        dedicatedOwnerAccountType: 'MERCHANT',
        description:
          'NEXORA Official Store is provisioned as a separate flagship retail store. Its staff hold store-scoped permissions only and never inherit platform administration permissions.',
      },
    };
  },

  async listPlatformStores() {
    await ensureOnboardingBootstrapped();
    const items = await onboardingRepository.listAllStores();
    return items.map((entry) => ({
      ...entry,
      ownershipLabel: entry.tenant.isOfficialStore
        ? 'Platform-Owned Official Store'
        : 'Independent Merchant Tenant',
    }));
  },

  async suspendStore(
    tenantId: string,
    reason: string,
    actor: { userId: string; email: string; roleSlug: string },
    ipAddress: string
  ) {
    await ensureOnboardingBootstrapped();
    const existing = await onboardingRepository.findTenantById(tenantId);
    if (!existing) throw new NotFoundError('Target tenant store not found.', 'TENANT_NOT_FOUND');

    const updated = await onboardingRepository.updateTenantLifecycleStatus(
      tenantId,
      'SUSPENDED',
      actor.userId,
      reason
    );

    await rbacRepository.recordAdminActivity({
      scope: 'PLATFORM',
      tenantId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.roleSlug,
      action: 'STORE_SUSPENDED',
      resourceType: 'TenantStore',
      resourceId: tenantId,
      outcome: 'ALLOWED',
      reason,
      ipAddress,
    });

    return updated;
  },

  async activateStore(
    tenantId: string,
    actor: { userId: string; email: string; roleSlug: string },
    ipAddress: string
  ) {
    await ensureOnboardingBootstrapped();
    const existing = await onboardingRepository.findTenantById(tenantId);
    if (!existing) throw new NotFoundError('Target tenant store not found.', 'TENANT_NOT_FOUND');

    const updated = await onboardingRepository.updateTenantLifecycleStatus(
      tenantId,
      'ACTIVE',
      actor.userId
    );

    await rbacRepository.recordAdminActivity({
      scope: 'PLATFORM',
      tenantId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.roleSlug,
      action: 'STORE_ACTIVATED',
      resourceType: 'TenantStore',
      resourceId: tenantId,
      outcome: 'ALLOWED',
      reason: 'Store reactivated by platform governance.',
      ipAddress,
    });

    return updated;
  },

  async getPublicStorefrontBySlug(slug: string) {
    await ensureOnboardingBootstrapped();
    const tenant = await onboardingRepository.findTenantBySlug(slug);
    if (!tenant) {
      throw new NotFoundError(`Storefront "${slug}" was not found.`, 'STORE_NOT_FOUND');
    }
    if (tenant.status === 'SUSPENDED') {
      throw new ForbiddenError(
        `Store "${tenant.name}" is currently suspended.`,
        'STORE_SUSPENDED'
      );
    }
    const bundle = await onboardingRepository.getProvisionedBundle(tenant.id);
    if (!bundle) {
      throw new NotFoundError(`Storefront "${slug}" configuration unavailable.`, 'STORE_NOT_FOUND');
    }
    return {
      store: {
        name: bundle.store.name,
        slug: bundle.store.slug,
        currency: bundle.store.currency,
        locale: bundle.store.locale,
        timezone: bundle.store.timezone,
        status: bundle.store.status,
        isOfficialStore: bundle.store.isOfficialStore,
      },
      theme: bundle.theme,
      shippingMethod: bundle.defaultShippingMethod,
    };
  },
};
