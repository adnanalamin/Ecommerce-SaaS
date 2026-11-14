/**
 * NEXORA Super Admin — Governance, Branding, Settings & Audit Modules
 * Covers: Advertisement Governance, Platform Branding, Global Settings, Audit Logs & Automated Verification Suite.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { Switch } from '../ui/Switch.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  CheckCircle2,
  Download,
  Palette,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  triggerCsvDownload,
  type ApiCallFn,
  type ConfirmActionConfig,
  type PaginationMeta,
} from './platformTypes.ts';

interface GovernanceModuleProps {
  mode: 'ads' | 'branding' | 'settings' | 'audit';
  apiCall: ApiCallFn;
  permissions: string[];
  onRequestConfirm: (cfg: ConfirmActionConfig) => void;
  onMutated: () => void;
}

interface VerificationResult {
  id: string;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
  error?: string;
}

interface VerificationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: VerificationResult[];
}

export const PlatformGovernanceModules: React.FC<GovernanceModuleProps> = ({
  mode,
  apiCall,
  permissions,
  onRequestConfirm,
  onMutated,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const canManageAds = permissions.includes('platform:ads:manage');
  const canManageSettings = permissions.includes('platform:settings:manage');
  const canReadAudit = permissions.includes('platform:audit:read');
  const canExport = permissions.includes('platform:export:data');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Ads state
  const [adsSearch, setAdsSearch] = useState('');
  const [adsPage, setAdsPage] = useState(1);
  const [adsPagination, setAdsPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 8,
    total: 0,
    totalPages: 1,
  });
  const [adsList, setAdsList] = useState<any[]>([]);

  // Branding state
  const [branding, setBranding] = useState<any>(null);

  // Global settings state
  const [settingsList, setSettingsList] = useState<any[]>([]);
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});

  // Audit & Verification state
  const [auditSearch, setAuditSearch] = useState('');
  const [auditScope, setAuditScope] = useState('ALL');
  const [auditOutcome, setAuditOutcome] = useState('ALL');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [verifyReport, setVerifyReport] = useState<VerificationReport | null>(null);
  const [runningVerify, setRunningVerify] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'ads' && canManageAds) {
        const params = new URLSearchParams({
          page: String(adsPage),
          limit: '8',
          ...(adsSearch.trim() ? { search: adsSearch.trim() } : {}),
        });
        const { res, json } = await apiCall(`/api/v1/platform/ads?${params.toString()}`);
        if (res.ok && json?.data) {
          setAdsList(json.data.items || []);
          setAdsPagination(json.data.pagination);
        }
      } else if (mode === 'branding' && canManageSettings) {
        const { res, json } = await apiCall('/api/v1/platform/branding');
        if (res.ok && json?.data?.branding) {
          setBranding(json.data.branding);
        }
      } else if (mode === 'settings' && canManageSettings) {
        const { res, json } = await apiCall('/api/v1/platform/settings');
        if (res.ok && json?.data?.settings) {
          const items = json.data.settings || [];
          setSettingsList(items);
          const drafts: Record<string, string> = {};
          for (const item of items) {
            drafts[item.key] = String(item.value);
          }
          setSettingDrafts(drafts);
        }
      } else if (mode === 'audit' && canReadAudit) {
        const params = new URLSearchParams({
          page: String(auditPage),
          limit: '10',
          ...(auditSearch.trim() ? { search: auditSearch.trim() } : {}),
          ...(auditScope !== 'ALL' ? { scope: auditScope } : {}),
          ...(auditOutcome !== 'ALL' ? { outcome: auditOutcome } : {}),
        });
        const { res, json } = await apiCall(`/api/v1/platform/audit-logs?${params.toString()}`);
        if (res.ok && json?.data) {
          setAuditLogs(json.data.items || []);
          setAuditPagination(json.data.pagination);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [
    apiCall,
    mode,
    canManageAds,
    canManageSettings,
    canReadAudit,
    adsPage,
    adsSearch,
    auditPage,
    auditSearch,
    auditScope,
    auditOutcome,
  ]);

  useEffect(() => {
    setAdsPage(1);
    setAuditPage(1);
  }, [mode, adsSearch, auditSearch, auditScope, auditOutcome]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleAdPolicy = async (
    tenantId: string,
    tenantName: string,
    patch: { isEnabled?: boolean; autoAdsEnabled?: boolean; isConsentBannerEnabled?: boolean }
  ) => {
    setBusy(true);
    try {
      const { res, json } = await apiCall(`/api/v1/platform/ads/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toastError('Ad Policy Failed', json?.error?.message || 'Unable to update ad policy.');
        return;
      }
      toastSuccess('Ad Governance Updated', `Updated advertisement policy for ${tenantName}.`);
      await loadData();
      onMutated();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branding) return;
    setBusy(true);
    try {
      const payload = {
        platformName: branding.platformName,
        tagline: branding.tagline,
        supportEmail: branding.supportEmail,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
        surfaceTint: branding.surfaceTint,
        footerAttribution: branding.footerAttribution,
        allowMerchantCustomCss: Boolean(branding.allowMerchantCustomCss),
      };
      const { res, json } = await apiCall('/api/v1/platform/branding', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toastError('Branding Update Failed', json?.error?.message || 'Validation error.');
        return;
      }
      setBranding(json.data.branding);
      toastSuccess('Platform Branding Saved', 'Global white-label theme tokens updated.');
      onMutated();
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateSetting = async (item: any, nextVal: string | number | boolean) => {
    const execUpdate = async () => {
      setBusy(true);
      try {
        const { res, json } = await apiCall(`/api/v1/platform/settings/${encodeURIComponent(item.key)}`, {
          method: 'PATCH',
          body: JSON.stringify({ value: nextVal }),
        });
        if (!res.ok) {
          toastError('Setting Update Failed', json?.error?.message || 'Unable to update setting.');
          return;
        }
        toastSuccess('Global Setting Saved', `${item.key} set to ${String(nextVal)}.`);
        await loadData();
        onMutated();
      } finally {
        setBusy(false);
      }
    };

    if (item.key === 'platform.maintenanceMode' && nextVal === true) {
      onRequestConfirm({
        title: 'Enable Platform Maintenance Mode',
        description:
          'Enabling maintenance mode restricts merchant storefront writes across NEXORA until disabled. Confirm this change.',
        confirmLabel: 'Enable Maintenance Mode',
        danger: true,
        onConfirm: execUpdate,
      });
      return;
    }

    await execUpdate();
  };

  const handleExportAuditLogs = async () => {
    setBusy(true);
    try {
      const { res, json } = await apiCall('/api/v1/platform/export/audit_logs');
      if (!res.ok) {
        toastError('Export Denied', json?.error?.message || 'Export permission required.');
        return;
      }
      triggerCsvDownload(json.data.filename, json.data.csv);
      toastSuccess('Audit CSV Exported', `Downloaded ${json.data.rowCount} audit log records.`);
      onMutated();
    } finally {
      setBusy(false);
    }
  };

  const handleRunVerification = async () => {
    setRunningVerify(true);
    try {
      const { res, json } = await apiCall('/api/v1/platform/verify', { method: 'POST' });
      if (!res.ok) {
        toastError('Verification Error', json?.error?.message || 'Verification suite failed.');
        return;
      }
      const report: VerificationReport = json.data;
      setVerifyReport(report);
      if (report.failed === 0) {
        toastSuccess(
          'Phase 09 Suite Passed',
          `${report.passed}/${report.totalTests} governance & security tests passed.`
        );
      } else {
        toastError(
          'Verification Failures Detected',
          `${report.failed} of ${report.totalTests} checks failed.`
        );
      }
      await loadData();
      onMutated();
    } finally {
      setRunningVerify(false);
    }
  };

  // Permission Guard Banner
  if (
    (mode === 'ads' && !canManageAds) ||
    ((mode === 'branding' || mode === 'settings') && !canManageSettings) ||
    (mode === 'audit' && !canReadAudit)
  ) {
    return (
      <Card>
        <CardBody>
          <div className="py-10 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Insufficient Governance Permission
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Your active platform role does not hold the required permission for the{' '}
              <span className="font-mono font-semibold">{mode}</span> module. Switch to Super Admin
              to manage global settings, branding, or ad policies.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  // ==========================================
  // 1. ADVERTISEMENT GOVERNANCE ENTRY
  // ==========================================
  if (mode === 'ads') {
    return (
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Advertisement Management &amp; ADR-011 Zero-Ad Checkout Policy
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Monitor merchant AdSense enablement, consent banners, impressions, and mandatory financial route exclusions
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
            <span>/checkout, /cart, /payment Excluded</span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[240px]">
                <Input
                  placeholder="Search tenant store or AdSense publisher ID..."
                  value={adsSearch}
                  onChange={(e) => setAdsSearch(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
                Refresh
              </Button>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Tenant Store</th>
                    <th className="py-2.5 px-3 font-semibold">Plan / Publisher ID</th>
                    <th className="py-2.5 px-3 font-semibold">Ads Enabled</th>
                    <th className="py-2.5 px-3 font-semibold">Auto-Ads</th>
                    <th className="py-2.5 px-3 font-semibold">Consent Banner</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Impressions / Est. Rev</th>
                    <th className="py-2.5 px-3 font-semibold">Protected Routes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Loading advertisement policies...
                      </td>
                    </tr>
                  ) : adsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No tenant advertisement policies found.
                      </td>
                    </tr>
                  ) : (
                    adsList.map((ad) => (
                      <tr key={ad.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {ad.tenantName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">{ad.tenantSlug}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-slate-800 dark:text-slate-200">
                            {ad.planCode}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">{ad.publisherId}</div>
                        </td>
                        <td className="py-3 px-3">
                          <Switch
                            checked={Boolean(ad.isEnabled)}
                            disabled={busy}
                            onChange={(checked) => {
                              if (!checked) {
                                onRequestConfirm({
                                  title: `Disable Ads for ${ad.tenantName}`,
                                  description:
                                    'Disabling tenant monetization immediately removes ad units across their storefront.',
                                  confirmLabel: 'Disable Ads',
                                  danger: true,
                                  onConfirm: () =>
                                    handleToggleAdPolicy(ad.tenantId, ad.tenantName, {
                                      isEnabled: false,
                                    }),
                                });
                              } else {
                                handleToggleAdPolicy(ad.tenantId, ad.tenantName, { isEnabled: true });
                              }
                            }}
                          />
                        </td>
                        <td className="py-3 px-3">
                          <Switch
                            checked={Boolean(ad.autoAdsEnabled)}
                            disabled={busy || !ad.isEnabled}
                            onChange={(checked) =>
                              handleToggleAdPolicy(ad.tenantId, ad.tenantName, {
                                autoAdsEnabled: checked,
                              })
                            }
                          />
                        </td>
                        <td className="py-3 px-3">
                          <Switch
                            checked={Boolean(ad.isConsentBannerEnabled)}
                            disabled={busy}
                            onChange={(checked) =>
                              handleToggleAdPolicy(ad.tenantId, ad.tenantName, {
                                isConsentBannerEnabled: checked,
                              })
                            }
                          />
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          <div className="text-slate-900 dark:text-white font-semibold">
                            {Number(ad.monthlyImpressions || 0).toLocaleString()}
                          </div>
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                            $ {Number(ad.estimatedRevenueUSD || 0).toFixed(2)}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                          {(ad.excludedRoutes || []).join(', ')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={adsPagination.page}
              totalPages={adsPagination.totalPages}
              totalRecords={adsPagination.total}
              onPageChange={setAdsPage}
            />
          </div>
        </CardBody>
      </Card>
    );
  }

  // ==========================================
  // 2. PLATFORM BRANDING
  // ==========================================
  if (mode === 'branding') {
    return (
      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Platform Branding &amp; White-Label Tokens
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure NEXORA platform identity, support contact, theme colors, and merchant CSS policy
            </p>
          </div>
          <Palette className="w-4 h-4 text-indigo-500 shrink-0" />
        </CardHeader>
        <CardBody>
          {loading || !branding ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Loading platform branding configuration...
            </div>
          ) : (
            <form onSubmit={handleSaveBranding} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Platform Display Name"
                  value={branding.platformName}
                  onChange={(e) => setBranding({ ...branding, platformName: e.target.value })}
                  required
                />
                <Input
                  label="Platform Support Email"
                  type="email"
                  value={branding.supportEmail}
                  onChange={(e) => setBranding({ ...branding, supportEmail: e.target.value })}
                  required
                />
                <Input
                  label="Platform Tagline"
                  value={branding.tagline}
                  onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
                  required
                />
                <Input
                  label="Footer Attribution"
                  value={branding.footerAttribution}
                  onChange={(e) => setBranding({ ...branding, footerAttribution: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Primary Brand Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                      className="h-9 w-12 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
                    />
                    <Input
                      value={branding.primaryColor}
                      onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Accent Highlight Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={branding.accentColor}
                      onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                      className="h-9 w-12 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
                    />
                    <Input
                      value={branding.accentColor}
                      onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Surface Header Tint
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={branding.surfaceTint}
                      onChange={(e) => setBranding({ ...branding, surfaceTint: e.target.value })}
                      className="h-9 w-12 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
                    />
                    <Input
                      value={branding.surfaceTint}
                      onChange={(e) => setBranding({ ...branding, surfaceTint: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={Boolean(branding.allowMerchantCustomCss)}
                    onChange={(checked) =>
                      setBranding({ ...branding, allowMerchantCustomCss: checked })
                    }
                  />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      Allow Merchant Custom CSS Scopes
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Permits paid-tier storefronts to override scoped theme variables safely.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {branding.updatedByEmail && (
                    <span className="text-[11px] font-mono text-slate-400">
                      Last updated by {branding.updatedByEmail}
                    </span>
                  )}
                  <Button type="submit" disabled={busy}>
                    Save Platform Branding
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    );
  }

  // ==========================================
  // 3. GLOBAL SETTINGS
  // ==========================================
  if (mode === 'settings') {
    return (
      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Global System Settings
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Platform-wide security, billing, onboarding, and operational controls backed by audit trails
            </p>
          </div>
          <Settings className="w-4 h-4 text-indigo-500 shrink-0" />
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Loading global system settings...
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {settingsList.map((item) => (
                <div
                  key={item.key}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {item.key}
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                        {item.category}
                      </span>
                      {item.isPublic && (
                        <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                          Public
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                    <p className="text-[11px] font-mono text-slate-400">
                      Updated {new Date(item.updatedAt).toLocaleString()}
                      {item.updatedByEmail ? ` · by ${item.updatedByEmail}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.valueType === 'boolean' ? (
                      <Switch
                        checked={Boolean(item.value)}
                        disabled={busy}
                        onChange={(checked) => handleUpdateSetting(item, checked)}
                      />
                    ) : (
                      <>
                        <input
                          type={item.valueType === 'number' ? 'number' : 'text'}
                          value={settingDrafts[item.key] ?? String(item.value)}
                          onChange={(e) =>
                            setSettingDrafts((prev) => ({ ...prev, [item.key]: e.target.value }))
                          }
                          className="w-36 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-slate-100"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            const raw = settingDrafts[item.key] ?? String(item.value);
                            const val = item.valueType === 'number' ? Number(raw) : raw;
                            handleUpdateSetting(item, val);
                          }}
                        >
                          Save
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  // ==========================================
  // 4. AUDIT LOGS & VERIFICATION SUITE
  // ==========================================
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Platform Audit Logs
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Immutable administrative governance trail covering role mutations, suspensions, support grants, and exports
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canExport && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportAuditLogs}
                disabled={busy}
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Export Audit CSV
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleRunVerification}
              disabled={runningVerify}
              leftIcon={
                runningVerify ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )
              }
            >
              {runningVerify ? 'Running Suite...' : 'Run Phase 09 Verification'}
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <Input
                  placeholder="Search actor email, action, resource, or reason..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <select
                value={auditScope}
                onChange={(e) => setAuditScope(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="ALL">All Scopes</option>
                <option value="PLATFORM">PLATFORM</option>
                <option value="TENANT">TENANT</option>
                <option value="STOREFRONT">STOREFRONT</option>
              </select>
              <select
                value={auditOutcome}
                onChange={(e) => setAuditOutcome(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="ALL">All Outcomes</option>
                <option value="ALLOWED">ALLOWED</option>
                <option value="DENIED">DENIED</option>
              </select>
              <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
                Refresh
              </Button>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                    <th className="py-2.5 px-3 font-semibold">Actor</th>
                    <th className="py-2.5 px-3 font-semibold">Action & Resource</th>
                    <th className="py-2.5 px-3 font-semibold">Outcome</th>
                    <th className="py-2.5 px-3 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Loading platform audit logs...
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No audit entries match the current filters.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-slate-900 dark:text-white">
                            {log.actorEmail || 'system'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {log.scope} · {log.actorRole}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {log.action}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {log.resourceType}
                            {log.resourceId ? ` · ${log.resourceId}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold whitespace-nowrap">
                          {log.outcome === 'ALLOWED' ? (
                            <span className="text-emerald-600 dark:text-emerald-400">ALLOWED</span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400">DENIED</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-md">
                          {log.reason || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={auditPagination.page}
              totalPages={auditPagination.totalPages}
              totalRecords={auditPagination.total}
              onPageChange={setAuditPage}
            />
          </div>
        </CardBody>
      </Card>

      {/* Automated Verification Output */}
      {verifyReport && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {`Phase 09 Verification Report (${verifyReport.passed}/${verifyReport.totalTests} Passed)`}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {`Executed at ${new Date(verifyReport.timestamp).toLocaleString()} against live Express authorization middleware`}
              </p>
            </div>
            {verifyReport.failed === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
                ALL PASSED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                <XCircle className="w-4 h-4" />
                {verifyReport.failed} FAILED
              </span>
            )}
          </CardHeader>
          <CardBody>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {verifyReport.results.map((r) => (
                <div
                  key={r.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {r.id}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">{r.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">{r.category}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {r.error ? r.error : r.details}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 font-mono text-xs tabular-nums">
                    <span className="text-slate-400">{r.durationMs}ms</span>
                    <span
                      className={
                        r.status === 'PASSED'
                          ? 'font-bold text-emerald-600 dark:text-emerald-400'
                          : 'font-bold text-rose-600 dark:text-rose-400'
                      }
                    >
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
};
