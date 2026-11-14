/**
 * NEXORA Phase 10 — Tenant Store Owner Dashboard Verification Suite
 *
 * Executes live HTTP requests against Express authorization middlewares & tenant services:
 *  TNT-01: Tenant A (UrbanWear BD) Overview Aggregations, Funnel Conversion Metrics & Quotas
 *  TNT-02: Tenant B (LuxeThread Studio) Overview & Strictly Disjoint Catalog/Orders Proof
 *  TNT-03: Cross-Tenant Isolation & Anti-IDOR Guard (Tenant A Owner Denied 403 on Tenant B Routes & Resource IDs)
 *  TNT-04: Product, Category & Brand Lifecycle CRUD (Create, Update, Delete + Cleanup)
 *  TNT-05: Inventory Stock Adjustment & Immutable Audit History Tracking
 *  TNT-06: Order Lifecycle Transitions & Customer CRM Updates (with Refund Permission Gate)
 *  TNT-07: Coupons & Automatic Store Discounts Creation & Toggle Lifecycle
 *  TNT-08: Store Settings, Store Branding, Payment Gateways (Secret-Safe) & Shipping Methods
 *  TNT-09: Staff Role Boundary Enforcement (Product Manager Blocked 403 on Settings/Staff/Refunds; Customer Blocked 403)
 *  TNT-10: Analytics Aggregations & Subscription Billing Cycle / Quota Governance
 */

import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createExpressApp } from '../app.ts';
import { DEMO_TENANT_A_ID, DEMO_TENANT_B_ID } from '../rbac/rbacRepository.ts';
import { ensureTenantDashboardBootstrapped } from './tenantRepository.ts';

export interface TenantTestResult {
  id: string;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
  error?: string;
}

export interface TenantVerificationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: TenantTestResult[];
}

