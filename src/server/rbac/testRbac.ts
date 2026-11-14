/**
 * NEXORA RBAC & Resource Authorization - Automated Security Test Suite
 *
 * Tests real HTTP requests against Express authorization middlewares:
 *  1. 14-Role Matrix Completeness (4 Platform, 8 Tenant, 2 Storefront)
 *  2. Privilege Escalation Blocking (Tenant -> Platform, Admin -> Owner, Client Tampering, Platform Perms in Tenant Role)
 *  3. Cross-Tenant Isolation (Tenant A Owner/Admin blocked from Tenant B resources & IDs)
 *  4. Resource Ownership & Anti-IDOR Enforcement (Customer Order IDOR, Staff update:own vs update:any)
 *  5. Store-Scoped Granular Permissions (Inventory vs Product vs Marketing vs Order Managers)
 *  6. Platform-Level Granular Permissions (Finance Manager vs Support Agent vs Super Admin)
 *  7. Staff Invitation Flow, Email Ownership Guard, Immediate Access & Revocation
 *  8. Custom Role Creation, Dynamic Permission Editing & Role Reassignment
 *  9. Guest & Customer Storefront Boundaries
 * 10. Immutable Admin Activity Audit Logs Verification
 */

import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createExpressApp } from '../app.ts';
import { logger } from '../utils/logger.ts';
import { hashPassword } from '../security/password.ts';
import { authRepository } from '../auth/authRepository.ts';
import {
  DEMO_TENANT_A_ID,
  DEMO_TENANT_B_ID,
  ensureRbacBootstrapped,
} from './rbacRepository.ts';
import { ROLE_DEFINITIONS } from './permissions.ts';

export type RbacTestCategory =
  | 'MATRIX'
  | 'ESCALATION'
  | 'CROSS_TENANT'
  | 'IDOR_OWNERSHIP'
  | 'STORE_PERMISSIONS'
  | 'PLATFORM_PERMISSIONS'
  | 'INVITATIONS'
  | 'AUDIT_LOGS';

export interface RbacTestResult {
  id: string;
  name: string;
  category: RbacTestCategory;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
  error?: string;
}

export interface RbacVerificationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: RbacTestResult[];
}

class CookieClient {
  private cookies = new Map<string, string>();
  public csrfToken = '';
  private ip: string;

  constructor(private baseUrl: string, ip: string) {
    this.ip = ip;
  }

