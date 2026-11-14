/**
 * NEXORA Super Admin — Executive Overview & Real Aggregated Telemetry Section
 */

import React, { useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  HardDrive,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { PlatformOverviewData } from './platformTypes.ts';

interface PlatformOverviewSectionProps {
  overview: PlatformOverviewData;
  onRefresh: () => void;
  onJumpToModule: (moduleId: string) => void;
  refreshing: boolean;
}

export const PlatformOverviewSection: React.FC<PlatformOverviewSectionProps> = ({
  overview,
  onRefresh,
  onJumpToModule,
  refreshing,
}) => {
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number>(
    Math.max(0, overview.charts.revenueTrend.length - 1)
  );

  const { totals, charts, systemHealth, securityAlerts, recentActivity, recentTransactions } =
    overview;

  const trend = charts.revenueTrend;
  const maxTrendVal = Math.max(
    1000,
    ...trend.map((t) => Math.max(t.transactionVolumeBDT, t.subscriptionMrrBDT))
  );

  const svgWidth = 620;
  const svgHeight = 200;
  const padX = 36;
  const padTop = 18;
  const padBottom = 28;
  const plotW = svgWidth - padX * 2;
  const plotH = svgHeight - padTop - padBottom;

  const pointsTx = trend.map((pt, idx) => {
    const x = padX + (trend.length > 1 ? (idx / (trend.length - 1)) * plotW : plotW / 2);
    const y = padTop + plotH - (pt.transactionVolumeBDT / maxTrendVal) * plotH;
    return { x, y, ...pt };
  });

  const pointsMrr = trend.map((pt, idx) => {
    const x = padX + (trend.length > 1 ? (idx / (trend.length - 1)) * plotW : plotW / 2);
    const y = padTop + plotH - (pt.subscriptionMrrBDT / maxTrendVal) * plotH;
    return { x, y, ...pt };
  });

  const txPath = pointsTx.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const mrrPath = pointsMrr.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const txArea =
    pointsTx.length > 0
      ? `${txPath} L ${pointsTx[pointsTx.length - 1].x} ${padTop + plotH} L ${pointsTx[0].x} ${padTop + plotH} Z`
      : '';

  const totalPaymentsCount = Math.max(
    1,
    charts.paymentStatusBreakdown.reduce((s, b) => s + b.count, 0)
  );

  const totalStoragePct =
    totals.storageQuotaMB > 0
      ? Math.min(100, Math.round((totals.storageUsedMB / totals.storageQuotaMB) * 100))
      : 0;

  const activePoint = trend[hoveredMonthIdx] || trend[trend.length - 1];

  return (
    <div className="space-y-6">
      {/* KPI Grid (Primary Executive Figures) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Tenants & Storefronts</span>
            <button
              type="button"
              onClick={() => onJumpToModule('tenants')}
              className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              Manage <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {totals.totalTenants}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {totals.activeStores} Active
            </span>{' '}
            ·{' '}
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              {totals.suspendedStores} Suspended
            </span>{' '}
            · {totals.officialStores} Official
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Registered Platform Users</span>
            <button
              type="button"
              onClick={() => onJumpToModule('users')}
              className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              Directory <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {totals.totalRegisteredUsers}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {totals.activeUsers} verified active · {systemHealth.activeSessions} live sessions
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Subscription MRR & Plans</span>
            <button
              type="button"
              onClick={() => onJumpToModule('subscriptions')}
              className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              Billing <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            ৳ {totals.subscriptionMrrBDT.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {totals.activeSubscriptions} active ({totals.paidPlansCount} Paid / {totals.freePlansCount} Free)
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Platform Transactions</span>
            <button
              type="button"
              onClick={() => onJumpToModule('payments')}
              className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              Ledger <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            ৳ {totals.totalTransactionVolumeBDT.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {totals.totalPaymentsCount} total txns · {totals.pendingRefundsCount} pending refunds
          </div>
        </div>
      </div>

      {/* Main Analytics Row: Revenue Trend Chart + Plan & Payment Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Platform Revenue & Transaction Trajectory (6 Months)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aggregated from live subscriptions and settled gateway transactions.
              </p>
            </div>
            {activePoint && (
              <div className="text-right font-mono tabular-nums text-[11px]">
                <div className="font-bold text-slate-900 dark:text-white">{activePoint.month}</div>
                <div className="text-indigo-600 dark:text-indigo-400">
                  Txns: ৳{activePoint.transactionVolumeBDT.toLocaleString()} · MRR: ৳
                  {activePoint.subscriptionMrrBDT.toLocaleString()}
                </div>
              </div>
            )}
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-52 select-none"
                role="img"
                aria-label="Platform Revenue and Transaction Trend Chart"
              >
                <defs>
                  <linearGradient id="nexoraTxArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {[0.25, 0.5, 0.75, 1].map((ratio, i) => {
                  const y = padTop + plotH * (1 - ratio);
                  return (
                    <g key={i}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={svgWidth - padX}
                        y2={y}
                        stroke="currentColor"
                        className="text-slate-200 dark:text-slate-800"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={4}
                        y={y + 3}
                        className="fill-slate-400 text-[9px] font-mono"
                      >
                        {Math.round((maxTrendVal * ratio) / 1000)}k
                      </text>
                    </g>
                  );
                })}

                {txArea && <path d={txArea} fill="url(#nexoraTxArea)" />}
                {txPath && (
                  <path
                    d={txPath}
                    fill="none"
                    stroke="#4F46E5"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {mrrPath && (
                  <path
                    d={mrrPath}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                  />
                )}

                {pointsTx.map((pt, idx) => (
                  <g
                    key={pt.month}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredMonthIdx(idx)}
                    onClick={() => setHoveredMonthIdx(idx)}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredMonthIdx === idx ? 5 : 3.5}
                      className="fill-indigo-600 dark:fill-indigo-400 stroke-white dark:stroke-slate-900"
                      strokeWidth="2"
                    />
                    <circle
                      cx={pointsMrr[idx].x}
                      cy={pointsMrr[idx].y}
                      r={hoveredMonthIdx === idx ? 4.5 : 3}
                      className="fill-emerald-600 dark:fill-emerald-400 stroke-white dark:stroke-slate-900"
                      strokeWidth="1.5"
                    />
                    <text
                      x={pt.x}
                      y={svgHeight - 8}
                      textAnchor="middle"
                      className={`text-[10px] font-mono ${
                        hoveredMonthIdx === idx
                          ? 'fill-slate-900 dark:fill-white font-bold'
                          : 'fill-slate-400'
                      }`}
                    >
                      {pt.month}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-indigo-600 inline-block" /> Transaction GMV (BDT)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-emerald-600 inline-block" /> Subscription MRR (BDT)
                </span>
              </div>
              <span className="font-mono tabular-nums text-[11px]">
                Annualized Run-Rate: ৳ {(totals.subscriptionMrrBDT * 12).toLocaleString()}
              </span>
            </div>
          </CardBody>
        </Card>

        {/* Free vs Paid Plans & Payment Status Breakdown */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Plan Tiers & Payment Health
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Free vs paid subscription distribution and settlement outcomes.
            </p>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Free vs Paid Subscriptions
              </div>
              {charts.planDistribution.map((p) => {
                const pct =
                  totals.totalTenants > 0
                    ? Math.round((p.count / Math.max(1, totals.totalTenants)) * 100)
                    : 0;
                return (
                  <div key={p.code} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {p.name}{' '}
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({p.isFree ? 'Free' : 'Paid'})
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {p.count} · ৳{p.monthlyRevenueBDT.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          p.isFree ? 'bg-slate-500' : 'bg-indigo-600 dark:bg-indigo-500'
                        }`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Gateway Payment Status
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {charts.paymentStatusBreakdown.map((item) => {
                  const pct = Math.round((item.count / totalPaymentsCount) * 100);
                  const statusText =
                    item.status === 'SUCCESS'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : item.status === 'PENDING'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400';
                  return (
                    <div
                      key={item.status}
                      className="py-1.5 flex items-center justify-between text-xs"
                    >
                      <span className={`font-mono font-semibold ${statusText}`}>
                        {item.status}
                      </span>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {item.count} ({pct}%) · ৳{item.amountBDT.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* System Health, Storage Utilization & Security Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Health + Storage Usage */}
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                System Health & Storage
              </h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              isLoading={refreshing}
              leftIcon={<RefreshCw className="w-3 h-3" />}
            >
              Poll
            </Button>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 block">Cluster State</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {systemHealth.status}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 block">Process Uptime</span>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {systemHealth.uptimeSeconds}s
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 block">Heap Used / RSS</span>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  {systemHealth.heapUsedMB} / {systemHealth.memoryRssMB} MB
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 block">Node Runtime</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {systemHealth.nodeVersion}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                  Tenant Storage Quota
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
                  {(totals.storageUsedMB / 1024).toFixed(1)} GB /{' '}
                  {(totals.storageQuotaMB / 1024).toFixed(1)} GB ({totalStoragePct}%)
                </span>
              </div>

              {charts.storageByTenant.slice(0, 4).map((st) => (
                <div key={st.tenantId} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-700 dark:text-slate-300 truncate max-w-[160px]">
                      {st.name}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {st.usedMB} / {st.quotaMB} MB ({st.utilizationPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        st.utilizationPct > 80
                          ? 'bg-rose-600'
                          : st.utilizationPct > 50
                            ? 'bg-amber-500'
                            : 'bg-indigo-600'
                      }`}
                      style={{ width: `${Math.max(3, st.utilizationPct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Security Alerts */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Security Alerts ({securityAlerts.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Denied escalations, cross-tenant blocks, and suspicious logins.
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {securityAlerts.length === 0 ? (
              <div className="p-5 text-xs text-slate-500 dark:text-slate-400">
                No security incidents or denied escalations recorded in the current window.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                {securityAlerts.map((alert) => (
                  <div key={alert.id} className="p-3.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono font-bold text-[11px] inline-flex items-center gap-1 ${
                          alert.severity === 'HIGH'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {alert.severity} · {alert.category}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-slate-400">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 font-medium truncate">
                      Actor: {alert.actor}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {alert.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Recent Platform Activity & Latest Transactions */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Recent Governance & Transactions
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live administrative events and payment callbacks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onJumpToModule('audit')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
            >
              Full Audit
            </button>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
              {recentTransactions.slice(0, 3).map((tx) => (
                <div key={tx.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-white truncate">
                      {tx.tenantName} · <span className="font-mono">{tx.gateway}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {tx.gatewayTransactionId} · {tx.orderNumber}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2 font-mono tabular-nums">
                    <div className="font-bold text-slate-900 dark:text-white">
                      ৳{tx.amount.toLocaleString()}
                    </div>
                    <div
                      className={`text-[10px] font-semibold ${
                        tx.status === 'SUCCESS'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : tx.status === 'PENDING'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {tx.status}
                    </div>
                  </div>
                </div>
              ))}
              {recentActivity.slice(0, 5).map((log) => (
                <div key={log.id} className="px-4 py-2.5 text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-[11px] truncate">
                      {log.action}
                    </span>
                    <span
                      className={`font-mono text-[10px] font-bold ${
                        log.outcome === 'ALLOWED'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {log.outcome}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {log.actorEmail || log.actorRole} · {log.reason || log.resourceType}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};
