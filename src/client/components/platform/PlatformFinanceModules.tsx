/**
 * NEXORA Super Admin — Billing & Financial Governance Modules
 * Subscription Management, Plan Management, Payment Monitoring & Refund Monitoring
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { Download, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext.tsx';
import {
  triggerCsvDownload,
  type ApiCallFn,
  type ConfirmActionConfig,
  type PaginationMeta,
} from './platformTypes.ts';

interface FinanceModuleProps {
  mode: 'subscriptions' | 'plans' | 'payments' | 'refunds';
  apiCall: ApiCallFn;
  permissions: string[];
  onRequestConfirm: (cfg: ConfirmActionConfig) => void;
  onMutated: () => void;
}

export const PlatformFinanceModules: React.FC<FinanceModuleProps> = ({
  mode,
  apiCall,
  permissions,
  onRequestConfirm,
  onMutated,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const canReadFinance = permissions.includes('platform:finance:read');
  const canManageFinance = permissions.includes('platform:finance:manage');
  const canExport = permissions.includes('platform:export:data');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [secondaryFilter, setSecondaryFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 8,
    total: 0,
    totalPages: 1,
  });

  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!canReadFinance) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (mode === 'subscriptions') {
        const params = new URLSearchParams({
          page: String(page),
          limit: '8',
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
          ...(secondaryFilter !== 'ALL' ? { planCode: secondaryFilter } : {}),
        });
        const { res, json } = await apiCall(`/api/v1/platform/subscriptions?${params.toString()}`);
        if (res.ok && json?.data) {
          setSubscriptions(json.data.items || []);
          setPagination(json.data.pagination);
        }
      } else if (mode === 'plans') {
        const { res, json } = await apiCall('/api/v1/platform/plans');
        if (res.ok && json?.data) {
          setPlans(json.data.plans || []);
        }
      } else if (mode === 'payments') {
        const params = new URLSearchParams({
          page: String(page),
          limit: '8',
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
          ...(secondaryFilter !== 'ALL' ? { gateway: secondaryFilter } : {}),
        });
        const { res, json } = await apiCall(`/api/v1/platform/payments?${params.toString()}`);
        if (res.ok && json?.data) {
          setPayments(json.data.items || []);
          setPagination(json.data.pagination);
        }
      } else if (mode === 'refunds') {
        const params = new URLSearchParams({
          page: String(page),
          limit: '8',
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
        });
        const { res, json } = await apiCall(`/api/v1/platform/refunds?${params.toString()}`);
        if (res.ok && json?.data) {
          setRefunds(json.data.items || []);
          setPagination(json.data.pagination);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [apiCall, canReadFinance, mode, page, search, secondaryFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
    setStatusFilter('ALL');
    setSecondaryFilter('ALL');
  }, [mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!canReadFinance) {
    return (
      <Card>
        <CardBody className="py-10 text-center space-y-2">
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            Finance Permission Required
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Your current role lacks <code className="font-mono">platform:finance:read</code>.
            Switch to Super Admin or Finance Manager to inspect subscriptions, plans, payments, and refunds.
          </p>
        </CardBody>
      </Card>
    );
  }

  const handleExport = async (dataset: 'payments' | 'refunds') => {
    setBusy(true);
    try {
      const { res, json } = await apiCall(`/api/v1/platform/export/${dataset}`);
      if (!res.ok) {
        toastError('Export Denied', json?.error?.message || 'Missing platform:export:data permission.');
        return;
      }
      triggerCsvDownload(json.data.filename, json.data.csv);
      toastSuccess('Report Exported', `Downloaded ${json.data.rowCount} records.`);
      onMutated();
    } finally {
      setBusy(false);
    }
  };

  // ---------- SUBSCRIPTIONS ----------
  if (mode === 'subscriptions') {
    const updateSub = async (tenantId: string, patch: Record<string, string>) => {
      const { res, json } = await apiCall(`/api/v1/platform/subscriptions/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toastError('Subscription Update Denied', json?.error?.message || 'Permission denied.');
        return;
      }
      toastSuccess('Subscription Updated', 'Tenant plan and billing state updated.');
      await loadData();
      onMutated();
    };

    return (
      <Card>
        <CardHeader className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Tenant SaaS Subscriptions
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage recurring plan assignments, billing cycles, and past-due / suspended states.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search tenant or email..."
                className="h-8 pl-8 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-48"
              />
            </div>
            <select
              value={secondaryFilter}
              onChange={(e) => {
                setSecondaryFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
            >
              <option value="ALL">All Plans</option>
              <option value="STARTER">Starter (Free)</option>
              <option value="GROWTH">Growth</option>
              <option value="PRO">Pro</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="TRIAL">Trial</option>
              <option value="PAST_DUE">Past Due</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 text-xs text-slate-500">Loading subscriptions...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Tenant</th>
                    <th className="py-2.5 px-4 font-semibold">Plan & Cycle</th>
                    <th className="py-2.5 px-4 font-semibold">Monthly Fee</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Governance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {subscriptions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{s.tenantName}</div>
                        <div className="font-mono text-[11px] text-slate-400">{s.tenantSlug}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {canManageFinance ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              aria-label={`Change plan for ${s.tenantName}`}
                              value={s.planCode}
                              onChange={(e) => updateSub(s.tenantId, { planCode: e.target.value })}
                              className="h-7 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                            >
                              <option value="STARTER">STARTER</option>
                              <option value="GROWTH">GROWTH</option>
                              <option value="PRO">PRO</option>
                              <option value="ENTERPRISE">ENTERPRISE</option>
                            </select>
                            <select
                              aria-label={`Change billing cycle for ${s.tenantName}`}
                              value={s.billingCycle}
                              onChange={(e) => updateSub(s.tenantId, { billingCycle: e.target.value })}
                              className="h-7 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                            >
                              <option value="MONTHLY">MONTHLY</option>
                              <option value="YEARLY">YEARLY</option>
                            </select>
                          </div>
                        ) : (
                          <span>
                            {s.planCode} · {s.billingCycle}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                        ৳ {s.monthlyFeeBDT.toLocaleString()} / mo
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        <span
                          className={
                            s.status === 'ACTIVE'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : s.status === 'TRIAL'
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {canManageFinance && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const target = s.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
                              onRequestConfirm({
                                title: `${target === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} Subscription`,
                                description: `Change ${s.tenantName} subscription billing state to ${target}.`,
                                confirmLabel: target === 'SUSPENDED' ? 'Suspend Billing' : 'Reactivate',
                                danger: target === 'SUSPENDED',
                                onConfirm: () => updateSub(s.tenantId, { status: target }),
                              });
                            }}
                          >
                            {s.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 border-t border-slate-100 dark:border-slate-800">
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalRecords={pagination.total}
              onPageChange={setPage}
            />
          </div>
        </CardBody>
      </Card>
    );
  }

  // ---------- PLAN MANAGEMENT ----------
  if (mode === 'plans') {
    const handleSavePlan = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingPlan) return;
      setBusy(true);
      try {
        const { res, json } = await apiCall(`/api/v1/platform/plans/${editingPlan.code}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: editingPlan.name,
            description: editingPlan.description,
            priceMonthlyBDT: Number(editingPlan.priceMonthlyBDT),
            priceMonthlyUSD: Number(editingPlan.priceMonthlyUSD),
            maxProducts: Number(editingPlan.maxProducts),
            maxStaffUsers: Number(editingPlan.maxStaffUsers),
            maxStorageMB: Number(editingPlan.maxStorageMB),
            transactionFeePercent: Number(editingPlan.transactionFeePercent),
            customDomainAllowed: Boolean(editingPlan.customDomainAllowed),
            adSenseAllowed: Boolean(editingPlan.adSenseAllowed),
          }),
        });
        if (!res.ok) {
          toastError('Plan Update Failed', json?.error?.message || 'Permission denied.');
          return;
        }
        setEditingPlan(null);
        toastSuccess('Plan Updated', `${json.data.plan.name} configuration saved and audited.`);
        await loadData();
        onMutated();
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => (
            <Card key={p.code}>
              <CardBody className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</h4>
                  <span className="font-mono text-[11px] text-slate-400">{p.code}</span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  ৳ {Number(p.priceMonthlyBDT).toLocaleString()}
                  <span className="text-xs font-normal text-slate-400"> / mo (${p.priceMonthlyUSD})</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed min-h-[36px]">
                  {p.description}
                </p>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <div>Products: {Number(p.maxProducts).toLocaleString()}</div>
                  <div>Staff Seats: {p.maxStaffUsers}</div>
                  <div>Storage: {Math.round(p.maxStorageMB / 1024)} GB</div>
                  <div>Txn Fee: {p.transactionFeePercent}%</div>
                  <div>Domain: {p.customDomainAllowed ? 'Allowed' : 'Subdomain Only'}</div>
                </div>
                {canManageFinance && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setEditingPlan({ ...p })}
                  >
                    Configure Plan
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>

        {editingPlan && (
          <Card>
            <CardHeader>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Editing Plan Tier: <code className="font-mono">{editingPlan.code}</code>
              </h3>
            </CardHeader>
            <CardBody>
              <form onSubmit={handleSavePlan} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Display Name"
                  value={editingPlan.name}
                  onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                />
                <Input
                  label="Monthly Price (BDT)"
                  type="number"
                  value={String(editingPlan.priceMonthlyBDT)}
                  onChange={(e) => setEditingPlan({ ...editingPlan, priceMonthlyBDT: e.target.value })}
                />
                <Input
                  label="Monthly Price (USD)"
                  type="number"
                  value={String(editingPlan.priceMonthlyUSD)}
                  onChange={(e) => setEditingPlan({ ...editingPlan, priceMonthlyUSD: e.target.value })}
                />
                <Input
                  label="Max Products"
                  type="number"
                  value={String(editingPlan.maxProducts)}
                  onChange={(e) => setEditingPlan({ ...editingPlan, maxProducts: e.target.value })}
                />
                <Input
                  label="Max Staff Users"
                  type="number"
                  value={String(editingPlan.maxStaffUsers)}
                  onChange={(e) => setEditingPlan({ ...editingPlan, maxStaffUsers: e.target.value })}
                />
                <Input
                  label="Storage Quota (MB)"
                  type="number"
                  value={String(editingPlan.maxStorageMB)}
                  onChange={(e) => setEditingPlan({ ...editingPlan, maxStorageMB: e.target.value })}
                />
                <Input
                  label="Transaction Fee (%)"
                  type="number"
                  step="0.1"
                  value={String(editingPlan.transactionFeePercent)}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, transactionFeePercent: e.target.value })
                  }
                />
                <div className="sm:col-span-2 flex items-end gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingPlan.customDomainAllowed)}
                      onChange={(e) =>
                        setEditingPlan({ ...editingPlan, customDomainAllowed: e.target.checked })
                      }
                    />
                    Custom Domain Allowed
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingPlan.adSenseAllowed)}
                      onChange={(e) =>
                        setEditingPlan({ ...editingPlan, adSenseAllowed: e.target.checked })
                      }
                    />
                    AdSense Allowed
                  </label>
                </div>
                <div className="sm:col-span-3 flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingPlan(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" isLoading={busy}>
                    Save Plan Configuration
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }

  // ---------- PAYMENT MONITORING ----------
  if (mode === 'payments') {
    const handleReconcile = (p: any, nextStatus: 'SUCCESS' | 'REVERSED') => {
      onRequestConfirm({
        title: `${nextStatus === 'SUCCESS' ? 'Mark Settled' : 'Reverse Transaction'}: ${p.gatewayTransactionId}`,
        description: `Reconcile ${p.gateway} transaction of ৳${p.amount.toLocaleString()} for ${p.tenantName} to ${nextStatus}.`,
        confirmLabel: nextStatus === 'SUCCESS' ? 'Confirm Settlement' : 'Confirm Reversal',
        danger: nextStatus === 'REVERSED',
        onConfirm: async () => {
          const { res, json } = await apiCall(`/api/v1/platform/payments/${p.id}/reconcile`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus }),
          });
          if (!res.ok) {
            toastError('Reconciliation Denied', json?.error?.message || 'Permission denied.');
            return;
          }
          toastSuccess('Transaction Reconciled', `${p.gatewayTransactionId} updated to ${nextStatus}.`);
          await loadData();
          onMutated();
        },
      });
    };

    return (
      <Card>
        <CardHeader className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Platform Payment Monitoring
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cross-gateway transaction stream across bKash, Nagad, Rocket, SSLCommerz, Stripe, and COD.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search txn ID, order, tenant..."
                className="h-8 pl-8 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-48"
              />
            </div>
            <select
              value={secondaryFilter}
              onChange={(e) => {
                setSecondaryFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
            >
              <option value="ALL">All Gateways</option>
              <option value="BKASH">bKash</option>
              <option value="NAGAD">Nagad</option>
              <option value="ROCKET">Rocket</option>
              <option value="SSLCOMMERZ">SSLCommerz</option>
              <option value="STRIPE">Stripe</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
              <option value="REVERSED">Reversed</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => handleExport('payments')}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              {canExport ? 'Export CSV' : 'Export (Locked)'}
            </Button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 text-xs text-slate-500">Loading payment ledger...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Transaction / Order</th>
                    <th className="py-2.5 px-4 font-semibold">Tenant</th>
                    <th className="py-2.5 px-4 font-semibold">Gateway & Instrument</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Amount</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Reconcile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {p.gatewayTransactionId}
                        </div>
                        <div className="text-[11px] text-slate-400">{p.orderNumber}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{p.tenantName}</td>
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {p.gateway}
                        </div>
                        <div className="text-[11px] text-slate-400">{p.paymentMethodDetails}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        ৳ {Number(p.amount).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        <span
                          className={
                            p.status === 'SUCCESS'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : p.status === 'PENDING'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {canManageFinance && p.status === 'PENDING' && (
                          <Button size="sm" variant="outline" onClick={() => handleReconcile(p, 'SUCCESS')}>
                            Settle
                          </Button>
                        )}
                        {canManageFinance && p.status === 'SUCCESS' && (
                          <Button size="sm" variant="ghost" onClick={() => handleReconcile(p, 'REVERSED')}>
                            Reverse
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 border-t border-slate-100 dark:border-slate-800">
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalRecords={pagination.total}
              onPageChange={setPage}
            />
          </div>
        </CardBody>
      </Card>
    );
  }

  // ---------- REFUND MONITORING ----------
  const handleRefundAction = (r: any, status: 'COMPLETED' | 'FAILED') => {
    onRequestConfirm({
      title: `${status === 'COMPLETED' ? 'Approve & Complete' : 'Reject'} Refund (${r.orderNumber})`,
      description: `Disbursement of ৳${r.amount.toLocaleString()} for ${r.tenantName}: "${r.reason}".`,
      confirmLabel: status === 'COMPLETED' ? 'Approve Refund' : 'Mark Failed',
      danger: status === 'FAILED',
      onConfirm: async () => {
        const { res, json } = await apiCall(`/api/v1/platform/refunds/${r.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          toastError('Refund Action Denied', json?.error?.message || 'Permission denied.');
          return;
        }
        toastSuccess('Refund Updated', `Refund for ${r.orderNumber} marked ${status}.`);
        await loadData();
        onMutated();
      },
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Platform Refund Monitoring
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track gateway reversals, partial order refunds, and reconciliation audits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => handleExport('refunds')}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            {canExport ? 'Export CSV' : 'Export (Locked)'}
          </Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {loading ? (
          <div className="p-6 text-xs text-slate-500">Loading refunds...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Order & Tenant</th>
                  <th className="py-2.5 px-4 font-semibold">Reason</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Amount</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {refunds.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900 dark:text-white">
                        {r.orderNumber}
                      </div>
                      <div className="text-[11px] text-slate-400">{r.tenantName}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs">{r.reason}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                      ৳ {Number(r.amount).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold">
                      <span
                        className={
                          r.status === 'COMPLETED'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : r.status === 'PENDING'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                      {canManageFinance && r.status === 'PENDING' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleRefundAction(r, 'COMPLETED')}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleRefundAction(r, 'FAILED')}>
                            Reject
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 border-t border-slate-100 dark:border-slate-800">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalRecords={pagination.total}
            onPageChange={setPage}
          />
        </div>
      </CardBody>
    </Card>
  );
};
