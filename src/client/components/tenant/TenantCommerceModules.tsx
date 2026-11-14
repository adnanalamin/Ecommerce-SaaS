/**
 * NEXORA Phase 10 — Commerce & Marketing Modules
 *  5. Orders Management
 *  6. Customers Directory & CRM
 *  7. Coupons Management
 *  8. Automatic Discounts Campaigns
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
import { Percent, Plus, Search, ShoppingBag, Ticket, Trash2, Users } from 'lucide-react';
import type {
  TenantApiCallFn,
  TenantConfirmConfig,
  TenantCouponItem,
  TenantCustomerItem,
  TenantDiscountItem,
  TenantOrderItem,
} from './tenantTypes.ts';
import { formatBDT } from './TenantWidgets.tsx';

export const TenantCommerceModules: React.FC<{
  tenantId: string;
  mode: 'orders' | 'customers' | 'coupons' | 'discounts';
  permissions: string[];
  apiCall: TenantApiCallFn;
  onRequestConfirm: (cfg: TenantConfirmConfig) => void;
  onDataMutated: () => void;
}> = ({ tenantId, mode, permissions, apiCall, onRequestConfirm, onDataMutated }) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orders, setOrders] = useState<TenantOrderItem[]>([]);
  const [customers, setCustomers] = useState<TenantCustomerItem[]>([]);
  const [coupons, setCoupons] = useState<TenantCouponItem[]>([]);
  const [discounts, setDiscounts] = useState<TenantDiscountItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [saving, setSaving] = useState(false);

  // Customer note modal
  const [editingCustomer, setEditingCustomer] = useState<TenantCustomerItem | null>(null);
  const [custSegment, setCustSegment] = useState<'VIP' | 'RETURNING' | 'NEW' | 'AT_RISK'>('VIP');
  const [custNotes, setCustNotes] = useState('');

  // Coupon modal
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [cpnCode, setCpnCode] = useState('');
  const [cpnTitle, setCpnTitle] = useState('');
  const [cpnType, setCpnType] = useState<'PERCENTAGE' | 'FIXED_BDT' | 'FREE_SHIPPING'>('PERCENTAGE');
  const [cpnValue, setCpnValue] = useState('15');
  const [cpnMinOrder, setCpnMinOrder] = useState('2500');
  const [cpnLimit, setCpnLimit] = useState('100');

  // Discount modal
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [dscName, setDscName] = useState('');
  const [dscCampaign, setDscCampaign] = useState<'FLASH_SALE' | 'BULK_TIER' | 'CATEGORY_OFFER' | 'FIRST_ORDER'>('FLASH_SALE');
  const [dscType, setDscType] = useState<'PERCENTAGE' | 'FIXED_BDT'>('PERCENTAGE');
  const [dscValue, setDscValue] = useState('12');
  const [dscMinQty, setDscMinQty] = useState('2');
  const [dscStackable, setDscStackable] = useState(false);

  const loadModule = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (mode === 'orders') {
        const { res, json } = await apiCall(
          `/api/v1/tenant/${tenantId}/orders?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(search)}`
        );
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Permission required to view orders.');
        setOrders(json.data.orders || []);
      } else if (mode === 'customers') {
        const { res, json } = await apiCall(
          `/api/v1/tenant/${tenantId}/customers?segment=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(search)}`
        );
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Permission required to view customers.');
        setCustomers(json.data.customers || []);
      } else if (mode === 'coupons') {
        const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/coupons`);
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Permission required to view coupons.');
        setCoupons(json.data.coupons || []);
      } else if (mode === 'discounts') {
        const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/discounts`);
        if (!res.ok) return setErrorMsg(json?.error?.message || 'Permission required to view discounts.');
        setDiscounts(json.data.discounts || []);
      }
    } catch {
      setErrorMsg('Failed to load module data.');
    } finally {
      setLoading(false);
    }
  }, [apiCall, tenantId, mode, statusFilter, search]);

  useEffect(() => {
    setStatusFilter('ALL');
    setSearch('');
  }, [mode, tenantId]);

  useEffect(() => {
    loadModule();
  }, [loadModule]);

  const handleOrderStatusChange = async (orderId: string, nextStatus: string) => {
    const execute = async () => {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        toastError('Order Update Blocked', json?.error?.message || 'Insufficient permission.');
        return;
      }
      toastSuccess('Order Updated', `Order status changed to ${nextStatus}.`);
      await loadModule();
      onDataMutated();
    };

    if (nextStatus === 'REFUNDED' || nextStatus === 'CANCELLED') {
      onRequestConfirm({
        title: `Confirm ${nextStatus} Transition?`,
        description: `Marking this order as ${nextStatus} updates financial settlement status in your tenant ledger.`,
        confirmLabel: `Mark ${nextStatus}`,
        variant: 'danger',
        onConfirm: execute,
      });
    } else {
      await execute();
    }
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer) return;
    setSaving(true);
    try {
      const { res, json } = await apiCall(
        `/api/v1/tenant/${tenantId}/customers/${editingCustomer.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ segment: custSegment, notes: custNotes }),
        }
      );
      if (!res.ok) {
        toastError('CRM Update Failed', json?.error?.message || 'Permission denied.');
        return;
      }
      toastSuccess('Customer Saved', `${editingCustomer.fullName} updated.`);
      setEditingCustomer(null);
      await loadModule();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCoupon = async () => {
    setSaving(true);
    try {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/coupons`, {
        method: 'POST',
        body: JSON.stringify({
          code: cpnCode,
          title: cpnTitle,
          discountType: cpnType,
          discountValue: Number(cpnValue),
          minOrderBDT: Number(cpnMinOrder),
          usageLimit: Number(cpnLimit),
        }),
      });
      if (!res.ok) {
        toastError('Coupon Error', json?.error?.message || 'Unable to create coupon.');
        return;
      }
      toastSuccess('Coupon Created', `Code ${cpnCode.toUpperCase()} is now active.`);
      setCouponModalOpen(false);
      setCpnCode('');
      setCpnTitle('');
      await loadModule();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDiscount = async () => {
    setSaving(true);
    try {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/discounts`, {
        method: 'POST',
        body: JSON.stringify({
          name: dscName,
          campaignType: dscCampaign,
          discountType: dscType,
          discountValue: Number(dscValue),
          minQty: Number(dscMinQty),
          stackable: dscStackable,
        }),
      });
      if (!res.ok) {
        toastError('Campaign Error', json?.error?.message || 'Unable to create discount.');
        return;
      }
      toastSuccess('Discount Launched', `${dscName} is active.`);
      setDiscountModalOpen(false);
      setDscName('');
      await loadModule();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonTable rows={5} columns={5} />;
  if (errorMsg) return <ErrorState title="Access Restricted" message={errorMsg} onRetry={loadModule} />;

  return (
    <div className="space-y-4">
      {/* ORDERS MODULE */}
      {mode === 'orders' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Orders & Fulfillment ({orders.length})</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tenant-scoped order workflow, payment settlements & refund authorization
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-48">
                <Input
                  placeholder="Order # or customer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <div className="w-40">
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Orders' },
                    { value: 'PENDING', label: 'Pending' },
                    { value: 'PROCESSING', label: 'Processing' },
                    { value: 'SHIPPED', label: 'Shipped' },
                    { value: 'DELIVERED', label: 'Delivered' },
                    { value: 'CANCELLED', label: 'Cancelled' },
                    { value: 'REFUNDED', label: 'Refunded' },
                  ]}
                />
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {orders.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No matching orders" description="No orders match this status or search filter." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Order & Items</th>
                      <th className="px-4 py-2.5 font-semibold">Customer & City</th>
                      <th className="px-4 py-2.5 font-semibold">Gateway</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Total</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Fulfillment Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">{o.orderNumber}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                            {o.itemsSummary}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 dark:text-slate-200">{o.customerName}</div>
                          <div className="text-[11px] text-slate-400">
                            {o.customerEmail} • {o.shippingCity}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {o.paymentGateway}
                          </div>
                          <div className="text-[11px] text-slate-400">{o.paymentStatus}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                          {formatBDT(o.totalBDT)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {permissions.includes('order:update') ? (
                            <div className="w-36 inline-block">
                              <Select
                                value={o.status}
                                onChange={(e) => handleOrderStatusChange(o.id, e.target.value)}
                                options={[
                                  { value: 'PENDING', label: 'PENDING' },
                                  { value: 'PROCESSING', label: 'PROCESSING' },
                                  { value: 'SHIPPED', label: 'SHIPPED' },
                                  { value: 'DELIVERED', label: 'DELIVERED' },
                                  { value: 'CANCELLED', label: 'CANCELLED' },
                                  { value: 'REFUNDED', label: 'REFUNDED' },
                                ]}
                              />
                            </div>
                          ) : (
                            <Badge variant="neutral">{o.status}</Badge>
                          )}
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

      {/* CUSTOMERS MODULE */}
      {mode === 'customers' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Store Customers ({customers.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sovereign customer directory, lifetime value (LTV) & VIP segmentation
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-48">
                <Input
                  placeholder="Name, email or city..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <div className="w-36">
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Segments' },
                    { value: 'VIP', label: 'VIP' },
                    { value: 'RETURNING', label: 'Returning' },
                    { value: 'NEW', label: 'New' },
                    { value: 'AT_RISK', label: 'At Risk' },
                  ]}
                />
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {customers.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No customers found" description="No shoppers match your current filter." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Customer</th>
                      <th className="px-4 py-2.5 font-semibold">City & Phone</th>
                      <th className="px-4 py-2.5 font-semibold">Segment</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Orders</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Total Spent</th>
                      <th className="px-4 py-2.5 font-semibold text-right">CRM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {customers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{c.fullName}</div>
                          <div className="text-[11px] text-slate-400">{c.email}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          <div>{c.city}</div>
                          <div className="text-[11px] font-mono text-slate-400">{c.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={c.segment === 'VIP' ? 'info' : c.segment === 'RETURNING' ? 'success' : 'neutral'}
                          >
                            {c.segment}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {c.ordersCount}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                          {formatBDT(c.totalSpentBDT)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {permissions.includes('customer:support') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingCustomer(c);
                                setCustSegment(c.segment);
                                setCustNotes(c.notes);
                              }}
                            >
                              Notes
                            </Button>
                          )}
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

      {/* COUPONS MODULE */}
      {mode === 'coupons' && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Promo Coupons ({coupons.length})</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Checkout voucher codes with minimum spend & usage caps
                </p>
              </div>
            </div>
            {permissions.includes('marketing:manage') && (
              <Button size="sm" onClick={() => setCouponModalOpen(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Create Coupon
              </Button>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {coupons.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No coupons configured" description="Create a checkout coupon to reward shoppers." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Code & Campaign</th>
                      <th className="px-4 py-2.5 font-semibold">Benefit</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Min Spend</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Usage</th>
                      <th className="px-4 py-2.5 font-semibold">Active</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {coupons.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{c.code}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.title}</div>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                          {c.discountType === 'PERCENTAGE'
                            ? `${c.discountValue}% OFF`
                            : c.discountType === 'FREE_SHIPPING'
                              ? 'FREE SHIPPING'
                              : `${formatBDT(c.discountValue)} OFF`}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {formatBDT(c.minOrderBDT)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {c.usedCount} / {c.usageLimit}
                        </td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={c.isActive}
                            disabled={!permissions.includes('marketing:manage')}
                            onChange={async (checked) => {
                              const { res } = await apiCall(`/api/v1/tenant/${tenantId}/coupons/${c.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ isActive: checked }),
                              });
                              if (res.ok) {
                                toastSuccess('Coupon Updated', `${c.code} ${checked ? 'activated' : 'paused'}.`);
                                await loadModule();
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {permissions.includes('marketing:manage') && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                onRequestConfirm({
                                  title: `Delete coupon ${c.code}?`,
                                  description: 'Customers will no longer be able to redeem this code at checkout.',
                                  confirmLabel: 'Delete Coupon',
                                  variant: 'danger',
                                  onConfirm: async () => {
                                    await apiCall(`/api/v1/tenant/${tenantId}/coupons/${c.id}`, {
                                      method: 'DELETE',
                                    });
                                    toastSuccess('Coupon Deleted', `${c.code} removed.`);
                                    await loadModule();
                                  },
                                })
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
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

      {/* AUTOMATIC DISCOUNTS MODULE */}
      {mode === 'discounts' && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Automatic Discounts & Campaigns ({discounts.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cart-level flash sales, bulk tiers & category offers applied automatically without promo codes
                </p>
              </div>
            </div>
            {permissions.includes('marketing:manage') && (
              <Button size="sm" onClick={() => setDiscountModalOpen(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Launch Discount
              </Button>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {discounts.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No active discount campaigns" description="Create an automatic price rule." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Campaign Rule</th>
                      <th className="px-4 py-2.5 font-semibold">Rule Type</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Discount</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Attributed Sales</th>
                      <th className="px-4 py-2.5 font-semibold">Active</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {discounts.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{d.name}</div>
                          <div className="text-[11px] text-slate-400">
                            Min Qty: {d.minQty} • {d.stackable ? 'Stackable' : 'Exclusive'} • {d.redemptionsCount} uses
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{d.campaignType}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                          {d.discountType === 'PERCENTAGE' ? `${d.discountValue}%` : formatBDT(d.discountValue)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatBDT(d.revenueImpactBDT)}
                        </td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={d.isActive}
                            disabled={!permissions.includes('marketing:manage')}
                            onChange={async (checked) => {
                              const { res } = await apiCall(`/api/v1/tenant/${tenantId}/discounts/${d.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ isActive: checked }),
                              });
                              if (res.ok) {
                                toastSuccess('Discount Updated', `${d.name} ${checked ? 'enabled' : 'paused'}.`);
                                await loadModule();
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {permissions.includes('marketing:manage') && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                onRequestConfirm({
                                  title: 'Delete discount campaign?',
                                  description: `Removing "${d.name}" stops automatic cart price reductions immediately.`,
                                  confirmLabel: 'Delete Discount',
                                  variant: 'danger',
                                  onConfirm: async () => {
                                    await apiCall(`/api/v1/tenant/${tenantId}/discounts/${d.id}`, {
                                      method: 'DELETE',
                                    });
                                    toastSuccess('Discount Deleted', 'Campaign removed.');
                                    await loadModule();
                                  },
                                })
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
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

      {/* MODALS */}
      <Modal
        isOpen={Boolean(editingCustomer)}
        onClose={() => setEditingCustomer(null)}
        title={`Customer CRM — ${editingCustomer?.fullName || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingCustomer(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={handleSaveCustomer}>
              Save Profile
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Select
            label="Customer Segment"
            value={custSegment}
            onChange={(e) => setCustSegment(e.target.value as any)}
            options={[
              { value: 'VIP', label: 'VIP' },
              { value: 'RETURNING', label: 'Returning' },
              { value: 'NEW', label: 'New' },
              { value: 'AT_RISK', label: 'At Risk' },
            ]}
          />
          <Input label="Support & Delivery Notes" value={custNotes} onChange={(e) => setCustNotes(e.target.value)} />
        </div>
      </Modal>

      <Modal
        isOpen={couponModalOpen}
        onClose={() => setCouponModalOpen(false)}
        title="Create Checkout Coupon"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCouponModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={handleCreateCoupon}>
              Create Coupon
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Coupon Code" placeholder="EID20" value={cpnCode} onChange={(e) => setCpnCode(e.target.value)} />
            <Select
              label="Discount Type"
              value={cpnType}
              onChange={(e) => setCpnType(e.target.value as any)}
              options={[
                { value: 'PERCENTAGE', label: 'Percentage (%)' },
                { value: 'FIXED_BDT', label: 'Fixed Amount (BDT)' },
                { value: 'FREE_SHIPPING', label: 'Free Shipping' },
              ]}
            />
          </div>
          <Input label="Campaign Title" value={cpnTitle} onChange={(e) => setCpnTitle(e.target.value)} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Value" type="number" value={cpnValue} onChange={(e) => setCpnValue(e.target.value)} />
            <Input label="Min Spend (BDT)" type="number" value={cpnMinOrder} onChange={(e) => setCpnMinOrder(e.target.value)} />
            <Input label="Usage Limit" type="number" value={cpnLimit} onChange={(e) => setCpnLimit(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={discountModalOpen}
        onClose={() => setDiscountModalOpen(false)}
        title="Launch Automatic Store Discount"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDiscountModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={handleCreateDiscount}>
              Activate Campaign
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="Campaign Name" value={dscName} onChange={(e) => setDscName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Campaign Strategy"
              value={dscCampaign}
              onChange={(e) => setDscCampaign(e.target.value as any)}
              options={[
                { value: 'FLASH_SALE', label: 'Flash Sale' },
                { value: 'BULK_TIER', label: 'Bulk Tier' },
                { value: 'CATEGORY_OFFER', label: 'Category Offer' },
                { value: 'FIRST_ORDER', label: 'First Order' },
              ]}
            />
            <Select
              label="Discount Type"
              value={dscType}
              onChange={(e) => setDscType(e.target.value as any)}
              options={[
                { value: 'PERCENTAGE', label: 'Percentage (%)' },
                { value: 'FIXED_BDT', label: 'Fixed BDT' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Discount Value" type="number" value={dscValue} onChange={(e) => setDscValue(e.target.value)} />
            <Input label="Minimum Item Qty" type="number" value={dscMinQty} onChange={(e) => setDscMinQty(e.target.value)} />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-700 dark:text-slate-300">Allow stacking with coupon codes</span>
            <Switch checked={dscStackable} onChange={setDscStackable} />
          </div>
        </div>
      </Modal>
    </div>
  );
};
