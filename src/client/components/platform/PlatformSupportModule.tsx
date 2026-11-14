/**
 * NEXORA Super Admin — Support Management & Controlled Logged Support Access
 *
 * Security invariant:
 *  Platform admins & support agents NEVER gain unrestricted access to tenant private data.
 *  Every tenant diagnostics lookup requires an active, ticket-bound, time-limited, justified
 *  SupportAccessGrant and emits a SUPPORT_DATA_ACCESSED audit entry.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  Eye,
  HeadphonesIcon,
  KeyRound,
  Lock,
  MessageSquare,
  Search,
  ShieldAlert,
  ShieldCheck,
  XOctagon,
} from 'lucide-react';
import type { ApiCallFn, ConfirmActionConfig, PaginationMeta } from './platformTypes.ts';

interface SupportModuleProps {
  apiCall: ApiCallFn;
  permissions: string[];
  onRequestConfirm: (cfg: ConfirmActionConfig) => void;
  onMutated: () => void;
}

export const PlatformSupportModule: React.FC<SupportModuleProps> = ({
  apiCall,
  permissions,
  onRequestConfirm,
  onMutated,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const canManageSupport = permissions.includes('platform:support:manage');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Tickets state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 8,
    total: 0,
    totalPages: 1,
  });
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState('');

  // Controlled Support Access Grants state
  const [grants, setGrants] = useState<any[]>([]);
  const [grantReason, setGrantReason] = useState(
    'Investigating checkout gateway callback discrepancy reported on active support ticket.'
  );
  const [grantDuration, setGrantDuration] = useState(15);
  const [grantScope, setGrantScope] = useState<'READ_DIAGNOSTICS' | 'ORDER_ASSIST'>(
    'ORDER_ASSIST'
  );

  // Redacted Diagnostics inspector
  const [diagnosticsOutput, setDiagnosticsOutput] = useState<any>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<{ code: string; message: string } | null>(
    null
  );

  const loadData = useCallback(async () => {
    if (!canManageSupport) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '8',
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
        ...(priorityFilter !== 'ALL' ? { priority: priorityFilter } : {}),
      });
      const [ticketsRes, grantsRes] = await Promise.all([
        apiCall(`/api/v1/platform/support/tickets?${params.toString()}`),
        apiCall('/api/v1/platform/support/access-grants'),
      ]);

      if (ticketsRes.res.ok && ticketsRes.json?.data) {
        const items = ticketsRes.json.data.items || [];
        setTickets(items);
        setPagination(ticketsRes.json.data.pagination);
        if (items.length > 0) {
          setSelectedTicket((prev: any) => {
            if (!prev) return items[0];
            return items.find((t: any) => t.id === prev.id) || items[0];
          });
        }
      }
      if (grantsRes.res.ok && grantsRes.json?.data) {
        setGrants(grantsRes.json.data.grants || []);
      }
    } finally {
      setLoading(false);
    }
  }, [apiCall, canManageSupport, page, search, statusFilter, priorityFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, priorityFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateTicket = async (
    ticketId: string,
    payload: { status?: string; priority?: string; replyBody?: string }
  ) => {
    setBusy(true);
    try {
      const { res, json } = await apiCall(`/api/v1/platform/support/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toastError('Ticket Update Failed', json?.error?.message || 'Unable to update ticket.');
        return;
      }
      setSelectedTicket(json.data.ticket);
      if (payload.replyBody) setReplyText('');
      toastSuccess('Ticket Updated', `${json.data.ticket.ticketNumber} saved.`);
      await loadData();
      onMutated();
    } finally {
      setBusy(false);
    }
  };

  const handleRequestSupportAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    setBusy(true);
    try {
      const { res, json } = await apiCall('/api/v1/platform/support/access-grants', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: selectedTicket.tenantId,
          ticketId: selectedTicket.id,
          reason: grantReason.trim(),
          durationMinutes: Number(grantDuration),
          accessScope: grantScope,
        }),
      });
      if (!res.ok) {
        toastError(
          'Grant Request Rejected',
          json?.error?.message || 'Unable to issue support access grant.'
        );
        return;
      }
      setDiagnosticsError(null);
      toastSuccess(
        'Controlled Support Access Granted',
        `Issued ${grantDuration}m ${grantScope} session tied to ${selectedTicket.ticketNumber}.`
      );
      await loadData();
      onMutated();
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeGrant = (grant: any) => {
    onRequestConfirm({
      title: `Revoke Support Access (${grant.grantId})`,
      description: `Immediately terminates ${grant.actorEmail}'s scoped access to ${grant.tenantName} and logs SUPPORT_ACCESS_REVOKED.`,
      confirmLabel: 'Revoke Grant',
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          const { res, json } = await apiCall(
            `/api/v1/platform/support/access-grants/${grant.grantId}/revoke`,
            { method: 'POST' }
          );
          if (!res.ok) {
            toastError('Revocation Failed', json?.error?.message || 'Unable to revoke grant.');
            return;
          }
          toastSuccess('Support Grant Revoked', `Session ${grant.grantId} terminated.`);
          await loadData();
          onMutated();
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleInspectDiagnostics = async (tenantId: string, tenantName: string) => {
    setBusy(true);
    try {
      const { res, json } = await apiCall(
        `/api/v1/platform/support/tenants/${tenantId}/diagnostics`
      );
      if (!res.ok) {
        const errCode = json?.error?.code || 'FORBIDDEN';
        const errMsg =
          json?.error?.message ||
          'Unrestricted access to tenant private data is blocked without an active Support Access Grant.';
        setDiagnosticsOutput(null);
        setDiagnosticsError({ code: errCode, message: errMsg });
        toastError(`Access Blocked (${res.status})`, errMsg);
        onMutated();
        return;
      }
      setDiagnosticsError(null);
      setDiagnosticsOutput(json.data);
      toastSuccess(
        'Audited Diagnostics Loaded',
        `Logged SUPPORT_DATA_ACCESSED for ${tenantName} (PII & secrets redacted).`
      );
      await loadData();
      onMutated();
    } finally {
      setBusy(false);
    }
  };

  if (!canManageSupport) {
    return (
      <Card>
        <CardBody>
          <div className="py-10 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Support Management Restricted
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Your active platform role does not grant <span className="font-mono">platform:support:manage</span>.
              Switch to Super Admin or Support Agent to manage merchant tickets and controlled access sessions.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tickets List + Thread Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Support Tickets Queue */}
        <div className="lg:col-span-7">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Merchant Support Queue
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Filter escalations, update status, and bind controlled support grants to verified tickets
                </p>
              </div>
              <HeadphonesIcon className="w-4 h-4 text-indigo-500 shrink-0" />
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      placeholder="Search ticket #, subject, tenant..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      leftIcon={<Search className="w-3.5 h-3.5" />}
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="WAITING_MERCHANT">WAITING_MERCHANT</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
                  >
                    <option value="ALL">All Priorities</option>
                    <option value="URGENT">URGENT</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {loading ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Loading support tickets...
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      No tickets match your filter criteria.
                    </div>
                  ) : (
                    tickets.map((tk) => {
                      const isSelected = selectedTicket?.id === tk.id;
                      return (
                        <button
                          key={tk.id}
                          type="button"
                          onClick={() => {
                            setSelectedTicket(tk);
                            setDiagnosticsOutput(null);
                            setDiagnosticsError(null);
                          }}
                          className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                              {tk.ticketNumber}
                            </span>
                            <div className="flex items-center gap-3 font-mono text-[11px]">
                              <span
                                className={
                                  tk.priority === 'URGENT' || tk.priority === 'HIGH'
                                    ? 'font-bold text-rose-600 dark:text-rose-400'
                                    : 'text-slate-500'
                                }
                              >
                                {tk.priority}
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {tk.status}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white mt-1 truncate">
                            {tk.subject}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                            <span>
                              {tk.tenantName} · {tk.requesterEmail}
                            </span>
                            <span className="font-mono">{tk.category}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  totalRecords={pagination.total}
                  onPageChange={setPage}
                />
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Right: Selected Ticket Conversation + Status Controls */}
        <div className="lg:col-span-5">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {selectedTicket
                    ? `${selectedTicket.ticketNumber} · ${selectedTicket.tenantName}`
                    : 'Ticket Details'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {selectedTicket ? selectedTicket.subject : 'Select a ticket from the queue'}
                </p>
              </div>
              <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
            </CardHeader>
            <CardBody>
              {!selectedTicket ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Select a ticket to inspect messages and request controlled support access.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Ticket Status
                      </label>
                      <select
                        value={selectedTicket.status}
                        disabled={busy}
                        onChange={(e) =>
                          handleUpdateTicket(selectedTicket.id, { status: e.target.value })
                        }
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="WAITING_MERCHANT">WAITING_MERCHANT</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Priority
                      </label>
                      <select
                        value={selectedTicket.priority}
                        disabled={busy}
                        onChange={(e) =>
                          handleUpdateTicket(selectedTicket.id, { priority: e.target.value })
                        }
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="URGENT">URGENT</option>
                      </select>
                    </div>
                  </div>

                  {/* Conversation Log */}
                  <div className="max-h-56 overflow-y-auto space-y-2.5 border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50/70 dark:bg-slate-900/50">
                    {(selectedTicket.messages || []).map((m: any, idx: number) => (
                      <div
                        key={idx}
                        className="pb-2.5 border-b border-slate-200 dark:border-slate-800 last:border-b-0 last:pb-0 text-xs"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {m.authorEmail} ({m.authorRole})
                          </span>
                          <span>{new Date(m.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 mt-1">{m.body}</p>
                      </div>
                    ))}
                  </div>

                  {/* Reply Form */}
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write a logged support response to the merchant..."
                      className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={busy || replyText.trim().length < 2}
                        onClick={() =>
                          handleUpdateTicket(selectedTicket.id, { replyBody: replyText.trim() })
                        }
                      >
                        Send Support Reply
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Controlled, Time-Bounded, Audited Support Access Console */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Controlled &amp; Audited Tenant Support Access
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Platform admins cannot browse tenant private records unrestrictedly. Every diagnostic read requires an active, ticket-bound Support Access Grant.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
            <Lock className="w-4 h-4" />
            <span>Zero-Standing-Privilege Guard</span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-6">
            {selectedTicket && (
              <form
                onSubmit={handleRequestSupportAccess}
                className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-indigo-500" />
                    <span>
                      Grant Scoped Session for {selectedTicket.tenantName} ({selectedTicket.ticketNumber})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        handleInspectDiagnostics(selectedTicket.tenantId, selectedTicket.tenantName)
                      }
                      leftIcon={<Eye className="w-3.5 h-3.5" />}
                    >
                      Read Scoped Diagnostics
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6">
                    <Input
                      label="Audited Justification (min 10 chars)"
                      value={grantReason}
                      onChange={(e) => setGrantReason(e.target.value)}
                      required
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Access Scope
                    </label>
                    <select
                      value={grantScope}
                      onChange={(e) => setGrantScope(e.target.value as any)}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200"
                    >
                      <option value="READ_DIAGNOSTICS">READ_DIAGNOSTICS</option>
                      <option value="ORDER_ASSIST">ORDER_ASSIST (Redacted)</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      TTL Duration
                    </label>
                    <select
                      value={grantDuration}
                      onChange={(e) => setGrantDuration(Number(e.target.value))}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200"
                    >
                      <option value={5}>5 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>60 minutes (Max)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={busy || grantReason.trim().length < 10}>
                    Start Ticket-Bound Support Grant
                  </Button>
                </div>
              </form>
            )}

            {/* Diagnostics Output or Blocked 403 Result */}
            {diagnosticsError && (
              <div className="p-4 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-xs space-y-1">
                <div className="font-mono font-bold text-rose-700 dark:text-rose-400">
                  403 {diagnosticsError.code} — Guard Enforced
                </div>
                <p className="text-rose-700 dark:text-rose-300">{diagnosticsError.message}</p>
              </div>
            )}

            {diagnosticsOutput && (
              <div className="p-4 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      Redacted Tenant Diagnostics · Grant {diagnosticsOutput.grant?.grantId} (
                      {diagnosticsOutput.diagnostics?.accessScope})
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">
                    PII & Payment Secrets Redacted: {String(diagnosticsOutput.diagnostics?.piiAndSecretsRedacted)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Store Slug</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {diagnosticsOutput.diagnostics?.storeSlug}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Store Status</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {diagnosticsOutput.diagnostics?.storeStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Catalog / Orders</span>
                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                      {diagnosticsOutput.diagnostics?.catalogCount} /{' '}
                      {diagnosticsOutput.diagnostics?.ordersCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Timezone</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {diagnosticsOutput.diagnostics?.timezone}
                    </span>
                  </div>
                </div>
                {Array.isArray(diagnosticsOutput.diagnostics?.redactedOrders) &&
                  diagnosticsOutput.diagnostics.redactedOrders.length > 0 && (
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-900">
                      <table className="w-full text-left text-[11px] font-mono">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="py-2 px-3">Order #</th>
                            <th className="py-2 px-3">Customer (Masked)</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3 text-right">Total (BDT)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {diagnosticsOutput.diagnostics.redactedOrders.map((o: any, idx: number) => (
                            <tr key={idx}>
                              <td className="py-2 px-3 font-semibold">{o.orderNumber}</td>
                              <td className="py-2 px-3 text-slate-500">{o.customerMasked}</td>
                              <td className="py-2 px-3">{o.status}</td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                ৳ {Number(o.totalBDT).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            )}

            {/* Active & Historical Support Access Grants Table */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Grant / Ticket</th>
                    <th className="py-2.5 px-3 font-semibold">Tenant & Scope</th>
                    <th className="py-2.5 px-3 font-semibold">Agent</th>
                    <th className="py-2.5 px-3 font-semibold">Status & Reads</th>
                    <th className="py-2.5 px-3 font-semibold">Expires At</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {grants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        No support access grants issued yet. Create one above tied to an open ticket.
                      </td>
                    </tr>
                  ) : (
                    grants.map((g) => (
                      <tr key={g.grantId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-mono">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {g.grantId}
                          </div>
                          <div className="text-[11px] text-indigo-600 dark:text-indigo-400">
                            {g.ticketNumber}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {g.tenantName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">{g.accessScope}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          <div className="text-slate-900 dark:text-white">{g.actorEmail}</div>
                          <div className="text-slate-500">{g.actorRole}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <div
                            className={
                              g.status === 'ACTIVE'
                                ? 'font-bold text-emerald-600 dark:text-emerald-400'
                                : g.status === 'REVOKED'
                                  ? 'font-bold text-rose-600 dark:text-rose-400'
                                  : 'text-slate-500'
                            }
                          >
                            {g.status}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {g.accessCount} reads
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 tabular-nums">
                          {new Date(g.expiresAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => handleInspectDiagnostics(g.tenantId, g.tenantName)}
                            >
                              Inspect
                            </Button>
                            {g.status === 'ACTIVE' && (
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busy}
                                onClick={() => handleRevokeGrant(g)}
                                leftIcon={<XOctagon className="w-3.5 h-3.5" />}
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
