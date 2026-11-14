/**
 * NEXORA Phase 10 — Store Operations, Configuration, Analytics & Subscription Modules
 *  9. Store Settings
 * 10. Staff Management
 * 11. Store Branding
 * 12. Payment Settings (Secret-Safe)
 * 13. Shipping Settings
 * 14. Analytics
 * 15. Subscription Management
 *  + Automated Two-Tenant Isolation Verifier
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Input } from '../ui/Input.tsx';
import { Select } from '../ui/Select.tsx';
import { Switch } from '../ui/Switch.tsx';
import { Modal } from '../ui/Modal.tsx';
import { SkeletonTable } from '../ui/Skeleton.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { ErrorState } from '../ui/ErrorState.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  BarChart3,
  CheckCircle2,
  CreditCard,
  Crown,
  Palette,
  Plus,
  Settings,
  ShieldCheck,
  Truck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import type { TenantApiCallFn, TenantConfirmConfig } from './tenantTypes.ts';
import { ConversionFunnelWidget, RevenueOrdersBarChart, formatBDT } from './TenantWidgets.tsx';

export const TenantOperationsModules: React.FC<{
  tenantId: string;
  mode: 'settings' | 'staff' | 'branding' | 'payments' | 'shipping' | 'analytics' | 'subscription';
  permissions: string[];
  apiCall: TenantApiCallFn;
  onRequestConfirm: (cfg: TenantConfirmConfig) => void;
  onDataMutated: () => void;
}> = ({ tenantId, mode, permissions, apiCall, onRequestConfirm, onDataMutated }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Store settings
  const [settings, setSettings] = useState<any>(null);
  // Branding
  const [branding, setBranding] = useState<any>(null);
  // Payments
  const [gateways, setGateways] = useState<any[]>([]);
  // Shipping
  const [shippingMethods, setShippingMethods] = useState<any[]>([]);
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipCode, setShipCode] = useState('');
  const [shipName, setShipName] = useState('');
  const [shipZone, setShipZone] = useState('');
  const [shipCarrier, setShipCarrier] = useState('Steadfast');
  const [shipRate, setShipRate] = useState('100');
  const [shipFreeAbove, setShipFreeAbove] = useState('5000');
  const [shipDays, setShipDays] = useState('2-3 business days');
  const [shipCod, setShipCod] = useState(true);

  // Staff
  const [staffData, setStaffData] = useState<any>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('product_manager');

  // Analytics
  const [analytics, setAnalytics] = useState<any>(null);
  const [testReport, setTestReport] = useState<any>(null);
  const [runningTests, setRunningTests] = useState(false);

  // Subscription
  const [subData, setSubData] = useState<any>(null);

  const loadModule = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (mode === 'settings') {
        const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/settings`);
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Permission required (settings:manage).');
        setSettings(json.data.settings);
      } else if (mode === 'branding') {
        const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/branding`);
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Permission required (theme:manage).');
        setBranding(json.data.branding);
      } else if (mode === 'payments') {
        const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/payments`);
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Permission required (settings:manage).');
        setGateways(json.data.gateways || []);
      } else if (mode === 'shipping') {
        const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/shipping`);
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Permission required.');
        setShippingMethods(json.data.methods || []);
      } else if (mode === 'staff') {
        const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/staff`);
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Permission required (staff:read).');
        setStaffData(json.data);
      } else if (mode === 'analytics') {
        const [anaRes, ovRes] = await Promise.all([
          apiCall(`/api/v1/tenant/${tenantId}/analytics`),
          apiCall(`/api/v1/tenant/${tenantId}/overview`),
        ]);
        if (!anaRes.res.ok) return setErrorMsg(anaRes.json?.error?.message || 'Analytics access denied.');
        setAnalytics({ ...anaRes.json.data, conversionMetrics: ovRes.json?.data?.conversionMetrics });
      } else if (mode === 'subscription') {
        const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/subscription`);
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Unable to load subscription details.');
        setSubData(json.data);
      }
    } catch {
      setErrorMsg('Failed to load module data.');
    } finally {
      setLoading(false);
    }
  }, [apiCall, tenantId, mode]);

  useEffect(() => {
    loadModule();
  }, [loadModule]);

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          storeName: settings.storeName,
          supportEmail: settings.supportEmail,
          supportPhone: settings.supportPhone,
          currency: settings.currency,
          timezone: settings.timezone,
          taxRatePct: Number(settings.taxRatePct),
          taxInclusivePricing: Boolean(settings.taxInclusivePricing),
          lowStockAlertThreshold: Number(settings.lowStockAlertThreshold),
          guestCheckoutEnabled: Boolean(settings.guestCheckoutEnabled),
          customDomain: settings.customDomain,
        }),
      });
      if (!res.ok) {
        toastError('Save Failed', json?.error?.message || 'Unable to save settings.');
        return;
      }
      setSettings(json.data.settings);
      toastSuccess('Store Settings Saved', 'Operational configuration updated.');
      onDataMutated();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBranding = async () => {
    if (!branding) return;
    setSaving(true);
    try {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/branding`, {
        method: 'PUT',
        body: JSON.stringify({
          themeCode: branding.themeCode,
          primaryColor: branding.primaryColor,
          secondaryColor: branding.secondaryColor,
          accentColor: branding.accentColor,
          fontHeading: branding.fontHeading,
          headerAnnouncement: branding.headerAnnouncement,
          heroHeadline: branding.heroHeadline,
          heroSubheadline: branding.heroSubheadline,
          footerText: branding.footerText,
          showPoweredByNexora: Boolean(branding.showPoweredByNexora),
        }),
      });
      if (!res.ok) {
        toastError('Branding Update Failed', json?.error?.message || 'Permission or color validation error.');
        return;
      }
      setBranding(json.data.branding);
      toastSuccess('Store Branding Published', 'Storefront visual tokens updated.');
      onDataMutated();
    } finally {
      setSaving(false);
    }
  };

  const handleInviteStaff = async () => {
    if (!inviteEmail.trim()) return;
    setSaving(true);
    try {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/staff/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), roleSlug: inviteRole }),
      });
      if (!res.ok) {
        toastError('Invite Blocked', json?.error?.message || 'Quota or hierarchy limit reached.');
        return;
      }
      toastSuccess('Staff Invited', `Invitation issued to ${inviteEmail.trim()} (${inviteRole}).`);
      setInviteEmail('');
      await loadModule();
    } finally {
      setSaving(false);
    }
  };

  const handleRunIsolationSuite = async () => {
    setRunningTests(true);
    try {
      const { res, json } = await apiCall('/api/v1/tenant/verify', { method: 'POST' });
      if (res.ok && json?.data) {
        setTestReport(json.data);
        toastSuccess(
          'Two-Tenant Isolation Suite Complete',
          `${json.data.passed}/${json.data.totalTests} assertions passed.`
        );
      } else {
        toastError('Verification Error', json?.error?.message || 'Suite failed.');
      }
    } finally {
      setRunningTests(false);
    }
  };

  if (loading) return <SkeletonTable rows={5} columns={4} />;
  if (errorMsg) return <ErrorState title="Module Restricted" message={errorMsg} onRetry={loadModule} />;

  return (
    <div className="space-y-4">
      {/* STORE SETTINGS */}
      {mode === 'settings' && settings && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Store Operational Settings</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Currency, tax, checkout & domain rules isolated to {settings.storeSlug}.nexora.shop
                </p>
              </div>
            </div>
            <Button size="sm" isLoading={saving} onClick={handleSaveSettings}>
              Save Settings
            </Button>
          </CardHeader>
          <CardBody className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input
                label="Store Display Name"
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
              />
              <Input
                label="Support Email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
              />
              <Input
                label="Support Phone"
                value={settings.supportPhone}
                onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
              />
              <Select
                label="Default Currency"
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                options={[
                  { value: 'BDT', label: 'BDT — Bangladeshi Taka' },
                  { value: 'USD', label: 'USD — US Dollar' },
                  { value: 'EUR', label: 'EUR — Euro' },
                  { value: 'GBP', label: 'GBP — British Pound' },
                ]}
              />
              <Input
                label="VAT / Tax Rate (%)"
                type="number"
                value={String(settings.taxRatePct)}
                onChange={(e) => setSettings({ ...settings, taxRatePct: Number(e.target.value) })}
              />
              <Input
                label="Custom Domain"
                value={settings.customDomain}
                onChange={(e) => setSettings({ ...settings, customDomain: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    Guest Checkout Enabled
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Allow shoppers to checkout without pre-registering
                  </span>
                </div>
                <Switch
                  checked={Boolean(settings.guestCheckoutEnabled)}
                  onChange={(checked) => setSettings({ ...settings, guestCheckoutEnabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    Tax-Inclusive Catalog Pricing
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Show final VAT-included prices on product cards
                  </span>
                </div>
                <Switch
                  checked={Boolean(settings.taxInclusivePricing)}
                  onChange={(checked) => setSettings({ ...settings, taxInclusivePricing: checked })}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* STAFF MANAGEMENT */}
      {mode === 'staff' && staffData && (
        <div className="space-y-4">
          {permissions.includes('staff:invite') && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Invite Store Team Member</h3>
                </div>
              </CardHeader>
              <CardBody className="p-4 flex flex-col sm:flex-row items-end gap-3">
                <div className="flex-1 w-full">
                  <Input
                    label="Staff Work Email"
                    placeholder="operations@yourstore.nexora.shop"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-56">
                  <Select
                    label="Store Role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    options={(staffData.assignableRoles || []).map((r: any) => ({
                      value: r.slug,
                      label: r.name,
                    }))}
                  />
                </div>
                <Button size="sm" isLoading={saving} onClick={handleInviteStaff}>
                  Send Invite
                </Button>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Active Store Memberships ({staffData.memberships?.length || 0})
                </h3>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Team Member</th>
                      <th className="px-4 py-2.5 font-semibold">Store Role</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Governance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(staffData.memberships || []).map((m: any) => (
                      <tr key={m.id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{m.userFullName}</div>
                          <div className="text-[11px] text-slate-400">{m.userEmail}</div>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {m.roleSlug}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={m.status === 'ACTIVE' ? 'success' : 'danger'}>{m.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {m.roleSlug !== 'store_owner' && m.status === 'ACTIVE' && permissions.includes('role:assign') ? (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                onRequestConfirm({
                                  title: `Revoke ${m.userEmail}?`,
                                  description: 'Immediately removes this member from your store team.',
                                  confirmLabel: 'Revoke Access',
                                  variant: 'danger',
                                  onConfirm: async () => {
                                    const { res } = await apiCall(
                                      `/api/v1/tenant/${tenantId}/staff/${m.userId}`,
                                      { method: 'DELETE' }
                                    );
                                    if (res.ok) {
                                      toastSuccess('Membership Revoked', `${m.userEmail} removed.`);
                                      await loadModule();
                                    }
                                  },
                                })
                              }
                            >
                              Revoke
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Protected</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* STORE BRANDING */}
      {mode === 'branding' && branding && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Storefront Theme & Copy</h3>
              </div>
              <Button size="sm" isLoading={saving} onClick={handleSaveBranding}>
                Publish Branding
              </Button>
            </CardHeader>
            <CardBody className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Theme Preset Code"
                  value={branding.themeCode}
                  onChange={(e) => setBranding({ ...branding, themeCode: e.target.value })}
                />
                <Input
                  label="Primary Hex"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                />
                <Input
                  label="Accent Hex"
                  value={branding.accentColor}
                  onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                />
              </div>
              <Input
                label="Top Announcement Bar"
                value={branding.headerAnnouncement}
                onChange={(e) => setBranding({ ...branding, headerAnnouncement: e.target.value })}
              />
              <Input
                label="Hero Headline"
                value={branding.heroHeadline}
                onChange={(e) => setBranding({ ...branding, heroHeadline: e.target.value })}
              />
              <Input
                label="Hero Subheadline"
                value={branding.heroSubheadline}
                onChange={(e) => setBranding({ ...branding, heroSubheadline: e.target.value })}
              />
              <Input
                label="Footer Copyright Notice"
                value={branding.footerText}
                onChange={(e) => setBranding({ ...branding, footerText: e.target.value })}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Live Storefront Preview</h3>
            </CardHeader>
            <CardBody className="p-4 space-y-3">
              <div
                className="rounded-lg p-3 text-[11px] text-white font-medium text-center"
                style={{ backgroundColor: branding.primaryColor }}
              >
                {branding.headerAnnouncement}
              </div>
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <span
                  className="text-[10px] font-mono uppercase tracking-wider font-bold"
                  style={{ color: branding.accentColor }}
                >
                  {branding.themeCode}
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{branding.heroHeadline}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{branding.heroSubheadline}</p>
                <div className="pt-2">
                  <span
                    className="inline-block px-3 py-1.5 rounded text-xs font-semibold text-white"
                    style={{ backgroundColor: branding.primaryColor }}
                  >
                    Shop Collection
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 text-center">{branding.footerText}</div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* PAYMENT SETTINGS */}
      {mode === 'payments' && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Payment Gateway Settings</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Credentials are masked server-side; raw API keys are never exposed in responses
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Gateway</th>
                    <th className="px-4 py-2.5 font-semibold">Merchant Account (Masked)</th>
                    <th className="px-4 py-2.5 font-semibold">Mode</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Fee</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Enabled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {gateways.map((g) => (
                    <tr key={g.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{g.displayName}</div>
                        <div className="text-[11px] text-slate-400">{g.settlementCycle}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                        {g.merchantAccountMasked}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={g.mode === 'LIVE' ? 'success' : 'warning'}>{g.mode}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {g.feePct}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Switch
                          checked={g.isEnabled}
                          onChange={async (checked) => {
                            const { res } = await apiCall(
                              `/api/v1/tenant/${tenantId}/payments/${g.gateway}`,
                              {
                                method: 'PATCH',
                                body: JSON.stringify({ isEnabled: checked }),
                              }
                            );
                            if (res.ok) {
                              toastSuccess(
                                'Gateway Updated',
                                `${g.gateway} ${checked ? 'enabled' : 'disabled'}.`
                              );
                              await loadModule();
                            }
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* SHIPPING SETTINGS */}
      {mode === 'shipping' && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Shipping Zones & Courier Rules ({shippingMethods.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Delivery rates, free-shipping thresholds & COD availability
                </p>
              </div>
            </div>
            {permissions.includes('settings:manage') && (
              <Button size="sm" onClick={() => setShipModalOpen(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Add Shipping Zone
              </Button>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {shippingMethods.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No shipping methods configured" description="Add a delivery zone for checkout." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Method & Carrier</th>
                      <th className="px-4 py-2.5 font-semibold">Zone</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Base Rate</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Free Above</th>
                      <th className="px-4 py-2.5 font-semibold">COD</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {shippingMethods.map((m) => (
                      <tr key={m.id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{m.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {m.code} • {m.carrier} • {m.estimatedDays}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{m.zoneName}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {formatBDT(m.baseRateBDT)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {m.freeShippingThresholdBDT > 0 ? formatBDT(m.freeShippingThresholdBDT) : 'Always Free'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={m.codSupported ? 'success' : 'neutral'}>
                            {m.codSupported ? 'COD OK' : 'PREPAID'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Switch
                            checked={m.isActive}
                            disabled={!permissions.includes('settings:manage')}
                            onChange={async (checked) => {
                              const { res } = await apiCall(
                                `/api/v1/tenant/${tenantId}/shipping/${m.id}`,
                                {
                                  method: 'PATCH',
                                  body: JSON.stringify({ isActive: checked }),
                                }
                              );
                              if (res.ok) {
                                toastSuccess('Shipping Updated', `${m.code} ${checked ? 'enabled' : 'disabled'}.`);
                                await loadModule();
                              }
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ANALYTICS & TWO-TENANT ISOLATION SUITE */}
      {mode === 'analytics' && analytics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardBody className="p-4">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block">Gross Margin</span>
                <span className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {analytics.unitEconomics.grossMarginPct}%
                </span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block">Catalog + Live Rev</span>
                <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {formatBDT(analytics.unitEconomics.grossRevenueBDT)}
                </span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block">Campaign Attribution</span>
                <span className="text-xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  {formatBDT(analytics.unitEconomics.activeCampaignImpactBDT)}
                </span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block">Coupon Uses</span>
                <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {analytics.unitEconomics.couponRedemptions}
                </span>
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RevenueOrdersBarChart series={analytics.dailySeries || []} title="Store Revenue Velocity" />
            {analytics.conversionMetrics && (
              <ConversionFunnelWidget metrics={analytics.conversionMetrics} />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Category Revenue Breakdown</h3>
                </div>
              </CardHeader>
              <CardBody className="p-4 space-y-3">
                {(analytics.categoryBreakdown || []).map((c: any) => (
                  <div key={c.categoryName} className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white block">{c.categoryName}</span>
                      <span className="text-[11px] font-mono text-slate-400">{c.unitsSold} units sold</span>
                    </div>
                    <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatBDT(c.revenueBDT)}
                    </span>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Automated Two-Tenant Isolation Verifier
                  </h3>
                </div>
                <Button size="sm" isLoading={runningTests} onClick={handleRunIsolationSuite}>
                  Run 10 Live HTTP Tests
                </Button>
              </CardHeader>
              <CardBody className="p-4 space-y-2">
                {!testReport ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Execute all 10 live Express tests proving disjoint data between UrbanWear BD and LuxeThread Studio,
                    403 anti-IDOR guards, RBAC boundaries, and CRUD workflows.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    <div className="flex items-center justify-between text-xs font-semibold pb-1">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {testReport.passed}/{testReport.totalTests} Passed
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(testReport.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {testReport.results.map((r: any) => (
                      <div
                        key={r.id}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] flex items-start gap-2"
                      >
                        {r.status === 'PASSED' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {r.id}: {r.name}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">{r.error || r.details}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* SUBSCRIPTION MANAGEMENT */}
      {mode === 'subscription' && subData && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Current Plan: {subData.currentPlan?.name} ({subData.subscription?.billingCycle})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {subData.currentPlan?.description} • Transaction fee {subData.currentPlan?.transactionFeePercent}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!permissions.includes('settings:manage')}
                  onClick={async () => {
                    const nextCycle = subData.subscription.billingCycle === 'MONTHLY' ? 'YEARLY' : 'MONTHLY';
                    const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/subscription`, {
                      method: 'PATCH',
                      body: JSON.stringify({ billingCycle: nextCycle }),
                    });
                    if (res.ok) {
                      setSubData(json.data);
                      toastSuccess('Billing Cycle Updated', `Switched to ${nextCycle} billing.`);
                      onDataMutated();
                    }
                  }}
                >
                  Switch to {subData.subscription?.billingCycle === 'MONTHLY' ? 'YEARLY' : 'MONTHLY'}
                </Button>
              </div>
            </CardHeader>
            <CardBody className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(subData.availablePlans || []).map((plan: any) => {
                const isCurrent = plan.code === subData.subscription?.planCode;
                return (
                  <div
                    key={plan.code}
                    className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 ${
                      isCurrent
                        ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{plan.name}</span>
                        {isCurrent && <Badge variant="info">CURRENT</Badge>}
                      </div>
                      <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatBDT(plan.priceMonthlyBDT)}
                        <span className="text-xs font-normal text-slate-400">/mo</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{plan.description}</p>
                      <ul className="pt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                        <li>• Up to {plan.maxProducts.toLocaleString()} products</li>
                        <li>• Up to {plan.maxStaffUsers} staff seats</li>
                        <li>• {plan.transactionFeePercent}% platform txn fee</li>
                        <li>• {plan.customDomainAllowed ? 'Custom domain included' : 'Subdomain only'}</li>
                      </ul>
                    </div>
                    <Button
                      size="sm"
                      variant={isCurrent ? 'outline' : 'primary'}
                      disabled={isCurrent || !permissions.includes('settings:manage')}
                      onClick={() =>
                        onRequestConfirm({
                          title: `Switch Store Plan to ${plan.name}?`,
                          description: `Updates subscription tier for this store to ${plan.name} (${formatBDT(plan.priceMonthlyBDT)}/mo).`,
                          confirmLabel: `Switch to ${plan.name}`,
                          onConfirm: async () => {
                            const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/subscription`, {
                              method: 'PATCH',
                              body: JSON.stringify({ planCode: plan.code }),
                            });
                            if (!res.ok) {
                              toastError('Plan Change Blocked', json?.error?.message || 'Unable to change plan.');
                              return;
                            }
                            setSubData(json.data);
                            toastSuccess('Subscription Updated', `Store is now on ${plan.name}.`);
                            onDataMutated();
                          },
                        })
                      }
                    >
                      {isCurrent ? 'Active Plan' : `Select ${plan.code}`}
                    </Button>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </div>
      )}

      {/* SHIPPING METHOD MODAL */}
      <Modal
        isOpen={shipModalOpen}
        onClose={() => setShipModalOpen(false)}
        title="Add Store Shipping Method"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShipModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              isLoading={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/shipping`, {
                    method: 'POST',
                    body: JSON.stringify({
                      code: shipCode,
                      name: shipName,
                      zoneName: shipZone,
                      carrier: shipCarrier,
                      baseRateBDT: Number(shipRate),
                      freeShippingThresholdBDT: Number(shipFreeAbove),
                      estimatedDays: shipDays,
                      codSupported: shipCod,
                    }),
                  });
                  if (!res.ok) {
                    toastError('Shipping Error', json?.error?.message || 'Unable to add method.');
                    return;
                  }
                  toastSuccess('Shipping Added', `${shipName} created.`);
                  setShipModalOpen(false);
                  await loadModule();
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save Method
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Code" placeholder="UW-EXP-01" value={shipCode} onChange={(e) => setShipCode(e.target.value)} />
            <Input label="Carrier" value={shipCarrier} onChange={(e) => setShipCarrier(e.target.value)} />
          </div>
          <Input label="Method Name" value={shipName} onChange={(e) => setShipName(e.target.value)} />
          <Input label="Delivery Zone" value={shipZone} onChange={(e) => setShipZone(e.target.value)} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Base Rate (BDT)" type="number" value={shipRate} onChange={(e) => setShipRate(e.target.value)} />
            <Input
              label="Free Above (BDT)"
              type="number"
              value={shipFreeAbove}
              onChange={(e) => setShipFreeAbove(e.target.value)}
            />
            <Input label="ETA Window" value={shipDays} onChange={(e) => setShipDays(e.target.value)} />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-700 dark:text-slate-300">Cash on Delivery Supported</span>
            <Switch checked={shipCod} onChange={setShipCod} />
          </div>
        </div>
      </Modal>
    </div>
  );
};
