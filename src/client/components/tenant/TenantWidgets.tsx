/**
 * NEXORA Phase 10 — Reusable Store Dashboard Widgets, Charts & Skeleton Loaders
 */

import React from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Skeleton } from '../ui/Skeleton.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { AlertTriangle, ArrowUpRight, PackageCheck, TrendingUp } from 'lucide-react';
import type { TenantOverviewData } from './tenantTypes.ts';

export function formatBDT(amount: number): string {
  return `৳${Math.round(amount).toLocaleString('en-US')}`;
}

export const TenantKpiCard: React.FC<{
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  accent?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky';
}> = ({ label, value, subtext, icon, accent = 'indigo' }) => {
  const accentClasses: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400',
  };

  return (
    <Card>
      <CardBody className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            {label}
          </span>
          <div className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums truncate">
            {value}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
            {subtext}
          </span>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accentClasses[accent]}`}>
          {icon}
        </div>
      </CardBody>
    </Card>
  );
};

export const RevenueOrdersBarChart: React.FC<{
  series: TenantOverviewData['conversionMetrics']['dailySeries'];
  title?: string;
}> = ({ series, title = '7-Day Revenue & Order Volume' }) => {
  const maxRevenue = Math.max(1, ...series.map((s) => s.revenueBDT));

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Daily storefront revenue (BDT) alongside completed orders
          </p>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          Live Ledger
        </span>
      </CardHeader>
      <CardBody className="p-4">
        {series.length === 0 ? (
          <EmptyState
            title="No sales telemetry yet"
            description="Orders and storefront traffic will populate this chart automatically."
          />
        ) : (
          <div className="space-y-3">
            <div className="h-44 flex items-end gap-2 sm:gap-3 pt-4">
              {series.map((pt) => {
                const heightPct = Math.max(8, Math.round((pt.revenueBDT / maxRevenue) * 100));
                return (
                  <div key={pt.dateLabel} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 opacity-80 group-hover:opacity-100">
                      {formatBDT(pt.revenueBDT)}
                    </div>
                    <div className="w-full max-w-[42px] bg-slate-100 dark:bg-slate-800/70 rounded-t-md h-28 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-indigo-600 dark:bg-indigo-500 rounded-t-md transition-all duration-300 group-hover:bg-indigo-500 dark:group-hover:bg-indigo-400"
                        style={{ height: `${heightPct}%` }}
                        title={`${pt.dateLabel}: ${formatBDT(pt.revenueBDT)} (${pt.orders} orders)`}
                      />
                    </div>
                    <div className="text-center">
                      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block">
                        {pt.dateLabel}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-slate-400 block">
                        {pt.orders} ord
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
};

export const ConversionFunnelWidget: React.FC<{
  metrics: TenantOverviewData['conversionMetrics'];
}> = ({ metrics }) => {
  const base = Math.max(1, metrics.storefrontSessions);
  const steps = [
    { label: 'Storefront Sessions', count: metrics.storefrontSessions, pct: 100, color: 'bg-slate-600 dark:bg-slate-400' },
    {
      label: 'Product Page Views',
      count: metrics.productViews,
      pct: Math.round((metrics.productViews / base) * 100),
      color: 'bg-sky-500',
    },
    {
      label: 'Added to Cart',
      count: metrics.cartAdditions,
      pct: Math.round((metrics.cartAdditions / base) * 100),
      color: 'bg-indigo-500',
    },
    {
      label: 'Checkout Initiated',
      count: metrics.checkoutInitiated,
      pct: Math.round((metrics.checkoutInitiated / base) * 100),
      color: 'bg-violet-500',
    },
    {
      label: 'Completed Orders',
      count: metrics.completedOrders,
      pct: Number(((metrics.completedOrders / base) * 100).toFixed(1)),
      color: 'bg-emerald-500',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Measurable Conversion Funnel</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            End-to-end shopper progression for this tenant storefront
          </p>
        </div>
        <span className="text-xs font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {metrics.overallConversionPct}% Conv.
        </span>
      </CardHeader>
      <CardBody className="p-4 space-y-3">
        {steps.map((s) => (
          <div key={s.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-700 dark:text-slate-300 font-medium">{s.label}</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-white font-semibold">
                {s.count.toLocaleString('en-US')}{' '}
                <span className="text-slate-400 font-normal">({s.pct}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${s.color}`}
                style={{ width: `${Math.min(100, Math.max(3, s.pct))}%` }}
              />
            </div>
          </div>
        ))}

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-center">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Add-to-Cart</span>
            <span className="text-xs font-mono font-bold tabular-nums text-slate-900 dark:text-white">
              {metrics.addToCartRatePct}%
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Checkout Pass</span>
            <span className="text-xs font-mono font-bold tabular-nums text-slate-900 dark:text-white">
              {metrics.checkoutCompletionPct}%
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Repeat Buyers</span>
            <span className="text-xs font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {metrics.repeatCustomerRatePct}%
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