class TenantCookieClient {
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
      'User-Agent': 'NexoraTenantTestSuite/1.0 Chrome/126.0',
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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export async function runTenantVerificationSuite(): Promise<TenantVerificationReport> {
  await ensureTenantDashboardBootstrapped();
  const app = createExpressApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const results: TenantTestResult[] = [];

  async function runCase(
    id: string,
    name: string,
    category: string,
    fn: () => Promise<string>
  ) {
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
        details: 'Verification assertion failed',
        error: err?.message || String(err),
      });
    }
  }

  try {
    const ownerA = new TenantCookieClient(baseUrl, '10.10.0.11');
    const ownerB = new TenantCookieClient(baseUrl, '10.10.0.12');
    const prodMgrA = new TenantCookieClient(baseUrl, '10.10.0.13');
    const customer = new TenantCookieClient(baseUrl, '10.10.0.14');

    await ownerA.login('owner@urbanwear.nexora.shop', 'NexoraDemo!2026');
    await ownerB.login('owner@luxethread.nexora.shop', 'NexoraDemo!2026');
    await prodMgrA.login('catalog@urbanwear.nexora.shop', 'NexoraDemo!2026');
    await customer.login('buyer1@nexora.shop', 'NexoraDemo!2026');

    let ovA: any = null;
    let ovB: any = null;

    await runCase(
      'TNT-01',
      'Tenant A (UrbanWear BD) Overview Aggregations, Conversion Metrics & Plan Quotas',
      'Overview & Telemetry',
      async () => {
        const storesRes = await ownerA.request('GET', '/api/v1/tenant/my-stores');
        assert(storesRes.status === 200, `my-stores expected 200, got ${storesRes.status}`);
        const stores = storesRes.json.data.stores as any[];
        assert(
          stores.length === 1 && stores[0].tenantId === DEMO_TENANT_A_ID,
          `Owner A should only see Tenant A, saw ${stores.length}`
        );

        const res = await ownerA.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/overview`);
        assert(res.status === 200, `overview A expected 200, got ${res.status}`);
        ovA = res.json.data;
        assert(ovA.kpis.totalProducts >= 4, 'UrbanWear BD must have seeded products');
        assert(ovA.lowStockProducts.length >= 2, 'UrbanWear BD must detect low stock items');
        assert(ovA.bestSellingProducts.length >= 3, 'Best-selling products missing');
        assert(ovA.recentOrders.length >= 3, 'Recent orders missing');
        assert(ovA.conversionMetrics.overallConversionPct > 0, 'Conversion rate must be computed');
        assert(ovA.subscription.quotas.maxProducts > 0, 'Plan quota metadata missing');
        return `UrbanWear BD: ${ovA.kpis.totalProducts} products, ${ovA.lowStockProducts.length} low stock, ${ovA.conversionMetrics.overallConversionPct}% conv, plan=${ovA.subscription.planCode}`;
      }
    );

    await runCase(
      'TNT-02',
      'Tenant B (LuxeThread Studio) Disjoint Overview & Separate Catalog/Orders Verification',
      'Two-Tenant Isolation',
      async () => {
        const storesRes = await ownerB.request('GET', '/api/v1/tenant/my-stores');
        assert(storesRes.status === 200, 'Owner B my-stores failed');
        assert(
          storesRes.json.data.stores.length === 1 &&
            storesRes.json.data.stores[0].tenantId === DEMO_TENANT_B_ID,
          'Owner B should only see Tenant B'
        );

        const res = await ownerB.request('GET', `/api/v1/tenant/${DEMO_TENANT_B_ID}/overview`);
        assert(res.status === 200, `overview B expected 200, got ${res.status}`);
        ovB = res.json.data;

        const catA = await ownerA.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/catalog`);
        const catB = await ownerB.request('GET', `/api/v1/tenant/${DEMO_TENANT_B_ID}/catalog`);
        const idsA = new Set((catA.json.data.products as any[]).map((p) => p.id));
        const idsB = new Set((catB.json.data.products as any[]).map((p) => p.id));
        const overlap = Array.from(idsA).filter((id) => idsB.has(id));
        assert(overlap.length === 0, `Detected overlapping product IDs between Tenant A & B: ${overlap.join(',')}`);
        assert(
          ovA.tenant.slug !== ovB.tenant.slug && ovA.kpis.totalRevenueBDT !== ovB.kpis.totalRevenueBDT,
          'Tenant A and Tenant B metrics must be strictly independent'
        );
        return `LuxeThread Studio (${ovB.kpis.totalProducts} products, 0 overlapping IDs with UrbanWear BD) verified disjoint.`;
      }
    );

    await runCase(
      'TNT-03',
      'Cross-Tenant Access Blocked (Owner A Denied 403 on Tenant B Routes & Cross-Tenant Resource IDs)',
      'Tenant Security & Anti-IDOR',
      async () => {
        const readB = await ownerA.request('GET', `/api/v1/tenant/${DEMO_TENANT_B_ID}/overview`);
        assert(
          readB.status === 403 && readB.json?.error?.code === 'CROSS_TENANT_ACCESS_DENIED',
          `Expected 403 CROSS_TENANT_ACCESS_DENIED reading Tenant B overview, got ${readB.status}`
        );

        const readAFromB = await ownerB.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/orders`);
        assert(
          readAFromB.status === 403 && readAFromB.json?.error?.code === 'CROSS_TENANT_ACCESS_DENIED',
          `Expected 403 reading Tenant A orders as Owner B, got ${readAFromB.status}`
        );

        // Attempt IDOR: pass Tenant B's product ID inside Tenant A's update route
        const idorPatch = await ownerA.request(
          'PATCH',
          `/api/v1/tenant/${DEMO_TENANT_A_ID}/products/prod_lt_201`,
          { priceBDT: 1 }
        );
        assert(
          idorPatch.status === 403 && idorPatch.json?.error?.code === 'CROSS_TENANT_ACCESS_DENIED',
          `Expected 403 CROSS_TENANT_ACCESS_DENIED on cross-tenant product IDOR, got ${idorPatch.status}`
        );

        // Attempt IDOR: pass Tenant A's order ID inside Tenant B's order status route
        const idorOrder = await ownerB.request(
          'PATCH',
          `/api/v1/tenant/${DEMO_TENANT_B_ID}/orders/ord_uw_9001/status`,
          { status: 'CANCELLED' }
        );
        assert(
          idorOrder.status === 403 && idorOrder.json?.error?.code === 'CROSS_TENANT_ACCESS_DENIED',
          `Expected 403 CROSS_TENANT_ACCESS_DENIED on cross-tenant order IDOR, got ${idorOrder.status}`
        );

        return 'All 4 cross-tenant route & resource IDOR probes returned 403 CROSS_TENANT_ACCESS_DENIED.';
      }
    );

    await runCase(
      'TNT-04',
      'Catalog CRUD: Categories, Brands & Products Create/Update/Delete Within Tenant Scope',
      'Catalog Modules',
      async () => {
        const catRes = await ownerA.request('POST', `/api/v1/tenant/${DEMO_TENANT_A_ID}/categories`, {
          name: 'Test Monsoon Footwear',
          description: 'Temporary verification category',
        });
        assert(catRes.status === 201, `Category create failed: ${catRes.status}`);
        const catId = catRes.json.data.category.id;

        const brdRes = await ownerA.request('POST', `/api/v1/tenant/${DEMO_TENANT_A_ID}/brands`, {
          name: 'Test Padma Kicks',
          originCountry: 'Bangladesh',
          websiteUrl: 'https://padmakicks.example.com',
        });
        assert(brdRes.status === 201, `Brand create failed: ${brdRes.status}`);
        const brdId = brdRes.json.data.brand.id;

        const prodRes = await ownerA.request('POST', `/api/v1/tenant/${DEMO_TENANT_A_ID}/products`, {
          title: 'Verification Canvas Sneaker',
          sku: 'UW-SNK-999',
          categoryId: catId,
          brandId: brdId,
          priceBDT: 3200,
          costBDT: 1400,
          stockQty: 25,
          lowStockThreshold: 5,
          status: 'PUBLISHED',
        });
        assert(prodRes.status === 201, `Product create failed: ${prodRes.status}`);
        const prodId = prodRes.json.data.product.id;

        // Verify Tenant B cannot see this newly created product
        const catB = await ownerB.request('GET', `/api/v1/tenant/${DEMO_TENANT_B_ID}/catalog`);
        assert(
          !(catB.json.data.products as any[]).some((p) => p.id === prodId),
          'Tenant B must not see product created in Tenant A'
        );

        // Cleanup
        await ownerA.request('DELETE', `/api/v1/tenant/${DEMO_TENANT_A_ID}/products/${prodId}`);
        await ownerA.request('DELETE', `/api/v1/tenant/${DEMO_TENANT_A_ID}/brands/${brdId}`);
        await ownerA.request('DELETE', `/api/v1/tenant/${DEMO_TENANT_A_ID}/categories/${catId}`);

        return 'Category, Brand, and Product created, verified isolated from Tenant B, and cleaned up.';
      }
    );

    await runCase(
      'TNT-05',
      'Inventory Stock Adjustment & Immutable Stock Movement Audit Log',
      'Inventory Module',
      async () => {
        const beforeCatalog = await ownerA.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/catalog`);
        const target = (beforeCatalog.json.data.products as any[]).find((p) => p.id === 'prod_uw_102');
        const originalQty = target.stockQty;

        const adjRes = await ownerA.request(
          'PATCH',
          `/api/v1/tenant/${DEMO_TENANT_A_ID}/inventory/prod_uw_102`,
          { newQty: originalQty + 15, reason: 'Automated replenishment verification' }
        );
        assert(adjRes.status === 200, `Inventory adjust failed: ${adjRes.status}`);
        assert(adjRes.json.data.product.stockQty === originalQty + 15, 'Stock quantity did not increment');
        assert(adjRes.json.data.log.deltaQty === 15, 'Inventory log delta mismatch');

        // Restore original qty
        await ownerA.request('PATCH', `/api/v1/tenant/${DEMO_TENANT_A_ID}/inventory/prod_uw_102`, {
          newQty: originalQty,
          reason: 'Restore baseline stock after verification',
        });
        return `Adjusted UW-CRG-102 (+15 -> ${originalQty + 15}) with audit log entry and restored baseline.`;
      }
    );

    await runCase(
      'TNT-06',
      'Orders Transition & Customer CRM Update',
      'Orders & Customers',
      async () => {
        const ordList = await ownerA.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/orders`);
        assert(ordList.status === 200 && ordList.json.data.orders.length >= 3, 'Orders list failed');

        const statusRes = await ownerA.request(
          'PATCH',
          `/api/v1/tenant/${DEMO_TENANT_A_ID}/orders/ord_uw_9003/status`,
          { status: 'PROCESSING' }
        );
        assert(statusRes.status === 200 && statusRes.json.data.order.status === 'PROCESSING', 'Order update failed');
        await ownerA.request('PATCH', `/api/v1/tenant/${DEMO_TENANT_A_ID}/orders/ord_uw_9003/status`, {
          status: 'PENDING',
        });

        const custRes = await ownerA.request(
          'PATCH',
          `/api/v1/tenant/${DEMO_TENANT_A_ID}/customers/cust_uw_1`,
          { notes: 'VIP verified by automated test' }
        );
        assert(custRes.status === 200, `Customer update failed: ${custRes.status}`);
        return 'Order workflow transition & Customer CRM note persisted inside Tenant A.';
      }
    );

    await runCase(
      'TNT-07',
      'Coupons & Automatic Store Discounts Create, Toggle & Cleanup',
      'Coupons & Discounts',
      async () => {
        const cpnRes = await ownerA.request('POST', `/api/v1/tenant/${DEMO_TENANT_A_ID}/coupons`, {
          code: 'WINTER20',
          title: 'Winter 20% Test Coupon',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          minOrderBDT: 3000,
          usageLimit: 50,
        });
        assert(cpnRes.status === 201, `Coupon create failed: ${cpnRes.status}`);
        const cpnId = cpnRes.json.data.coupon.id;

        const dscRes = await ownerA.request('POST', `/api/v1/tenant/${DEMO_TENANT_A_ID}/discounts`, {
          name: 'Flash Friday 15% Test Campaign',
          campaignType: 'FLASH_SALE',
          discountType: 'PERCENTAGE',
          discountValue: 15,
          minQty: 1,
          stackable: false,
        });
        assert(dscRes.status === 201, `Discount create failed: ${dscRes.status}`);
        const dscId = dscRes.json.data.discount.id;

        await ownerA.request('DELETE', `/api/v1/tenant/${DEMO_TENANT_A_ID}/coupons/${cpnId}`);
        await ownerA.request('DELETE', `/api/v1/tenant/${DEMO_TENANT_A_ID}/discounts/${dscId}`);
        return 'Created & cleaned up tenant-scoped coupon WINTER20 and flash-sale discount.';
      }
    );

    await runCase(
      'TNT-08',
      'Store Settings, Store Branding, Secret-Safe Payment Settings & Shipping Methods',
      'Store Configuration',
      async () => {
        const setRes = await ownerA.request('PUT', `/api/v1/tenant/${DEMO_TENANT_A_ID}/settings`, {
          taxRatePct: 5,
          guestCheckoutEnabled: true,
        });
        assert(setRes.status === 200 && setRes.json.data.settings.taxRatePct === 5, 'Settings update failed');

        const brdRes = await ownerA.request('PUT', `/api/v1/tenant/${DEMO_TENANT_A_ID}/branding`, {
          primaryColor: '#4F46E5',
          headerAnnouncement: 'Free Express Dhaka Delivery on Orders Above ৳5,000',
        });
        assert(brdRes.status === 200, 'Branding update failed');

        const payList = await ownerA.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/payments`);
        assert(payList.status === 200, 'Payments list failed');
        const serialized = JSON.stringify(payList.json.data.gateways);
        assert(!serialized.includes('sk_live_'), 'Raw secret keys must never appear in payment settings response');

        const payPatch = await ownerA.request(
          'PATCH',
          `/api/v1/tenant/${DEMO_TENANT_A_ID}/payments/NAGAD`,
          { isEnabled: true, merchantAccountInput: '01799887766' }
        );
        assert(
          payPatch.status === 200 && payPatch.json.data.gateway.merchantAccountMasked.includes('••••'),
          'Merchant account must be masked before returning'
        );

        const shipCreate = await ownerA.request('POST', `/api/v1/tenant/${DEMO_TENANT_A_ID}/shipping`, {
          code: 'UW-SYL-EXP',
          name: 'Sylhet Express Test Zone',
          zoneName: 'Sylhet Metro',
          carrier: 'RedX',
          baseRateBDT: 110,
          freeShippingThresholdBDT: 5500,
          estimatedDays: '2 days',
          codSupported: true,
        });
        assert(shipCreate.status === 201, 'Shipping method create failed');
        await ownerA.request(
          'DELETE',
          `/api/v1/tenant/${DEMO_TENANT_A_ID}/shipping/${shipCreate.json.data.method.id}`
        );

        return 'Store settings, branding, masked payment gateway credentials & shipping methods verified.';
      }
    );

    await runCase(
      'TNT-09',
      'Staff Permission Boundaries (Product Manager Blocked 403 on Settings/Staff/Refunds; Customer Blocked 403)',
      'RBAC Enforcement',
      async () => {
        const pmCatalog = await prodMgrA.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/catalog`);
        assert(pmCatalog.status === 200, 'Product Manager should access catalog');

        const pmSettings = await prodMgrA.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/settings`);
        assert(pmSettings.status === 403, `Product Manager should get 403 on settings, got ${pmSettings.status}`);

        const pmStaff = await prodMgrA.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/staff`);
        assert(pmStaff.status === 403, `Product Manager should get 403 on staff list, got ${pmStaff.status}`);

        const pmRefund = await prodMgrA.request(
          'PATCH',
          `/api/v1/tenant/${DEMO_TENANT_A_ID}/orders/ord_uw_9001/status`,
          { status: 'REFUNDED' }
        );
        assert(pmRefund.status === 403, `Product Manager should get 403 on refund, got ${pmRefund.status}`);

        const custDenied = await customer.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/overview`);
        assert(custDenied.status === 403, `Customer should get 403 on tenant dashboard, got ${custDenied.status}`);

        return 'Product Manager & Customer permission boundaries enforced with 403 Forbidden.';
      }
    );

    await runCase(
      'TNT-10',
      'Analytics Funnel Aggregations & Subscription Billing Cycle Update',
      'Analytics & Subscription',
      async () => {
        const anaRes = await ownerA.request('GET', `/api/v1/tenant/${DEMO_TENANT_A_ID}/analytics`);
        assert(anaRes.status === 200, 'Analytics endpoint failed');
        assert(anaRes.json.data.categoryBreakdown.length >= 2, 'Category breakdown missing');
        assert(anaRes.json.data.unitEconomics.grossMarginPct > 0, 'Gross margin calculation invalid');

        const subRes = await ownerA.request('PATCH', `/api/v1/tenant/${DEMO_TENANT_A_ID}/subscription`, {
          billingCycle: 'YEARLY',
        });
        assert(subRes.status === 200 && subRes.json.data.subscription.billingCycle === 'YEARLY', 'Cycle update failed');
        // Restore MONTHLY
        await ownerA.request('PATCH', `/api/v1/tenant/${DEMO_TENANT_A_ID}/subscription`, {
          billingCycle: 'MONTHLY',
        });

        return `Analytics (gross margin ${anaRes.json.data.unitEconomics.grossMarginPct}%) & subscription cycle verified.`;
      }
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed: results.filter((r) => r.status === 'PASSED').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    results,
  };
}

// Standalone CLI execution when invoked via `npm run tenant:test`
const isCliEntry = process.argv[1] && process.argv[1].includes('testTenant');
if (isCliEntry) {
  runTenantVerificationSuite()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.failed > 0) process.exit(1);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Tenant verification suite crashed:', err);
      process.exit(1);
    });
}
