/**
 * NEXORA Enterprise Design System
 * Dashboard Layout & Responsive Sidebar Shell
 */

import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext.tsx';
import { Breadcrumb, BreadcrumbItem } from '../ui/Breadcrumb.tsx';
import { Dropdown } from '../ui/Dropdown.tsx';
import {
  Store,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  Palette,
  CreditCard,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
  ChevronDown,
  Layers,
  Database,
  ShieldCheck,
  KeyRound,
  UserCog,
  Crown,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  onClick?: () => void;
}

export interface DashboardLayoutProps {
  children: React.ReactNode;
  activeNavId: string;
  onNavSelect: (id: string) => void;
  breadcrumbs?: BreadcrumbItem[];
  storeName?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeNavId,
  onNavSelect,
  breadcrumbs = [{ label: 'NEXORA' }, { label: 'Design System Showcase' }],
  storeName = 'Urban Wear BD',
}) => {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: NavItem[] = [
    { id: 'super-admin', label: 'Super Admin', icon: <Crown className="w-4 h-4" />, badge: 'Phase 09' },
    { id: 'onboarding', label: 'Store Onboarding', icon: <Store className="w-4 h-4" />, badge: 'Phase 08' },
    { id: 'rbac', label: 'Roles & Permissions', icon: <UserCog className="w-4 h-4" />, badge: 'Phase 07' },
    { id: 'auth', label: 'Authentication & MFA', icon: <KeyRound className="w-4 h-4" />, badge: 'Phase 06' },
    { id: 'security', label: 'Security Foundation', icon: <ShieldCheck className="w-4 h-4" />, badge: 'Phase 05' },
    { id: 'database', label: 'Database Architecture', icon: <Database className="w-4 h-4" />, badge: '35 Colls' },
    { id: 'design-system', label: 'Design System Gallery', icon: <Palette className="w-4 h-4" /> },
    { id: 'dashboard', label: 'Dashboard Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'products', label: 'Products & Variants', icon: <Package className="w-4 h-4" />, badge: '42' },
    { id: 'orders', label: 'Orders & Fulfillment', icon: <ShoppingBag className="w-4 h-4" />, badge: '12' },
    { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" /> },
    { id: 'payments', label: 'Payment Adapters', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'architecture', label: 'Architecture Docs', icon: <Layers className="w-4 h-4" /> },
    { id: 'settings', label: 'Store Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const handleNavClick = (id: string) => {
    onNavSelect(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Desktop Sidebar (Fixed 260px) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        {/* Brand Lockup */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-800 gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-indigo-500/20">
            NX
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white block truncate">
              NEXORA
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
              Enterprise SaaS
            </span>
          </div>
        </div>

        {/* Tenant Store Badge / Switcher */}
        <div className="p-3 mx-3 my-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Store className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="truncate">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">
                {storeName}
              </span>
              <span className="text-[10px] text-slate-400 font-mono block truncate">
                urbanwear.nexora.shop
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Stream */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeNavId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className={isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="font-mono">Phase 09 Active</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
            Ready
          </span>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Bar */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
              aria-label="Open mobile menu"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Contextual Breadcrumbs */}
            <Breadcrumb items={breadcrumbs} className="truncate" />
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Light / Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Profile Dropdown */}
            <Dropdown
              align="right"
              trigger={
                <div className="flex items-center gap-2 pl-2 cursor-pointer select-none">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center">
                    AD
                  </div>
                  <span className="hidden sm:inline text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Al-Amin Adnan
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>
              }
              items={[
                { id: 'profile', label: 'My Profile' },
                { id: 'security', label: 'Security & 2FA' },
                { id: 'docs', label: 'Architecture Specs' },
                { id: 'logout', label: 'Sign Out', danger: true },
              ]}
            />
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col z-10 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold text-sm text-slate-900 dark:text-white">NEXORA Navigation</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left ${
                    activeNavId === item.id
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
};