export const PlanQuotaMetersWidget: React.FC<{
  subscription: TenantOverviewData['subscription'];
  onManageSubscription?: () => void;
}> = ({ subscription, onManageSubscription }) => {
  const { quotas } = subscription;
  const rows = [
    { label: 'Catalog Products', used: quotas.productsUsed, max: quotas.maxProducts, unit: '' },
    { label: 'Staff Team Seats', used: quotas.staffUsed, max: quotas.maxStaffUsers, unit: '' },
    { label: 'Media & Asset Storage', used: quotas.storageUsedMB, max: quotas.maxStorageMB, unit: ' MB' },
  ];

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Subscription & Quotas</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {subscription.planName} • {subscription.billingCycle} • {subscription.transactionFeePercent}% txn fee
          </p>
        </div>
        <Badge variant={subscription.status === 'ACTIVE' ? 'success' : 'warning'} dot>
          {subscription.status}
        </Badge>
      </CardHeader>
      <CardBody className="p-4 space-y-3">
        {rows.map((r) => {
          const pct = Math.min(100, Math.round((r.used / Math.max(1, r.max)) * 100));
          return (
            <div key={r.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">{r.label}</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {r.used.toLocaleString()}
                  {r.unit} / {r.max.toLocaleString()}
                  {r.unit}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    pct >= 85 ? 'bg-amber-500' : 'bg-indigo-600 dark:bg-indigo-500'
                  }`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
          </span>
          {onManageSubscription && (
            <button
              type="button"
              onClick={onManageSubscription}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Manage Plan <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

export const LowStockAlertList: React.FC<{
  items: TenantOverviewData['lowStockProducts'];
  onGoToInventory?: () => void;
}> = ({ items, onGoToInventory }) => {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Low Stock Alerts</h3>
        </div>
        <Badge variant={items.length > 0 ? 'warning' : 'success'}>
          {items.length} SKU{items.length === 1 ? '' : 's'}
        </Badge>
      </CardHeader>
      <CardBody className="p-4">
        {items.length === 0 ? (
          <div className="py-6 text-center space-y-1.5">
            <PackageCheck className="w-7 h-7 text-emerald-500 mx-auto" />
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              All SKUs Above Safety Threshold
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              No immediate warehouse replenishment required.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {items.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{item.title}</p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {item.sku} • Threshold {item.lowStockThreshold}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant={item.stockQty <= 3 ? 'danger' : 'warning'}>
                    {item.stockQty} left
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
        {onGoToInventory && (
          <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={onGoToInventory}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Adjust Inventory Levels <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </CardBody>
    </Card>
  );
};

export const TenantOverviewSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardBody className="p-4 space-y-2">
            <Skeleton width="55%" height={12} />
            <Skeleton width="75%" height={26} />
            <Skeleton width="65%" height={11} />
          </CardBody>
        </Card>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardBody className="p-4 space-y-3">
          <Skeleton width="45%" height={16} />
          <Skeleton width="100%" height={150} />
        </CardBody>
      </Card>
      <Card>
        <CardBody className="p-4 space-y-3">
          <Skeleton width="45%" height={16} />
          <Skeleton width="100%" height={150} />
        </CardBody>
      </Card>
    </div>
  </div>
);