  private absorb(res: globalThis.Response) {
    const headers =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
    for (const raw of headers) {
      const part = raw.split(';')[0] || '';
      const eq = part.indexOf('=');
      if (eq > 0) {
        const name = part.slice(0, eq).trim();
        const val = decodeURIComponent(part.slice(eq + 1).trim());
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
    const headers: Record<string, string> = {
      'X-Forwarded-For': this.ip,
      'User-Agent': 'NexoraRbacTestSuite/1.0 Chrome/126.0',
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
      throw new Error(`Demo login failed for ${email}: ${r.status} ${JSON.stringify(r.json)}`);
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

export async function runRbacVerificationSuite(): Promise<RbacVerificationReport> {
  logger.info('[RBAC_TEST] Running NEXORA Phase 07 RBAC & Resource Authorization Suite...');
  await ensureRbacBootstrapped();
  const results: RbacTestResult[] = [];
  const runTag = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const ipOctet = (Math.floor(Math.random() * 200) + 10).toString();
  let ipCounter = 1;
  const nextIp = () => `198.51.${ipOctet}.${++ipCounter}`;

  const runCheck = async (
    id: string,
    name: string,
    category: RbacTestCategory,
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

  const createVerifiedUser = async (opts: {
    email: string;
    fullName: string;
    password: string;
    userType?: 'MERCHANT' | 'CUSTOMER';
  }) => {
    const hash = await hashPassword(opts.password);
    const user = await authRepository.createUser({
      email: opts.email,
      fullName: opts.fullName,
      passwordHash: hash,
      userType: opts.userType || 'MERCHANT',
      status: 'ACTIVE',
    });
    await authRepository.updateUser(user.id, { status: 'ACTIVE', emailVerifiedAt: new Date() });
    return user;
  };

  try {
    // RBAC-01: 14-Role Matrix Verification
    await runCheck(
      'RBAC-01',
      'Canonical 14-Role Matrix (4 Platform, 8 Tenant, 2 Storefront)',
      'MATRIX',
      async () => {
        const guest = new CookieClient(server.baseUrl, nextIp());
        const ov = await guest.request('GET', '/api/v1/rbac/overview');
        if (ov.status !== 200) throw new Error(`Overview returned ${ov.status}`);
        const roles: Array<{ slug: string; scope: string }> = ov.json?.data?.systemRoles || [];
        const platformCount = roles.filter((r) => r.scope === 'PLATFORM').length;
        const tenantCount = roles.filter((r) => r.scope === 'TENANT').length;
        const storefrontCount = roles.filter((r) => r.scope === 'STOREFRONT').length;
        if (roles.length !== 14 || platformCount !== 4 || tenantCount !== 8 || storefrontCount !== 2) {
          throw new Error(`Expected 14 roles (4P/8T/2S), got ${roles.length} (${platformCount}/${tenantCount}/${storefrontCount})`);
        }
        return `Verified ${ROLE_DEFINITIONS.length} system roles across PLATFORM (4), TENANT (8), and STOREFRONT (2).`;
      }
    );

    // RBAC-02: Privilege Escalation Blocking
    await runCheck(
      'RBAC-02',
      'Blocks Tenant->Platform, Admin->Owner, PlatformAdmin->SuperAdmin & Role Tampering',
      'ESCALATION',
      async () => {
        // 1. Tenant Store Owner attempting platform role assignment
        const ownerA = new CookieClient(server.baseUrl, nextIp());
        await ownerA.login('owner@urbanwear.nexora.shop', 'NexoraDemo!2026');
        const t2p = await ownerA.request('POST', '/api/v1/rbac/platform/roles/assign', {
          email: 'owner@urbanwear.nexora.shop',
          roleSlug: 'super_admin',
        });
        if (t2p.status !== 403 || t2p.json?.error?.code !== 'PLATFORM_ACCESS_REQUIRED') {
          throw new Error(`Tenant->Platform escalation not blocked (${t2p.status})`);
        }

        // 2. Tenant Store Owner attempting to assign 'super_admin' inside tenant member endpoint
        const tenantAssignPlatform = await ownerA.request(
          'POST',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/members/${(await authRepository.findUserByEmail('catalog@urbanwear.nexora.shop'))!.id}/role`,
          { roleSlug: 'super_admin' }
        );
        if (tenantAssignPlatform.status !== 403 || tenantAssignPlatform.json?.error?.code !== 'PRIVILEGE_ESCALATION_BLOCKED') {
          throw new Error(`Tenant assigning platform role returned ${tenantAssignPlatform.status}`);
        }

        // 3. Tenant attempting to inject 'platform:roles:assign' into a custom tenant role
        const injectPlatformPerm = await ownerA.request(
          'POST',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/roles`,
          {
            name: 'Rogue Role',
            slug: `rogue_${runTag}`.slice(0, 24),
            permissionCodes: ['product:read', 'platform:roles:assign'],
          }
        );
        if (injectPlatformPerm.status !== 403 || injectPlatformPerm.json?.error?.code !== 'PRIVILEGE_ESCALATION_BLOCKED') {
          throw new Error(`Platform perm injection into tenant role returned ${injectPlatformPerm.status}`);
        }

        // 4. Store Admin cannot promote anyone to Store Owner
        const adminEmail = `storeadmin_${runTag}@nexora.shop`;
        const adminUser = await createVerifiedUser({
          email: adminEmail,
          fullName: 'Store Admin',
          password: 'RbacTest!2026',
        });
        await ownerA.request(
          'POST',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/members/${adminUser.id}/role`,
          { roleSlug: 'store_admin' }
        );
        const adminClient = new CookieClient(server.baseUrl, nextIp());
        await adminClient.login(adminEmail, 'RbacTest!2026');
        const promoteToOwner = await adminClient.request(
          'POST',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/members/${adminUser.id}/role`,
          { roleSlug: 'store_owner' }
        );
        if (promoteToOwner.status !== 403 || promoteToOwner.json?.error?.code !== 'PRIVILEGE_ESCALATION_BLOCKED') {
          throw new Error(`Store Admin->Store Owner escalation returned ${promoteToOwner.status}`);
        }

        // 5. Platform Admin cannot promote self or others to Super Admin
        const superAdmin = new CookieClient(server.baseUrl, nextIp());
        await superAdmin.login('superadmin@nexora.cloud', 'NexoraDemo!2026');
        const pAdminEmail = `padmin_${runTag}@nexora.cloud`;
        await createVerifiedUser({ email: pAdminEmail, fullName: 'Platform Admin', password: 'RbacTest!2026' });
        await superAdmin.request('POST', '/api/v1/rbac/platform/roles/assign', {
          email: pAdminEmail,
          roleSlug: 'platform_admin',
        });
        const pAdminClient = new CookieClient(server.baseUrl, nextIp());
        await pAdminClient.login(pAdminEmail, 'RbacTest!2026');
        const pAdminEsc = await pAdminClient.request('POST', '/api/v1/rbac/platform/roles/assign', {
          email: pAdminEmail,
          roleSlug: 'super_admin',
        });
        if (pAdminEsc.status !== 403 || pAdminEsc.json?.error?.code !== 'PRIVILEGE_ESCALATION_BLOCKED') {
          throw new Error(`Platform Admin->Super Admin escalation returned ${pAdminEsc.status}`);
        }

        return 'Blocked all 5 privilege-escalation vectors with HTTP 403.';
      }
    );

    // RBAC-03: Cross-Tenant Isolation
    await runCheck(
      'RBAC-03',
      'Cross-Tenant Isolation Blocks Tenant A Owner from Tenant B Resources',
      'CROSS_TENANT',
      async () => {
        const ownerA = new CookieClient(server.baseUrl, nextIp());
        await ownerA.login('owner@urbanwear.nexora.shop', 'NexoraDemo!2026');

        const readBProducts = await ownerA.request('GET', `/api/v1/rbac/tenants/${DEMO_TENANT_B_ID}/products`);
        if (readBProducts.status !== 403 || readBProducts.json?.error?.code !== 'CROSS_TENANT_ACCESS_DENIED') {
          throw new Error(`Expected 403 reading Tenant B products, got ${readBProducts.status}`);
        }

        const readBMembers = await ownerA.request('GET', `/api/v1/rbac/tenants/${DEMO_TENANT_B_ID}/members`);
        if (readBMembers.status !== 403) {
          throw new Error(`Expected 403 reading Tenant B members, got ${readBMembers.status}`);
        }

        // Cross-tenant IDOR: passing Tenant B productId into Tenant A endpoint
        const crossIdor = await ownerA.request(
          'PATCH',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/products/prod_lt_201`,
          { priceBDT: 1 }
        );
        if (crossIdor.status !== 403 || crossIdor.json?.error?.code !== 'CROSS_TENANT_ACCESS_DENIED') {
          throw new Error(`Cross-tenant product mutation returned ${crossIdor.status}`);
        }

        return 'Blocked Tenant A Owner from Tenant B endpoints and cross-tenant product IDOR (403 CROSS_TENANT_ACCESS_DENIED).';
      }
    );

    // RBAC-04: Resource Ownership & Anti-IDOR Enforcement
    await runCheck(
      'RBAC-04',
      'Anti-IDOR Ownership Enforcement (Customer Orders & Staff Own Products)',
      'IDOR_OWNERSHIP',
      async () => {
        const custA = new CookieClient(server.baseUrl, nextIp());
        await custA.login('buyer1@nexora.shop', 'NexoraDemo!2026');

        // Customer A can read own order ord_uw_9001
        const ownOrder = await custA.request('GET', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/orders/ord_uw_9001`);
        if (ownOrder.status !== 200) {
          throw new Error(`Customer A could not read own order (${ownOrder.status})`);
        }

        // Customer A attempting IDOR read on Customer B's order ord_uw_9002 -> MUST fail 403
        const idorRead = await custA.request('GET', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/orders/ord_uw_9002`);
        if (idorRead.status !== 403 || idorRead.json?.error?.code !== 'RESOURCE_OWNERSHIP_DENIED') {
          throw new Error(`Customer order IDOR read returned ${idorRead.status}`);
        }

        // Customer A attempting IDOR cancel on Customer B's order -> MUST fail 403
        const idorCancel = await custA.request('PATCH', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/orders/ord_uw_9002/cancel`);
        if (idorCancel.status !== 403 || idorCancel.json?.error?.code !== 'RESOURCE_OWNERSHIP_DENIED') {
          throw new Error(`Customer order IDOR cancel returned ${idorCancel.status}`);
        }

        // Store Staff (product:update:own only) cannot edit Product Manager's product prod_uw_101
        const ownerA = new CookieClient(server.baseUrl, nextIp());
        await ownerA.login('owner@urbanwear.nexora.shop', 'NexoraDemo!2026');
        const staffUser = await createVerifiedUser({
          email: `staff_${runTag}@nexora.shop`,
          fullName: 'Junior Staff',
          password: 'RbacTest!2026',
        });
        await ownerA.request(
          'POST',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/members/${staffUser.id}/role`,
          { roleSlug: 'store_staff' }
        );
        const staffClient = new CookieClient(server.baseUrl, nextIp());
        await staffClient.login(`staff_${runTag}@nexora.shop`, 'RbacTest!2026');
        const editOthersProd = await staffClient.request(
          'PATCH',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/products/prod_uw_101`,
          { title: 'Tampered Title' }
        );
        if (editOthersProd.status !== 403 || editOthersProd.json?.error?.code !== 'RESOURCE_OWNERSHIP_DENIED') {
          throw new Error(`Store Staff editing another user's product returned ${editOthersProd.status}`);
        }

        return 'Allowed Customer A own order, blocked order IDOR read/cancel (403) and Store Staff non-owned product modification (403).';
      }
    );

    // RBAC-05: Store-Scoped Granular Permissions
    await runCheck(
      'RBAC-05',
      'Store-Scoped Granular Permissions (Inventory vs Marketing vs Product Managers)',
      'STORE_PERMISSIONS',
      async () => {
        const ownerA = new CookieClient(server.baseUrl, nextIp());
        await ownerA.login('owner@urbanwear.nexora.shop', 'NexoraDemo!2026');

        const invUser = await createVerifiedUser({
          email: `inv_${runTag}@nexora.shop`,
          fullName: 'Inventory Mgr',
          password: 'RbacTest!2026',
        });
        const mktUser = await createVerifiedUser({
          email: `mkt_${runTag}@nexora.shop`,
          fullName: 'Marketing Mgr',
          password: 'RbacTest!2026',
        });

        await ownerA.request('POST', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/members/${invUser.id}/role`, {
          roleSlug: 'inventory_manager',
        });
        await ownerA.request('POST', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/members/${mktUser.id}/role`, {
          roleSlug: 'marketing_manager',
        });

        const invClient = new CookieClient(server.baseUrl, nextIp());
        await invClient.login(`inv_${runTag}@nexora.shop`, 'RbacTest!2026');

        const stockOk = await invClient.request(
          'PATCH',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/products/prod_uw_101/inventory`,
          { stockQty: 75 }
        );
        const invCreateProd = await invClient.request(
          'POST',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/products`,
          { title: 'Illegal Item', sku: 'ILL-1', priceBDT: 500, stockQty: 5 }
        );
        if (stockOk.status !== 200 || invCreateProd.status !== 403) {
          throw new Error(`Inventory manager expected 200/403, got ${stockOk.status}/${invCreateProd.status}`);
        }

        const mktClient = new CookieClient(server.baseUrl, nextIp());
        await mktClient.login(`mkt_${runTag}@nexora.shop`, 'RbacTest!2026');

        const couponOk = await mktClient.request(
          'POST',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/marketing/coupons`,
          { code: 'EID25', discountPercent: 25 }
        );
        const mktStockDeny = await mktClient.request(
          'PATCH',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/products/prod_uw_101/inventory`,
          { stockQty: 1 }
        );
        if (couponOk.status !== 201 || mktStockDeny.status !== 403) {
          throw new Error(`Marketing manager expected 201/403, got ${couponOk.status}/${mktStockDeny.status}`);
        }

        return 'Verified strict separation: Inventory Manager (stock=200, createProduct=403) & Marketing Manager (coupon=201, stock=403).';
      }
    );

    // RBAC-06: Platform-Level Permissions
    await runCheck(
      'RBAC-06',
      'Platform Role Boundaries (Super Admin vs Finance Manager vs Support Agent)',
      'PLATFORM_PERMISSIONS',
      async () => {
        const finance = new CookieClient(server.baseUrl, nextIp());
        await finance.login('finance@nexora.cloud', 'NexoraDemo!2026');

        const finOk = await finance.request('GET', '/api/v1/rbac/platform/finance/summary');
        const finAssignDeny = await finance.request('POST', '/api/v1/rbac/platform/roles/assign', {
          email: 'support@nexora.cloud',
          roleSlug: 'platform_admin',
        });
        if (finOk.status !== 200 || finAssignDeny.status !== 403) {
          throw new Error(`Finance Manager expected 200/403, got ${finOk.status}/${finAssignDeny.status}`);
        }

        const support = new CookieClient(server.baseUrl, nextIp());
        await support.login('support@nexora.cloud', 'NexoraDemo!2026');
        const supTenantsOk = await support.request('GET', '/api/v1/rbac/platform/tenants');
        const supFinDeny = await support.request('GET', '/api/v1/rbac/platform/finance/summary');
        if (supTenantsOk.status !== 200 || supFinDeny.status !== 403) {
          throw new Error(`Support Agent expected 200/403, got ${supTenantsOk.status}/${supFinDeny.status}`);
        }

        return 'Verified Finance Manager (finance=200, roleAssign=403) and Support Agent (tenants=200, finance=403).';
      }
    );

    // RBAC-07: Staff Invitation Flow & Revocation
    await runCheck(
      'RBAC-07',
      'Staff Invitation Flow, Email Ownership Check, Immediate Access & Revocation',
      'INVITATIONS',
      async () => {
        const ownerA = new CookieClient(server.baseUrl, nextIp());
        await ownerA.login('owner@urbanwear.nexora.shop', 'NexoraDemo!2026');

        const inviteeEmail = `order_invitee_${runTag}@nexora.shop`;
        const invitee = await createVerifiedUser({
          email: inviteeEmail,
          fullName: 'Invited Order Mgr',
          password: 'RbacTest!2026',
        });

        const inviteRes = await ownerA.request(
          'POST',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/invitations`,
          { email: inviteeEmail, roleSlug: 'order_manager' }
        );
        const token = inviteRes.json?.data?.inviteTokenPreview;
        if (inviteRes.status !== 201 || !token) {
          throw new Error(`Invite creation failed (${inviteRes.status})`);
        }

        // Wrong user attempting to accept someone else's invitation -> MUST fail 403 INVITE_EMAIL_MISMATCH
        const buyerClient = new CookieClient(server.baseUrl, nextIp());
        await buyerClient.login('buyer1@nexora.shop', 'NexoraDemo!2026');
        const hijackRes = await buyerClient.request('POST', '/api/v1/rbac/invitations/accept', { token });
        if (hijackRes.status !== 403 || hijackRes.json?.error?.code !== 'INVITE_EMAIL_MISMATCH') {
          throw new Error(`Invitation hijack attempt returned ${hijackRes.status}`);
        }

        // Real invitee accepts token
        const inviteeClient = new CookieClient(server.baseUrl, nextIp());
        await inviteeClient.login(inviteeEmail, 'RbacTest!2026');
        const acceptRes = await inviteeClient.request('POST', '/api/v1/rbac/invitations/accept', { token });
        if (acceptRes.status !== 200) throw new Error(`Invite accept failed: ${acceptRes.status}`);

        // Invitee can now update order status in Tenant A
        const orderUpd = await inviteeClient.request(
          'PATCH',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/orders/ord_uw_9002/status`,
          { status: 'SHIPPED' }
        );
        if (orderUpd.status !== 200) throw new Error(`New Order Manager update failed (${orderUpd.status})`);

        // Owner revokes invitee membership -> next request MUST immediately fail 403
        const revokeRes = await ownerA.request(
          'DELETE',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/members/${invitee.id}`
        );
        if (revokeRes.status !== 200) throw new Error(`Revoke failed: ${revokeRes.status}`);

        const afterRevoke = await inviteeClient.request(
          'GET',
          `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/orders`
        );
        if (afterRevoke.status !== 403) {
          throw new Error(`Expected 403 immediately after membership revocation, got ${afterRevoke.status}`);
        }

        return 'Verified invitation token email binding, immediate Order Manager access upon acceptance, and instant 403 upon revocation.';
      }
    );

    // RBAC-08: Dynamic Custom Role & Permission Updates
    await runCheck(
      'RBAC-08',
      'Custom Role Creation & Dynamic Permission Modification Take Immediate Effect',
      'STORE_PERMISSIONS',
      async () => {
        const ownerA = new CookieClient(server.baseUrl, nextIp());
        await ownerA.login('owner@urbanwear.nexora.shop', 'NexoraDemo!2026');

        const roleSlug = `auditor_${runTag.slice(-6)}`;
        const createRoleRes = await ownerA.request('POST', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/roles`, {
          name: 'Catalog Viewer',
          slug: roleSlug,
          permissionCodes: ['product:read'],
        });
        if (createRoleRes.status !== 201) throw new Error(`Create custom role returned ${createRoleRes.status}`);

        const uEmail = `customrole_${runTag}@nexora.shop`;
        const u = await createVerifiedUser({ email: uEmail, fullName: 'Custom Role User', password: 'RbacTest!2026' });
        await ownerA.request('POST', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/members/${u.id}/role`, {
          roleSlug,
        });

        const uClient = new CookieClient(server.baseUrl, nextIp());
        await uClient.login(uEmail, 'RbacTest!2026');

        const beforeGrant = await uClient.request('GET', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/orders`);
        if (beforeGrant.status !== 403) throw new Error(`Expected 403 before order:read grant, got ${beforeGrant.status}`);

        // Grant order:read dynamically
        await ownerA.request('PATCH', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/roles/${roleSlug}`, {
          permissionCodes: ['product:read', 'order:read'],
        });
        const afterGrant = await uClient.request('GET', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/orders`);
        if (afterGrant.status !== 200) throw new Error(`Expected 200 after order:read grant, got ${afterGrant.status}`);

        return 'Verified custom tenant role creation and live permission enforcement without requiring token reissue.';
      }
    );

    // RBAC-09: Guest & Customer Boundaries
    await runCheck(
      'RBAC-09',
      'Storefront Guest & Customer Boundaries Enforced Server-Side',
      'MATRIX',
      async () => {
        const guest = new CookieClient(server.baseUrl, nextIp());
        const publicCat = await guest.request('GET', `/api/v1/rbac/storefront/${DEMO_TENANT_A_ID}/catalog`);
        const guestProtected = await guest.request('GET', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/products`);
        if (publicCat.status !== 200 || guestProtected.status !== 401) {
          throw new Error(`Guest expected 200/401, got ${publicCat.status}/${guestProtected.status}`);
        }

        const cust = new CookieClient(server.baseUrl, nextIp());
        await cust.login('buyer1@nexora.shop', 'NexoraDemo!2026');
        const custTenantAdmin = await cust.request('GET', `/api/v1/rbac/tenants/${DEMO_TENANT_A_ID}/products`);
        const custPlatform = await cust.request('GET', '/api/v1/rbac/platform/tenants');
        if (custTenantAdmin.status !== 403 || custPlatform.status !== 403) {
          throw new Error(`Customer expected 403/403 on admin endpoints, got ${custTenantAdmin.status}/${custPlatform.status}`);
        }

        return 'Guest allowed public catalog (200) and blocked on protected routes (401); Customer blocked from admin routes (403).';
      }
    );

    // RBAC-10: Admin Activity Logs Capture Allowed & Denied Actions
    await runCheck(
      'RBAC-10',
      'Immutable Admin Activity Logs Record Mutations & Blocked Security Events',
      'AUDIT_LOGS',
      async () => {
        const superAdmin = new CookieClient(server.baseUrl, nextIp());
        await superAdmin.login('superadmin@nexora.cloud', 'NexoraDemo!2026');
        const logsRes = await superAdmin.request('GET', '/api/v1/rbac/platform/activity-logs');
        if (logsRes.status !== 200) throw new Error(`Activity logs returned ${logsRes.status}`);

        const logs: Array<{ action: string }> = logsRes.json?.data?.logs || [];
        const actions = new Set(logs.map((l) => l.action));
        const required = ['PRIVILEGE_ESCALATION_BLOCKED', 'CROSS_TENANT_ACCESS_BLOCKED', 'IDOR_OWNERSHIP_DENIED', 'STAFF_INVITED'];
        const missing = required.filter((a) => !actions.has(a));
        if (missing.length > 0) {
          throw new Error(`Missing audit log actions: ${missing.join(', ')}`);
        }

        return `Verified ${logs.length} audit log records including all blocked escalation, cross-tenant, IDOR, and staff actions.`;
      }
    );
  } finally {
    await server.close();
  }

  const passed = results.filter((r) => r.status === 'PASSED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  logger.info(`[RBAC_TEST] Verification finished: ${passed}/${results.length} passed, ${failed} failed.`);

  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    results,
  };
}
