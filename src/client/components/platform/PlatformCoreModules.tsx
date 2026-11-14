/**
 * NEXORA Super Admin — Core Governance Modules
 * Tenant Management, Store Management, User Management & Admin Management
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { Download, Search, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useToast } from '../../context/ToastContext.tsx';
import {
  triggerCsvDownload,
  type ApiCallFn,
  type ConfirmActionConfig,
  type PaginationMeta,
} from './platformTypes.ts';

interface CoreModuleProps {
  mode: 'tenants' | 'stores' | 'users' | 'admins';
  apiCall: ApiCallFn;
  permissions: string[];
  onRequestConfirm: (cfg: ConfirmActionConfig) => void;
  onMutated: () => void;
}

export const PlatformCoreModules: React.FC<CoreModuleProps> = ({
  mode,
  apiCall,
  permissions,
  onRequestConfirm,
  onMutated,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const canManageTenants = permissions.includes('platform:tenants:manage');
  const canAssignRoles = permissions.includes('platform:roles:assign');
  const canExport = permissions.includes('platform:export:data');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Tenants / Stores state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [userTypeFilter, setUserTypeFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 8,
    total: 0,
    totalPages: 1,
  });

  const [tenants, setTenants] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);

  // Assign Admin form
  const [assignEmail, setAssignEmail] = useState('');
  const [assignRole, setAssignRole] = useState('support_agent');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'tenants' || mode === 'stores') {
        const params = new URLSearchParams({
          page: String(page),
          limit: '8',
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
          ...(tierFilter !== 'ALL' ? { tier: tierFilter } : {}),
        });
        const { res, json } = await apiCall(`/api/v1/platform/tenants?${params.toString()}`);
        if (res.ok && json?.data) {
          setTenants(json.data.items || []);
          setPagination(json.data.pagination);
        }
      } else if (mode === 'users') {
        const params = new URLSearchParams({
          page: String(page),
          limit: '8',
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(userTypeFilter !== 'ALL' ? { userType: userTypeFilter } : {}),
          ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
        });
        const { res, json } = await apiCall(`/api/v1/platform/users?${params.toString()}`);
        if (res.ok && json?.data) {
          setUsers(json.data.items || []);
          setPagination(json.data.pagination);
        }
      } else if (mode === 'admins') {
        const { res, json } = await apiCall('/api/v1/platform/admins');
        if (res.ok && json?.data) {
          setAdmins(json.data.admins || []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [apiCall, mode, page, search, statusFilter, tierFilter, userTypeFilter]);

  useEffect(() => {
    setPage(1);
  }, [mode, search, statusFilter, tierFilter, userTypeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportCsv = async (dataset: 'tenants' | 'users') => {
    setBusy(true);
    try {
      const { res, json } = await apiCall(`/api/v1/platform/export/${dataset}`);
      if (!res.ok) {
        toastError('Export Denied', json?.error?.message || 'Export permission required.');
        return;
      }
      triggerCsvDownload(json.data.filename, json.data.csv);
      toastSuccess('CSV Exported', `Exported ${json.data.rowCount} rows (${json.data.filename}).`);
      onMutated();
    } finally {
      setBusy(false);
    }
  };

  const handleTenantStatusAction = (t: any, nextStatus: 'ACTIVE' | 'SUSPENDED') => {
    onRequestConfirm({
      title: `${nextStatus === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} ${t.name}`,
      description:
        nextStatus === 'SUSPENDED'
          ? `Suspending '${t.slug}' blocks merchant admin mutations and flags the storefront as suspended. Audit log entry will be recorded.`
          : `Reactivating '${t.slug}' restores normal merchant and storefront operations.`,
      confirmLabel: nextStatus === 'SUSPENDED' ? 'Suspend Store' : 'Activate Store',
      danger: nextStatus === 'SUSPENDED',
      onConfirm: async () => {
        const { res, json } = await apiCall(`/api/v1/platform/tenants/${t.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: nextStatus,
            reason:
              nextStatus === 'SUSPENDED'
                ? 'Suspended via Super Admin governance console'
                : 'Reactivated via Super Admin governance console',
          }),
        });
        if (!res.ok) {
          toastError('Action Blocked', json?.error?.message || 'Permission denied.');
          return;
        }
        toastSuccess('Tenant Updated', `${t.name} is now ${nextStatus}.`);
        await loadData();
        onMutated();
      },
    });
  };

  const handleArchiveTenant = (t: any) => {
    onRequestConfirm({
      title: `Archive Tenant "${t.name}"`,
      description:
        'Soft-deleting this tenant archives its storefront and suspends tenant access. This action is audited.',
      confirmLabel: 'Confirm Archive',
      danger: true,
      onConfirm: async () => {
        const { res, json } = await apiCall(`/api/v1/platform/tenants/${t.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason: 'Archived by Super Admin platform governance' }),
        });
        if (!res.ok) {
          toastError('Archive Denied', json?.error?.message || 'Unable to archive tenant.');
          return;
        }
        toastSuccess('Tenant Archived', `${t.name} has been archived.`);
        await loadData();
        onMutated();
      },
    });
  };

  const handleUserStatusToggle = (u: any) => {
    const nextStatus = u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    onRequestConfirm({
      title: `${nextStatus === 'SUSPENDED' ? 'Suspend' : 'Activate'} User Account`,
      description:
        nextStatus === 'SUSPENDED'
          ? `Suspending ${u.email} immediately revokes all active sessions and prevents sign-in.`
          : `Activating ${u.email} clears login lockouts and restores authentication access.`,
      confirmLabel: nextStatus === 'SUSPENDED' ? 'Suspend User' : 'Activate User',
      danger: nextStatus === 'SUSPENDED',
      onConfirm: async () => {
        const { res, json } = await apiCall(`/api/v1/platform/users/${u.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: nextStatus,
            reason: `Status set to ${nextStatus} by platform governance`,
          }),
        });
        if (!res.ok) {
          toastError('Update Denied', json?.error?.message || 'Unable to update user status.');
          return;
        }
        toastSuccess('User Updated', `${u.email} is now ${nextStatus}.`);
        await loadData();
        onMutated();
      },
    });
  };

  const handleRevokeUserSessions = (u: any) => {
    onRequestConfirm({
      title: `Revoke Active Sessions for ${u.email}`,
      description: 'Forces immediate logout across all browsers and devices for this account.',
      confirmLabel: 'Revoke All Sessions',
      danger: true,
      onConfirm: async () => {
        const { res, json } = await apiCall(`/api/v1/platform/users/${u.id}/revoke-sessions`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Forced session revocation from Super Admin console' }),
        });
        if (!res.ok) {
          toastError('Action Failed', json?.error?.message || 'Permission denied.');
          return;
        }
        toastSuccess('Sessions Revoked', `All sessions terminated for ${u.email}.`);
        onMutated();
      },
    });
  };

  const handleAssignAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiCall('/api/v1/platform/admins/assign', {
        method: 'POST',
        body: JSON.stringify({ email: assignEmail, roleSlug: assignRole }),
      });
      if (!res.ok) {
        toastError('Assignment Denied', json?.error?.message || 'Failed to assign platform role.');
        return;
      }
      setAssignEmail('');
      toastSuccess('Admin Role Assigned', `${json.data.email} updated to ${json.data.platformRoleSlug}.`);
      await loadData();
      onMutated();
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeAdmin = (a: any) => {
    onRequestConfirm({
      title: `Revoke Platform Admin Role for ${a.email}`,
      description: `Downgrades ${a.fullName} from ${a.platformRoleName} back to standard Customer scope.`,
      confirmLabel: 'Revoke Admin Role',
      danger: true,
      onConfirm: async () => {
        const { res, json } = await apiCall('/api/v1/platform/admins/revoke', {
          method: 'POST',
          body: JSON.stringify({ userId: a.id }),
        });
        if (!res.ok) {
          toastError('Revocation Blocked', json?.error?.message || 'Unable to revoke role.');
          return;
        }
        toastSuccess('Admin Role Revoked', `${a.email} removed from platform administration.`);
        await loadData();
        onMutated();
      },
    });
  };

  // ---------- TENANTS & STORES RENDER ----------
  if (mode === 'tenants' || mode === 'stores') {
    return (
      <Card>
        <CardHeader className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {mode === 'tenants' ? 'Tenant Organizations Directory' : 'Storefront Instances Registry'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {mode === 'tenants'
                ? 'Manage merchant tenants, plan tiers, storage quotas, and isolated NEXORA Official Flagship Store.'
                : 'Monitor storefront status, themes, currencies, locales, and domain routing across tenants.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, slug, email..."
                className="h-8 pl-8 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 w-48 sm:w-56"
              />
            </div>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="TRIAL">Trial</option>
            </select>
            <select
              aria-label="Filter by tier"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
            >
              <option value="ALL">All Plans</option>
              <option value="STARTER">Starter</option>
              <option value="GROWTH">Growth</option>
              <option value="PRO">Pro</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => handleExportCsv('tenants')}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              {canExport ? 'Export CSV' : 'Export (Locked)'}
            </Button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400">Loading tenant directory...</div>
          ) : tenants.length === 0 ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
              No tenants match the current search or filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">
                      {mode === 'tenants' ? 'Tenant & Slug' : 'Storefront & Subdomain'}
                    </th>
                    <th className="py-2.5 px-4 font-semibold">Ownership</th>
                    <th className="py-2.5 px-4 font-semibold">
                      {mode === 'tenants' ? 'Plan Tier' : 'Theme & Locale'}
                    </th>
                    <th className="py-2.5 px-4 font-semibold">Storage Used</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {tenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{t.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {t.slug}.nexora.shop · {t.contactEmail}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {t.isOfficialStore ? 'Platform Official (Isolated)' : 'Merchant Tenant'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {mode === 'tenants'
                          ? `${t.tier} · ${t.currency}`
                          : `${t.defaultThemeCode} · ${t.locale} (${t.currency})`}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {t.storageUsedMB} / {t.storageQuotaMB} MB
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        <span
                          className={
                            t.status === 'ACTIVE'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {canManageTenants ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleTenantStatusAction(
                                  t,
                                  t.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
                                )
                              }
                            >
                              {t.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                            </Button>
                            {!t.isOfficialStore && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleArchiveTenant(t)}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              </Button>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400">Read-Only</span>
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

  // ---------- USER MANAGEMENT RENDER ----------
  if (mode === 'users') {
    return (
      <Card>
        <CardHeader className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Registered Platform Users Directory
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Global identities across Platform Admins, Store Merchants, and Storefront Customers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email or name..."
                className="h-8 pl-8 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-48"
              />
            </div>
            <select
              aria-label="Filter by user type"
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
            >
              <option value="ALL">All Types</option>
              <option value="MERCHANT">Merchants</option>
              <option value="CUSTOMER">Customers</option>
              <option value="PLATFORM_SUPER_ADMIN">Super Admin</option>
              <option value="PLATFORM_ADMIN">Platform Admin</option>
              <option value="PLATFORM_FINANCE_MANAGER">Finance Manager</option>
              <option value="PLATFORM_SUPPORT_AGENT">Support Agent</option>
            </select>
            <select
              aria-label="Filter by account status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="PENDING_VERIFICATION">Pending Verify</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => handleExportCsv('users')}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              {canExport ? 'Export CSV' : 'Export (Locked)'}
            </Button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 text-xs text-slate-500">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">User</th>
                    <th className="py-2.5 px-4 font-semibold">Account Type</th>
                    <th className="py-2.5 px-4 font-semibold">Security</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{u.fullName}</div>
                        <div className="font-mono text-[11px] text-slate-400">{u.email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {u.userType}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-500 dark:text-slate-400">
                        {u.isMfaEnabled ? 'MFA Enabled' : 'Password'} ·{' '}
                        {u.emailVerified ? 'Verified' : 'Unverified'}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        <span
                          className={
                            u.status === 'ACTIVE'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {canManageTenants ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUserStatusToggle(u)}
                            >
                              {u.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRevokeUserSessions(u)}
                            >
                              Revoke Sessions
                            </Button>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400">Read-Only</span>
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

  // ---------- ADMIN MANAGEMENT RENDER ----------
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Platform Administrators ({admins.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Users holding platform-wide governance roles. Super Admin modifications require Super Admin rank.
          </p>
        </CardHeader>
        <CardBody className="p-0">
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {admins.map((a) => (
              <div
                key={a.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {a.fullName}{' '}
                    <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                      ({a.platformRoleName})
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">{a.email}</div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {a.permissions.join(' · ')}
                  </div>
                </div>
                {canAssignRoles && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={a.platformRoleSlug === 'super_admin'}
                    onClick={() => handleRevokeAdmin(a)}
                  >
                    {a.platformRoleSlug === 'super_admin' ? 'Protected' : 'Revoke Role'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Assign Platform Role
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Requires <code className="font-mono">platform:roles:assign</code>. Hierarchy guards block lateral/upward escalation.
          </p>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleAssignAdmin} className="space-y-3">
            <Input
              label="User Account Email"
              type="email"
              required
              placeholder="buyer1@nexora.shop"
              value={assignEmail}
              onChange={(e) => setAssignEmail(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Platform Role
              </label>
              <select
                value={assignRole}
                onChange={(e) => setAssignRole(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
              >
                <option value="support_agent">Support Agent (Rank 60)</option>
                <option value="finance_manager">Finance Manager (Rank 70)</option>
                <option value="platform_admin">Platform Admin (Rank 90)</option>
                <option value="super_admin">Super Admin (Rank 100)</option>
              </select>
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-full"
              isLoading={busy}
              disabled={!canAssignRoles}
            >
              {canAssignRoles ? 'Grant Platform Role' : 'Requires platform:roles:assign'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
};
