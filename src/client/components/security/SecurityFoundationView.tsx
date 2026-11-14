/**
 * NEXORA Security Foundation Explorer
 * Phase 05 - Application Security Checklist, Live Penetration Suite & Audit Stream
 */

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  Lock,
  KeyRound,
  AlertTriangle,
  Activity,
  FileCheck2,
  RefreshCw,
} from 'lucide-react';

interface SecurityChecklistItem {
  id: string;
  control: string;
  status: string;
  details: string;
}

interface SecurityEventRecord {
  id: string;
  timestamp: string;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  clientIp?: string;
  path?: string;
  message: string;
}

interface SecurityTestResult {
  id: string;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
  error?: string;
}

interface SecurityVerificationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: SecurityTestResult[];
}

interface DependencyAuditSummary {
  checkedAt: string;
  totalDependencies: number;
  totalDevDependencies: number;
  lockfilePresent: boolean;
  securityPackagesInstalled: string[];
  findings: Array<{ packageName: string; severity: string; note: string }>;
}

const REMAINING_LIMITATIONS = [
  {
    title: 'Multi-Replica Rate Limit Store',
    severity: 'MEDIUM',
    note: 'Current rate limiter uses per-process memory. Attach Redis store (rate-limit-redis) before horizontal auto-scaling.',
  },
  {
    title: 'Binary Malware / Antivirus Scanning',
    severity: 'MEDIUM',
    note: 'Magic-byte inspection blocks spoofed extensions/XSS, but deep AV scanning (ClamAV) requires async quarantine worker.',
  },
  {
    title: 'SSRF DNS Rebinding TOCTOU Window',
    severity: 'LOW',
    note: 'DNS is validated pre-fetch, but custom undici IP-pinned lookup + cloud VPC egress firewall recommended in production.',
  },
  {
    title: 'Edge WAF & Volumetric L4/L7 DDoS',
    severity: 'MEDIUM',
    note: 'Express perimeter limits protect app workers; volumetric floods require upstream Cloudflare WAF / Cloud Armor.',
  },
];

