/**
 * NEXORA Enterprise Design System
 * Interactive Component Showcase & Architecture Explorer
 */

import React, { useState } from 'react';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Select } from '../ui/Select.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { RadioGroup } from '../ui/Radio.tsx';
import { Switch } from '../ui/Switch.tsx';
import { Modal } from '../ui/Modal.tsx';
import { Drawer } from '../ui/Drawer.tsx';
import { Dropdown } from '../ui/Dropdown.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';
import { Popover } from '../ui/Popover.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Tabs } from '../ui/Tabs.tsx';
import { Table, Column } from '../ui/Table.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { Skeleton, SkeletonTable } from '../ui/Skeleton.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { ErrorState } from '../ui/ErrorState.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  Download,
  Plus,
  Trash2,
  Mail,
  RotateCcw,
  Eye,
} from 'lucide-react';

// DEMO DATA: Clearly labeled demo product item interface
interface DemoProductRecord {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  priceBDT: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
}

const DEMO_PRODUCTS: DemoProductRecord[] = [
  { id: '1', sku: 'NX-APP-101', name: 'Cotton Panjabi Premium', category: 'Apparel', stock: 124, priceBDT: 3450, status: 'In Stock' },
  { id: '2', sku: 'NX-APP-102', name: 'Raw Denim Slim Fit', category: 'Apparel', stock: 8, priceBDT: 2850, status: 'Low Stock' },
  { id: '3', sku: 'NX-ACC-201', name: 'Full-Grain Leather Wallet', category: 'Accessories', stock: 65, priceBDT: 1650, status: 'In Stock' },
  { id: '4', sku: 'NX-APP-103', name: 'Summer Linen Shirt', category: 'Apparel', stock: 0, priceBDT: 2150, status: 'Out of Stock' },
  { id: '5', sku: 'NX-FTW-301', name: 'Handcrafted Oxford Shoes', category: 'Footwear', stock: 19, priceBDT: 5900, status: 'In Stock' },
];

