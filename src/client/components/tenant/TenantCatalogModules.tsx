/**
 * NEXORA Phase 10 — Catalog & Warehouse Modules
 *  1. Product Management
 *  2. Category Management
 *  3. Brand Management
 *  4. Inventory & Movement History
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Input } from '../ui/Input.tsx';
import { Select } from '../ui/Select.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { Modal } from '../ui/Modal.tsx';
import { SkeletonTable } from '../ui/Skeleton.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { ErrorState } from '../ui/ErrorState.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { Layers, Package, Plus, RefreshCw, Search, Tag, Trash2, Warehouse } from 'lucide-react';
import type {
  TenantApiCallFn,
  TenantBrandItem,
  TenantCategoryItem,
  TenantConfirmConfig,
  TenantInventoryLogItem,
  TenantProductItem,
} from './tenantTypes.ts';
import { formatBDT } from './TenantWidgets.tsx';

export const TenantCatalogModules: React.FC<{
  tenantId: string;
  mode: 'products' | 'categories' | 'brands' | 'inventory';
  permissions: string[];
  apiCall: TenantApiCallFn;
  onRequestConfirm: (cfg: TenantConfirmConfig) => void;
  onDataMutated: () => void;
}> = ({ tenantId, mode, permissions, apiCall, onRequestConfirm, onDataMutated }) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [products, setProducts] = useState<TenantProductItem[]>([]);
  const [categories, setCategories] = useState<TenantCategoryItem[]>([]);
  const [brands, setBrands] = useState<TenantBrandItem[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<TenantInventoryLogItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Product modal
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<TenantProductItem | null>(null);
  const [pTitle, setPTitle] = useState('');
  const [pSku, setPSku] = useState('');
  const [pCategoryId, setPCategoryId] = useState('');
  const [pBrandId, setPBrandId] = useState('');
  const [pPrice, setPPrice] = useState('2450');
  const [pCost, setPCost] = useState('1200');
  const [pStock, setPStock] = useState('25');
  const [pThreshold, setPThreshold] = useState('10');
  const [pStatus, setPStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('PUBLISHED');
  const [saving, setSaving] = useState(false);

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Brand modal
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [brandOrigin, setBrandOrigin] = useState('Bangladesh');
  const [brandUrl, setBrandUrl] = useState('https://nexora.shop');

  // Inventory adjust modal
  const [invTarget, setInvTarget] = useState<TenantProductItem | null>(null);
  const [invNewQty, setInvNewQty] = useState('');
  const [invThreshold, setInvThreshold] = useState('');
  const [invReason, setInvReason] = useState('Warehouse stock count reconciliation');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/catalog`);
      if (!res.ok) {
        setErrorMsg(json?.error?.message || 'Unable to load store catalog.');
        return;
      }
      const d = json.data;
      setProducts(d.products || []);
      setCategories(d.categories || []);
      setBrands(d.brands || []);
      setInventoryLogs(d.inventoryLogs || []);
      if (d.categories?.length && !pCategoryId) setPCategoryId(d.categories[0].id);
      if (d.brands?.length && !pBrandId) setPBrandId(d.brands[0].id);
    } catch {
      setErrorMsg('Network error loading catalog.');
    } finally {
      setLoading(false);
    }
  }, [apiCall, tenantId, pCategoryId, pBrandId]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const openCreateProduct = () => {
    setEditingProduct(null);
    setPTitle('');
    setPSku(`SKU-${Date.now().toString().slice(-4)}`);
    setPCategoryId(categories[0]?.id || '');
    setPBrandId(brands[0]?.id || '');
    setPPrice('2450');
    setPCost('1200');
    setPStock('25');
    setPThreshold('10');
    setPStatus('PUBLISHED');
    setProductModalOpen(true);
  };

  const openEditProduct = (p: TenantProductItem) => {
    setEditingProduct(p);
    setPTitle(p.title);
    setPSku(p.sku);
    setPCategoryId(p.categoryId);
    setPBrandId(p.brandId);
    setPPrice(String(p.priceBDT));
    setPCost(String(p.costBDT));
    setPStock(String(p.stockQty));
    setPThreshold(String(p.lowStockThreshold));
    setPStatus(p.status);
    setProductModalOpen(true);
  };

  const handleSaveProduct = async () => {
    setSaving(true);
    try {
      if (editingProduct) {
        const { res, json } = await apiCall(
          `/api/v1/tenant/${tenantId}/products/${editingProduct.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              title: pTitle,
              categoryId: pCategoryId,
              brandId: pBrandId,
              priceBDT: Number(pPrice),
              costBDT: Number(pCost),
              lowStockThreshold: Number(pThreshold),
              status: pStatus,
            }),
          }
        );
        if (!res.ok) {
          toastError('Update Failed', json?.error?.message || 'Permission or validation error.');
          return;
        }
        toastSuccess('Product Updated', `${pTitle} saved.`);
      } else {
        const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/products`, {
          method: 'POST',
          body: JSON.stringify({
            title: pTitle,
            sku: pSku,
            categoryId: pCategoryId,
            brandId: pBrandId,
            priceBDT: Number(pPrice),
            costBDT: Number(pCost),
            stockQty: Number(pStock),
            lowStockThreshold: Number(pThreshold),
            status: pStatus,
          }),
        });
        if (!res.ok) {
          toastError('Create Failed', json?.error?.message || 'Unable to create product.');
          return;
        }
        toastSuccess('Product Created', `${pTitle} added to your store catalog.`);
      }
      setProductModalOpen(false);
      await loadCatalog();
      onDataMutated();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    setSaving(true);
    try {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/categories`, {
        method: 'POST',
        body: JSON.stringify({ name: catName, description: catDesc }),
      });
      if (!res.ok) {
        toastError('Category Error', json?.error?.message || 'Could not create category.');
        return;
      }
      toastSuccess('Category Added', `${catName} created.`);
      setCatModalOpen(false);
      setCatName('');
      setCatDesc('');
      await loadCatalog();
      onDataMutated();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBrand = async () => {
    setSaving(true);
    try {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/brands`, {
        method: 'POST',
        body: JSON.stringify({
          name: brandName,
          originCountry: brandOrigin,
          websiteUrl: brandUrl,
          isFeatured: true,
        }),
      });
      if (!res.ok) {
        toastError('Brand Error', json?.error?.message || 'Could not create brand.');
        return;
      }
      toastSuccess('Brand Added', `${brandName} registered.`);
      setBrandModalOpen(false);
      setBrandName('');
      await loadCatalog();
      onDataMutated();
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustStock = async () => {
    if (!invTarget) return;
    setSaving(true);
    try {
      const { res, json } = await apiCall(`/api/v1/tenant/${tenantId}/inventory/${invTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          newQty: Number(invNewQty),
          lowStockThreshold: Number(invThreshold),
          reason: invReason,
        }),
      });
      if (!res.ok) {
        toastError('Adjustment Failed', json?.error?.message || 'Unable to adjust stock.');
        return;
      }
      toastSuccess('Inventory Updated', `${invTarget.sku} stock updated to ${invNewQty}.`);
      setInvTarget(null);
      await loadCatalog();
      onDataMutated();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonTable rows={6} columns={5} />;
  if (errorMsg) return <ErrorState title="Catalog Unavailable" message={errorMsg} onRetry={loadCatalog} />;

  const q = search.trim().toLowerCase();
  const filteredProducts = products.filter((p) => {
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    if (q) {
      return (
        p.title.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.categoryName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* PRODUCTS MODULE */}
      {mode === 'products' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Product Catalog ({products.length})</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tenant-isolated SKU pricing, margins, categories & publishing status
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-48">
                <Input
                  placeholder="Search SKU or title..."
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
                    { value: 'ALL', label: 'All Statuses' },
                    { value: 'PUBLISHED', label: 'Published' },
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'ARCHIVED', label: 'Archived' },
                  ]}
                />
              </div>
              {permissions.includes('product:create') && (
                <Button size="sm" onClick={openCreateProduct} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                  Add Product
                </Button>
              )}
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {filteredProducts.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No matching products"
                  description="Adjust your search filter or create a new SKU for this store."
                  action={
                    permissions.includes('product:create') ? (
                      <Button size="sm" onClick={openCreateProduct}>
                        Create First Product
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Product & SKU</th>
                      <th className="px-4 py-2.5 font-semibold">Category / Brand</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Price</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Stock</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{p.title}</div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {p.sku} • {p.unitsSold} sold
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          <div>{p.categoryName}</div>
                          <div className="text-[11px] text-slate-400">{p.brandName}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {formatBDT(p.priceBDT)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          <span
                            className={
                              p.stockQty <= p.lowStockThreshold
                                ? 'text-amber-600 dark:text-amber-400 font-bold'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {p.stockQty}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              p.status === 'PUBLISHED' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'neutral'
                            }
                          >
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {(permissions.includes('product:update') || permissions.includes('product:update:own')) && (
                              <Button size="sm" variant="outline" onClick={() => openEditProduct(p)}>
                                Edit
                              </Button>
                            )}
                            {permissions.includes('product:delete') && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() =>
                                  onRequestConfirm({
                                    title: `Delete ${p.sku}?`,
                                    description: `This removes "${p.title}" from your store catalog permanently.`,
                                    confirmLabel: 'Delete Product',
                                    variant: 'danger',
                                    onConfirm: async () => {
                                      const { res, json } = await apiCall(
                                        `/api/v1/tenant/${tenantId}/products/${p.id}`,
                                        { method: 'DELETE' }
                                      );
                                      if (!res.ok) {
                                        toastError('Delete Failed', json?.error?.message || 'Error deleting product.');
                                        return;
                                      }
                                      toastSuccess('Product Deleted', `${p.sku} removed.`);
                                      await loadCatalog();
                                      onDataMutated();
                                    },
                                  })
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
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

      {/* CATEGORIES MODULE */}
      {mode === 'categories' && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Store Categories ({categories.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Organize storefront navigation collections strictly scoped to this store
                </p>
              </div>
            </div>
            {permissions.includes('product:create') && (
              <Button size="sm" onClick={() => setCatModalOpen(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                New Category
              </Button>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {categories.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No categories configured" description="Add categories to group storefront products." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Category Name</th>
                      <th className="px-4 py-2.5 font-semibold">Description</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Products</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {categories.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">/{c.slug}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-md">{c.description}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {c.productCount ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={c.isActive ? 'success' : 'neutral'}>
                            {c.isActive ? 'ACTIVE' : 'HIDDEN'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {permissions.includes('product:delete') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                onRequestConfirm({
                                  title: `Delete category "${c.name}"?`,
                                  description: 'Products inside this category will become uncategorized.',
                                  confirmLabel: 'Delete Category',
                                  variant: 'danger',
                                  onConfirm: async () => {
                                    const { res, json } = await apiCall(
                                      `/api/v1/tenant/${tenantId}/categories/${c.id}`,
                                      { method: 'DELETE' }
                                    );
                                    if (!res.ok) {
                                      toastError('Delete Failed', json?.error?.message || 'Error');
                                      return;
                                    }
                                    toastSuccess('Category Deleted', `${c.name} removed.`);
                                    await loadCatalog();
                                  },
                                })
                              }
                            >
                              Delete
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

      {/* BRANDS MODULE */}
      {mode === 'brands' && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Store Brands ({brands.length})</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage in-house labels and partner designer brands for this store
                </p>
              </div>
            </div>
            {permissions.includes('product:create') && (
              <Button size="sm" onClick={() => setBrandModalOpen(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Add Brand
              </Button>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {brands.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No brands yet" description="Register a house brand or vendor label." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Brand</th>
                      <th className="px-4 py-2.5 font-semibold">Origin</th>
                      <th className="px-4 py-2.5 font-semibold text-right">SKUs</th>
                      <th className="px-4 py-2.5 font-semibold">Featured</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {brands.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{b.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">{b.websiteUrl}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.originCountry}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {b.productCount ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={b.isFeatured ? 'info' : 'neutral'}>
                            {b.isFeatured ? 'FEATURED' : 'STANDARD'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {permissions.includes('product:delete') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                onRequestConfirm({
                                  title: `Remove brand "${b.name}"?`,
                                  description: 'This deletes the brand metadata from this tenant store.',
                                  confirmLabel: 'Remove Brand',
                                  variant: 'danger',
                                  onConfirm: async () => {
                                    const { res } = await apiCall(`/api/v1/tenant/${tenantId}/brands/${b.id}`, {
                                      method: 'DELETE',
                                    });
                                    if (res.ok) {
                                      toastSuccess('Brand Deleted', `${b.name} removed.`);
                                      await loadCatalog();
                                    }
                                  },
                                })
                              }
                            >
                              Remove
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

      {/* INVENTORY MODULE */}
      {mode === 'inventory' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-amber-500" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Stock Levels & Reorder Alerts</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Real-time SKU stock control with threshold alerts and immutable audit trails
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={loadCatalog} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
                Sync Stock
              </Button>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">SKU & Item</th>
                      <th className="px-4 py-2.5 font-semibold text-right">On Hand</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Threshold</th>
                      <th className="px-4 py-2.5 font-semibold">Health</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {products.map((p) => {
                      const isLow = p.stockQty <= p.lowStockThreshold;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900 dark:text-white">{p.title}</div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{p.sku}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                            {p.stockQty}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {p.lowStockThreshold}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={p.stockQty === 0 ? 'danger' : isLow ? 'warning' : 'success'}>
                              {p.stockQty === 0 ? 'OUT OF STOCK' : isLow ? 'LOW STOCK' : 'HEALTHY'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {permissions.includes('inventory:update') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setInvTarget(p);
                                  setInvNewQty(String(p.stockQty));
                                  setInvThreshold(String(p.lowStockThreshold));
                                  setInvReason('Warehouse replenishment intake');
                                }}
                              >
                                Adjust Stock
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Stock Movement Audit History</h3>
            </CardHeader>
            <CardBody className="p-0">
              {inventoryLogs.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No stock adjustments yet" description="Adjustments appear here with actor attribution." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">SKU</th>
                        <th className="px-4 py-2.5 font-semibold">Reason</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Delta</th>
                        <th className="px-4 py-2.5 font-semibold text-right">New Qty</th>
                        <th className="px-4 py-2.5 font-semibold">Actor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {inventoryLogs.map((l) => (
                        <tr key={l.id}>
                          <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {l.sku}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{l.reason}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold">
                            <span className={l.deltaQty >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {l.deltaQty >= 0 ? `+${l.deltaQty}` : l.deltaQty}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                            {l.newQty}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{l.actorEmail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* MODALS */}
      <Modal
        isOpen={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={editingProduct ? `Edit Product (${editingProduct.sku})` : 'Add Store Product'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setProductModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={handleSaveProduct}>
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="Product Title" value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
          {!editingProduct && (
            <Input label="SKU Code" value={pSku} onChange={(e) => setPSku(e.target.value)} />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Category"
              value={pCategoryId}
              onChange={(e) => setPCategoryId(e.target.value)}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              label="Brand"
              value={pBrandId}
              onChange={(e) => setPBrandId(e.target.value)}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="Price (BDT)" type="number" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
            <Input label="Cost (BDT)" type="number" value={pCost} onChange={(e) => setPCost(e.target.value)} />
            {!editingProduct && (
              <Input label="Initial Stock" type="number" value={pStock} onChange={(e) => setPStock(e.target.value)} />
            )}
            <Input
              label="Low Alert"
              type="number"
              value={pThreshold}
              onChange={(e) => setPThreshold(e.target.value)}
            />
          </div>
          <Select
            label="Visibility Status"
            value={pStatus}
            onChange={(e) => setPStatus(e.target.value as any)}
            options={[
              { value: 'PUBLISHED', label: 'Published (Live on Storefront)' },
              { value: 'DRAFT', label: 'Draft (Hidden)' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]}
          />
        </div>
      </Modal>

      <Modal
        isOpen={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title="Create Store Category"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCatModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={handleCreateCategory}>
              Save Category
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="Category Name" value={catName} onChange={(e) => setCatName(e.target.value)} />
          <Textarea label="Description" value={catDesc} onChange={(e) => setCatDesc(e.target.value)} />
        </div>
      </Modal>

      <Modal
        isOpen={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        title="Register Store Brand"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setBrandModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={handleCreateBrand}>
              Register Brand
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="Brand Name" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          <Input label="Country of Origin" value={brandOrigin} onChange={(e) => setBrandOrigin(e.target.value)} />
          <Input label="Website URL" value={brandUrl} onChange={(e) => setBrandUrl(e.target.value)} />
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(invTarget)}
        onClose={() => setInvTarget(null)}
        title={`Adjust Stock — ${invTarget?.sku || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setInvTarget(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={handleAdjustStock}>
              Apply Stock Update
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="New Stock Quantity"
              type="number"
              value={invNewQty}
              onChange={(e) => setInvNewQty(e.target.value)}
            />
            <Input
              label="Low Stock Threshold"
              type="number"
              value={invThreshold}
              onChange={(e) => setInvThreshold(e.target.value)}
            />
          </div>
          <Input label="Audit Reason" value={invReason} onChange={(e) => setInvReason(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
};
