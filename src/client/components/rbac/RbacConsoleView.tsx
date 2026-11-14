/**
 * NEXORA Role-Based Access Control (RBAC) & Authorization Console
 * Phase 07 - 14-Role Matrix, Store-Scoped Permissions, Staff Invitations,
 * Platform Governance, Resource/IDOR Verification & Admin Activity Logs.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  MailPlus,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

interface PermissionDef {
  code: string;
  name: string;
  description: string;
  module: string;
  scope: 'PLATFORM' | 'TENANT' | 'STOREFRONT';
}

interface RoleDef {
  id?: string;
  slug: string;
  name: string;
  scope?: 'PLATFORM' | 'TENANT' | 'STOREFRONT';
  hierarchyRank: number;
  description: string;
  permissionCodes: string[];
  isSystemDefault: boolean;
}

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  status: string;
}

interface MembershipItem {
  id: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  roleSlug: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REVOKED';
  joinedAt: string;
}

interface InvitationItem {
  id: string;
  email: string;
  roleSlug: string;
  status: string;
  expiresAt: string;
}

interface PlatformUserItem {
  id: string;
  email: string;
  fullName: string;
  userType: string;
  platformRoleSlug: string;
  platformRoleName: string;
  permissions: string[];
}

interface ProductItem {
  id: string;
  tenantId: string;
  title: string;
  sku: string;
  priceBDT: number;
  stockQty: number;
  status: string;
  createdByUserId: string;
}

interface OrderItem {
  id: string;
  tenantId: string;
  orderNumber: string;
  customerUserId: string;
  customerEmail: string;
  totalBDT: number;
  status: string;
  itemsSummary: string;
}

interface ActivityLogItem {
  id: string;
  scope: string;
  tenantId?: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome: 'ALLOWED' | 'DENIED';
  reason?: string;
  ipAddress: string;
  createdAt: string;
}

interface RbacTestResult {
  id: string;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
  error?: string;
}

interface RbacVerificationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: RbacTestResult[];
}

const DEMO_PERSONAS = [
  { label: 'Super Admin', email: 'superadmin@nexora.cloud', roleHint: 'Platform · Rank 100' },
  { label: 'Finance Manager', email: 'finance@nexora.cloud', roleHint: 'Platform · Rank 70' },
  { label: 'Support Agent', email: 'support@nexora.cloud', roleHint: 'Platform · Rank 60' },
  { label: 'UrbanWear Owner', email: 'owner@urbanwear.nexora.shop', roleHint: 'Tenant A · Rank 80' },
  { label: 'Product Manager', email: 'catalog@urbanwear.nexora.shop', roleHint: 'Tenant A · Rank 50' },
  { label: 'LuxeThread Owner', email: 'owner@luxethread.nexora.shop', roleHint: 'Tenant B · Rank 80' },
  { label: 'Customer A', email: 'buyer1@nexora.shop', roleHint: 'Storefront · Rank 10' },
];

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

export const RbacConsoleView: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();
  const csrfRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    'matrix' | 'members' | 'platform' | 'resources' | 'audit'
  >('matrix');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'PLATFORM' | 'TENANT' | 'STOREFRONT'>('ALL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Overview & Identity State
  const [permissionsCatalog, setPermissionsCatalog] = useState<PermissionDef[]>([]);
  const [systemRoles, setSystemRoles] = useState<RoleDef[]>([]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [meSummary, setMeSummary] = useState<any>(null);

  // Tenant-Scoped Management State
  const [tenantRoles, setTenantRoles] = useState<RoleDef[]>([]);
  const [editingRoleSlug, setEditingRoleSlug] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleSlug, setNewRoleSlug] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<string[]>(['product:read']);

  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleSlug, setInviteRoleSlug] = useState('order_manager');
  const [latestInviteToken, setLatestInviteToken] = useState('');
  const [acceptTokenInput, setAcceptTokenInput] = useState('');

  // Platform Governance State
  const [platformUsers, setPlatformUsers] = useState<PlatformUserItem[]>([]);
  const [platformAssignEmail, setPlatformAssignEmail] = useState('');
  const [platformAssignRole, setPlatformAssignRole] = useState('support_agent');

  // Resource & IDOR Probe State
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [probeResponse, setProbeResponse] = useState<{ status: number; code?: string; message: string } | null>(null);
  const [newProdTitle, setNewProdTitle] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('1850');
  const [customOrderIdProbe, setCustomOrderIdProbe] = useState('ord_uw_9002');

  // Audit & Verification State
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logOutcomeFilter, setLogOutcomeFilter] = useState<'ALL' | 'ALLOWED' | 'DENIED'>('ALL');
  const [testReport, setTestReport] = useState<RbacVerificationReport | null>(null);
  const [runningTests, setRunningTests] = useState(false);

  const ensureCsrf = async (): Promise<string> => {
    const cookieVal = readCookieValue('nexora_csrf');
    if (cookieVal) {
      csrfRef.current = cookieVal;
      return cookieVal;
    }
    if (csrfRef.current) return csrfRef.current;
    const res = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    const token = json?.data?.csrfToken || '';
    csrfRef.current = token;
    return token;
  };

  const apiCall = useCallback(async (path: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...((init.headers as Record<string, string>) || {}),
    };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = await ensureCsrf();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    const res = await fetch(path, { ...init, credentials: 'include', headers });
    const json = await res.json().catch(() => ({}));
    if (json?.data?.csrfToken) csrfRef.current = json.data.csrfToken;
    return { res, json };
  }, []);

  const loadContextualData = useCallback(
    async (tenantId: string) => {
      if (!tenantId) return;
      const [rolesRes, membersRes, prodRes, ordRes, tenantLogsRes, platUsersRes, platLogsRes] =
        await Promise.all([
          apiCall(`/api/v1/rbac/tenants/${tenantId}/roles`),
          apiCall(`/api/v1/rbac/tenants/${tenantId}/members`),
          apiCall(`/api/v1/rbac/tenants/${tenantId}/products`),
          apiCall(`/api/v1/rbac/tenants/${tenantId}/orders`),
          apiCall(`/api/v1/rbac/tenants/${tenantId}/activity-logs`),
          apiCall('/api/v1/rbac/platform/users'),
          apiCall('/api/v1/rbac/platform/activity-logs'),
        ]);

      setTenantRoles(rolesRes.res.ok ? rolesRes.json?.data?.roles || [] : []);
      setMemberships(membersRes.res.ok ? membersRes.json?.data?.memberships || [] : []);
      setInvitations(membersRes.res.ok ? membersRes.json?.data?.invitations || [] : []);

      if (prodRes.res.ok) {
        setProducts(prodRes.json?.data?.products || []);
      } else {
        // Fallback to public storefront catalog for Guest / Customer visibility
        const pubRes = await apiCall(`/api/v1/rbac/storefront/${tenantId}/catalog`);
        setProducts(pubRes.res.ok ? pubRes.json?.data?.products || [] : []);
      }

      setOrders(ordRes.res.ok ? ordRes.json?.data?.orders || [] : []);
      setPlatformUsers(platUsersRes.res.ok ? platUsersRes.json?.data?.users || [] : []);

      if (platLogsRes.res.ok) {
        setActivityLogs(platLogsRes.json?.data?.logs || []);
      } else if (tenantLogsRes.res.ok) {
        setActivityLogs(tenantLogsRes.json?.data?.logs || []);
      } else {
        setActivityLogs([]);
      }
    },
    [apiCall]
  );

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, meRes] = await Promise.all([
        apiCall('/api/v1/rbac/overview'),
        apiCall('/api/v1/rbac/me/permissions'),
      ]);
      if (ovRes.res.ok && ovRes.json?.data) {
        setPermissionsCatalog(ovRes.json.data.permissions || []);
        setSystemRoles(ovRes.json.data.systemRoles || []);
        const tList: TenantSummary[] = ovRes.json.data.tenants || [];
        setTenants(tList);
        const activeTid = selectedTenantId || tList[0]?.id || '';
        if (activeTid && activeTid !== selectedTenantId) {
          setSelectedTenantId(activeTid);
        }
        if (meRes.res.ok) setMeSummary(meRes.json?.data || null);
        if (activeTid) await loadContextualData(activeTid);
      }
    } finally {
      setLoading(false);
    }
  }, [apiCall, loadContextualData, selectedTenantId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handlePersonaLogin = async (email: string) => {
    setBusy(true);
    setProbeResponse(null);
    try {
      const { res, json } = await apiCall('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'NexoraDemo!2026' }),
      });
      if (!res.ok) {
        toastError('Sign-In Failed', json?.error?.message || 'Unable to authenticate demo account.');
        return;
      }
      toastSuccess('Session Switched', `Signed in via HttpOnly cookies as ${email}.`);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const handleSignOutToGuest = async () => {
    setBusy(true);
    setProbeResponse(null);
    try {
      await apiCall('/api/v1/auth/logout', { method: 'POST' });
      toastSuccess('Signed Out', 'Active scope downgraded to Storefront Guest.');
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  // ---------- ROLE PERMISSION MANAGEMENT ----------
  const handleSaveRolePermissions = async () => {
    if (!editingRoleSlug || !selectedTenantId) return;
    setBusy(true);
    try {
      const { res, json } = await apiCall(
        `/api/v1/rbac/tenants/${selectedTenantId}/roles/${editingRoleSlug}`,
        { method: 'PATCH', body: JSON.stringify({ permissionCodes: editingPerms }) }
      );
      if (!res.ok) {
        toastError('Authorization Denied', json?.error?.message || 'Cannot modify role permissions.');
        return;
      }
      setEditingRoleSlug(null);
      await loadContextualData(selectedTenantId);
      toastSuccess('Permissions Updated', `Updated role ${editingRoleSlug} permissions.`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    setBusy(true);
    try {
      const { res, json } = await apiCall(`/api/v1/rbac/tenants/${selectedTenantId}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          name: newRoleName,
          slug: newRoleSlug,
          permissionCodes: newRolePerms,
        }),
      });
      if (!res.ok) {
        toastError('Role Creation Blocked', json?.error?.message || 'Unable to create custom role.');
        return;
      }
      setNewRoleName('');
      setNewRoleSlug('');
      await loadContextualData(selectedTenantId);
      toastSuccess('Custom Role Created', `Role '${json.data.role.slug}' is now active.`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- MEMBERSHIPS & INVITATIONS ----------
  const handleChangeMemberRole = async (userId: string, roleSlug: string) => {
    setBusy(true);
    try {
      const { res, json } = await apiCall(
        `/api/v1/rbac/tenants/${selectedTenantId}/members/${userId}/role`,
        { method: 'POST', body: JSON.stringify({ roleSlug }) }
      );
      if (!res.ok) {
        toastError('Assignment Denied', json?.error?.message || 'Role assignment failed.');
        return;
      }
      await loadContextualData(selectedTenantId);
      toastSuccess('Role Assigned', `Member updated to ${roleSlug}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeMember = async (userId: string) => {
    setBusy(true);
    try {
      const { res, json } = await apiCall(
        `/api/v1/rbac/tenants/${selectedTenantId}/members/${userId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        toastError('Revocation Blocked', json?.error?.message || 'Cannot revoke member.');
        return;
      }
      await loadContextualData(selectedTenantId);
      toastSuccess('Access Revoked', 'Member access terminated immediately.');
    } finally {
      setBusy(false);
    }
  };

  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiCall(`/api/v1/rbac/tenants/${selectedTenantId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, roleSlug: inviteRoleSlug }),
      });
      if (!res.ok) {
        toastError('Invitation Blocked', json?.error?.message || 'Permission denied.');
        return;
      }
      const tokenPreview = json?.data?.inviteTokenPreview || '';
      setLatestInviteToken(tokenPreview);
      if (tokenPreview) setAcceptTokenInput(tokenPreview);
      setInviteEmail('');
      await loadContextualData(selectedTenantId);
      toastSuccess('Staff Invited', `Invitation issued for ${json.data.invitation.email}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiCall('/api/v1/rbac/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token: acceptTokenInput }),
      });
      if (!res.ok) {
        toastError('Invitation Rejected', json?.error?.message || 'Invalid or mismatched token.');
        return;
      }
      setAcceptTokenInput('');
      setLatestInviteToken('');
      await refreshAll();
      toastSuccess('Invitation Accepted', 'You have joined the tenant store team.');
    } finally {
      setBusy(false);
    }
  };

  // ---------- PLATFORM ROLE GOVERNANCE ----------
  const handleAssignPlatformRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiCall('/api/v1/rbac/platform/roles/assign', {
        method: 'POST',
        body: JSON.stringify({ email: platformAssignEmail, roleSlug: platformAssignRole }),
      });
      if (!res.ok) {
        toastError('Platform Governance Denied', json?.error?.message || 'Unauthorized.');
        return;
      }
      setPlatformAssignEmail('');
      await refreshAll();
      toastSuccess('Platform Role Assigned', `${json.data.email} updated to ${json.data.platformRoleSlug}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleRevokePlatformRole = async (userId: string) => {
    setBusy(true);
    try {
      const { res, json } = await apiCall('/api/v1/rbac/platform/roles/revoke', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        toastError('Revocation Blocked', json?.error?.message || 'Permission denied.');
        return;
      }
      await refreshAll();
      toastSuccess('Platform Role Revoked', 'User downgraded to standard Customer scope.');
    } finally {
      setBusy(false);
    }
  };

  // ---------- RESOURCE & IDOR AUTHORIZATION PROBES ----------
  const runProbeCall = async (label: string, method: string, path: string, body?: unknown) => {
    setBusy(true);
    try {
      const { res, json } = await apiCall(path, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (res.ok) {
        setProbeResponse({ status: res.status, message: `${label} succeeded (HTTP ${res.status}).` });
        await loadContextualData(selectedTenantId);
      } else {
        setProbeResponse({
          status: res.status,
          code: json?.error?.code,
          message: json?.error?.message || 'Request rejected by server authorization.',
        });
        await loadContextualData(selectedTenantId);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRunRbacTests = async () => {
    setRunningTests(true);
    try {
      const { res, json } = await apiCall('/api/v1/rbac/verify', { method: 'POST' });
      if (res.ok && json?.data) {
        setTestReport(json.data);
        await loadContextualData(selectedTenantId);
        if (json.data.failed === 0) {
          toastSuccess('RBAC Suite Passed', `${json.data.passed}/${json.data.totalTests} authorization scenarios verified.`);
        } else {
          toastError('RBAC Suite Alert', `${json.data.failed} assertion(s) failed.`);
        }
      } else {
        toastError('Suite Execution Error', json?.error?.message || 'Failed to run verification suite.');
      }
    } finally {
      setRunningTests(false);
    }
  };

  const tenantPermissionsOnly = permissionsCatalog.filter((p) => p.scope === 'TENANT');
  const filteredRoles = systemRoles.filter(
    (r) => scopeFilter === 'ALL' || r.scope === scopeFilter
  );
  const filteredLogs = activityLogs.filter((l) => {
    if (logOutcomeFilter !== 'ALL' && l.outcome !== logOutcomeFilter) return false;
    if (!logSearch.trim()) return true;
    const q = logSearch.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      (l.actorEmail || '').toLowerCase().includes(q) ||
      l.actorRole.toLowerCase().includes(q) ||
      (l.reason || '').toLowerCase().includes(q)
    );
  });

  const activeUserLabel = meSummary?.authenticated
    ? `${meSummary.user.fullName} (${meSummary.user.email})`
    : 'Guest Visitor (Unauthenticated)';

  return (
    <div className="space-y-6">
      {/* Header & Top Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Role-Based Access Control & Authorization
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            14-role platform, tenant, and storefront hierarchy with server-authoritative permission enforcement, anti-IDOR ownership, and audit logging.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            aria-label="Select Target Tenant Scope"
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                Store Scope: {t.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={refreshAll}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Sync State
          </Button>
        </div>
      </div>

      {/* Interactive Demo Identity Switcher (Real HttpOnly Cookie Auth) */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs space-y-0.5">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold">
                <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Active Identity: {activeUserLabel}</span>
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                {meSummary?.platformRole
                  ? `Platform Role: ${meSummary.platformRole.name} · ${meSummary.platformRole.permissions.length} platform permissions`
                  : meSummary?.memberships?.length
                    ? meSummary.memberships
                        .map((m: any) => `${m.tenantName}: ${m.roleSlug} (${m.permissions.length} perms)`)
                        .join(' · ')
                    : meSummary?.storefrontRole
                      ? `Storefront Role: Customer · ${meSummary.storefrontRole.permissions.length} storefront permissions`
                      : 'Storefront Role: Guest · 1 public catalog permission'}
              </div>
            </div>

            {meSummary?.authenticated && (
              <Button size="sm" variant="outline" isLoading={busy} onClick={handleSignOutToGuest}>
                Switch to Guest
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
              Test As Persona:
            </span>
            {DEMO_PERSONAS.map((p) => {
              const isCurrent = meSummary?.user?.email === p.email;
              return (
                <button
                  key={p.email}
                  type="button"
                  disabled={busy}
                  onClick={() => handlePersonaLogin(p.email)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
                    isCurrent
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Primary Workspace Navigation Tabs */}
      <div className="flex overflow-x-auto items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
        {[
          { id: 'matrix', label: 'Role & Permission Matrix', icon: <KeyRound className="w-3.5 h-3.5" /> },
          { id: 'members', label: 'Members & Invitations', icon: <Users className="w-3.5 h-3.5" /> },
          { id: 'platform', label: 'Platform Governance', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
          { id: 'resources', label: 'Resource & IDOR Tester', icon: <Lock className="w-3.5 h-3.5" /> },
          { id: 'audit', label: 'Activity Logs & Tests', icon: <Play className="w-3.5 h-3.5" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: ROLE & PERMISSION MATRIX + CUSTOM TENANT ROLE EDITOR */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Canonical 14-Role Authorization Hierarchy
            </h3>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['ALL', 'PLATFORM', 'TENANT', 'STOREFRONT'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScopeFilter(s)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    scopeFilter === s
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {s === 'ALL' ? 'All Scopes (14)' : s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRoles.map((role) => (
              <Card key={role.slug}>
                <CardBody className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{role.name}</h4>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      Rank {role.hierarchyRank}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {role.scope} · <span className="font-mono">{role.slug}</span> ·{' '}
                    <span className="font-mono tabular-nums">{role.permissionCodes.length}</span> permissions
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {role.description}
                  </p>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 break-words">
                    {role.permissionCodes.join(' · ')}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Store-Scoped Role Permission Editor (Requires role:manage inside selected tenant) */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Store-Scoped Role Permissions Editor
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Requires active store membership with <code className="font-mono">role:manage</code>. Platform permissions are strictly excluded.
                </p>
              </div>
            </CardHeader>
            <CardBody className="space-y-5">
              {tenantRoles.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400 py-4">
                  Sign in as an active member of this store with <code className="font-mono">staff:read</code> or <code className="font-mono">role:manage</code> (e.g. Store Owner) to view and customize store roles.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Role</th>
                        <th className="py-2.5 px-3 font-semibold">Rank</th>
                        <th className="py-2.5 px-3 font-semibold">Assigned Permissions</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {tenantRoles.map((tr) => (
                        <tr key={tr.slug} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                            {tr.name} <span className="text-slate-400 font-mono">({tr.slug})</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {tr.hierarchyRank}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {tr.permissionCodes.join(', ')}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={tr.slug === 'store_owner'}
                              onClick={() => {
                                setEditingRoleSlug(tr.slug);
                                setEditingPerms([...tr.permissionCodes]);
                              }}
                            >
                              {tr.slug === 'store_owner' ? 'Locked' : 'Edit'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {editingRoleSlug && (
                <div className="p-4 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Editing Permissions for: <code className="font-mono">{editingRoleSlug}</code>
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveRolePermissions} isLoading={busy}>
                        Save Permissions
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingRoleSlug(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {tenantPermissionsOnly.map((perm) => {
                      const checked = editingPerms.includes(perm.code);
                      return (
                        <label
                          key={perm.code}
                          className="flex items-start gap-2 text-xs p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setEditingPerms((prev) =>
                                e.target.checked
                                  ? [...prev, perm.code]
                                  : prev.filter((c) => c !== perm.code)
                              );
                            }}
                            className="mt-0.5"
                          />
                          <div>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 block">
                              {perm.code}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{perm.name}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Create Custom Tenant Role */}
              <form onSubmit={handleCreateCustomRole} className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Create Custom Store Role
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    label="Role Name"
                    required
                    placeholder="Catalog Auditor"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                  <Input
                    label="Role Slug"
                    required
                    placeholder="catalog_auditor"
                    value={newRoleSlug}
                    onChange={(e) => setNewRoleSlug(e.target.value)}
                  />
                  <div className="flex flex-col justify-end">
                    <Button type="submit" size="md" isLoading={busy}>
                      Create Store Role
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {tenantPermissionsOnly.slice(0, 8).map((perm) => {
                    const selected = newRolePerms.includes(perm.code);
                    return (
                      <button
                        key={perm.code}
                        type="button"
                        onClick={() =>
                          setNewRolePerms((prev) =>
                            selected ? prev.filter((c) => c !== perm.code) : [...prev, perm.code]
                          )
                        }
                        className={`px-2 py-1 rounded border font-mono cursor-pointer ${
                          selected
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {perm.code}
                      </button>
                    );
                  })}
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 2: TENANT MEMBERSHIPS & STAFF INVITATION FLOW */}
      {activeTab === 'members' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Store Team Memberships
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Server-enforced membership roster for the selected store.
                </p>
              </CardHeader>
              <CardBody className="p-0">
                {memberships.length === 0 ? (
                  <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
                    No roster visible. Authenticate as a store member with <code className="font-mono">staff:read</code> permission.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {memberships.map((m) => (
                      <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {m.userFullName}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                            {m.userEmail} · Status: {m.status} · Role: {m.roleSlug}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            aria-label={`Assign role for ${m.userEmail}`}
                            value={m.roleSlug}
                            disabled={busy || m.status !== 'ACTIVE'}
                            onChange={(e) => handleChangeMemberRole(m.userId, e.target.value)}
                            className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs"
                          >
                            {tenantRoles.map((tr) => (
                              <option key={tr.slug} value={tr.slug}>
                                {tr.name}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || m.status !== 'ACTIVE' || m.roleSlug === 'store_owner'}
                            onClick={() => handleRevokeMember(m.userId)}
                            leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Sent Staff Invitations ({invitations.length})
                </h3>
              </CardHeader>
              <CardBody className="p-0">
                {invitations.length === 0 ? (
                  <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
                    No staff invitations issued for this tenant yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="p-3.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white">{inv.email}</span>
                          <span className="text-slate-500 dark:text-slate-400 block font-mono text-[11px]">
                            Role: {inv.roleSlug} · Status: {inv.status}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          Expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Right Column: Invite & Accept Staff Flow */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MailPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Invite Staff Member
                </h3>
              </CardHeader>
              <CardBody>
                <form onSubmit={handleInviteStaff} className="space-y-3">
                  <Input
                    label="Staff Email Address"
                    type="email"
                    required
                    placeholder="buyer1@nexora.shop"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Assigned Store Role
                    </label>
                    <select
                      value={inviteRoleSlug}
                      onChange={(e) => setInviteRoleSlug(e.target.value)}
                      className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                    >
                      <option value="store_admin">Store Admin (Rank 70)</option>
                      <option value="product_manager">Product Manager (Rank 50)</option>
                      <option value="order_manager">Order Manager (Rank 50)</option>
                      <option value="inventory_manager">Inventory Manager (Rank 50)</option>
                      <option value="marketing_manager">Marketing Manager (Rank 50)</option>
                      <option value="customer_support">Customer Support (Rank 40)</option>
                      <option value="store_staff">Store Staff (Rank 30)</option>
                    </select>
                  </div>
                  <Button type="submit" size="sm" isLoading={busy} className="w-full">
                    Send Invitation
                  </Button>
                </form>

                {latestInviteToken && (
                  <div className="mt-4 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-[11px] space-y-1">
                    <span className="font-semibold text-slate-700 dark:text-slate-200 block">
                      Generated Invite Token (Sandbox Preview):
                    </span>
                    <code className="font-mono break-all text-indigo-600 dark:text-indigo-400">
                      {latestInviteToken}
                    </code>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Accept Staff Invitation
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Server enforces that authenticated user email matches invitation recipient.
                </p>
              </CardHeader>
              <CardBody>
                <form onSubmit={handleAcceptInvite} className="space-y-3">
                  <Input
                    label="Invitation Token"
                    required
                    placeholder="Paste invite token"
                    value={acceptTokenInput}
                    onChange={(e) => setAcceptTokenInput(e.target.value)}
                  />
                  <Button type="submit" size="sm" variant="secondary" isLoading={busy} className="w-full">
                    Accept & Join Store
                  </Button>
                </form>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 3: PLATFORM ROLE GOVERNANCE */}
      {activeTab === 'platform' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Platform Administrative Accounts
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Requires <code className="font-mono">platform:tenants:read</code>. Tenant roles receive HTTP 403.
                </p>
              </CardHeader>
              <CardBody className="p-0">
                {platformUsers.length === 0 ? (
                  <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
                    Access restricted. Sign in as a Platform role (Super Admin, Finance Manager, or Support Agent) to inspect platform governance.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {platformUsers.map((pu) => (
                      <div key={pu.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{pu.fullName}</div>
                          <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                            {pu.email} · {pu.platformRoleName} ({pu.platformRoleSlug})
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || pu.email === meSummary?.user?.email}
                          onClick={() => handleRevokePlatformRole(pu.id)}
                        >
                          Revoke Platform Role
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Assign Platform Role
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Only Super Admin or Platform Admin (below own rank) may assign platform roles.
              </p>
            </CardHeader>
            <CardBody>
              <form onSubmit={handleAssignPlatformRole} className="space-y-3">
                <Input
                  label="Existing User Email"
                  type="email"
                  required
                  placeholder="buyer2@nexora.shop"
                  value={platformAssignEmail}
                  onChange={(e) => setPlatformAssignEmail(e.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Platform Role
                  </label>
                  <select
                    value={platformAssignRole}
                    onChange={(e) => setPlatformAssignRole(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                  >
                    <option value="super_admin">Super Admin (Rank 100)</option>
                    <option value="platform_admin">Platform Admin (Rank 90)</option>
                    <option value="finance_manager">Finance Manager (Rank 70)</option>
                    <option value="support_agent">Support Agent (Rank 60)</option>
                  </select>
                </div>
                <Button type="submit" size="sm" isLoading={busy} className="w-full">
                  Assign Platform Role
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 4: LIVE RESOURCE OWNERSHIP & IDOR / CROSS-TENANT TESTER */}
      {activeTab === 'resources' && (
        <div className="space-y-6">
          {probeResponse && (
            <div
              className={`p-4 rounded-lg border text-xs flex items-start gap-2.5 ${
                probeResponse.status < 300
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                  : 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
              }`}
            >
              {probeResponse.status < 300 ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-bold font-mono">
                  HTTP {probeResponse.status} {probeResponse.code ? `(${probeResponse.code})` : ''}
                </span>
                <p className="mt-0.5">{probeResponse.message}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tenant Products & Inventory */}
            <Card>
              <CardHeader>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Store Products & Inventory ({products.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Server checks <code className="font-mono">product:create</code>, <code className="font-mono">product:update</code>, <code className="font-mono">inventory:update</code>, and cross-tenant isolation.
                </p>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {products.map((prod) => (
                    <div key={prod.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{prod.title}</div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {prod.id} · SKU {prod.sku} · ৳{prod.priceBDT} · Stock {prod.stockQty}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            runProbeCall(
                              'Adjust Inventory',
                              'PATCH',
                              `/api/v1/rbac/tenants/${selectedTenantId}/products/${prod.id}/inventory`,
                              { stockQty: prod.stockQty + 5 }
                            )
                          }
                        >
                          +5 Stock
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            runProbeCall(
                              'Update Product',
                              'PATCH',
                              `/api/v1/rbac/tenants/${selectedTenantId}/products/${prod.id}`,
                              { priceBDT: prod.priceBDT + 100 }
                            )
                          }
                        >
                          +৳100
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="Product title"
                      value={newProdTitle}
                      onChange={(e) => setNewProdTitle(e.target.value)}
                    />
                    <Input
                      placeholder="SKU-102"
                      value={newProdSku}
                      onChange={(e) => setNewProdSku(e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="Price BDT"
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !newProdTitle || !newProdSku}
                      onClick={() =>
                        runProbeCall(
                          'Create Product',
                          'POST',
                          `/api/v1/rbac/tenants/${selectedTenantId}/products`,
                          {
                            title: newProdTitle,
                            sku: newProdSku,
                            priceBDT: Number(newProdPrice) || 1000,
                            stockQty: 20,
                            status: 'PUBLISHED',
                          }
                        )
                      }
                    >
                      Create Product
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        runProbeCall(
                          'Cross-Tenant IDOR Probe (Tenant B Product)',
                          'PATCH',
                          `/api/v1/rbac/tenants/${selectedTenantId}/products/prod_lt_201`,
                          { priceBDT: 1 }
                        )
                      }
                    >
                      Attempt Cross-Tenant Edit
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Orders & Ownership (Anti-IDOR) */}
            <Card>
              <CardHeader>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Orders & Ownership Protection ({orders.length} Visible)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Store staff see tenant orders; Customers only see their own orders (<code className="font-mono">storefront:order:read:own</code>).
                </p>
              </CardHeader>
              <CardBody className="space-y-4">
                {orders.length === 0 ? (
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    No orders visible for current actor in this tenant scope.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {orders.map((ord) => (
                      <div key={ord.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {ord.orderNumber} · {ord.status}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {ord.id} · {ord.customerEmail} · ৳{ord.totalBDT}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            runProbeCall(
                              `Cancel Order ${ord.id}`,
                              'PATCH',
                              `/api/v1/rbac/tenants/${selectedTenantId}/orders/${ord.id}/cancel`
                            )
                          }
                        >
                          Cancel Order
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Direct Order ID Probe (Test Anti-IDOR Enforcement)
                  </span>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. ord_uw_9002 (Customer B Order)"
                      value={customOrderIdProbe}
                      onChange={(e) => setCustomOrderIdProbe(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        runProbeCall(
                          `IDOR Read ${customOrderIdProbe}`,
                          'GET',
                          `/api/v1/rbac/tenants/${selectedTenantId}/orders/${customOrderIdProbe}`
                        )
                      }
                    >
                      Read Order
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        runProbeCall(
                          `IDOR Cancel ${customOrderIdProbe}`,
                          'PATCH',
                          `/api/v1/rbac/tenants/${selectedTenantId}/orders/${customOrderIdProbe}/cancel`
                        )
                      }
                    >
                      Cancel ID
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 5: ADMIN ACTIVITY LOGS & AUTOMATED RBAC TEST SUITE */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Automated Verification Suite */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Automated RBAC Security Verification Suite
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tests privilege escalation, cross-tenant boundaries, IDOR ownership, invitations, and role modifications via real HTTP calls.
                </p>
              </div>
              <Button
                size="sm"
                isLoading={runningTests}
                onClick={handleRunRbacTests}
                leftIcon={<Play className="w-3.5 h-3.5" />}
              >
                Run 10 RBAC Tests
              </Button>
            </CardHeader>
            {testReport && (
              <CardBody className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-slate-500 block">Total Scenarios</span>
                    <span className="text-lg font-bold font-mono tabular-nums">{testReport.totalTests}</span>
                  </div>
                  <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30">
                    <span className="text-emerald-700 dark:text-emerald-400 block">Passed</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {testReport.passed}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30">
                    <span className="text-rose-700 dark:text-rose-400 block">Failed</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
                      {testReport.failed}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {testReport.results.map((r) => (
                    <div key={r.id} className="p-3 flex items-start justify-between gap-3 text-xs">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {r.status === 'PASSED' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {r.id}: {r.name}{' '}
                            <span className="text-slate-400 font-normal">· {r.category}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {r.error ? r.error : r.details}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                        {r.durationMs}ms
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            )}
          </Card>

          {/* Admin Activity Audit Log */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Admin Activity & Authorization Audit Logs
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Records allowed administrative mutations alongside denied escalation, cross-tenant, and IDOR events.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Filter actor or action..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-48"
                />
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(['ALL', 'ALLOWED', 'DENIED'] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setLogOutcomeFilter(o)}
                      className={`px-2 py-1 text-xs font-medium rounded cursor-pointer whitespace-nowrap shrink-0 ${
                        logOutcomeFilter === o
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                          : 'text-slate-500'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {filteredLogs.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
                  No activity logs visible for the current role/filter. Sign in as a Store Owner or Platform role with audit read permission.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                        <th className="py-2.5 px-3 font-semibold">Outcome</th>
                        <th className="py-2.5 px-3 font-semibold">Action</th>
                        <th className="py-2.5 px-3 font-semibold">Actor</th>
                        <th className="py-2.5 px-3 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 font-semibold ${
                                log.outcome === 'ALLOWED'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {log.outcome === 'ALLOWED' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5" />
                              )}
                              {log.outcome}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {log.action}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {log.actorEmail || 'system'} <span className="text-slate-400">({log.actorRole})</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                            {log.reason || `${log.resourceType} ${log.resourceId || ''}`}
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
      )}
    </div>
  );
};