export const DesignSystemShowcase: React.FC = () => {
  const toast = useToast();

  // Navigation Subtabs within Design System
  const [activeCategory, setActiveCategory] = useState<string>('buttons');

  // Form states
  const [inputValue, setInputValue] = useState('');
  const [selectValue, setSelectValue] = useState('bdt');
  const [textareaValue, setTextareaValue] = useState('');
  const [checkboxValue, setCheckboxValue] = useState(true);
  const [radioValue, setRadioValue] = useState('standard');
  const [switchValue, setSwitchValue] = useState(true);

  // Overlay states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Table states
  const [tableData, setTableData] = useState<DemoProductRecord[]>(DEMO_PRODUCTS);
  const [sortKey, setSortKey] = useState<string>('sku');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [tableLoading, setTableLoading] = useState(false);

  // Filter / Tabs demo
  const [segmentedTab, setSegmentedTab] = useState('all');

  const handleSort = (key: string) => {
    const isAsc = sortKey === key && sortOrder === 'asc';
    const nextOrder = isAsc ? 'desc' : 'asc';
    setSortKey(key);
    setSortOrder(nextOrder);

    const sorted = [...tableData].sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[key];
      const valB = (b as unknown as Record<string, unknown>)[key];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return nextOrder === 'asc' ? valA - valB : valB - valA;
      }
      return nextOrder === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
    setTableData(sorted);
  };

  const columns: Column<DemoProductRecord>[] = [
    {
      key: 'sku',
      header: 'SKU Code',
      sortable: true,
      render: (item) => <span className="font-mono text-slate-900 dark:text-slate-100 font-semibold">{item.sku}</span>,
    },
    {
      key: 'name',
      header: 'Product Title',
      sortable: true,
      render: (item) => (
        <div>
          <span className="font-medium text-slate-800 dark:text-slate-200 block">{item.name}</span>
          <span className="text-[10px] text-slate-400">{item.category}</span>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock Units',
      sortable: true,
      align: 'right',
      render: (item) => <span className="font-mono tabular-nums">{item.stock}</span>,
    },
    {
      key: 'priceBDT',
      header: 'Price (BDT)',
      sortable: true,
      align: 'right',
      render: (item) => (
        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
          ৳{item.priceBDT.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Inventory State',
      render: (item) => {
        const variant =
          item.status === 'In Stock'
            ? 'success'
            : item.status === 'Low Stock'
            ? 'warning'
            : 'danger';
        return <Badge variant={variant} dot>{item.status}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toast.info(`Inspect Product: ${item.name}`, `SKU: ${item.sku}`)}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Design System Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60">
              Phase 03 Production Component Library
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">WCAG 2.1 AA Compliant</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            NEXORA Enterprise Design System
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Atomic tokens, accessible form controls, interactive overlays, data tables, and state indicators.
          </p>
        </div>

        {/* Global Action Trigger */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={() => {
              setTableData(DEMO_PRODUCTS);
              toast.info('Demo state refreshed', 'Reset all component samples to default values.');
            }}
          >
            Reset Demos
          </Button>
        </div>
      </div>

      {/* Category Navigation Bar */}
      <Tabs
        variant="segmented"
        activeTab={activeCategory}
        onChange={setActiveCategory}
        tabs={[
          { id: 'buttons', label: 'Buttons & Triggers' },
          { id: 'forms', label: 'Form Controls' },
          { id: 'overlays', label: 'Modals & Drawers' },
          { id: 'data', label: 'Tables & Pagination' },
          { id: 'feedback', label: 'Feedback & States' },
          { id: 'tokens', label: 'Design Tokens' },
        ]}
      />

      {/* 1. BUTTONS & ACTIONS SECTION */}
      {activeCategory === 'buttons' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Button Variants</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              High-contrast, accessible actions with zero layout shift and visible focus rings.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => toast.success('Primary Button Clicked')}>
                Primary Action
              </Button>
              <Button variant="secondary" onClick={() => toast.info('Secondary Button Clicked')}>
                Secondary Action
              </Button>
              <Button variant="outline" onClick={() => toast.info('Outline Button Clicked')}>
                Outline Action
              </Button>
              <Button variant="ghost" onClick={() => toast.info('Ghost Button Clicked')}>
                Ghost Action
              </Button>
              <Button variant="danger" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => toast.error('Danger Triggered')}>
                Destructive Action
              </Button>
              <Button variant="link" onClick={() => toast.info('Link Button Clicked')}>
                Text Link
              </Button>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Sizes, Icons & Loading States</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" leftIcon={<Plus className="w-3 h-3" />}>Small (32px)</Button>
              <Button size="md" leftIcon={<Plus className="w-3.5 h-3.5" />}>Medium (36px)</Button>
              <Button size="lg" leftIcon={<Plus className="w-4 h-4" />}>Large (40px)</Button>
              <Button size="md" isLoading>Processing Order</Button>
              <Button size="md" disabled>Disabled State</Button>
            </div>
          </div>
        </div>
      )}

      {/* 2. FORM CONTROLS SECTION */}
      {activeCategory === 'forms' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Inputs & Selects */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Text Inputs & Selects</h3>

            <Input
              label="Store Subdomain"
              placeholder="e.g. urbanwear"
              rightIcon={<span className="text-[11px] text-slate-400 font-mono">.nexora.shop</span>}
              helperText="This forms your public store address."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />

            <Input
              label="Email Address (Validation Sample)"
              type="email"
              placeholder="merchant@example.com"
              leftIcon={<Mail className="w-3.5 h-3.5" />}
              error={inputValue.length > 0 && !inputValue.includes('@') ? 'Please provide a valid email format' : undefined}
            />

            <Select
              label="Store Base Currency"
              value={selectValue}
              onChange={(e) => setSelectValue(e.target.value)}
              helperText="Authoritative checkout currency for this tenant."
              options={[
                { label: 'Bangladeshi Taka (BDT ৳)', value: 'bdt' },
                { label: 'United States Dollar (USD $)', value: 'usd' },
                { label: 'Euro (EUR €)', value: 'eur' },
                { label: 'British Pound (GBP £)', value: 'gbp' },
              ]}
            />

            <Textarea
              label="Storefront SEO Tagline"
              placeholder="Short description rendered in search engine previews..."
              maxLength={160}
              showCount
              value={textareaValue}
              onChange={(e) => setTextareaValue(e.target.value)}
            />
          </div>

          {/* Selection & Toggle Controls */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Switches, Checkboxes & Radios</h3>

            <Switch
              label="Automatic SSL Provisioning"
              description="Issue Let's Encrypt certificates automatically for custom domains."
              checked={switchValue}
              onChange={setSwitchValue}
            />

            <Checkbox
              label="Enforce Multi-Factor Authentication (MFA)"
              description="Require all staff accounts to enter a TOTP authenticator code."
              checked={checkboxValue}
              onChange={(e) => setCheckboxValue(e.target.checked)}
            />

            <RadioGroup
              label="Default Fulfillment Policy"
              name="fulfillment-policy"
              value={radioValue}
              onChange={setRadioValue}
              options={[
                { label: 'Manual Order Review', value: 'manual', description: 'Staff manually confirms and packs each order.' },
                { label: 'Standard Automatic Capture', value: 'standard', description: 'Stock reserved immediately upon payment.' },
                { label: 'Pre-Order / Backorder Mode', value: 'preorder', description: 'Accept purchases even when physical inventory reaches zero.' },
              ]}
            />
          </div>
        </div>
      )}

      {/* 3. OVERLAYS & DIALOGS SECTION */}
      {activeCategory === 'overlays' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Interactive Overlay Triggers</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Modals and drawers feature accessible focus traps, background scroll lock, and Escape key listeners.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setIsModalOpen(true)}>Open Modal Dialog</Button>
              <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>Open Slide-Over Drawer</Button>

              <Dropdown
                trigger={<Button variant="outline">Dropdown Menu</Button>}
                items={[
                  { id: '1', label: 'Export Inventory CSV', icon: <Download className="w-3.5 h-3.5" /> },
                  { id: '2', label: 'Sync Gateway Webhooks', icon: <RotateCcw className="w-3.5 h-3.5" /> },
                  { id: '3', label: 'Delete Product', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true },
                ]}
              />

              <Tooltip content="Tooltip helper text displaying contextual information.">
                <Button variant="ghost">Hover for Tooltip</Button>
              </Tooltip>

              <Popover
                trigger={<Button variant="ghost">Open Popover</Button>}
                content={
                  <div className="space-y-2">
                    <h5 className="font-bold text-xs text-slate-900 dark:text-slate-100">Quick Filters</h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Adjust date ranges and category parameters on the fly.</p>
                    <Button size="sm" className="w-full mt-2" onClick={() => toast.success('Filters applied')}>Apply</Button>
                  </div>
                }
              />
            </div>
          </div>

          {/* Sample Modal Instance */}
          <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="Add Product Variant"
            description="Configure SKU, size, color, and price for this variant."
            footer={
              <>
                <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={() => { setIsModalOpen(false); toast.success('Variant Saved'); }}>Save Variant</Button>
              </>
            }
          >
            <div className="space-y-3">
              <Input label="Variant Title" placeholder="e.g. Size: XL, Color: Navy Blue" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="SKU" placeholder="NX-APP-101-XL" />
                <Input label="Stock Count" type="number" placeholder="25" />
              </div>
            </div>
          </Modal>

          {/* Sample Drawer Instance */}
          <Drawer
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            title="Store Filter Parameters"
            footer={
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setIsDrawerOpen(false)}>Reset</Button>
                <Button size="sm" onClick={() => { setIsDrawerOpen(false); toast.success('Filters Updated'); }}>Apply Filters</Button>
              </div>
            }
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure faceted attributes for the public customer storefront:
              </p>
              <Checkbox label="Filter by Price Slider (৳0 - ৳10,000)" checked={true} readOnly />
              <Checkbox label="Filter by Rating (4★ and above)" checked={true} readOnly />
              <Checkbox label="In Stock Items Only" checked={false} readOnly />
            </div>
          </Drawer>
        </div>
      )}

      {/* 4. TABLES & DATA DISPLAY SECTION */}
      {activeCategory === 'data' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Enterprise Product Ledger</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dense 36px row height, tabular numerals (tabular-nums), interactive sorting, and hover highlights.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTableLoading(true);
                  setTimeout(() => setTableLoading(false), 800);
                }}
              >
                Simulate Loading
              </Button>
            </div>
          </div>

          {/* Interactive Category Segmented Control */}
          <Tabs
            variant="segmented"
            activeTab={segmentedTab}
            onChange={(cat) => {
              setSegmentedTab(cat);
              if (cat === 'all') {
                setTableData(DEMO_PRODUCTS);
              } else {
                setTableData(DEMO_PRODUCTS.filter((p) => p.category === cat));
              }
            }}
            tabs={[
              { id: 'all', label: 'All Products', count: DEMO_PRODUCTS.length },
              { id: 'Apparel', label: 'Apparel', count: 3 },
              { id: 'Accessories', label: 'Accessories', count: 1 },
              { id: 'Footwear', label: 'Footwear', count: 1 },
            ]}
          />

          {/* Data Table */}
          <Table<DemoProductRecord>
            columns={columns}
            data={tableData}
            keyExtractor={(item) => item.id}
            sortKey={sortKey}
            sortOrder={sortOrder}
            onSort={handleSort}
            isLoading={tableLoading}
          />

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={3}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            totalRecords={DEMO_PRODUCTS.length}
          />
        </div>
      )}

      {/* 5. FEEDBACK, LOADERS & STATES SECTION */}
      {activeCategory === 'feedback' && (
        <div className="space-y-6">
          {/* Toast Notification Triggers */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Toast Notifications</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dispatched with auto-dismiss timers and accessible status announcements.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => toast.success('Order Confirmed', 'Order #NX-10492 has been paid via bKash.')}>
                Success Toast
              </Button>
              <Button variant="outline" onClick={() => toast.error('Payment Failed', 'Card issuer declined the transaction.')}>
                Error Toast
              </Button>
              <Button variant="outline" onClick={() => toast.warning('Low Inventory Warning', 'Product SKU: NX-APP-102 has only 3 units remaining.')}>
                Warning Toast
              </Button>
              <Button variant="outline" onClick={() => toast.info('System Maintenance', 'SSL renewal scheduled in 2 hours.')}>
                Info Toast
              </Button>
            </div>
          </div>

          {/* Skeleton Loaders */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Skeleton Loaders</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Geometric placeholders preventing layout shift during asynchronous data fetches.
            </p>

            <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
              <Skeleton variant="circular" />
              <div className="flex-1 space-y-1.5">
                <Skeleton width="40%" />
                <Skeleton width="75%" />
              </div>
            </div>

            <SkeletonTable rows={3} columns={4} />
          </div>

          {/* Empty & Error States */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <EmptyState
              title="No Customer Orders Yet"
              description="When shoppers complete checkouts on your storefront, orders will appear here in real-time."
              action={<Button size="sm" leftIcon={<Eye className="w-3.5 h-3.5" />}>View Storefront</Button>}
            />

            <ErrorState
              title="Connection Error"
              message="Could not reach the payment gateway webhook API. Please check your network or retry."
              onRetry={() => toast.info('Retrying connection...')}
            />
          </div>
        </div>
      )}

      {/* 6. DESIGN TOKENS INSPECTOR SECTION */}
      {activeCategory === 'tokens' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Design Token Palette</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              {[
                { name: 'Canvas BG', class: 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800', hex: 'slate-50 / slate-950' },
                { name: 'Surface BG', class: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800', hex: 'white / slate-900' },
                { name: 'Subtle BG', class: 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700', hex: 'slate-100 / slate-800' },
                { name: 'Primary', class: 'bg-indigo-600 text-white', hex: '#4F46E5' },
                { name: 'Success', class: 'bg-emerald-500 text-white', hex: '#22C55E' },
                { name: 'Warning', class: 'bg-amber-500 text-white', hex: '#F59E0B' },
                { name: 'Danger', class: 'bg-rose-600 text-white', hex: '#E11D48' },
                { name: 'Text Primary', class: 'bg-slate-900 dark:bg-white text-white dark:text-slate-900', hex: 'slate-900 / white' },
              ].map((tok, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                  <div className={`h-8 w-full rounded flex items-center justify-center font-mono text-[10px] font-bold ${tok.class}`}>
                    Sample
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block text-[11px] truncate">{tok.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono block truncate">{tok.hex}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
