/**
 * NEXORA Automatic Tenant Store Creation — Automated Verification Suite
 *
 * Tests 10 real-HTTP end-to-end scenarios against Express middleware:
 *  ONB-01: Full 11-Step Business Owner Journey & Dashboard Redirect
 *  ONB-02: Duplicate Email Registration & Client-Supplied Tenant/Role Tampering Prevention
 *  ONB-03: Slug Normalization & Reserved Slug Protection
 *  ONB-04: Slug Collision Detection & Unique Alternative Suggestions
 *  ONB-05: Transaction-Safe Partial Failure Atomic Rollback (Zero Orphans)
 *  ONB-06: Idempotent Retry Recovery After Rollback & Replay After Success
 *  ONB-07: Default Currency, Locale, Timezone & Onboarding Progress Persistence
 *  ONB-08: Store Status Lifecycle — Suspension & Activation Enforcement
 *  ONB-09: Segregated NEXORA Official Store Isolation (No Shared Platform Permissions)
 *  ONB-10: Cross-Tenant Isolation Between Newly Provisioned Stores
 */

import http from 'node:http';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createExpressApp } from '../app.ts';
import { logger } from '../utils/logger.ts';
import {
  ensureOnboardingBootstrapped,
  onboardingRepository,
  OFFICIAL_STORE_OWNER_EMAIL,
  OFFICIAL_STORE_TENANT_ID,
} from './onboardingRepository.ts';

export type OnboardingTestCategory =
  | 'USER_JOURNEY'
  | 'DUPLICATE_PREVENTION'
  | 'SLUG_POLICY'
  | 'TRANSACTIONS_ROLLBACK'
  | 'IDEMPOTENCY'
  | 'LIFECYCLE'
  | 'OFFICIAL_STORE_ISOLATION';

export interface OnboardingTestResult {
  id: string;
  name: string;
  category: OnboardingTestCategory;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
}

interface HttpResult {
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
}

class OnboardingHttpClient {
  private cookies = new Map<string, string>();
  private csrfToken = '';

  constructor(private readonly baseUrl: string, private readonly fakeIp: string) {}

