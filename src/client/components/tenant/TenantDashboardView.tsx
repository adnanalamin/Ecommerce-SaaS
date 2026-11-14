/**
 * NEXORA Phase 10 — Tenant Store Owner Dashboard View
 *
 * Complete merchant control center strictly scoped by server-verified `tenantId`.
 * Includes Two-Tenant Persona Switcher (UrbanWear BD vs LuxeThread Studio),
 * Live Cross-Tenant Access Probe, Overview + all 15 Store Modules, and
 * Destructive Action Confirmation Modal.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardBody } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Modal } from '../ui/Modal.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { ErrorState } from '../ui/ErrorState.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  Activity,
  BarChart3,
  CreditCard,
  Crown,
  Layers,
  Lock,
  Package,
  Palette,
  Percent,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  Ticket,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import type {
  MyStoreSummary,
  TenantApiCallFn,
  TenantConfirmConfig,
  TenantOverviewData,
} from './tenantTypes.ts';
import { TenantOverviewSkeleton } from './TenantWidgets.tsx';
import { TenantOverviewSection } from './TenantOverviewSection.tsx';
import { TenantCatalogModules } from './TenantCatalogModules.tsx';
import { TenantCommerceModules } from './TenantCommerceModules.tsx';
import { TenantOperationsModules } from './TenantOperationsModules.tsx';

const DEMO_TENANT_A_ID = '6730a840e6c1e95819e92001';
const DEMO_TENANT_B_ID = '6730a840e6c1e95819e92002';

type TenantModuleId =
  | 'overview'
  | 'products'
  | 'categories'
  | 'brands'
  | 'inventory'
  | 'orders'
  | 'customers'
  | 'coupons'
  | 'discounts'
  | 'settings'
  | 'staff'
  | 'branding'
  | 'payments'
  | 'shipping'
  | 'analytics'
  | 'subscription';

const TENANT_MODULE_NAV: Array<{
  id: TenantModuleId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'overview', label: 'Overview', icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'products', label: 'Products', icon: <Package className="w-3.5 h-3.5" /> },
  { id: 'categories', label: 'Categories', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'brands', label: 'Brands', icon: <Tag className="w-3.5 h-3.5" /> },
  { id: 'inventory', label: 'Inventory', icon: <Warehouse className="w-3.5 h-3.5" /> },
  { id: 'orders', label: 'Orders', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
  { id: 'customers', label: 'Customers', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'coupons', label: 'Coupons', icon: <Ticket className="w-3.5 h-3.5" /> },
  { id: 'discounts', label: 'Discounts', icon: <Percent className="w-3.5 h-3.5" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'branding', label: 'Branding', icon: <Palette className="w-3.5 h-3.5" /> },
  { id: 'payments', label: 'Payments', icon: <CreditCard className="w-3.5 h-3.5" /> },
  { id: 'shipping', label: 'Shipping', icon: <Truck className="w-3.5 h-3.5" /> },
  { id: 'staff', label: 'Staff', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-3.5 h-3.5" /> },
  { id: 'subscription', label: 'Subscription', icon: <Crown className="w-3.5 h-3.5" /> },
];

const TENANT_PERSONAS = [
  {
    label: 'UrbanWear BD Owner',
    email: 'owner@urbanwear.nexora.shop',
    hint: 'Tenant A • Full Store Owner',
  },
  {
    label: 'UrbanWear Product Mgr',
    email: 'catalog@urbanwear.nexora.shop',
    hint: 'Tenant A • Catalog RBAC',
  },
  {
    label: 'LuxeThread Owner',
    email: 'owner@luxethread.nexora.shop',
    hint: 'Tenant B • Isolated Store',
  },
  {
    label: 'Customer (403 Blocked)',
    email: 'buyer1@nexora.shop',
    hint: 'Storefront Boundary Test',
  },
];

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

export const TenantDashboardView: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();
  const csrfRef = useRef<string | null>(null);

  const [activeModule, setActiveModule] = useState<TenantModuleId>('overview');
  const [loading, setLoading] = useState(true);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);

  const [sessionUser, setSessionUser] = useState<any>(null);
  const [myStores, setMyStores] = useState<MyStoreSummary[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [overview, setOverview] = useState<TenantOverviewData | null>(null);
  const [accessDeniedMsg, setAccessDeniedMsg] = useState<string | null>(null);
  const [crossTenantProbeResult, setCrossTenantProbeResult] = useState<string | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<TenantConfirmConfig | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const ensureCsrf = useCallback(async () => {
    const cookieToken = readCookieValue('nexora_csrf');
    if (cookieToken) {
      csrfRef.current = cookieToken;
      return cookieToken;
    }
    if (csrfRef.current) return csrfRef.current;
    const res = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const json = await res.json().catch(() => null);
    const token = json?.data?.csrfToken || readCookieValue('nexora_csrf') || '';
    csrfRef.current = token;
    return token;
  }, []);

  const apiCall: TenantApiCallFn = useCallback(
    async (path: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string>),
      };
      if (init?.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const csrf = await ensureCsrf();
        if (csrf) headers['X-CSRF-Token'] = csrf;
      }
      const res = await fetch(path, { ...init, headers, credentials: 'include' });
      const json = await res.json().catch(() => null);
      return { res, json };
    },
    [ensureCsrf]
  );

  const loadWorkspace = useCallback(
    async (preferredTenantId?: string | null) => {
      setLoading(true);
      setAccessDeniedMsg(null);
      setCrossTenantProbeResult(null);
      try {
        // Guest-safe session probe (returns 200 even if unauthenticated)
        const sessionRes = await apiCall('/api/v1/auth/session');
        const authData = sessionRes.json?.data;
        if (!authData?.authenticated || !authData?.user) {
          setSessionUser(null);
          setMyStores([]);
          setSelectedTenantId(null);
          setOverview(null);
          return;
        }
        setSessionUser(authData.user);

        const storesRes = await apiCall('/api/v1/tenant/my-stores');
        const stores: MyStoreSummary[] = storesRes.json?.data?.stores || [];
        setMyStores(stores);

        const targetId =
          preferredTenantId && stores.some((s) => s.tenantId === preferredTenantId)
            ? preferredTenantId
            : stores[0]?.tenantId || null;

        setSelectedTenantId(targetId);

        if (!targetId) {
          // Demonstrate server-side 403 when non-merchant attempts tenant dashboard access
          const probe = await apiCall(`/api/v1/tenant/${DEMO_TENANT_A_ID}/overview`);
          setOverview(null);
          setAccessDeniedMsg(
            probe.json?.error?.message ||
              'You do not hold an active store membership. Only store owners & invited staff can open a tenant dashboard.'
          );
          return;
        }

        const ovRes = await apiCall(`/api/v1/tenant/${targetId}/overview`);
        if (ovRes.res.status === 403) {
          setOverview(null);
          setAccessDeniedMsg(ovRes.json?.error?.message || 'Access denied for this tenant store.');
          return;
        }
        if (ovRes.res.ok && ovRes.json?.data) {
          setOverview(ovRes.json.data);
        }
      } finally {
        setLoading(false);
      }
    },
    [apiCall]
  );

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleSwitchPersona = async (email: string) => {
    setSwitchingEmail(email);
    try {
      const csrf = await ensureCsrf();
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({ email, password: 'NexoraDemo!2026' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toastError('Persona Switch Failed', json?.error?.message || 'Unable to authenticate.');
        return;
      }
      csrfRef.current = readCookieValue('nexora_csrf');
      toastSuccess('Merchant Session Active', `Signed in as ${email}.`);
      setActiveModule('overview');
      await loadWorkspace(null);
    } finally {
      setSwitchingEmail(null);
    }
  };

  const handleCrossTenantProbe = async () => {
    if (!selectedTenantId) return;
    const oppositeTenantId =
      selectedTenantId === DEMO_TENANT_A_ID ? DEMO_TENANT_B_ID : DEMO_TENANT_A_ID;
    const oppositeName =
      selectedTenantId === DEMO_TENANT_A_ID ? 'LuxeThread Studio (Tenant B)' : 'UrbanWear BD (Tenant A)';
    const { res, json } = await apiCall(`/api/v1/tenant/${oppositeTenantId}/overview`);
    const code = json?.error?.code || 'FORBIDDEN';
    const msg = `HTTP ${res.status} (${code}) trying to read ${oppositeName}: ${json?.error?.message || 'Blocked'}`;
    setCrossTenantProbeResult(msg);
    if (res.status === 403) {
      toastSuccess('Cross-Tenant Guard Verified', `Blocked with 403 ${code}`);
    } else {
      toastError('Unexpected Response', `Status ${res.status}`);
    }
  };

  const handleConfirmExecute = async () => {
    if (!confirmConfig) return;
    setConfirmBusy(true);
    try {
      await confirmConfig.onConfirm();
      setConfirmConfig(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const permissions = overview?.viewer?.permissions || [];

  return (
    <div className="space-y-6">
      {/* Header & Store Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {overview ? `${overview.tenant.name} — Store Owner Dashboard` : 'NEXORA Tenant Store Owner Dashboard'}
            </h1>
            {overview && <Badge variant="success" dot>{overview.tenant.status}</Badge>}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Strictly tenant-isolated merchant workspace •{' '}
            <span className="font-mono text-indigo-600 dark:text-indigo-400">
              {overview ? `${overview.tenant.subdomain} (${overview.viewer.roleSlug})` : 'Select a store persona'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedTenantId && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCrossTenantProbe}
              leftIcon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
            >
              Test Cross-Tenant Isolation
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadWorkspace(selectedTenantId)}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Persona Switcher Bar */}
      <Card>
        <CardBody className="p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Two-Tenant Isolation & Role Switcher
            </span>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {sessionUser
                ? `Active Session: ${sessionUser.email} (${myStores.length} owned/staff store${myStores.length === 1 ? '' : 's'})`
                : 'Sign in as UrbanWear BD Owner, LuxeThread Studio Owner, Product Manager, or Customer to inspect strict tenant boundaries.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TENANT_PERSONAS.map((p) => {
              const isCurrent = sessionUser?.email === p.email;
              return (
                <Button
                  key={p.email}
                  size="sm"
                  variant={isCurrent ? 'primary' : 'outline'}
                  isLoading={switchingEmail === p.email}
                  onClick={() => handleSwitchPersona(p.email)}
                >
                  {p.label}
                </Button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {crossTenantProbeResult && (
        <div className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300 font-mono flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{crossTenantProbeResult}</span>
        </div>
      )}

      {/* Unauthenticated Guest State */}
      {!loading && !sessionUser && (
        <Card>
          <CardBody className="p-8">
            <EmptyState
              icon={<Lock className="w-8 h-8 text-indigo-500" />}
              title="Merchant Store Session Required"
              description="Click 'UrbanWear BD Owner' or 'LuxeThread Owner' above to establish an authenticated HttpOnly session and inspect strictly isolated store data."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={() => handleSwitchPersona('owner@urbanwear.nexora.shop')}>
                    Open UrbanWear BD (Tenant A)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSwitchPersona('owner@luxethread.nexora.shop')}
                  >
                    Open LuxeThread Studio (Tenant B)
                  </Button>
                </div>
              }
            />
          </CardBody>
        </Card>
      )}

      {/* 403 Customer / Unauthorized Boundary State */}
      {!loading && sessionUser && accessDeniedMsg && (
        <ErrorState
          title="403 — Tenant Store Access Denied"
          message={accessDeniedMsg}
        />
      )}

      {/* Authenticated Tenant Workspace */}
      {loading && <TenantOverviewSkeleton />}

      {!loading && overview && selectedTenantId && (
        <div className="space-y-5">
          {/* Multi-store selector if user belongs to >1 store */}
          {myStores.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Your Stores:</span>
              {myStores.map((s) => (
                <Button
                  key={s.tenantId}
                  size="sm"
                  variant={s.tenantId === selectedTenantId ? 'primary' : 'outline'}
                  onClick={() => loadWorkspace(s.tenantId)}
                >
                  {s.name} ({s.roleSlug})
                </Button>
              ))}
            </div>
          )}

          {/* 16-Module Navigation Tabs */}
          <div className="flex overflow-x-auto gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2.5">
            {TENANT_MODULE_NAV.map((tab) => {
              const isActive = activeModule === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveModule(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {activeModule === 'overview' && (
            <TenantOverviewSection
              overview={overview}
              onNavigateModule={(id) => setActiveModule(id as TenantModuleId)}
            />
          )}

          {(activeModule === 'products' ||
            activeModule === 'categories' ||
            activeModule === 'brands' ||
            activeModule === 'inventory') && (
            <TenantCatalogModules
              tenantId={selectedTenantId}
              mode={activeModule}
              permissions={permissions}
              apiCall={apiCall}
              onRequestConfirm={setConfirmConfig}
              onDataMutated={() => loadWorkspace(selectedTenantId)}
            />
          )}

          {(activeModule === 'orders' ||
            activeModule === 'customers' ||
            activeModule === 'coupons' ||
            activeModule === 'discounts') && (
            <TenantCommerceModules
              tenantId={selectedTenantId}
              mode={activeModule}
              permissions={permissions}
              apiCall={apiCall}
              onRequestConfirm={setConfirmConfig}
              onDataMutated={() => loadWorkspace(selectedTenantId)}
            />
          )}

          {(activeModule === 'settings' ||
            activeModule === 'staff' ||
            activeModule === 'branding' ||
            activeModule === 'payments' ||
            activeModule === 'shipping' ||
            activeModule === 'analytics' ||
            activeModule === 'subscription') && (
            <TenantOperationsModules
              tenantId={selectedTenantId}
              mode={activeModule}
              permissions={permissions}
              apiCall={apiCall}
              onRequestConfirm={setConfirmConfig}
              onDataMutated={() => loadWorkspace(selectedTenantId)}
            />
          )}
        </div>
      )}

      {/* Confirmation Modal for Destructive Actions */}
      <Modal
        isOpen={Boolean(confirmConfig)}
        onClose={() => !confirmBusy && setConfirmConfig(null)}
        title={confirmConfig?.title || 'Confirm Action'}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={confirmBusy}
              onClick={() => setConfirmConfig(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant={confirmConfig?.variant === 'danger' ? 'danger' : 'primary'}
              isLoading={confirmBusy}
              onClick={handleConfirmExecute}
            >
              {confirmConfig?.confirmLabel || 'Confirm'}
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
          <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{confirmConfig?.description}</p>
        </div>
      </Modal>
    </div>
  );
};
