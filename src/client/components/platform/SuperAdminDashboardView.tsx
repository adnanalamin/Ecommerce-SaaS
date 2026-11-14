/**
 * NEXORA Phase 09 — Super Admin Platform Governance Dashboard
 *
 * Unifies:
 *  - Platform Role Persona Switcher (real HttpOnly cookie sessions + CSRF)
 *  - Executive Overview (real aggregated KPIs, charts, health, storage, security alerts)
 *  - All 13 Governance Modules (Tenants, Stores, Users, Admins, Subscriptions, Plans,
 *    Payments, Refunds, Ads, Platform Branding, Global Settings, Audit Logs, Support)
 *  - Global Confirmation Modal for Destructive Actions
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardBody } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Modal } from '../ui/Modal.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  Activity,
  Building2,
  CreditCard,
  FileText,
  HeadphonesIcon,
  Layers,
  Lock,
  Megaphone,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  ApiCallFn,
  ConfirmActionConfig,
  PlatformOverviewData,
} from './platformTypes.ts';
import { PlatformOverviewSection } from './PlatformOverviewSection.tsx';
import { PlatformCoreModules } from './PlatformCoreModules.tsx';
import { PlatformFinanceModules } from './PlatformFinanceModules.tsx';
import { PlatformGovernanceModules } from './PlatformGovernanceModules.tsx';
import { PlatformSupportModule } from './PlatformSupportModule.tsx';

type ModuleId =
  | 'overview'
  | 'tenants'
  | 'stores'
  | 'users'
  | 'admins'
  | 'subscriptions'
  | 'plans'
  | 'payments'
  | 'refunds'
  | 'ads'
  | 'branding'
  | 'settings'
  | 'audit'
  | 'support';

const MODULE_NAV: Array<{
  id: ModuleId;
  label: string;
  requiredPermission: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'overview',
    label: 'Overview',
    requiredPermission: 'platform:tenants:read',
    icon: <Activity className="w-3.5 h-3.5" />,
  },
  {
    id: 'tenants',
    label: 'Tenants',
    requiredPermission: 'platform:tenants:read',
    icon: <Building2 className="w-3.5 h-3.5" />,
  },
  {
    id: 'stores',
    label: 'Stores',
    requiredPermission: 'platform:tenants:read',
    icon: <Store className="w-3.5 h-3.5" />,
  },
  {
    id: 'users',
    label: 'Users',
    requiredPermission: 'platform:tenants:read',
    icon: <Users className="w-3.5 h-3.5" />,
  },
  {
    id: 'admins',
    label: 'Admins',
    requiredPermission: 'platform:tenants:read',
    icon: <UserCog className="w-3.5 h-3.5" />,
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    requiredPermission: 'platform:finance:read',
    icon: <Layers className="w-3.5 h-3.5" />,
  },
  {
    id: 'plans',
    label: 'Plans',
    requiredPermission: 'platform:finance:read',
    icon: <Wallet className="w-3.5 h-3.5" />,
  },
  {
    id: 'payments',
    label: 'Payments',
    requiredPermission: 'platform:finance:read',
    icon: <CreditCard className="w-3.5 h-3.5" />,
  },
  {
    id: 'refunds',
    label: 'Refunds',
    requiredPermission: 'platform:finance:read',
    icon: <RotateCcw className="w-3.5 h-3.5" />,
  },
  {
    id: 'ads',
    label: 'Ad Governance',
    requiredPermission: 'platform:ads:manage',
    icon: <Megaphone className="w-3.5 h-3.5" />,
  },
  {
    id: 'branding',
    label: 'Platform Branding',
    requiredPermission: 'platform:settings:manage',
    icon: <Palette className="w-3.5 h-3.5" />,
  },
  {
    id: 'settings',
    label: 'Global Settings',
    requiredPermission: 'platform:settings:manage',
    icon: <Settings className="w-3.5 h-3.5" />,
  },
  {
    id: 'audit',
    label: 'Audit Logs',
    requiredPermission: 'platform:audit:read',
    icon: <FileText className="w-3.5 h-3.5" />,
  },
  {
    id: 'support',
    label: 'Support & Access',
    requiredPermission: 'platform:support:manage',
    icon: <HeadphonesIcon className="w-3.5 h-3.5" />,
  },
];

const PLATFORM_PERSONAS = [
  { label: 'Super Admin', email: 'superadmin@nexora.cloud', roleHint: 'Full Platform Control' },
  { label: 'Finance Manager', email: 'finance@nexora.cloud', roleHint: 'Billing, Plans & Exports' },
  { label: 'Support Agent', email: 'support@nexora.cloud', roleHint: 'Tickets & Controlled Access' },
  {
    label: 'Tenant Merchant (Blocked)',
    email: 'owner@urbanwear.nexora.shop',
    roleHint: '403 Boundary Test',
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

export const SuperAdminDashboardView: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();
  const csrfRef = useRef<string | null>(null);

  const [activeModule, setActiveModule] = useState<ModuleId>('overview');
  const [loading, setLoading] = useState(true);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);

  const [sessionUser, setSessionUser] = useState<any>(null);
  const [overview, setOverview] = useState<PlatformOverviewData | null>(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  // Destructive action confirmation modal state
  const [confirmConfig, setConfirmConfig] = useState<ConfirmActionConfig | null>(null);
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

  const apiCall: ApiCallFn = useCallback(
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

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setAccessDeniedMessage(null);
    try {
      // Probe session via guest-safe endpoint (returns 200 even when unauthenticated)
      const sessionRes = await apiCall('/api/v1/auth/session');
      const authData = sessionRes.json?.data;
      if (!authData?.authenticated || !authData?.user) {
        setSessionUser(null);
        setOverview(null);
        return;
      }
      setSessionUser(authData.user);

      // Fetch Super Admin Executive Overview
      const overviewRes = await apiCall('/api/v1/platform/overview');
      if (overviewRes.res.status === 403) {
        setOverview(null);
        setAccessDeniedMessage(
          overviewRes.json?.error?.message ||
            'Platform-level role required. Tenant merchants and customers are denied access.'
        );
        return;
      }
      if (overviewRes.res.ok && overviewRes.json?.data) {
        setOverview(overviewRes.json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

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
        body: JSON.stringify({
          email,
          password: 'NexoraDemo!2026',
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toastError('Persona Switch Failed', json?.error?.message || 'Unable to authenticate persona.');
        return;
      }
      csrfRef.current = readCookieValue('nexora_csrf');
      toastSuccess('Session Switched', `Authenticated as ${email}.`);
      setActiveModule('overview');
      await loadDashboard();
    } finally {
      setSwitchingEmail(null);
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
      {/* Header & Role Persona Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              NEXORA Super Admin Governance Console
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Platform-owner control center for tenant lifecycle, subscriptions, financial ledgers,
            branding, audit logs, and controlled support access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {overview?.viewer && (
            <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono">
              <span className="text-slate-500">Active Role: </span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {overview.viewer.platformRoleName}
              </span>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={loadDashboard}
            disabled={loading}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Role Switcher Bar */}
      <Card>
        <CardBody>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-semibold text-slate-900 dark:text-white block">
                Role-Based Access Testing (Live Cookie Session)
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {sessionUser
                  ? `Signed in as ${sessionUser.email} (${sessionUser.userType})`
                  : 'Currently unauthenticated guest. Select a platform role below to launch the dashboard.'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {PLATFORM_PERSONAS.map((p) => {
                const isActive = sessionUser?.email === p.email;
                return (
                  <Button
                    key={p.email}
                    size="sm"
                    variant={isActive ? 'primary' : 'outline'}
                    disabled={switchingEmail !== null}
                    onClick={() => handleSwitchPersona(p.email)}
                  >
                    {switchingEmail === p.email ? 'Switching...' : p.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Unauthenticated Gate */}
      {!loading && !sessionUser && (
        <Card>
          <CardBody>
            <div className="py-12 text-center space-y-4">
              <Lock className="w-9 h-9 text-indigo-500 mx-auto" />
              <div className="space-y-1 max-w-md mx-auto">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Platform Authentication Required
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sign in as a NEXORA Platform Role above to access aggregated tenant telemetry,
                  financial ledgers, and controlled support diagnostics.
                </p>
              </div>
              <div className="flex justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSwitchPersona('superadmin@nexora.cloud')}
                  disabled={switchingEmail !== null}
                >
                  Sign In as Super Admin
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSwitchPersona('support@nexora.cloud')}
                  disabled={switchingEmail !== null}
                >
                  Sign In as Support Agent
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* 403 Role Boundary Enforcement View (for Merchant / Customer sessions) */}
      {!loading && sessionUser && accessDeniedMessage && (
        <Card>
          <CardBody>
            <div className="py-10 text-center space-y-3">
              <ShieldAlert className="w-9 h-9 text-rose-500 mx-auto" />
              <div className="space-y-1 max-w-lg mx-auto">
                <div className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                  HTTP 403 FORBIDDEN · ROLE BOUNDARY ENFORCED
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Super Admin Dashboard Denied for {sessionUser.email}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{accessDeniedMessage}</p>
              </div>
              <div>
                <Button
                  size="sm"
                  onClick={() => handleSwitchPersona('superadmin@nexora.cloud')}
                  disabled={switchingEmail !== null}
                >
                  Return to Super Admin Session
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Authenticated Platform Dashboard */}
      {overview && (
        <>
          {/* 14-Item Governance Module Tabs */}
          <div className="flex overflow-x-auto gap-1.5 pb-1 border-b border-slate-200 dark:border-slate-800">
            {MODULE_NAV.map((mod) => {
              const hasAccess = permissions.includes(mod.requiredPermission);
              const isSelected = activeModule === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveModule(mod.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-semibold'
                      : hasAccess
                        ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        : 'text-slate-400 dark:text-slate-600 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                  }`}
                >
                  {mod.icon}
                  <span>{mod.label}</span>
                  {!hasAccess && <Lock className="w-3 h-3 opacity-60" />}
                </button>
              );
            })}
          </div>

          {/* Active Module Content */}
          {activeModule === 'overview' && (
            <PlatformOverviewSection
              overview={overview}
              onRefresh={loadDashboard}
              onJumpToModule={(id) => setActiveModule(id as ModuleId)}
              refreshing={loading}
            />
          )}

          {(activeModule === 'tenants' ||
            activeModule === 'stores' ||
            activeModule === 'users' ||
            activeModule === 'admins') && (
            <PlatformCoreModules
              mode={activeModule}
              apiCall={apiCall}
              permissions={permissions}
              onRequestConfirm={setConfirmConfig}
              onMutated={loadDashboard}
            />
          )}

          {(activeModule === 'subscriptions' ||
            activeModule === 'plans' ||
            activeModule === 'payments' ||
            activeModule === 'refunds') && (
            <PlatformFinanceModules
              mode={activeModule}
              apiCall={apiCall}
              permissions={permissions}
              onRequestConfirm={setConfirmConfig}
              onMutated={loadDashboard}
            />
          )}

          {(activeModule === 'ads' ||
            activeModule === 'branding' ||
            activeModule === 'settings' ||
            activeModule === 'audit') && (
            <PlatformGovernanceModules
              mode={activeModule}
              apiCall={apiCall}
              permissions={permissions}
              onRequestConfirm={setConfirmConfig}
              onMutated={loadDashboard}
            />
          )}

          {activeModule === 'support' && (
            <PlatformSupportModule
              apiCall={apiCall}
              permissions={permissions}
              onRequestConfirm={setConfirmConfig}
              onMutated={loadDashboard}
            />
          )}
        </>
      )}

      {/* Destructive Action Confirmation Modal */}
      <Modal
        isOpen={Boolean(confirmConfig)}
        onClose={() => !confirmBusy && setConfirmConfig(null)}
        title={confirmConfig?.title || 'Confirm Administrative Action'}
        description={confirmConfig?.description}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
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
              variant={confirmConfig?.danger ? 'danger' : 'primary'}
              disabled={confirmBusy}
              onClick={handleConfirmExecute}
            >
              {confirmBusy ? 'Applying...' : confirmConfig?.confirmLabel || 'Confirm'}
            </Button>
          </div>
        }
      >
        <div className="text-xs text-slate-600 dark:text-slate-300">
          This action is permanently recorded in the NEXORA Platform Audit Log with your actor
          identity, IP address, and justification.
        </div>
      </Modal>
    </div>
  );
};