  private buildCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private captureCookies(setCookieHeaders?: string[]) {
    if (!setCookieHeaders) return;
    for (const raw of setCookieHeaders) {
      const [pair] = raw.split(';');
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        const name = pair.slice(0, eqIdx).trim();
        const value = pair.slice(eqIdx + 1).trim();
        if (value === '') this.cookies.delete(name);
        else this.cookies.set(name, value);
        if (name.includes('csrf') && value) {
          this.csrfToken = decodeURIComponent(value).replace(/^s:/, '').split('.')[0];
        }
      }
    }
  }

  async ensureCsrf(): Promise<void> {
    if (this.csrfToken) return;
    const res = await this.request('GET', '/api/v1/auth/csrf');
    if (res.body?.data?.csrfToken) this.csrfToken = res.body.data.csrfToken;
  }

  async request(method: string, path: string, body?: unknown): Promise<HttpResult> {
    if (method !== 'GET' && !this.csrfToken) {
      await this.ensureCsrf();
    }

    const url = new URL(path, this.baseUrl);
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      Origin: this.baseUrl,
      'User-Agent': 'NEXORA-Onboarding-Suite/1.0',
      'X-Forwarded-For': this.fakeIp,
    };
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) headers.Cookie = cookieHeader;
    if (method !== 'GET' && this.csrfToken) headers['X-CSRF-Token'] = this.csrfToken;
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    return new Promise((resolve, reject) => {
      const req = http.request(url, { method, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          this.captureCookies(res.headers['set-cookie']);
          const rawText = Buffer.concat(chunks).toString('utf8');
          let parsed: any = null;
          try {
            parsed = rawText ? JSON.parse(rawText) : null;
          } catch {
            parsed = rawText;
          }
          if (parsed?.data?.csrfToken) this.csrfToken = parsed.data.csrfToken;
          resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

export async function runOnboardingVerificationSuite(): Promise<{
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: OnboardingTestResult[];
}> {
  await ensureOnboardingBootstrapped();

  const app = createExpressApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const runNonce = randomUUID().slice(0, 6);
  const results: OnboardingTestResult[] = [];
  let ipCounter = 50;
  const nextIp = () => `198.51.102.${ipCounter++}`;

  const runCase = async (
    id: string,
    name: string,
    category: OnboardingTestCategory,
    fn: () => Promise<string>
  ) => {
    const start = Date.now();
    try {
      const details = await fn();
      results.push({ id, name, category, status: 'PASSED', durationMs: Date.now() - start, details });
    } catch (err: any) {
      results.push({
        id,
        name,
        category,
        status: 'FAILED',
        durationMs: Date.now() - start,
        details: err?.message || String(err),
      });
    }
  };

  let ownerAClient: OnboardingHttpClient;
  let ownerAEmail = `merchant.a.${runNonce}@nexora.shop`;
  let ownerATenantId = '';
  let ownerASlug = `dhaka-linen-${runNonce}`;
  let ownerAIdemKey = `idem_owner_a_${runNonce}`;

  let ownerBClient: OnboardingHttpClient;
  let ownerBEmail = `merchant.b.${runNonce}@nexora.shop`;
  let ownerBTenantId = '';
  let ownerBSlug = `bengal-ceramics-${runNonce}`;

  try {
    // ONB-01: Full 11-Step Business Owner Journey & Dashboard Redirect
    await runCase(
      'ONB-01',
      'End-to-End 11-Step Business Owner Store Creation & Dashboard Redirect',
      'USER_JOURNEY',
      async () => {
        ownerAClient = new OnboardingHttpClient(baseUrl, nextIp());

        // Step 1: Register
        const reg = await ownerAClient.request('POST', '/api/v1/onboarding/register', {
          fullName: 'Amina Sultana',
          email: ownerAEmail,
          password: 'StrongMerchant!2026',
          phone: '+8801711000111',
        });
        assert(reg.status === 201, `Expected 201 on register, got ${reg.status}`);
        assert(reg.body.data.onboarding.currentStep === 'REGISTERED', 'Step should be REGISTERED');
        const verifyToken = reg.body.data.verificationTokenPreview;
        assert(typeof verifyToken === 'string' && verifyToken.length > 10, 'Expected verification token');

        // Step 2: Email Verification
        const ver = await ownerAClient.request('POST', '/api/v1/onboarding/verify-email', {
          token: verifyToken,
        });
        assert(ver.status === 200, `Expected 200 on email verify, got ${ver.status}`);
        assert(ver.body.data.onboarding.currentStep === 'EMAIL_VERIFIED', 'Step should advance to EMAIL_VERIFIED');

        // Login to acquire HttpOnly session cookie
        const login = await ownerAClient.request('POST', '/api/v1/auth/login', {
          email: ownerAEmail,
          password: 'StrongMerchant!2026',
        });
        assert(login.status === 200, `Expected 200 on login, got ${login.status}`);

        // Step 3: Business Information Form
        const biz = await ownerAClient.request('POST', '/api/v1/onboarding/business-info', {
          legalBusinessName: 'Dhaka Linen Collective Ltd.',
          category: 'Apparel & Textiles',
          country: 'Bangladesh',
          currency: 'BDT',
          locale: 'en-BD',
          timezone: 'Asia/Dhaka',
        });
        assert(biz.status === 200, `Expected 200 saving business info, got ${biz.status}`);
        assert(biz.body.data.onboarding.currentStep === 'BUSINESS_INFO_SAVED', 'Step should be BUSINESS_INFO_SAVED');

        // Steps 4 & 5: Store Name & Unique Slug Check
        const slugCheck = await ownerAClient.request('POST', '/api/v1/onboarding/check-slug', {
          storeName: `Dhaka Linen ${runNonce}`,
          customSlug: ownerASlug,
          themeCode: 'nexora-atelier',
        });
        assert(slugCheck.status === 200 && slugCheck.body.data.available === true, 'Slug should be available');

        // Steps 6-11: Transaction-Safe Provisioning (Free Plan, Tenant, Theme, Settings, Owner Membership, Redirect)
        const prov = await ownerAClient.request('POST', '/api/v1/onboarding/provision', {
          storeName: `Dhaka Linen ${runNonce}`,
          storeSlug: ownerASlug,
          themeCode: 'nexora-atelier',
          idempotencyKey: ownerAIdemKey,
        });
        assert(prov.status === 201, `Expected 201 provisioning store, got ${prov.status}: ${JSON.stringify(prov.body)}`);
        const d = prov.body.data;
        ownerATenantId = d.tenant.id;
        assert(d.plan.code === 'STARTER' && d.plan.priceMonthlyBDT === 0, 'Expected STARTER free plan');
        assert(d.subscription.status === 'ACTIVE', 'Expected active subscription association');
        assert(d.theme.themeCode === 'nexora-atelier', 'Expected default theme assigned');
        assert(d.store.currency === 'BDT' && d.store.locale === 'en-BD' && d.store.timezone === 'Asia/Dhaka', 'Expected BDT/en-BD/Asia/Dhaka defaults');
        assert(d.ownerMembership.roleSlug === 'store_owner' && d.rolesCount === 8, 'Expected store_owner membership + 8 tenant roles');
        assert(d.dashboardUrl === `/dashboard/stores/${ownerASlug}`, 'Expected dashboard redirect URL');

        // Verify RBAC permissions immediately recognize Owner A on newly provisioned store
        const rbacProducts = await ownerAClient.request('GET', `/api/v1/rbac/tenants/${ownerATenantId}/products`);
        assert(rbacProducts.status === 200, `Expected 200 on new store RBAC route, got ${rbacProducts.status}`);

        return `Provisioned ${ownerASlug}.nexora.shop (Plan: STARTER, Roles: ${d.rolesCount}, Redirect: ${d.dashboardUrl}).`;
      }
    );

    // ONB-02: Duplicate Registration & Browser-Supplied Tenant/Owner/Role Tampering Rejection
    await runCase(
      'ONB-02',
      'Duplicate Registration Blocked & Client-Supplied Tenant/Owner Fields Rejected',
      'DUPLICATE_PREVENTION',
      async () => {
        const dupReg = await ownerAClient.request('POST', '/api/v1/onboarding/register', {
          fullName: 'Duplicate Amina',
          email: ownerAEmail,
          password: 'StrongMerchant!2026',
        });
        assert(dupReg.status === 409, `Expected 409 on duplicate email, got ${dupReg.status}`);

        // Browser attempts to forge tenantId, ownerUserId, isOfficialStore, planId in provision body
        const tamper = await ownerAClient.request('POST', '/api/v1/onboarding/provision', {
          storeName: 'Tamper Store',
          storeSlug: `tamper-${runNonce}`,
          idempotencyKey: `idem_tamper_${runNonce}`,
          tenantId: OFFICIAL_STORE_TENANT_ID,
          isOfficialStore: true,
        });
        assert(
          tamper.status === 400 || tamper.status === 422,
          `Expected 400/422 strict validation rejection on client-supplied tenantId/isOfficialStore, got ${tamper.status}`
        );

        return 'Blocked duplicate email (409) and rejected forged tenantId/isOfficialStore payload.';
      }
    );

    // ONB-03: Slug Normalization & Reserved Slug Protection
    await runCase(
      'ONB-03',
      'Slug Normalization (Diacritics/Symbols) & Reserved Slug Protection',
      'SLUG_POLICY',
      async () => {
        const normCheck = await ownerAClient.request('POST', '/api/v1/onboarding/check-slug', {
          storeName: 'Café & Co. Studio!!',
        });
        assert(
          normCheck.status === 200 && normCheck.body.data.normalizedSlug === 'cafe-and-co-studio',
          `Expected normalized slug 'cafe-and-co-studio', got ${normCheck.body?.data?.normalizedSlug}`
        );

        for (const reserved of ['Admin', 'NEXORA Official', 'api', 'checkout', 'platform']) {
          const resCheck = await ownerAClient.request('POST', '/api/v1/onboarding/check-slug', {
            storeName: reserved,
          });
          assert(
            resCheck.status === 200 && resCheck.body.data.available === false && resCheck.body.data.isReserved === true,
            `Expected reserved block for "${reserved}"`
          );
          assert(Array.isArray(resCheck.body.data.suggestions) && resCheck.body.data.suggestions.length > 0, 'Expected alternative slug suggestions');
        }

        const directReservedProvision = await ownerAClient.request('POST', '/api/v1/onboarding/provision', {
          storeName: 'NEXORA Official',
          storeSlug: 'nexora-official',
          idempotencyKey: `idem_reserved_${runNonce}`,
        });
        assert(
          directReservedProvision.status === 403 && directReservedProvision.body?.error?.code === 'RESERVED_STORE_SLUG',
          `Expected 403 RESERVED_STORE_SLUG, got ${directReservedProvision.status}`
        );

        return 'Normalized diacritics/symbols and blocked all reserved platform/official slugs with 403.';
      }
    );

    // ONB-04: Slug Collision Detection & Unique Suggestions
    await runCase(
      'ONB-04',
      'Slug Collision Detection & Unique Candidate Generation Across Owners',
      'SLUG_POLICY',
      async () => {
        ownerBClient = new OnboardingHttpClient(baseUrl, nextIp());
        const regB = await ownerBClient.request('POST', '/api/v1/onboarding/register', {
          fullName: 'Tariq Karim',
          email: ownerBEmail,
          password: 'StrongMerchant!2026',
        });
        assert(regB.status === 201, 'Owner B registration failed');

        await ownerBClient.request('POST', '/api/v1/onboarding/verify-email', {
          token: regB.body.data.verificationTokenPreview,
        });
        await ownerBClient.request('POST', '/api/v1/auth/login', {
          email: ownerBEmail,
          password: 'StrongMerchant!2026',
        });

        const collisionCheck = await ownerBClient.request('POST', '/api/v1/onboarding/check-slug', {
          storeName: ownerASlug,
        });
        assert(
          collisionCheck.body.data.available === false && collisionCheck.body.data.isReserved === false,
          'Collision check should report slug already taken'
        );
        assert(
          collisionCheck.body.data.suggestions.length >= 2 &&
            !collisionCheck.body.data.suggestions.includes(ownerASlug),
          'Expected non-colliding alternative slug suggestions'
        );

        const collideProv = await ownerBClient.request('POST', '/api/v1/onboarding/provision', {
          storeName: 'Hijack Dhaka Linen',
          storeSlug: ownerASlug,
          idempotencyKey: `idem_collide_${runNonce}`,
        });
        assert(
          collideProv.status === 409 && collideProv.body?.error?.code === 'SLUG_ALREADY_TAKEN',
          `Expected 409 SLUG_ALREADY_TAKEN, got ${collideProv.status}`
        );

        return `Blocked slug collision on "${ownerASlug}" (409) and generated ${collisionCheck.body.data.suggestions.length} free alternatives.`;
      }
    );

    // ONB-05: Partial Failure Atomic Rollback (Zero Orphans)
    await runCase(
      'ONB-05',
      'Transaction-Safe Partial Failure Rolls Back All Records (Zero Orphans)',
      'TRANSACTIONS_ROLLBACK',
      async () => {
        const failSlug = `atomic-fail-${runNonce}`;
        const failRes = await ownerBClient.request('POST', '/api/v1/onboarding/provision', {
          storeName: 'Bengal Ceramics Studio',
          storeSlug: failSlug,
          currency: 'USD',
          locale: 'en-US',
          timezone: 'America/New_York',
          idempotencyKey: `idem_retry_b_${runNonce}`,
          simulateFailureAtStep: 'ASSIGN_DEFAULT_THEME',
        });
        assert(failRes.status === 500, `Expected 500 on simulated failure, got ${failRes.status}`);

        const orphans = await onboardingRepository.inspectOrphansBySlug(failSlug);
        assert(
          orphans.tenants === 0 && orphans.stores === 0 && orphans.subscriptions === 0 && orphans.themes === 0,
          `Orphan records leaked after partial failure: ${JSON.stringify(orphans)}`
        );

        const state = await ownerBClient.request('GET', '/api/v1/onboarding/state');
        assert(
          state.body.data.onboarding.status === 'FAILED_ROLLED_BACK',
          `Expected onboarding status FAILED_ROLLED_BACK, got ${state.body?.data?.onboarding?.status}`
        );

        return 'Injected failure at ASSIGN_DEFAULT_THEME; verified 0 tenants, 0 stores, 0 subscriptions, 0 themes remained.';
      }
    );

    // ONB-06: Idempotent Retry Recovery After Rollback & Replay After Success
    await runCase(
      'ONB-06',
      'Idempotent Retry Recovers Cleanly After Failure & Replays Safely After Success',
      'IDEMPOTENCY',
      async () => {
        const idemKeyB = `idem_retry_b_${runNonce}`;

        // Retry with same idempotencyKey without failure injection using final slug
        const recovered = await ownerBClient.request('POST', '/api/v1/onboarding/provision', {
          storeName: 'Bengal Ceramics Studio',
          storeSlug: ownerBSlug,
          currency: 'USD',
          locale: 'en-US',
          timezone: 'America/New_York',
          themeCode: 'nexora-dhaka-craft',
          idempotencyKey: idemKeyB,
        });
        assert(recovered.status === 201 && recovered.body.data.idempotentReplay === false, `Expected 201 recovery, got ${recovered.status}`);
        ownerBTenantId = recovered.body.data.tenant.id;

        // Replay exact same request again -> 200 idempotentReplay: true, identical IDs, 0 duplicates
        const replay = await ownerBClient.request('POST', '/api/v1/onboarding/provision', {
          storeName: 'Bengal Ceramics Studio',
          storeSlug: ownerBSlug,
          currency: 'USD',
          locale: 'en-US',
          timezone: 'America/New_York',
          themeCode: 'nexora-dhaka-craft',
          idempotencyKey: idemKeyB,
        });
        assert(replay.status === 200 && replay.body.data.idempotentReplay === true, `Expected 200 idempotentReplay=true, got ${replay.status}`);
        assert(replay.body.data.tenant.id === ownerBTenantId, 'Replay returned mismatched tenantId');

        const counts = await onboardingRepository.inspectOrphansBySlug(ownerBSlug);
        assert(counts.tenants === 1 && counts.stores === 1 && counts.subscriptions === 1, 'Replay created duplicate records');

        return `Recovered cleanly after rollback and confirmed idempotent replay (1 tenant, 1 store, 1 subscription).`;
      }
    );

    // ONB-07: Default Currency, Locale, Timezone & Onboarding Progress
    await runCase(
      'ONB-07',
      'Store Currency, Locale, Timezone & Server-Derived My-Stores Dashboard',
      'USER_JOURNEY',
      async () => {
        const myStoresB = await ownerBClient.request('GET', '/api/v1/onboarding/my-stores');
        assert(myStoresB.status === 200 && myStoresB.body.data.stores.length === 1, 'Expected 1 server-resolved store for Owner B');
        const storeB = myStoresB.body.data.stores[0];
        assert(
          storeB.store.currency === 'USD' &&
            storeB.store.locale === 'en-US' &&
            storeB.store.timezone === 'America/New_York',
          'Expected custom USD / en-US / America/New_York settings'
        );
        assert(
          storeB.tenant.onboardingProgress.currentStep === 'COMPLETED' &&
            storeB.tenant.onboardingProgress.completedSteps.includes('OWNER_MEMBERSHIP_CREATED'),
          'Expected completed onboarding progress milestones'
        );

        return 'Verified USD/en-US/America/New_York store settings and COMPLETED onboarding progress milestones.';
      }
    );

    // ONB-08: Store Status Suspension & Activation Lifecycle
    await runCase(
      'ONB-08',
      'Platform Store Suspension Blocks Storefront & Tenant Ops; Activation Restores',
      'LIFECYCLE',
      async () => {
        // Non-platform owner cannot suspend stores
        const unauthSuspend = await ownerAClient.request('POST', `/api/v1/onboarding/tenants/${ownerBTenantId}/suspend`, {
          reason: 'Unauthorized attempt',
        });
        assert(unauthSuspend.status === 403, `Expected 403 blocking merchant from suspending store, got ${unauthSuspend.status}`);

        // Platform Super Admin suspends Owner B's store
        const superClient = new OnboardingHttpClient(baseUrl, nextIp());
        await superClient.request('POST', '/api/v1/auth/login', {
          email: 'superadmin@nexora.cloud',
          password: 'NexoraDemo!2026',
        });

        const suspend = await superClient.request('POST', `/api/v1/onboarding/tenants/${ownerBTenantId}/suspend`, {
          reason: 'Compliance verification hold',
        });
        assert(suspend.status === 200 && suspend.body.data.tenant.status === 'SUSPENDED', 'Store should be SUSPENDED');

        // Public storefront and Owner B RBAC access are both blocked while suspended
        const sfBlocked = await ownerBClient.request('GET', `/api/v1/onboarding/storefront/${ownerBSlug}`);
        assert(sfBlocked.status === 403 && sfBlocked.body?.error?.code === 'STORE_SUSPENDED', `Expected 403 STORE_SUSPENDED on storefront, got ${sfBlocked.status}`);

        const opsBlocked = await ownerBClient.request('GET', `/api/v1/rbac/tenants/${ownerBTenantId}/products`);
        assert(opsBlocked.status === 403 && opsBlocked.body?.error?.code === 'STORE_SUSPENDED', `Expected 403 STORE_SUSPENDED on tenant ops, got ${opsBlocked.status}`);

        // Reactivate
        const activate = await superClient.request('POST', `/api/v1/onboarding/tenants/${ownerBTenantId}/activate`, {});
        assert(activate.status === 200 && activate.body.data.tenant.status === 'ACTIVE', 'Store should be ACTIVE after reactivation');

        const sfRestored = await ownerBClient.request('GET', `/api/v1/onboarding/storefront/${ownerBSlug}`);
        assert(sfRestored.status === 200, 'Storefront should resolve 200 after reactivation');

        return 'Verified SUSPENDED blocks storefront & merchant ops (403 STORE_SUSPENDED) and activation restores 200.';
      }
    );

    // ONB-09: Segregated NEXORA Official Store Isolation
    await runCase(
      'ONB-09',
      'NEXORA Official Store Segregated Without Shared Platform Admin Permissions',
      'OFFICIAL_STORE_ISOLATION',
      async () => {
        const summary = await ownerAClient.request('GET', '/api/v1/onboarding/official-store');
        assert(summary.status === 200, 'Expected 200 for official store summary');
        const off = summary.body.data.officialStore;
        assert(
          off.tenant.isOfficialStore === true &&
            off.tenant.storeOwnershipType === 'PLATFORM_OWNED_OFFICIAL' &&
            summary.body.data.isolationContract.sharesPlatformAdminPermissions === false,
          'Official store must carry PLATFORM_OWNED_OFFICIAL flag and isolation contract'
        );

        // 1. Official Store Merchant Owner CANNOT access Platform Admin endpoints
        const officialOwnerClient = new OnboardingHttpClient(baseUrl, nextIp());
        const offLogin = await officialOwnerClient.request('POST', '/api/v1/auth/login', {
          email: OFFICIAL_STORE_OWNER_EMAIL,
          password: 'NexoraDemo!2026',
        });
        assert(offLogin.status === 200, 'Official Store owner login failed');

        const platformAttempt = await officialOwnerClient.request('GET', '/api/v1/onboarding/tenants');
        assert(
          platformAttempt.status === 403 && platformAttempt.body?.error?.code === 'PLATFORM_ACCESS_REQUIRED',
          `Official Store owner must NOT hold platform admin permissions, got ${platformAttempt.status}`
        );

        // 2. Platform Super Admin does NOT automatically hold tenant-level store permissions on Official Store
        const superClient = new OnboardingHttpClient(baseUrl, nextIp());
        await superClient.request('POST', '/api/v1/auth/login', {
          email: 'superadmin@nexora.cloud',
          password: 'NexoraDemo!2026',
        });
        const superIntoOfficialStore = await superClient.request(
          'POST',
          `/api/v1/rbac/tenants/${OFFICIAL_STORE_TENANT_ID}/products`,
          { title: 'Bypass Test', sku: 'BYP-01', priceBDT: 999, stockQty: 5 }
        );
        assert(
          superIntoOfficialStore.status === 403,
          `Platform Super Admin must not implicitly share Official Store tenant permissions, got ${superIntoOfficialStore.status}`
        );

        return 'Confirmed NEXORA Official Store merchant lacks platform:* (403) and Platform Admin lacks implicit store product:create (403).';
      }
    );

    // ONB-10: Cross-Tenant Isolation Between Newly Provisioned Stores
    await runCase(
      'ONB-10',
      'Cross-Tenant Isolation Enforced Immediately on Newly Provisioned Stores',
      'OFFICIAL_STORE_ISOLATION',
      async () => {
        const crossRead = await ownerAClient.request('GET', `/api/v1/rbac/tenants/${ownerBTenantId}/products`);
        assert(
          crossRead.status === 403 && crossRead.body?.error?.code === 'CROSS_TENANT_ACCESS_DENIED',
          `Expected 403 CROSS_TENANT_ACCESS_DENIED when Owner A reads Owner B store, got ${crossRead.status}`
        );

        const crossCreate = await ownerBClient.request('POST', `/api/v1/rbac/tenants/${ownerATenantId}/products`, {
          title: 'Cross-Tenant Inject',
          sku: 'X-INJ-01',
          priceBDT: 500,
          stockQty: 1,
        });
        assert(
          crossCreate.status === 403 && crossCreate.body?.error?.code === 'CROSS_TENANT_ACCESS_DENIED',
          `Expected 403 CROSS_TENANT_ACCESS_DENIED when Owner B writes to Owner A store, got ${crossCreate.status}`
        );

        return 'Blocked Owner A <-> Owner B cross-tenant reads and writes with 403 CROSS_TENANT_ACCESS_DENIED.';
      }
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const passed = results.filter((r) => r.status === 'PASSED').length;
  const failed = results.length - passed;
  logger.info(`[ONBOARDING_TEST] Verification finished: ${passed}/${results.length} passed, ${failed} failed.`);

  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    results,
  };
}
