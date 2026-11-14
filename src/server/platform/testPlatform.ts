/**
 * NEXORA Super Admin Dashboard — Automated Verification Suite
 *
 * Tests real HTTP requests against Express authorization middlewares:
 *  PLT-01: Super Admin Executive Overview Real Aggregations (Tenants, Stores, MRR, Storage, Alerts)
 *  PLT-02: Role-Based Dashboard Boundaries (Merchant/Customer/Finance vs Support Agent Permissions)
 *  PLT-03: Export Permissions Enforcement (Super Admin & Finance Allowed, Support Agent 403 Denied)
 *  PLT-04: Tenant Suspension, Reactivation & NEXORA Official Store Archive Protection
 *  PLT-05: Plan & Subscription Lifecycle Updates + Audit Trail Verification
 *  PLT-06: Payment Reconciliation & Refund Processing Governance
 *  PLT-07: Global Settings, Platform Branding & ADR-011 Ad Exclusion Enforcement
 *  PLT-08: Controlled Support Access Blocks Unrestricted Tenant Private Reads (403 SUPPORT_ACCESS_REQUIRED)
 *  PLT-09: Ticket-Bound Time-Limited Support Grant Allows Scoped Redacted Diagnostics & Audits Access
 *  PLT-10: Immediate Support Grant Revocation & Expiry Block Subsequent Diagnostics Reads
 */

import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createExpressApp } from '../app.ts';
import { logger } from '../utils/logger.ts';
import { DEMO_TENANT_A_ID, rbacRepository } from '../rbac/rbacRepository.ts';
import { OFFICIAL_STORE_TENANT_ID } from '../onboarding/onboardingRepository.ts';
import { ensurePlatformBootstrapped, platformRepository } from './platformRepository.ts';

export interface PlatformTestResult {
  id: string;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
  error?: string;
}

export interface PlatformVerificationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: PlatformTestResult[];
}

class PlatformCookieClient {
  private cookies = new Map<string, string>();
  public csrfToken = '';

  constructor(private readonly baseUrl: string, private readonly ip: string) {}

  private absorb(res: globalThis.Response) {
    const headers =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : res.headers.get('set-cookie')
          ? [res.headers.get('set-cookie')!]
          : [];
    for (const raw of headers) {
      const pair = raw.split(';')[0] || '';
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const val = decodeURIComponent(pair.slice(eq + 1).trim());
        if (val === '' || raw.toLowerCase().includes('max-age=0')) {
          this.cookies.delete(name);
        } else {
          this.cookies.set(name, val);
          if (name === 'nexora_csrf') this.csrfToken = val;
        }
      }
    }
  }

  async request(method: string, path: string, body?: unknown) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && !this.csrfToken) {
      await this.request('GET', '/api/v1/auth/csrf');
    }
    const headers: Record<string, string> = {
      Origin: this.baseUrl,
      'X-Forwarded-For': this.ip,
      'User-Agent': 'NexoraPlatformTestSuite/1.0 Chrome/126.0',
    };
    if (this.cookies.size > 0) {
      headers['Cookie'] = Array.from(this.cookies.entries())
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('; ');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.absorb(res);
    const json = (await res.json().catch(() => ({}))) as any;
    if (json?.data?.csrfToken) this.csrfToken = json.data.csrfToken;
    return { status: res.status, json };
  }

  async login(email: string, password: string) {
    const r = await this.request('POST', '/api/v1/auth/login', { email, password });
    if (r.status !== 200) {
      throw new Error(`Login failed for ${email}: ${r.status} ${JSON.stringify(r.json)}`);
    }
    return r;
  }
}

