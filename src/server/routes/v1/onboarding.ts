/**
 * NEXORA Automatic Tenant Store Creation Routes (/api/v1/onboarding)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validateRequest.ts';
import { requireAuth } from '../../middleware/authenticate.ts';
import { requirePlatformPermission } from '../../middleware/authorize.ts';
import { authRateLimiter } from '../../middleware/rateLimiter.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import { mapUserTypeToPlatformRoleSlug } from '../../rbac/permissions.ts';
import { onboardingService } from '../../onboarding/onboardingService.ts';
import { DEFAULT_STORE_THEMES } from '../../onboarding/storeDefaults.ts';
import { runOnboardingVerificationSuite } from '../../onboarding/testOnboarding.ts';

export const onboardingRouter = Router();

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim().slice(0, 64);
  return (req.ip || req.socket.remoteAddress || '127.0.0.1').slice(0, 64);
}

// Strict Zod schemas reject client-supplied tenantId, ownerUserId, roleSlug, isOfficialStore, planId
const RegisterOwnerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(180),
    password: z.string().min(10).max(128),
    phone: z.string().trim().min(6).max(24).optional(),
  })
  .strict();

const VerifyEmailSchema = z
  .object({
    token: z.string().trim().min(16).max(256),
  })
  .strict();

const BusinessInfoSchema = z
  .object({
    legalBusinessName: z.string().trim().min(2).max(120),
    category: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(6).max(24).optional(),
    contactEmail: z.string().trim().email().max(180).optional(),
    country: z.string().trim().min(2).max(80),
    currency: z.enum(['BDT', 'USD', 'EUR', 'GBP']).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    timezone: z.string().trim().min(2).max(64).optional(),
  })
  .strict();

const CheckSlugSchema = z
  .object({
    storeName: z.string().trim().min(2).max(100),
    customSlug: z.string().trim().max(64).optional(),
    themeCode: z.string().trim().max(64).optional(),
  })
  .strict();

const ProvisionStoreSchema = z
  .object({
    storeName: z.string().trim().min(2).max(100),
    storeSlug: z.string().trim().min(2).max(64).optional(),
    legalBusinessName: z.string().trim().min(2).max(120).optional(),
    category: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().min(6).max(24).optional(),
    contactEmail: z.string().trim().email().max(180).optional(),
    country: z.string().trim().min(2).max(80).optional(),
    currency: z.enum(['BDT', 'USD', 'EUR', 'GBP']).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    timezone: z.string().trim().min(2).max(64).optional(),
    themeCode: z.string().trim().max(64).optional(),
    idempotencyKey: z.string().trim().min(8).max(128),
    simulateFailureAtStep: z
      .enum([
        'ASSIGN_FREE_PLAN',
        'CREATE_TENANT',
        'CREATE_STORE_AND_SETTINGS',
        'ASSIGN_DEFAULT_THEME',
        'CREATE_SUBSCRIPTION',
        'CREATE_ROLES_AND_OWNER_MEMBERSHIP',
      ])
      .optional(),
  })
  .strict();

const TenantIdParamSchema = z
  .object({
    tenantId: z.string().trim().min(8).max(64),
  })
  .strict();

const SuspendStoreSchema = z
  .object({
    reason: z.string().trim().min(5).max(300),
  })
  .strict();

const SlugParamSchema = z
  .object({
    slug: z.string().trim().min(2).max(64),
  })
  .strict();

// 1. Public Catalog of Default Store Themes & Reserved Rules
onboardingRouter.get('/presets', (_req: Request, res: Response) => {
  return sendSuccess(res, {
    themes: DEFAULT_STORE_THEMES,
    defaultCurrency: 'BDT',
    defaultLocale: 'en-BD',
    defaultTimezone: 'Asia/Dhaka',
    defaultPlanCode: 'STARTER',
  });
});

// 2. Step 1 — Business Owner Registration
onboardingRouter.post(
  '/register',
  authRateLimiter,
  validateRequest({ body: RegisterOwnerSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await onboardingService.registerBusinessOwner(req.body);
      return sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// 3. Step 2 — Email Verification
onboardingRouter.post(
  '/verify-email',
  validateRequest({ body: VerifyEmailSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await onboardingService.verifyOwnerEmail(req.body.token);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 4. Get Authenticated Onboarding State & My Provisioned Stores
onboardingRouter.get('/state', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await onboardingService.getOnboardingState(req.auth!.userId);
    return sendSuccess(res, state);
  } catch (err) {
    next(err);
  }
});

// 5. Step 3 — Business Information & Store Locale/Currency/Timezone
onboardingRouter.post(
  '/business-info',
  requireAuth,
  validateRequest({ body: BusinessInfoSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await onboardingService.saveBusinessInformation(req.auth!.userId, req.body);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 6. Steps 4 & 5 — Store Name & Unique Slug Check (Protected against reserved & duplicate slugs)
onboardingRouter.post(
  '/check-slug',
  validateRequest({ body: CheckSlugSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await onboardingService.checkAndReserveSlug({
        ...req.body,
        userId: req.auth?.userId,
      });
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 7. Steps 6–11 — Transaction-Safe, Idempotent Automatic Tenant Store Creation
onboardingRouter.post(
  '/provision',
  requireAuth,
  validateRequest({ body: ProvisionStoreSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await onboardingService.provisionStore(
        req.auth!.userId,
        req.body,
        getClientIp(req)
      );
      return sendSuccess(res, result, result.idempotentReplay ? 200 : 201);
    } catch (err) {
      next(err);
    }
  }
);

// 8. My Provisioned Stores (Derived strictly from server-side memberships, never browser tenantId)
onboardingRouter.get('/my-stores', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stores = await onboardingService.getMyStoresDashboard(req.auth!.userId);
    return sendSuccess(res, { stores });
  } catch (err) {
    next(err);
  }
});

// 9. Segregated NEXORA Official Store Summary
onboardingRouter.get('/official-store', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await onboardingService.getOfficialStoreSummary();
    return sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
});

// 10. Public Storefront Resolution by Slug (respects SUSPENDED state)
onboardingRouter.get(
  '/storefront/:slug',
  validateRequest({ params: SlugParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storefront = await onboardingService.getPublicStorefrontBySlug(String(req.params.slug));
      return sendSuccess(res, storefront);
    } catch (err) {
      next(err);
    }
  }
);

// 11. Platform Governance: List All Stores, Suspend, Activate
onboardingRouter.get(
  '/tenants',
  requirePlatformPermission('platform:tenants:read'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stores = await onboardingService.listPlatformStores();
      return sendSuccess(res, { stores });
    } catch (err) {
      next(err);
    }
  }
);

onboardingRouter.post(
  '/tenants/:tenantId/suspend',
  requirePlatformPermission('platform:tenants:manage'),
  validateRequest({ params: TenantIdParamSchema, body: SuspendStoreSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roleSlug = mapUserTypeToPlatformRoleSlug(req.auth!.userType) || 'platform_admin';
      const updated = await onboardingService.suspendStore(
        String(req.params.tenantId),
        req.body.reason,
        { userId: req.auth!.userId, email: req.auth!.email, roleSlug },
        getClientIp(req)
      );
      return sendSuccess(res, { tenant: updated });
    } catch (err) {
      next(err);
    }
  }
);

onboardingRouter.post(
  '/tenants/:tenantId/activate',
  requirePlatformPermission('platform:tenants:manage'),
  validateRequest({ params: TenantIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roleSlug = mapUserTypeToPlatformRoleSlug(req.auth!.userType) || 'platform_admin';
      const updated = await onboardingService.activateStore(
        String(req.params.tenantId),
        { userId: req.auth!.userId, email: req.auth!.email, roleSlug },
        getClientIp(req)
      );
      return sendSuccess(res, { tenant: updated });
    } catch (err) {
      next(err);
    }
  }
);

// 12. Automated Phase 08 Verification Runner
onboardingRouter.post('/verify', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await runOnboardingVerificationSuite();
    return sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
});
