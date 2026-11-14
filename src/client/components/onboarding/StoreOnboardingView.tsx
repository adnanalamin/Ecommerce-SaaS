/**
 * NEXORA Automatic Tenant Store Creation & Lifecycle Console
 * Phase 08 — 11-Step Business Owner Onboarding, Slug Normalization/Reservation,
 * Transaction-Safe Idempotent Provisioning, Store Suspension/Activation & Official Store Isolation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  CheckCircle2,
  ExternalLink,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Store,
  XCircle,
} from 'lucide-react';

interface ThemePreset {
  code: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  layoutMode: string;
}

interface ProvisionedBundle {
  idempotentReplay?: boolean;
  myRoleSlug?: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    subdomain: string;
    status: string;
    storeOwnershipType: 'INDEPENDENT_TENANT' | 'PLATFORM_OWNED_OFFICIAL';
    isOfficialStore: boolean;
    currency: string;
    locale: string;
    timezone: string;
    onboardingProgress: {
      currentStep: string;
      completedSteps: string[];
    };
    suspendedReason?: string;
  };
  store: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    locale: string;
    timezone: string;
    status: string;
    defaultThemeCode: string;
    businessCategory?: string;
    isOfficialStore: boolean;
  };
  plan: {
    code: string;
    name: string;
    priceMonthlyBDT: number;
    maxProducts: number;
    maxStaffUsers: number;
    maxStorageMB: number;
    transactionFeePercent: number;
  };
  subscription: {
    id: string;
    planCode: string;
    status: string;
    billingCycle: string;
  };
  theme: {
    themeCode: string;
    themeName: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontHeading: string;
  };
  defaultShippingMethod: {
    code: string;
    name: string;
    baseRate: number;
    currency: string;
  };
  rolesCount: number;
  ownerMembership: {
    roleSlug: string;
    status: string;
  };
  dashboardUrl: string;
}

interface PlatformStoreRow {
  tenant: ProvisionedBundle['tenant'];
  store: ProvisionedBundle['store'];
  planCode: string;
  ownershipLabel: string;
}

interface OnboardingTestResult {
  id: string;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
}

type TabId = 'wizard' | 'my-stores' | 'official-lifecycle' | 'tests';

const JOURNEY_STEPS = [
  { num: '01', label: 'Register' },
  { num: '02', label: 'Verify Email' },
  { num: '03', label: 'Business Info' },
  { num: '04', label: 'Store & Slug' },
  { num: '05', label: 'Provisioning' },
  { num: '06', label: 'Dashboard' },
];

export const StoreOnboardingView: React.FC = () => {
  const toast = useToast();
  const addToast = useCallback(
    (type: 'success' | 'error' | 'warning' | 'info', title: string) => {
      toast[type](title);
    },
    [toast]
  );
  const csrfRef = useRef<string>('');

  const [activeTab, setActiveTab] = useState<TabId>('wizard');
  const [loading, setLoading] = useState(false);

  // Active authenticated identity
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    email: string;
    fullName: string;
    userType: string;
  } | null>(null);

  // Presets & state
  const [themes, setThemes] = useState<ThemePreset[]>([]);
  const [myStores, setMyStores] = useState<ProvisionedBundle[]>([]);
  const [officialStore, setOfficialStore] = useState<ProvisionedBundle | null>(null);
  const [officialIsolation, setOfficialIsolation] = useState<{
    ownershipModel: string;
    sharesPlatformAdminPermissions: boolean;
    dedicatedOwnerAccountType: string;
    description: string;
  } | null>(null);
  const [platformStores, setPlatformStores] = useState<PlatformStoreRow[]>([]);

  // Wizard Step State (1..6)
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [regFullName, setRegFullName] = useState('Nusrat Jahan');
  const [regEmail, setRegEmail] = useState(`founder.${Math.floor(1000 + Math.random() * 9000)}@nexora.shop`);
  const [regPassword, setRegPassword] = useState('FounderPass!2026');
  const [regPhone, setRegPhone] = useState('+8801712345678');
  const [verifyToken, setVerifyToken] = useState('');

  // Business Info
  const [legalName, setLegalName] = useState('Padma Loom & Craft Ltd.');
  const [category, setCategory] = useState('Apparel & Handloom');
  const [country, setCountry] = useState('Bangladesh');
  const [currency, setCurrency] = useState<'BDT' | 'USD' | 'EUR' | 'GBP'>('BDT');
  const [locale, setLocale] = useState('en-BD');
  const [timezone, setTimezone] = useState('Asia/Dhaka');

  // Store & Slug
  const [storeName, setStoreName] = useState('Padma Loom Collective');
  const [customSlug, setCustomSlug] = useState('padma-loom');
  const [selectedTheme, setSelectedTheme] = useState('nexora-atelier');
  const [slugCheckResult, setSlugCheckResult] = useState<{
    available: boolean;
    normalizedSlug: string;
    subdomainPreview?: string;
    isReserved: boolean;
    reason?: string;
    suggestions: string[];
  } | null>(null);

  // Idempotency & Provisioning Result
  const [idempotencyKey, setIdempotencyKey] = useState(() => `idem_ui_${Date.now().toString(36)}`);
  const [provisionResult, setProvisionResult] = useState<ProvisionedBundle | null>(null);
  const [lastProvisionNotice, setLastProvisionNotice] = useState<string>('');
  const [storefrontPreview, setStorefrontPreview] = useState<{
    slug: string;
    status: number;
    message: string;
    data?: any;
  } | null>(null);

  // Lifecycle & Test Suite
  const [suspendReason, setSuspendReason] = useState('Compliance review pending');
  const [testReport, setTestReport] = useState<{
    timestamp: string;
    totalTests: number;
    passed: number;
    failed: number;
    results: OnboardingTestResult[];
  } | null>(null);
  const [testRunning, setTestRunning] = useState(false);

  const ensureCsrf = useCallback(async (): Promise<string> => {
    if (csrfRef.current) return csrfRef.current;
    const res = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const json = await res.json();
    const token = json?.data?.csrfToken || '';
    csrfRef.current = token;
    return token;
  }, []);

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      };
      if (method !== 'GET' && method !== 'HEAD') {
        headers['X-CSRF-Token'] = await ensureCsrf();
      }
      const res = await fetch(url, {
        ...options,
        method,
        headers,
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (json?.data?.csrfToken) {
        csrfRef.current = json.data.csrfToken;
      }
      return { ok: res.ok, status: res.status, json };
    },
    [ensureCsrf]
  );

  const refreshContext = useCallback(async () => {
    const [presetsRes, officialRes, sessionRes] = await Promise.all([
      apiFetch('/api/v1/onboarding/presets'),
      apiFetch('/api/v1/onboarding/official-store'),
      apiFetch('/api/v1/auth/session'),
    ]);

    if (presetsRes.ok && presetsRes.json?.data?.themes) {
      setThemes(presetsRes.json.data.themes);
    }
    if (officialRes.ok && officialRes.json?.data) {
      setOfficialStore(officialRes.json.data.officialStore);
      setOfficialIsolation(officialRes.json.data.isolationContract);
    }

    if (sessionRes.ok && sessionRes.json?.data?.authenticated && sessionRes.json?.data?.user) {
      const u = sessionRes.json.data.user;
      setCurrentUser(u);

      const myRes = await apiFetch('/api/v1/onboarding/my-stores');
      if (myRes.ok && myRes.json?.data?.stores) {
        setMyStores(myRes.json.data.stores);
      } else {
        setMyStores([]);
      }

      if (u.userType?.startsWith('PLATFORM_')) {
        const platRes = await apiFetch('/api/v1/onboarding/tenants');
        if (platRes.ok && platRes.json?.data?.stores) {
          setPlatformStores(platRes.json.data.stores);
        }
      } else {
        setPlatformStores([]);
      }
    } else {
      setCurrentUser(null);
      setMyStores([]);
      setPlatformStores([]);
    }
  }, [apiFetch]);

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  const handleCurrencyChange = (nextCurrency: 'BDT' | 'USD' | 'EUR' | 'GBP') => {
    setCurrency(nextCurrency);
    const defaults: Record<string, { locale: string; timezone: string }> = {
      BDT: { locale: 'en-BD', timezone: 'Asia/Dhaka' },
      USD: { locale: 'en-US', timezone: 'America/New_York' },
      GBP: { locale: 'en-GB', timezone: 'Europe/London' },
      EUR: { locale: 'en-EU', timezone: 'Europe/Berlin' },
    };
    setLocale(defaults[nextCurrency].locale);
    setTimezone(defaults[nextCurrency].timezone);
  };

  const loginPersona = async (email: string, password: string, label: string) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        addToast('error', res.json?.error?.message || `Failed to sign in as ${label}`);
        return false;
      }
      addToast('success', `Authenticated via HttpOnly cookie as ${label}`);
      await refreshContext();
      return true;
    } finally {
      setLoading(false);
    }
  };

  // Wizard Actions
  const handleStep1Register = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/onboarding/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: regFullName,
          email: regEmail,
          password: regPassword,
          phone: regPhone,
        }),
      });
      if (!res.ok) {
        addToast('error', res.json?.error?.message || 'Registration failed');
        return;
      }
      const token = res.json?.data?.verificationTokenPreview || '';
      setVerifyToken(token);
      addToast('success', 'Business owner registered. Proceed to email verification.');
      setWizardStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handleStep2VerifyAndSignIn = async () => {
    setLoading(true);
    try {
      const verRes = await apiFetch('/api/v1/onboarding/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken }),
      });
      if (!verRes.ok) {
        addToast('error', verRes.json?.error?.message || 'Email verification failed');
        return;
      }
      const loginOk = await loginPersona(regEmail, regPassword, regFullName);
      if (loginOk) {
        setWizardStep(3);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStep3SaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/onboarding/business-info', {
        method: 'POST',
        body: JSON.stringify({
          legalBusinessName: legalName,
          category,
          phone: regPhone,
          contactEmail: currentUser?.email || regEmail,
          country,
          currency,
          locale,
          timezone,
        }),
      });
      if (!res.ok) {
        addToast('error', res.json?.error?.message || 'Could not save business info');
        return;
      }
      addToast('success', 'Business info, currency, locale & timezone saved.');
      setWizardStep(4);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckSlug = async (slugOverride?: string) => {
    setLoading(true);
    try {
      const targetSlug = slugOverride !== undefined ? slugOverride : customSlug;
      const res = await apiFetch('/api/v1/onboarding/check-slug', {
        method: 'POST',
        body: JSON.stringify({
          storeName,
          customSlug: targetSlug,
          themeCode: selectedTheme,
        }),
      });
      if (res.ok && res.json?.data) {
        setSlugCheckResult(res.json.data);
        if (slugOverride !== undefined) setCustomSlug(slugOverride);
      } else {
        addToast('error', res.json?.error?.message || 'Slug validation failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionStore = async (simulateFailureAtStep?: string) => {
    setLoading(true);
    setLastProvisionNotice('');
    try {
      const res = await apiFetch('/api/v1/onboarding/provision', {
        method: 'POST',
        body: JSON.stringify({
          storeName,
          storeSlug: customSlug,
          legalBusinessName: legalName,
          category,
          phone: regPhone,
          country,
          currency,
          locale,
          timezone,
          themeCode: selectedTheme,
          idempotencyKey,
          ...(simulateFailureAtStep ? { simulateFailureAtStep } : {}),
        }),
      });

      if (!res.ok) {
        const msg = res.json?.error?.message || 'Provisioning failed and rolled back cleanly.';
        setLastProvisionNotice(`Rolled back (${res.status}): ${msg}`);
        addToast('error', msg);
        return;
      }

      const bundle: ProvisionedBundle = res.json.data;
      setProvisionResult(bundle);
      setLastProvisionNotice(
        bundle.idempotentReplay
          ? `Idempotent Replay (HTTP 200): Returned existing provisioned store "${bundle.store.slug}" with 0 duplicates.`
          : `Provisioned Atomically (HTTP 201): Tenant, Store, STARTER Plan, Theme & store_owner Membership created.`
      );
      addToast(
        'success',
        bundle.idempotentReplay
          ? 'Idempotent replay returned existing store.'
          : `Store "${bundle.store.name}" provisioned cleanly!`
      );
      setWizardStep(6);
      await refreshContext();
    } finally {
      setLoading(false);
    }
  };

  const handleInspectStorefront = async (slug: string) => {
    const res = await apiFetch(`/api/v1/onboarding/storefront/${encodeURIComponent(slug)}`);
    setStorefrontPreview({
      slug,
      status: res.status,
      message: res.ok
        ? `Storefront live at ${slug}.nexora.shop (${res.json.data.store.currency} / ${res.json.data.store.locale})`
        : res.json?.error?.message || 'Storefront unavailable',
      data: res.ok ? res.json.data : null,
    });
  };

  const handleSuspendStore = async (tenantId: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/onboarding/tenants/${tenantId}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason: suspendReason }),
      });
      if (!res.ok) {
        addToast('error', res.json?.error?.message || 'Suspension failed');
        return;
      }
      addToast('success', 'Store suspended. Storefront & tenant operations blocked.');
      await refreshContext();
    } finally {
      setLoading(false);
    }
  };

  const handleActivateStore = async (tenantId: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/onboarding/tenants/${tenantId}/activate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        addToast('error', res.json?.error?.message || 'Activation failed');
        return;
      }
      addToast('success', 'Store reactivated cleanly.');
      await refreshContext();
    } finally {
      setLoading(false);
    }
  };

  const handleRunVerificationSuite = async () => {
    setTestRunning(true);
    try {
      const res = await apiFetch('/api/v1/onboarding/verify', { method: 'POST', body: JSON.stringify({}) });
      if (res.ok && res.json?.data) {
        setTestReport(res.json.data);
        addToast(
          res.json.data.failed === 0 ? 'success' : 'error',
          `Onboarding verification finished: ${res.json.data.passed}/${res.json.data.totalTests} passed`
        );
      } else {
        addToast('error', res.json?.error?.message || 'Failed to execute test suite');
      }
    } finally {
      setTestRunning(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setRegEmail(`founder.${Math.floor(1000 + Math.random() * 9000)}@nexora.shop`);
    setVerifyToken('');
    setSlugCheckResult(null);
    setProvisionResult(null);
    setLastProvisionNotice('');
    setIdempotencyKey(`idem_ui_${Date.now().toString(36)}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Automatic Tenant Store Creation
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Transaction-safe, idempotent 11-step merchant onboarding with normalized reserved-slug protection,
            free Starter plan assignment, theme initialization, and segregated NEXORA Official Store architecture.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {currentUser ? (
            <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200">
              <span className="font-semibold">{currentUser.email}</span>
              <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">{currentUser.userType}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">Guest Session</span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => loginPersona('owner@urbanwear.nexora.shop', 'NexoraDemo!2026', 'UrbanWear Owner')}
            disabled={loading}
          >
            Sign in Merchant
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => loginPersona('superadmin@nexora.cloud', 'NexoraDemo!2026', 'Platform Super Admin')}
            disabled={loading}
          >
            Sign in Super Admin
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
        {[
          { id: 'wizard' as TabId, label: 'Store Creation Wizard' },
          { id: 'my-stores' as TabId, label: `My Stores (${myStores.length})` },
          { id: 'official-lifecycle' as TabId, label: 'Official Store & Lifecycle' },
          { id: 'tests' as TabId, label: 'Resilience & Test Suite' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: 11-STEP STORE CREATION WIZARD */}
      {activeTab === 'wizard' && (
        <div className="space-y-6">
          {/* Progress Stepper */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {JOURNEY_STEPS.map((s, idx) => {
                  const stepIndex = idx + 1;
                  const isDone = wizardStep > stepIndex;
                  const isActive = wizardStep === stepIndex;
                  return (
                    <button
                      key={s.num}
                      type="button"
                      onClick={() => stepIndex <= wizardStep && setWizardStep(stepIndex)}
                      className={`flex items-center gap-2 text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                          : isDone
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      <span className="font-mono tabular-nums">{s.num}.</span>
                      <span>{s.label}</span>
                      {idx < JOURNEY_STEPS.length - 1 && (
                        <span className="text-slate-300 dark:text-slate-700 ml-1">/</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <Button size="sm" variant="ghost" onClick={resetWizard} leftIcon={<RotateCcw className="w-3.5 h-3.5" />}>
                Start New Owner
              </Button>
            </div>
          </div>

          {/* Step 1: Business Owner Registration */}
          {wizardStep === 1 && (
            <form
              onSubmit={handleStep1Register}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5 max-w-3xl"
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  01. Business Owner Registration
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Creates a verified merchant identity using Argon2id hashing. Public registration strictly restricts accountType to MERCHANT.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Owner Full Name" value={regFullName} onChange={(e) => setRegFullName(e.target.value)} required />
                <Input label="Business Email" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
                <Input label="Password (min 10 chars)" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required />
                <Input label="Phone Number" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button type="submit" isLoading={loading}>
                  Register Merchant Account
                </Button>
              </div>
            </form>
          )}

          {/* Step 2: Email Verification */}
          {wizardStep === 2 && (
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5 max-w-3xl">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  02. Email Verification & Session Activation
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Store creation is blocked until the merchant email address is cryptographically verified.
                </p>
              </div>
              <Input
                label="Verification Token"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                helperText="Issued by POST /api/v1/onboarding/register for sandbox verification."
              />
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="ghost" onClick={() => setWizardStep(1)}>Back</Button>
                <Button onClick={handleStep2VerifyAndSignIn} isLoading={loading} disabled={!verifyToken}>
                  Verify Email & Sign In
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Business Info & Locale/Currency/Timezone */}
          {wizardStep === 3 && (
            <form
              onSubmit={handleStep3SaveBusiness}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5 max-w-3xl"
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  03. Business Information & Regional Defaults
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Configures store legal entity, default currency, locale tag, and IANA timezone.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Legal Business Name" value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
                <Input label="Business Category" value={category} onChange={(e) => setCategory(e.target.value)} required />
                <Input label="Country" value={country} onChange={(e) => setCountry(e.target.value)} required />
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Default Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => handleCurrencyChange(e.target.value as 'BDT' | 'USD' | 'EUR' | 'GBP')}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="BDT">BDT — Bangladeshi Taka</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </div>
                <Input label="Store Locale" value={locale} onChange={(e) => setLocale(e.target.value)} required />
                <Input label="Store Timezone (IANA)" value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button type="submit" isLoading={loading}>
                  Save Business Profile
                </Button>
              </div>
            </form>
          )}

          {/* Step 4: Store Name & Normalized Reserved Slug Check */}
          {wizardStep === 4 && (
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5 max-w-3xl">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  04. Store Name & Unique Slug Protection
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Normalizes Unicode/punctuation, enforces reserved platform/official slug bans, and suggests available handles on collision.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Store Display Name"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                />
                <Input
                  label="Desired Store Slug"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  helperText={`Subdomain preview: ${(customSlug || 'your-store').toLowerCase()}.nexora.shop`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Quick policy checks:</span>
                <button
                  type="button"
                  onClick={() => handleCheckSlug('nexora-official')}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Test Reserved (&quot;nexora-official&quot;)
                </button>
                <button
                  type="button"
                  onClick={() => handleCheckSlug('urbanwear')}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Test Collision (&quot;urbanwear&quot;)
                </button>
                <button
                  type="button"
                  onClick={() => handleCheckSlug('Café & Co. Studio!')}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Test Normalization (&quot;Café &amp; Co.!&quot;)
                </button>
              </div>

              {slugCheckResult && (
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      Normalized: {slugCheckResult.normalizedSlug || '(empty)'}
                    </span>
                    <span
                      className={`font-semibold ${
                        slugCheckResult.available
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {slugCheckResult.available
                        ? 'Available'
                        : slugCheckResult.isReserved
                        ? 'Reserved Slug Blocked'
                        : 'Unavailable / Collision'}
                    </span>
                  </div>
                  {slugCheckResult.reason && (
                    <p className="text-slate-600 dark:text-slate-400">{slugCheckResult.reason}</p>
                  )}
                  {slugCheckResult.suggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-slate-500">Available alternatives:</span>
                      {slugCheckResult.suggestions.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => handleCheckSlug(sug)}
                          className="font-mono px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 cursor-pointer"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="ghost" onClick={() => setWizardStep(3)}>Back</Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => handleCheckSlug()} isLoading={loading}>
                    Check Slug Availability
                  </Button>
                  <Button
                    onClick={() => setWizardStep(5)}
                    disabled={slugCheckResult ? !slugCheckResult.available : false}
                  >
                    Continue to Plan &amp; Theme
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Free Plan, Default Theme & Atomic Idempotent Provisioning */}
          {wizardStep === 5 && (
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-6 max-w-4xl">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  05. Free Plan, Default Theme &amp; Transaction-Safe Provisioning
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Atomically provisions Tenant, Store, STARTER Free Plan Subscription, Theme + Branding, Shipping Settings, 8 Tenant Roles, and Store Owner Membership.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {themes.map((t) => {
                  const isSelected = selectedTheme === t.code;
                  return (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setSelectedTheme(t.code)}
                      className={`text-left p-4 rounded-xl border transition-colors cursor-pointer space-y-2 ${
                        isSelected
                          ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{t.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="w-3.5 h-3.5 rounded-sm border border-slate-200" style={{ backgroundColor: t.primaryColor }} />
                          <span className="w-3.5 h-3.5 rounded-sm border border-slate-200" style={{ backgroundColor: t.accentColor }} />
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{t.description}</p>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {t.fontHeading} · {t.layoutMode}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Input
                  label="Idempotency Key (Retry Safe)"
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  helperText="Re-submitting with this key replays the exact store without creating duplicates."
                />
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-white">Assigned Plan: STARTER Free</div>
                  <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                    0 BDT / month · 50 Products · 2 Staff · 1,024 MB Storage
                  </div>
                </div>
              </div>

              {lastProvisionNotice && (
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 font-mono">
                  {lastProvisionNotice}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="ghost" onClick={() => setWizardStep(4)}>Back</Button>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleProvisionStore('ASSIGN_DEFAULT_THEME')}
                    isLoading={loading}
                  >
                    Simulate Partial Failure &amp; Rollback
                  </Button>
                  <Button onClick={() => handleProvisionStore()} isLoading={loading}>
                    Provision Store Atomically
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Completed + Dashboard Redirect Summary */}
          {wizardStep === 6 && provisionResult && (
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5 max-w-4xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      06. Store Ready — Redirecting to {provisionResult.dashboardUrl}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lastProvisionNotice}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleProvisionStore()} isLoading={loading}>
                    Test Idempotent Replay
                  </Button>
                  <Button size="sm" onClick={() => setActiveTab('my-stores')}>
                    Open My Store Dashboard
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">Tenant &amp; Subdomain</span>
                  <div className="font-semibold text-slate-900 dark:text-white">{provisionResult.store.name}</div>
                  <div className="font-mono text-indigo-600 dark:text-indigo-400">{provisionResult.tenant.subdomain}.nexora.shop</div>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">Plan &amp; Subscription</span>
                  <div className="font-semibold text-slate-900 dark:text-white">{provisionResult.plan.name}</div>
                  <div className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {provisionResult.subscription.status} · ৳{provisionResult.plan.priceMonthlyBDT}/mo
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">Regional Settings</span>
                  <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                    {provisionResult.store.currency} · {provisionResult.store.locale}
                  </div>
                  <div className="font-mono text-slate-600 dark:text-slate-300">{provisionResult.store.timezone}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">RBAC &amp; Theme</span>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {provisionResult.ownerMembership.roleSlug} ({provisionResult.rolesCount} roles)
                  </div>
                  <div className="font-mono text-slate-600 dark:text-slate-300">{provisionResult.theme.themeName}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY PROVISIONED STORES (SERVER-DERIVED) */}
      {activeTab === 'my-stores' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Server-Resolved Merchant Stores
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Resolved strictly from active server-side StoreMembership records for the signed-in session (never trusting client-supplied tenantId).
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={refreshContext} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
              Refresh
            </Button>
          </div>

          {!currentUser ? (
            <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sign in or complete the Store Creation Wizard to view your provisioned tenant stores.
              </p>
              <Button size="sm" onClick={() => setActiveTab('wizard')}>Go to Store Creation Wizard</Button>
            </div>
          ) : myStores.length === 0 ? (
            <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                No store memberships associated with <span className="font-mono">{currentUser.email}</span>.
              </p>
              <Button size="sm" onClick={() => setActiveTab('wizard')}>Create Your First Store</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {myStores.map((bundle) => (
                <div
                  key={bundle.tenant.id}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                          {bundle.store.name}
                        </h3>
                      </div>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {bundle.tenant.subdomain}.nexora.shop · Role: {bundle.myRoleSlug || bundle.ownerMembership.roleSlug}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        bundle.tenant.status === 'ACTIVE'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {bundle.tenant.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-slate-400 block">Plan</span>
                      <span className="font-medium text-slate-900 dark:text-white">{bundle.plan.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Currency / Locale</span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                        {bundle.store.currency} · {bundle.store.locale}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Timezone</span>
                      <span className="font-mono text-slate-900 dark:text-white">{bundle.store.timezone}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Theme: <span className="text-slate-800 dark:text-slate-200 font-medium">{bundle.theme.themeName}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleInspectStorefront(bundle.store.slug)}
                      leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
                    >
                      Verify Storefront
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {storefrontPreview && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Storefront Endpoint Probe (GET /api/v1/onboarding/storefront/{storefrontPreview.slug}) — HTTP {storefrontPreview.status}
              </div>
              <p className="font-mono text-slate-600 dark:text-slate-300">{storefrontPreview.message}</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: NEXORA OFFICIAL STORE & PLATFORM LIFECYCLE */}
      {activeTab === 'official-lifecycle' && (
        <div className="space-y-6">
          {/* Segregated Official Store Card */}
          {officialStore && officialIsolation && (
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Platform-Owned Flagship Store · Segregated Permission Boundary</span>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {officialStore.store.name} ({officialStore.store.slug}.nexora.shop)
                  </h2>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleInspectStorefront(officialStore.store.slug)}
                >
                  Check Public Storefront
                </Button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-4xl">
                {officialIsolation.description}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2">
                <div>
                  <span className="text-slate-400 block">Ownership Model</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {officialIsolation.ownershipModel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Shared Platform Admin Perms</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {String(officialIsolation.sharesPlatformAdminPermissions)} (Isolated)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Store Owner Account Type</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {officialIsolation.dedicatedOwnerAccountType}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Regional Config</span>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                    {officialStore.store.currency} · {officialStore.store.locale} · {officialStore.store.timezone}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Platform Governance: Store Suspension & Activation Table */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Platform Store Lifecycle Controls (Suspend / Activate)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Requires platform:tenants:manage permission. Suspending a store immediately blocks its storefront and merchant RBAC operations.
                </p>
              </div>
              {!currentUser?.userType?.startsWith('PLATFORM_') && (
                <Button
                  size="sm"
                  onClick={() => loginPersona('superadmin@nexora.cloud', 'NexoraDemo!2026', 'Platform Super Admin')}
                >
                  Authenticate as Super Admin
                </Button>
              )}
            </div>

            {platformStores.length > 0 ? (
              <div className="space-y-4">
                <div className="max-w-md">
                  <Input
                    label="Suspension Reason (for audit log)"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 pr-4 font-medium">Store Name</th>
                        <th className="py-2.5 pr-4 font-medium">Slug</th>
                        <th className="py-2.5 pr-4 font-medium">Classification</th>
                        <th className="py-2.5 pr-4 font-medium">Currency / TZ</th>
                        <th className="py-2.5 pr-4 font-medium">Status</th>
                        <th className="py-2.5 text-right font-medium">Governance Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {platformStores.map((row) => (
                        <tr key={row.tenant.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">{row.store.name}</td>
                          <td className="py-3 pr-4 font-mono text-slate-600 dark:text-slate-300">{row.store.slug}</td>
                          <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{row.ownershipLabel}</td>
                          <td className="py-3 pr-4 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {row.store.currency} · {row.store.timezone}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`font-semibold ${
                                row.tenant.status === 'ACTIVE'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {row.tenant.status}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            {row.tenant.status === 'SUSPENDED' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleActivateStore(row.tenant.id)}
                                disabled={loading}
                              >
                                Activate
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleSuspendStore(row.tenant.id)}
                                disabled={loading}
                              >
                                Suspend
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-400">
                Platform tenant governance table is locked until authenticated as a Platform Admin / Super Admin.
              </div>
            )}

            {storefrontPreview && (
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-700 dark:text-slate-300">
                Storefront Probe ({storefrontPreview.slug}): HTTP {storefrontPreview.status} — {storefrontPreview.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: RESILIENCE & AUTOMATED TEST SUITE */}
      {activeTab === 'tests' && (
        <div className="space-y-5">
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Automated Store Provisioning &amp; Isolation Verification
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Executes 10 live HTTP test scenarios covering 11-step onboarding, duplicate registration, slug normalization/reserved bans,
                partial failure rollback, idempotent retry, store suspension/activation, and NEXORA Official Store segregation.
              </p>
            </div>
            <Button
              onClick={handleRunVerificationSuite}
              isLoading={testRunning}
              leftIcon={<Play className="w-3.5 h-3.5" />}
            >
              Run All 10 Tests
            </Button>
          </div>

          {testReport && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                  Results: {testReport.passed}/{testReport.totalTests} Passed · {testReport.failed} Failed
                </span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {new Date(testReport.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {testReport.results.map((t) => (
                  <div key={t.id} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        {t.status === 'PASSED' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        )}
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{t.id}</span>
                        <span className="font-medium text-slate-900 dark:text-white">{t.name}</span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 pl-6">{t.details}</p>
                    </div>
                    <div className="flex items-center gap-3 pl-6 sm:pl-0 shrink-0 font-mono tabular-nums">
                      <span className="text-slate-400">{t.durationMs} ms</span>
                      <span className={t.status === 'PASSED' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 font-semibold'}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