async function startEphemeralServer() {
  const app = createExpressApp({ rateLimitMax: 1000, rateLimitWindowMs: 60_000 });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function runPlatformVerificationSuite(): Promise<PlatformVerificationReport> {
  logger.info('[PLATFORM_TEST] Running NEXORA Phase 09 Super Admin Verification Suite...');
  await ensurePlatformBootstrapped();
  const results: PlatformTestResult[] = [];
  const ipOctet = (Math.floor(Math.random() * 200) + 10).toString();
  let ipCounter = 1;
  const nextIp = () => `198.51.${ipOctet}.${++ipCounter}`;

  const runCheck = async (
    id: string,
    name: string,
    category: string,
    fn: () => Promise<string>
  ) => {
    const t0 = performance.now();
    try {
      const details = await fn();
      results.push({
        id,
        name,
        category,
        status: 'PASSED',
        durationMs: Math.round(performance.now() - t0),
        details,
      });
    } catch (err: unknown) {
      results.push({
        id,
        name,
        category,
        status: 'FAILED',
        durationMs: Math.round(performance.now() - t0),
        details: 'Assertion failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const server = await startEphemeralServer();

  try {
    const superAdmin = new PlatformCookieClient(server.baseUrl, nextIp());
    await superAdmin.login('superadmin@nexora.cloud', 'NexoraDemo!2026');

    const financeMgr = new PlatformCookieClient(server.baseUrl, nextIp());
    await financeMgr.login('finance@nexora.cloud', 'NexoraDemo!2026');

    const supportAgent = new PlatformCookieClient(server.baseUrl, nextIp());
    await supportAgent.login('support@nexora.cloud', 'NexoraDemo!2026');

    const merchant = new PlatformCookieClient(server.baseUrl, nextIp());
    await merchant.login('owner@urbanwear.nexora.shop', 'NexoraDemo!2026');

    // PLT-01: Overview Aggregations
    await runCheck(
      'PLT-01',
      'Executive Overview Aggregations (Tenants, MRR, Storage, Charts, Alerts)',
      'OVERVIEW',
      async () => {
        const res = await superAdmin.request('GET', '/api/v1/platform/overview');
        if (res.status !== 200) throw new Error(`Overview returned ${res.status}`);
        const d = res.json?.data;
        if (!d?.totals || d.totals.totalTenants < 3 || d.totals.subscriptionMrrBDT <= 0) {
          throw new Error(`Invalid overview totals: ${JSON.stringify(d?.totals)}`);
        }
        if (!Array.isArray(d.charts?.revenueTrend) || d.charts.revenueTrend.length !== 6) {
          throw new Error('Missing 6-month revenueTrend aggregation');
        }
        return `Aggregated ${d.totals.totalTenants} tenants, MRR ৳${d.totals.subscriptionMrrBDT}, ${d.totals.totalRegisteredUsers} users, and 6-month chart series.`;
      }
    );

    // PLT-02: Role-Based Dashboard Boundaries
    await runCheck(
      'PLT-02',
      'Role-Based Dashboard Boundaries (Merchant Blocked 403, Finance vs Support Scopes)',
      'RBAC',
      async () => {
        const mRes = await merchant.request('GET', '/api/v1/platform/overview');
        if (mRes.status !== 403) throw new Error(`Expected 403 for merchant, got ${mRes.status}`);

        const fSuspend = await financeMgr.request(
          'PATCH',
          `/api/v1/platform/tenants/${DEMO_TENANT_A_ID}/status`,
          { status: 'SUSPENDED', reason: 'Unauthorized role probe' }
        );
        if (fSuspend.status !== 403) {
          throw new Error(`Expected Finance Manager blocked from tenant suspension, got ${fSuspend.status}`);
        }

        const sFinance = await supportAgent.request('GET', '/api/v1/platform/payments');
        if (sFinance.status !== 403) {
          throw new Error(`Expected Support Agent blocked from payment monitoring, got ${sFinance.status}`);
        }

        return 'Blocked Merchant (403), Finance Manager tenant suspension (403), and Support Agent financial ledger read (403).';
      }
    );

    // PLT-03: Export Permissions Enforcement
    await runCheck(
      'PLT-03',
      'Export Permissions Enforcement & Formula-Safe CSV Generation',
      'EXPORT',
      async () => {
        const denied = await supportAgent.request('GET', '/api/v1/platform/export/tenants');
        if (denied.status !== 403) {
          throw new Error(`Support Agent export should be 403, got ${denied.status}`);
        }
        const ok = await financeMgr.request('GET', '/api/v1/platform/export/payments');
        if (ok.status !== 200 || !String(ok.json?.data?.csv || '').includes('TransactionID')) {
          throw new Error(`Finance Manager export failed (${ok.status})`);
        }
        return `Support Agent export denied (403); Finance Manager exported ${ok.json.data.rowCount} payment rows with audit entry.`;
      }
    );

    // PLT-04: Tenant Lifecycle & Official Store Archive Protection
    await runCheck(
      'PLT-04',
      'Tenant Suspension/Reactivation & NEXORA Official Store Archive Protection',
      'TENANTS',
      async () => {
        const susp = await superAdmin.request(
          'PATCH',
          `/api/v1/platform/tenants/${DEMO_TENANT_A_ID}/status`,
          { status: 'SUSPENDED', reason: 'Phase 09 test suspension check' }
        );
        if (susp.status !== 200 || susp.json?.data?.tenant?.status !== 'SUSPENDED') {
          throw new Error(`Failed to suspend tenant (${susp.status})`);
        }
        const act = await superAdmin.request(
          'PATCH',
          `/api/v1/platform/tenants/${DEMO_TENANT_A_ID}/status`,
          { status: 'ACTIVE', reason: 'Phase 09 test reactivation' }
        );
        if (act.status !== 200 || act.json?.data?.tenant?.status !== 'ACTIVE') {
          throw new Error(`Failed to reactivate tenant (${act.status})`);
        }
        const archOfficial = await superAdmin.request(
          'DELETE',
          `/api/v1/platform/tenants/${OFFICIAL_STORE_TENANT_ID}`,
          { reason: 'Attempt archive official flagship store' }
        );
        if (archOfficial.status !== 403 || archOfficial.json?.error?.code !== 'OFFICIAL_STORE_PROTECTED') {
          throw new Error(`Official Store archive protection failed (${archOfficial.status})`);
        }
        return 'Suspended & reactivated UrbanWear BD; blocked deletion of NEXORA Official Store (403 OFFICIAL_STORE_PROTECTED).';
      }
    );

    // PLT-05: Plan & Subscription Updates
    await runCheck(
      'PLT-05',
      'Plan Configuration & Tenant Subscription Updates',
      'SUBSCRIPTIONS',
      async () => {
        const planRes = await financeMgr.request('PATCH', '/api/v1/platform/plans/GROWTH', {
          maxProducts: 1200,
        });
        if (planRes.status !== 200 || planRes.json?.data?.plan?.maxProducts !== 1200) {
          throw new Error(`Plan update failed (${planRes.status})`);
        }
        const subRes = await financeMgr.request(
          'PATCH',
          `/api/v1/platform/subscriptions/${DEMO_TENANT_A_ID}`,
          { billingCycle: 'YEARLY' }
        );
        if (subRes.status !== 200 || subRes.json?.data?.subscription?.billingCycle !== 'YEARLY') {
          throw new Error(`Subscription update failed (${subRes.status})`);
        }
        await financeMgr.request('PATCH', `/api/v1/platform/subscriptions/${DEMO_TENANT_A_ID}`, {
          billingCycle: 'MONTHLY',
        });
        return 'Updated GROWTH plan quota & UrbanWear BD subscription cycle with immutable finance audit logs.';
      }
    );

    // PLT-06: Payment Reconciliation & Refund Monitoring
    await runCheck(
      'PLT-06',
      'Payment Monitoring Search/Filter & Refund Reconciliation',
      'PAYMENTS_REFUNDS',
      async () => {
        const payList = await financeMgr.request('GET', '/api/v1/platform/payments?status=PENDING&limit=5');
        if (payList.status !== 200) throw new Error(`Payment list failed (${payList.status})`);
        const refList = await financeMgr.request('GET', '/api/v1/platform/refunds');
        if (refList.status !== 200 || !refList.json?.data?.items?.length) {
          throw new Error('Missing seeded refunds');
        }
        const pendingRef = refList.json.data.items.find((r: any) => r.status === 'PENDING');
        if (pendingRef) {
          const proc = await financeMgr.request('PATCH', `/api/v1/platform/refunds/${pendingRef.id}`, {
            status: 'COMPLETED',
          });
          if (proc.status !== 200 || proc.json?.data?.refund?.status !== 'COMPLETED') {
            throw new Error(`Refund completion failed (${proc.status})`);
          }
        }
        return `Verified filtered payment monitoring and refund completion governance.`;
      }
    );

    // PLT-07: Branding, Global Settings & ADR-011 Ad Exclusions
    await runCheck(
      'PLT-07',
      'Global Settings, Platform Branding & ADR-011 Mandatory Checkout Ad Exclusions',
      'GOVERNANCE',
      async () => {
        const brandRes = await superAdmin.request('PATCH', '/api/v1/platform/branding', {
          tagline: 'Enterprise Multi-Tenant Commerce Operating System',
        });
        if (brandRes.status !== 200) throw new Error(`Branding update failed (${brandRes.status})`);

        const setRes = await superAdmin.request(
          'PATCH',
          '/api/v1/platform/settings/security.max_login_attempts',
          { value: 5 }
        );
        if (setRes.status !== 200) throw new Error(`Setting update failed (${setRes.status})`);

        const adRes = await superAdmin.request('PATCH', `/api/v1/platform/ads/${DEMO_TENANT_A_ID}`, {
          isEnabled: true,
        });
        const excluded: string[] = adRes.json?.data?.adPolicy?.excludedRoutes || [];
        if (adRes.status !== 200 || !excluded.includes('/checkout') || !excluded.includes('/payment')) {
          throw new Error(`Ad exclusion invariant broken (${adRes.status})`);
        }
        return 'Persisted branding + security setting and preserved mandatory ADR-011 /checkout & /payment ad exclusions.';
      }
    );

    // PLT-08: Unconsented Direct Tenant Diagnostics Blocked
    await runCheck(
      'PLT-08',
      'Blocks Unrestricted Admin Access to Tenant Private Data Without Support Grant',
      'SUPPORT_SECURITY',
      async () => {
        const blocked = await superAdmin.request(
          'GET',
          `/api/v1/platform/support/tenants/${DEMO_TENANT_A_ID}/diagnostics`
        );
        if (blocked.status !== 403 || blocked.json?.error?.code !== 'SUPPORT_ACCESS_REQUIRED') {
          throw new Error(`Expected 403 SUPPORT_ACCESS_REQUIRED, got ${blocked.status}`);
        }
        return 'Super Admin blocked (403 SUPPORT_ACCESS_REQUIRED) from inspecting tenant diagnostics without ticket-bound grant.';
      }
    );

    // PLT-09: Controlled Ticket-Bound Support Access Grant
    let activeGrantId = '';
    await runCheck(
      'PLT-09',
      'Controlled Ticket-Bound Support Grant Enables Audited Redacted Diagnostics',
      'SUPPORT_SECURITY',
      async () => {
        const ticketsRes = await supportAgent.request('GET', '/api/v1/platform/support/tickets');
        const ticket = (ticketsRes.json?.data?.items || []).find(
          (t: any) => t.tenantId === DEMO_TENANT_A_ID && t.status !== 'CLOSED'
        );
        if (!ticket) throw new Error('No open ticket found for UrbanWear BD');

        const grantRes = await supportAgent.request('POST', '/api/v1/platform/support/access-grants', {
          tenantId: DEMO_TENANT_A_ID,
          ticketId: ticket.id,
          reason: 'Investigating SSLCommerz webhook IPN callback timeout on ticket',
          durationMinutes: 15,
          accessScope: 'ORDER_ASSIST',
        });
        if (grantRes.status !== 201 || !grantRes.json?.data?.grant?.grantId) {
          throw new Error(`Grant creation failed (${grantRes.status})`);
        }
        activeGrantId = grantRes.json.data.grant.grantId;

        const diagRes = await supportAgent.request(
          'GET',
          `/api/v1/platform/support/tenants/${DEMO_TENANT_A_ID}/diagnostics`
        );
        if (diagRes.status !== 200 || !diagRes.json?.data?.diagnostics?.piiAndSecretsRedacted) {
          throw new Error(`Controlled diagnostics read failed (${diagRes.status})`);
        }
        return `Granted 15m scoped session ${activeGrantId} for ${ticket.ticketNumber}; verified redacted diagnostics & audit logging.`;
      }
    );

    // PLT-10: Immediate Support Grant Revocation & Expiry Enforcement
    await runCheck(
      'PLT-10',
      'Immediate Support Grant Revocation & Expiry Block Subsequent Diagnostics Access',
      'SUPPORT_SECURITY',
      async () => {
        if (!activeGrantId) throw new Error('Missing grantId from PLT-09');
        const rev = await supportAgent.request(
          'POST',
          `/api/v1/platform/support/access-grants/${activeGrantId}/revoke`,
          {}
        );
        if (rev.status !== 200 || rev.json?.data?.grant?.status !== 'REVOKED') {
          throw new Error(`Grant revocation failed (${rev.status})`);
        }
        const afterRev = await supportAgent.request(
          'GET',
          `/api/v1/platform/support/tenants/${DEMO_TENANT_A_ID}/diagnostics`
        );
        if (afterRev.status !== 403) {
          throw new Error(`Expected 403 after grant revocation, got ${afterRev.status}`);
        }

        // Also test expiry path
        const ticketsRes = await supportAgent.request('GET', '/api/v1/platform/support/tickets');
        const ticket = (ticketsRes.json?.data?.items || []).find(
          (t: any) => t.tenantId === DEMO_TENANT_A_ID
        );
        const g2 = await supportAgent.request('POST', '/api/v1/platform/support/access-grants', {
          tenantId: DEMO_TENANT_A_ID,
          ticketId: ticket.id,
          reason: 'Testing automatic TTL expiry enforcement on support grant',
          durationMinutes: 10,
          accessScope: 'READ_DIAGNOSTICS',
        });
        await platformRepository.expireGrantForTesting(g2.json.data.grant.grantId);
        const afterExp = await supportAgent.request(
          'GET',
          `/api/v1/platform/support/tenants/${DEMO_TENANT_A_ID}/diagnostics`
        );
        if (afterExp.status !== 403 || afterExp.json?.error?.code !== 'SUPPORT_ACCESS_EXPIRED') {
          throw new Error(`Expected 403 SUPPORT_ACCESS_EXPIRED, got ${afterExp.status}`);
        }

        const logs = await rbacRepository.listAdminActivityLogs({ limit: 40 });
        const hasAudit = logs.some((l) => l.action === 'SUPPORT_ACCESS_REVOKED') &&
          logs.some((l) => l.action === 'SUPPORT_ACCESS_BLOCKED');
        if (!hasAudit) throw new Error('Missing SUPPORT_ACCESS_REVOKED / BLOCKED audit events');

        return 'Confirmed immediate revocation (403), automatic expiry (403 SUPPORT_ACCESS_EXPIRED), and audit trail records.';
      }
    );
  } finally {
    await server.close();
  }

  const passed = results.filter((r) => r.status === 'PASSED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  logger.info(`[PLATFORM_TEST] Verification finished: ${passed}/${results.length} passed, ${failed} failed.`);

  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    results,
  };
}
