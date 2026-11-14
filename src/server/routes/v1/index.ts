/**
 * NEXORA Multi-Tenant SaaS E-Commerce Platform
 * API v1 Router Aggregator
 */

import { Router, Request, Response } from 'express';
import { healthRouter } from '../health.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import { getTenantContext } from '../../middleware/tenantContext.ts';

import { databaseRouter } from './database.ts';
import { securityRouter } from './security.ts';
import { authRouter } from './auth.ts';
import { rbacRouter } from './rbac.ts';
import { onboardingRouter } from './onboarding.ts';
import { platformRouter } from './platform.ts';

export const v1Router = Router();

// 1. Health check mounted under /api/v1/health
v1Router.use('/health', healthRouter);

// 2. Database verification and dictionary mounted under /api/v1/database
v1Router.use('/database', databaseRouter);

// 3. Security foundation status, CSRF tokens, and live verification suite
v1Router.use('/security', securityRouter);

// 4. Authentication, sessions, MFA/TOTP, lockout, and device management
v1Router.use('/auth', authRouter);

// 5. Granular RBAC, platform/tenant permissions, invitations & ownership checks
v1Router.use('/rbac', rbacRouter);

// 6. Automatic tenant store onboarding, provisioning & official store
v1Router.use('/onboarding', onboardingRouter);

// 7. Super Admin platform governance, billing, monitoring & controlled support access
v1Router.use('/platform', platformRouter);

// 4. API v1 Root Info & Directory
v1Router.get('/', (_req: Request, res: Response) => {
  const context = getTenantContext();
  sendSuccess(res, {
    api: 'NEXORA Master Multi-Tenant API',
    version: 'v1.0.0',
    documentation: '/docs',
    tenantContext: context ?? null,
    availableDomains: [
      { domain: 'health', path: '/api/v1/health', description: 'Application & subsystem health' },
      { domain: 'database', path: '/api/v1/database', description: 'Database dictionary, verification tests, and seed' },
      { domain: 'security', path: '/api/v1/security', description: 'Security checklist, CSRF token, and automated test suite' },
      { domain: 'auth', path: '/api/v1/auth', description: 'Authentication, MFA, and session tokens' },
      { domain: 'rbac', path: '/api/v1/rbac', description: 'Granular RBAC, roles, invitations, and resource authorization' },
      { domain: 'onboarding', path: '/api/v1/onboarding', description: 'Automatic tenant store provisioning & NEXORA Official Store' },
      { domain: 'platform', path: '/api/v1/platform', description: 'Platform Super Admin operations' },
      { domain: 'tenant', path: '/api/v1/tenant', description: 'Merchant Admin operations & inventory' },
      { domain: 'storefront', path: '/api/v1/storefront', description: 'Public shopper storefront catalog' },
      { domain: 'webhooks', path: '/api/v1/webhooks', description: 'Payment gateway webhook listeners' },
    ],
  });
});
