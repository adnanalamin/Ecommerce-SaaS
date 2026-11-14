/**
 * NEXORA Phase 10 — Store Owner Executive Overview Section
 *
 * Covers all 10 mandated overview dimensions:
 * Sales, Orders, Revenue, Customers, Products, Low Stock,
 * Best-Selling Products, Recent Orders, Conversion Metrics & Subscription Status.
 */

import React from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Badge } from '../ui/Badge.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  DollarSign,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { TenantOverviewData } from './tenantTypes.ts';
import {
  ConversionFunnelWidget,
  LowStockAlertList,
  PlanQuotaMetersWidget,
  RevenueOrdersBarChart,
  TenantKpiCard,
  formatBDT,
} from './TenantWidgets.tsx';

function orderStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'DELIVERED':
      return 'success';
    case 'PROCESSING':
    case 'SHIPPED':
      return 'info';
    case 'PENDING':
      return 'warning';
    case 'CANCELLED':
    case 'REFUNDED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export const TenantOverviewSection: React.FC<{
  overview: TenantOverviewData;
  onNavigateModule: (moduleId: string) => void;
}> = ({ overview, onNavigateModule }) => {
  const { kpis, orderStatusBreakdown } = overview;

  return (
    <div className="space-y-6">
      {/* Primary KPI Row (Sales, Orders, Revenue, Customers, Products, Low Stock) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <TenantKpiCard
          label="Gross Revenue"
          value={formatBDT(kpis.totalRevenueBDT)}
          subtext={`AOV ${formatBDT(kpis.avgOrderValueBDT)} • Live ${formatBDT(kpis.liveOrderRevenueBDT)}`}
          icon={<DollarSign className="w-4 h-4" />}
          accent="emerald"
        />
        <TenantKpiCard
          label="Total Sales"
          value={kpis.totalSalesUnits.toLocaleString('en-US')}
          subtext="Units sold across catalog"
          icon={<TrendingUp className="w-4 h-4" />}
          accent="indigo"
        />
        <TenantKpiCard
          label="Store Orders"
          value={String(kpis.totalOrders)}
          subtext={`${orderStatusBreakdown.PENDING} pending • ${orderStatusBreakdown.DELIVERED} delivered`}
          icon={<ShoppingBag className="w-4 h-4" />}
          accent="sky"
        />
        <TenantKpiCard
          label="Customers"
          value={String(kpis.totalCustomers)}
          subtext={`${kpis.vipCustomers} VIP • ${overview.conversionMetrics.repeatCustomerRatePct}% repeat`}
          icon={<Users className="w-4 h-4" />}
          accent="indigo"
        />
        <TenantKpiCard
          label="Catalog Products"
          value={String(kpis.totalProducts)}
          subtext={`${kpis.publishedProducts} live • ${kpis.totalInventoryUnits} stock units`}
          icon={<Package className="w-4 h-4" />}
          accent="sky"
        />
        <TenantKpiCard
          label="Low Stock SKUs"
          value={String(kpis.lowStockCount)}
          subtext={kpis.lowStockCount > 0 ? 'Requires replenishment' : 'Healthy thresholds'}
          icon={<AlertTriangle className="w-4 h-4" />}
          accent={kpis.lowStockCount > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Charts & Conversion Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueOrdersBarChart series={overview.conversionMetrics.dailySeries} />
        <ConversionFunnelWidget metrics={overview.conversionMetrics} />
      </div>

      {/* Best-Selling Products & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Best-Selling Products</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateModule('products')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              All Products <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </CardHeader>
          <CardBody className="p-0">
            {overview.bestSellingProducts.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No product sales recorded"
                  description="Publish products to your storefront to track top performers."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Product</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Sold</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Revenue</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {overview.bestSellingProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900 dark:text-white">{p.title}</div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {p.sku} • {p.categoryName}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                          {p.unitsSold}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatBDT(p.revenueBDT)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {p.stockQty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Store Orders</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateModule('orders')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Manage Orders <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </CardHeader>
          <CardBody className="p-0">
            {overview.recentOrders.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No orders yet"
                  description="Customer checkouts for this store will stream here."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Order</th>
                      <th className="px-4 py-2.5 font-semibold">Customer</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Total</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {overview.recentOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2.5">
                          <div className="font-mono font-semibold text-slate-900 dark:text-white">{o.orderNumber}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {o.paymentGateway} • {o.shippingCity}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-800 dark:text-slate-200">{o.customerName}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{o.customerEmail}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {formatBDT(o.totalBDT)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Badge variant={orderStatusVariant(o.status)}>{o.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Low Stock Alerts & Subscription Quotas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LowStockAlertList
          items={overview.lowStockProducts}
          onGoToInventory={() => onNavigateModule('inventory')}
        />
        <PlanQuotaMetersWidget
          subscription={overview.subscription}
          onManageSubscription={() => onNavigateModule('subscription')}
        />
      </div>
    </div>
  );
};