export const SecurityFoundationView: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<'checklist' | 'tests' | 'events' | 'limitations'>('checklist');
  const [checklist, setChecklist] = useState<SecurityChecklistItem[]>([]);
  const [events, setEvents] = useState<SecurityEventRecord[]>([]);
  const [depAudit, setDepAudit] = useState<DependencyAuditSummary | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [runningTests, setRunningTests] = useState(false);
  const [report, setReport] = useState<SecurityVerificationReport | null>(null);

  const fetchSecurityStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/v1/security/status');
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setChecklist(json.data.checklist || []);
          setEvents(json.data.recentSecurityEvents || []);
          setDepAudit(json.data.dependencyAudit || null);
        }
      }
    } catch {
      toastError('Security Status Notice', 'Unable to query live /api/v1/security/status endpoint.');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchSecurityStatus();
  }, []);

  const handleRunSecuritySuite = async () => {
    setRunningTests(true);
    setActiveTab('tests');
    try {
      const res = await fetch('/api/v1/security/verify', { method: 'POST' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setReport(json.data);
      // Refresh security events log captured during live attack probes
      await fetchSecurityStatus();
      if (json.data.failed === 0) {
        toastSuccess('Security Suite Passed', `All ${json.data.passed}/${json.data.totalTests} live security checks passed.`);
      } else {
        toastError('Security Check Warning', `${json.data.failed} check(s) failed.`);
      }
    } catch (err: unknown) {
      toastError('Execution Error', err instanceof Error ? err.message : 'Failed to run security suite');
    } finally {
      setRunningTests(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="success" dot>Phase 05 Hardened</Badge>
            <Badge variant="primary">OWASP ASVS Level 2</Badge>
            <Badge variant="info">Zero Stack Leakage</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            NEXORA Security Foundation
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl mt-1">
            Reusable fail-closed perimeter defense: Helmet CSP/HSTS, strict CORS allowlist, NoSQL/XSS/CSRF/SSRF guards, Argon2id, AES-256-GCM, and automatic log redaction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSecurityStatus}
            isLoading={loadingStatus}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh Posture
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunSecuritySuite}
            isLoading={runningTests}
            leftIcon={<Play className="w-4 h-4" />}
          >
            Run Security Test Suite
          </Button>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Enforced Controls</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{checklist.length || 17}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Shield className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Active perimeter & crypto guards</p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Password Hash</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">Argon2id</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <KeyRound className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">64 MiB RAM, 3 iterations, AES-GCM</p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Security Packages</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {depAudit?.securityPackagesInstalled.length ?? 6}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
                <FileCheck2 className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">helmet, cors, zod, argon2, rate-limit</p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Blocked Probes</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{events.length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Sanitized events in audit stream</p>
          </CardBody>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-800 gap-6 text-sm">
        <button
          onClick={() => setActiveTab('checklist')}
          className={`pb-3 font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'checklist'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Lock className="w-4 h-4" />
          Security Checklist ({checklist.length || 17})
        </button>

        <button
          onClick={() => setActiveTab('tests')}
          className={`pb-3 font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'tests'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Live Penetration & Unit Tests
          {report && (
            <Badge variant={report.failed === 0 ? 'success' : 'danger'}>
              {report.passed}/{report.totalTests}
            </Badge>
          )}
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`pb-3 font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'events'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Activity className="w-4 h-4" />
          Security Audit Log ({events.length})
        </button>

        <button
          onClick={() => setActiveTab('limitations')}
          className={`pb-3 font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'limitations'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Remaining Limitations ({REMAINING_LIMITATIONS.length})
        </button>
      </div>

      {/* TAB 1: CHECKLIST */}
      {activeTab === 'checklist' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Mandatory Application Security Controls
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Active across the Express ingress pipeline, cryptographic utilities, and error handlers.
            </p>
          </CardHeader>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {checklist.map((item) => (
              <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{item.id}</span>
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">{item.control}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{item.details}</p>
                  </div>
                </div>
                <Badge variant="success" dot>{item.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* TAB 2: LIVE SECURITY TEST SUITE */}
      {activeTab === 'tests' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Automated Security Penetration & Unit Suite
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tests malicious input, oversized payloads, invalid origins, security headers, rate-limit bursts, SSRF, Argon2id, log redaction, and uploads.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunSecuritySuite}
              isLoading={runningTests}
              leftIcon={<Play className="w-4 h-4" />}
            >
              Execute 11 Security Checks
            </Button>
          </CardHeader>
          <CardBody>
            {!report ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Ready to run live security probes</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                  Spins up an isolated Express instance and attacks it with NoSQL injections, XSS, oversized bodies, untrusted origins, and burst floods.
                </p>
                <Button variant="outline" size="sm" onClick={handleRunSecuritySuite} leftIcon={<Play className="w-3.5 h-3.5" />}>
                  Run Automated Tests
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`flex items-center justify-between p-4 rounded-lg border ${
                  report.failed === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                }`}>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Passed {report.passed} of {report.totalTests} Security Assertions
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Completed in {report.results.reduce((a, b) => a + b.durationMs, 0)}ms at {new Date(report.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <Badge variant={report.failed === 0 ? 'success' : 'danger'}>
                    {report.failed === 0 ? '100% Verified' : `${report.failed} Failed`}
                  </Badge>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {report.results.map((r) => (
                    <div key={r.id} className="p-3.5 flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        {r.status === 'PASSED' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] text-slate-400">{r.id}</span>
                            <span className="font-semibold text-xs text-slate-900 dark:text-white">{r.name}</span>
                            <Badge variant="neutral">{r.category}</Badge>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{r.details}</p>
                          {r.error && <p className="text-xs text-rose-600 font-mono mt-1">{r.error}</p>}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">{r.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* TAB 3: AUDIT EVENTS */}
      {activeTab === 'events' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Recent Security Audit Events (Redacted)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Captured automatically when requests violate CORS, size limits, NoSQL/XSS rules, CSRF, or rate limits.
            </p>
          </CardHeader>
          <CardBody>
            {events.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                No security violations recorded yet. Click "Run Security Test Suite" to generate and verify live defense probes.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {events.map((ev) => (
                  <div key={ev.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={ev.severity === 'HIGH' || ev.severity === 'CRITICAL' ? 'danger' : 'warning'}>
                          {ev.eventType}
                        </Badge>
                        <span className="font-medium text-slate-900 dark:text-white">{ev.message}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 font-mono">
                        {ev.path || '-'} • IP: {ev.clientIp || '-'} • {new Date(ev.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* TAB 4: REMAINING LIMITATIONS */}
      {activeTab === 'limitations' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Documented Remaining Security Limitations</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Infrastructure-layer controls scheduled for Phase 17 production cluster provisioning.
            </p>
          </CardHeader>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {REMAINING_LIMITATIONS.map((lim, idx) => (
              <div key={idx} className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm text-slate-900 dark:text-white">{lim.title}</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{lim.note}</p>
                  </div>
                </div>
                <Badge variant={lim.severity === 'MEDIUM' ? 'warning' : 'info'}>{lim.severity}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
