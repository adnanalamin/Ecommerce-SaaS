/**
 * NEXORA Authentication & Identity Console (Phase 06)
 * Cookie-authenticated SPA integration (HttpOnly cookies + X-CSRF-Token, zero localStorage tokens).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Badge } from '../ui/Badge.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  KeyRound,
  Lock,
  LogOut,
  MailCheck,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
} from 'lucide-react';

interface PublicUser {
  id?: string;
  userId?: string;
  email: string;
  fullName: string;
  userType: string;
  isMfaEnabled: boolean;
}

interface ActiveSessionItem {
  sessionId: string;
  deviceLabel: string;
  ipAddress: string;
  lastActivityAt: string;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

interface LoginHistoryItem {
  id: string;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED' | 'MFA_CHALLENGE' | 'SUSPICIOUS_FLAGGED';
  failureReason?: string;
  ipAddress: string;
  deviceLabel: string;
  suspiciousSignals: string[];
  createdAt: string;
}

interface AuthTestResult {
  id: string;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  details: string;
  error?: string;
}

interface AuthVerificationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: AuthTestResult[];
}

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

export const AuthWorkbenchView: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();

  // In-memory CSRF token cache (never stored in localStorage)
  const csrfTokenRef = useRef<string | null>(null);

  const [section, setSection] = useState<'portal' | 'tests'>('portal');
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'verify' | 'reset'>('login');

  // Authenticated state (hydrated strictly from HttpOnly session cookie via /me)
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ActiveSessionItem[]>([]);
  const [history, setHistory] = useState<LoginHistoryItem[]>([]);
  const [suspiciousBanner, setSuspiciousBanner] = useState<string[]>([]);

  // Login & MFA Challenge
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaLoginCode, setMfaLoginCode] = useState('');

  // Registration & Verification
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regType, setRegType] = useState<'MERCHANT' | 'CUSTOMER'>('MERCHANT');
  const [verifyToken, setVerifyToken] = useState('');

  // Forgot & Reset Password
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');

  // Authenticated Security Controls
  const [curPassChange, setCurPassChange] = useState('');
  const [newPassChange, setNewPassChange] = useState('');
  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [mfaConfirmCode, setMfaConfirmCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableMfaPass, setDisableMfaPass] = useState('');
  const [disableMfaCode, setDisableMfaCode] = useState('');

  const [busy, setBusy] = useState(false);
  const [testReport, setTestReport] = useState<AuthVerificationReport | null>(null);
  const [runningTests, setRunningTests] = useState(false);

  const ensureCsrfToken = async (): Promise<string> => {
    const cookieToken = readCookieValue('nexora_csrf');
    if (cookieToken) {
      csrfTokenRef.current = cookieToken;
      return cookieToken;
    }
    if (csrfTokenRef.current) return csrfTokenRef.current;

    const res = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const json = await res.json();
    const token = json?.data?.csrfToken || '';
    csrfTokenRef.current = token;
    return token;
  };

  const apiFetch = async (path: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...((init.headers as Record<string, string>) || {}),
    };

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = await ensureCsrfToken();
      if (csrf) {
        headers['X-CSRF-Token'] = csrf;
      }
    }

    const res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers,
    });
    const json = await res.json().catch(() => ({}));
    if (json?.data?.csrfToken) {
      csrfTokenRef.current = json.data.csrfToken;
    }
    return { res, json };
  };

  const loadAccountSecurity = async () => {
    const [sessRes, histRes] = await Promise.all([
      apiFetch('/api/v1/auth/sessions'),
      apiFetch('/api/v1/auth/login-history'),
    ]);
    if (sessRes.res.ok) setSessions(sessRes.json?.data?.sessions || []);
    if (histRes.res.ok) setHistory(histRes.json?.data?.history || []);
  };

  const checkCurrentSession = async () => {
    setCheckingSession(true);
    try {
      await ensureCsrfToken();
      const { res, json } = await apiFetch('/api/v1/auth/me');
      if (res.ok && json?.data?.user) {
        setCurrentUser(json.data.user);
        setCurrentSessionId(json.data.sessionId);
        await loadAccountSecurity();
      } else {
        setCurrentUser(null);
        setCurrentSessionId(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setCheckingSession(false);
    }
  };

  useEffect(() => {
    checkCurrentSession();
  }, []);

  // ---------- HANDLERS ----------
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: regName,
          email: regEmail,
          password: regPassword,
          accountType: regType,
        }),
      });
      if (!res.ok) {
        toastError('Registration Rejected', json?.error?.message || 'Validation failed.');
        return;
      }
      const preview = json?.data?.verificationTokenPreview;
      if (preview) setVerifyToken(preview);
      setLoginEmail(regEmail);
      setAuthTab('verify');
      toastSuccess('Account Created', 'Verification token generated. Verify email before signing in.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken.trim() }),
      });
      if (!res.ok) {
        toastError('Verification Failed', json?.error?.message || 'Invalid or expired token.');
        return;
      }
      setAuthTab('login');
      toastSuccess('Email Verified', 'Your account is now ACTIVE. You can sign in.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (!res.ok) {
        toastError('Sign-In Failed', json?.error?.message || 'Authentication failed.');
        return;
      }
      if (json?.data?.mfaRequired) {
        setMfaTicket(json.data.mfaTicket);
        toastSuccess('MFA Required', 'Enter your 6-digit authenticator TOTP or single-use backup code.');
        return;
      }
      setCurrentUser(json.data.user);
      setCurrentSessionId(json.data.sessionId);
      setSuspiciousBanner(json.data.suspiciousSignals || []);
      setLoginPassword('');
      await loadAccountSecurity();
      toastSuccess('Signed In', 'HttpOnly signed session cookies established.');
    } finally {
      setBusy(false);
    }
  };

  const handleMfaLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaTicket) return;
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/mfa/verify-login', {
        method: 'POST',
        body: JSON.stringify({ mfaTicket, code: mfaLoginCode.trim() }),
      });
      if (!res.ok) {
        toastError('MFA Failed', json?.error?.message || 'Invalid verification code.');
        return;
      }
      setMfaTicket(null);
      setMfaLoginCode('');
      setLoginPassword('');
      setCurrentUser(json.data.user);
      setCurrentSessionId(json.data.sessionId);
      setSuspiciousBanner(json.data.suspiciousSignals || []);
      await loadAccountSecurity();
      toastSuccess('MFA Verified', 'Authenticated session established.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshSession = async () => {
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/refresh', { method: 'POST' });
      if (!res.ok) {
        toastError('Refresh Rejected', json?.error?.message || 'Please sign in again.');
        setCurrentUser(null);
        return;
      }
      setCurrentSessionId(json.data.sessionId);
      await loadAccountSecurity();
      toastSuccess('Token Rotated', 'Refresh & access cookies rotated atomically.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async (allDevices = false) => {
    setBusy(true);
    try {
      const endpoint = allDevices ? '/api/v1/auth/logout-all' : '/api/v1/auth/logout';
      await apiFetch(endpoint, { method: 'POST' });
      setCurrentUser(null);
      setCurrentSessionId(null);
      setSessions([]);
      setHistory([]);
      setMfaSetupData(null);
      setBackupCodes([]);
      toastSuccess('Signed Out', allDevices ? 'All device sessions revoked.' : 'Current session revoked.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (res.ok) {
        if (json?.data?.resetTokenPreview) {
          setResetToken(json.data.resetTokenPreview);
        }
        toastSuccess('Reset Requested', 'If that account exists, a 15-minute reset token was issued.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken.trim(), newPassword: resetNewPass }),
      });
      if (!res.ok) {
        toastError('Reset Failed', json?.error?.message || 'Invalid or expired reset token.');
        return;
      }
      setResetToken('');
      setResetNewPass('');
      setAuthTab('login');
      toastSuccess('Password Reset', 'Password updated and all prior sessions revoked.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: curPassChange, newPassword: newPassChange }),
      });
      if (!res.ok) {
        toastError('Password Change Rejected', json?.error?.message || 'Check current password.');
        return;
      }
      setCurPassChange('');
      setNewPassChange('');
      await loadAccountSecurity();
      toastSuccess('Password Changed', `Password updated. Sibling sessions revoked: ${json?.data?.revokedOtherSessions ?? 0}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleStartMfaSetup = async () => {
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/mfa/setup', { method: 'POST' });
      if (!res.ok) {
        toastError('MFA Setup Failed', json?.error?.message || 'Unable to start MFA setup.');
        return;
      }
      setMfaSetupData(json.data);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/mfa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: mfaConfirmCode.trim() }),
      });
      if (!res.ok) {
        toastError('MFA Verification Failed', json?.error?.message || 'Invalid 6-digit code.');
        return;
      }
      setBackupCodes(json.data.backupCodes || []);
      setMfaSetupData(null);
      setMfaConfirmCode('');
      if (currentUser) setCurrentUser({ ...currentUser, isMfaEnabled: true });
      toastSuccess('MFA Enabled', 'TOTP is now active. Save your 8 single-use backup codes!');
    } finally {
      setBusy(false);
    }
  };

  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: disableMfaPass, code: disableMfaCode.trim() }),
      });
      if (!res.ok) {
        toastError('Disable MFA Failed', json?.error?.message || 'Verify password and 6-digit TOTP.');
        return;
      }
      setDisableMfaPass('');
      setDisableMfaCode('');
      setBackupCodes([]);
      if (currentUser) setCurrentUser({ ...currentUser, isMfaEnabled: false });
      toastSuccess('MFA Disabled', 'Two-factor authentication turned off.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setBusy(true);
    try {
      const { res, json } = await apiFetch(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toastError('Revoke Failed', json?.error?.message || 'Could not revoke session.');
        return;
      }
      if (sessionId === currentSessionId) {
        setCurrentUser(null);
        setCurrentSessionId(null);
      } else {
        await loadAccountSecurity();
      }
      toastSuccess('Device Revoked', 'Target session terminated immediately.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunAuthTests = async () => {
    setRunningTests(true);
    try {
      const { res, json } = await apiFetch('/api/v1/auth/verify', { method: 'POST' });
      if (res.ok && json?.data) {
        setTestReport(json.data);
        if (json.data.failed === 0) {
          toastSuccess('All Auth Tests Passed', `${json.data.passed}/${json.data.totalTests} authentication assertions verified.`);
        } else {
          toastError('Auth Suite Alert', `${json.data.failed} assertion(s) failed.`);
        }
      } else {
        toastError('Suite Error', json?.error?.message || 'Failed to execute verification suite.');
      }
    } finally {
      setRunningTests(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              NEXORA Authentication & Session Engine
            </h2>
            <Badge variant="success" dot>Argon2id + Rotating Cookies</Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Phase 06 — HttpOnly SameSite=Lax cookies, CSRF double-submit protection, TOTP MFA, lockout, and remote device management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={section === 'portal' ? 'primary' : 'outline'}
            onClick={() => setSection('portal')}
            leftIcon={<KeyRound className="w-3.5 h-3.5" />}
          >
            Auth Console
          </Button>
          <Button
            size="sm"
            variant={section === 'tests' ? 'primary' : 'outline'}
            onClick={() => setSection('tests')}
            leftIcon={<Play className="w-3.5 h-3.5" />}
          >
            Automated Tests
          </Button>
        </div>
      </div>

      {/* SECTION 1: AUTOMATED VERIFICATION SUITE */}
      {section === 'tests' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Live End-to-End Authentication Verification Suite
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Verifies invalid credentials, lockout, CSRF, refresh rotation & replay revocation, session expiry, password reset, MFA/TOTP, and device audit.
                </p>
              </div>
              <Button
                size="sm"
                isLoading={runningTests}
                onClick={handleRunAuthTests}
                leftIcon={<Play className="w-3.5 h-3.5" />}
              >
                Run 11 Auth Tests
              </Button>
            </CardHeader>

            <CardBody>
              {!testReport && !runningTests && (
                <div className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  Click <strong className="text-slate-800 dark:text-slate-200">Run 11 Auth Tests</strong> to execute real HTTP authentication assertions against the Express backend.
                </div>
              )}

              {testReport && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 block">Total Scenarios</span>
                      <span className="text-lg font-bold font-mono">{testReport.totalTests}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block">Passed</span>
                      <span className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">{testReport.passed}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                      <span className="text-[11px] text-rose-700 dark:text-rose-400 block">Failed</span>
                      <span className="text-lg font-bold font-mono text-rose-700 dark:text-rose-400">{testReport.failed}</span>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {testReport.results.map((r) => (
                      <div key={r.id} className="p-3.5 flex items-start justify-between gap-3 bg-white dark:bg-slate-900">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {r.status === 'PASSED' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {r.id}: {r.name}
                              </span>
                              <Badge variant="neutral">{r.category}</Badge>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                              {r.error ? r.error : r.details}
                            </p>
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
        </div>
      )}

      {/* SECTION 2: AUTH PORTAL & ACCOUNT CONSOLE */}
      {section === 'portal' && (
        <>
          {checkingSession ? (
            <Card>
              <CardBody className="py-10 text-center text-xs text-slate-500">
                Verifying signed HttpOnly session cookie with server...
              </CardBody>
            </Card>
          ) : !currentUser ? (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'login', label: 'Sign In', icon: <Lock className="w-3.5 h-3.5" /> },
                        { id: 'register', label: 'Register', icon: <UserPlus className="w-3.5 h-3.5" /> },
                        { id: 'verify', label: 'Verify Email', icon: <MailCheck className="w-3.5 h-3.5" /> },
                        { id: 'reset', label: 'Password Reset', icon: <KeyRound className="w-3.5 h-3.5" /> },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setAuthTab(tab.id as typeof authTab);
                            setMfaTicket(null);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                            authTab === tab.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          {tab.icon}
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </CardHeader>

                  <CardBody>
                    {authTab === 'login' && !mfaTicket && (
                      <form onSubmit={handleLogin} className="space-y-4">
                        <Input
                          label="Work Email"
                          type="email"
                          required
                          placeholder="owner@urbanwear.nexora.shop"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                        />
                        <Input
                          label="Password"
                          type="password"
                          required
                          placeholder="Minimum 10 characters"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                        />
                        <div className="flex items-center justify-between pt-1">
                          <Button type="submit" isLoading={busy} leftIcon={<Lock className="w-3.5 h-3.5" />}>
                            Sign In Securely
                          </Button>
                          <button
                            type="button"
                            onClick={() => setAuthTab('reset')}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            Forgot password?
                          </button>
                        </div>
                      </form>
                    )}

                    {authTab === 'login' && mfaTicket && (
                      <form onSubmit={handleMfaLogin} className="space-y-4">
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
                          Two-Factor Authentication is enabled. Enter your 6-digit TOTP authenticator code or an 8-character backup code (<code className="font-mono">XXXX-XXXX</code>).
                        </div>
                        <Input
                          label="6-Digit TOTP or Backup Code"
                          required
                          placeholder="123456 or ABCD-EFGH"
                          value={mfaLoginCode}
                          onChange={(e) => setMfaLoginCode(e.target.value)}
                        />
                        <div className="flex items-center gap-2">
                          <Button type="submit" isLoading={busy}>Verify & Sign In</Button>
                          <Button variant="ghost" onClick={() => setMfaTicket(null)}>Cancel</Button>
                        </div>
                      </form>
                    )}

                    {authTab === 'register' && (
                      <form onSubmit={handleRegister} className="space-y-4">
                        <Input
                          label="Full Name"
                          required
                          placeholder="Al-Amin Adnan"
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                        />
                        <Input
                          label="Email Address"
                          type="email"
                          required
                          placeholder="merchant@nexora.shop"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                        />
                        <Input
                          label="Password"
                          type="password"
                          required
                          helperText="At least 10 chars with uppercase, lowercase, number, and symbol."
                          placeholder="StrongPass!2026"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                        />
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Account Type:</span>
                          {(['MERCHANT', 'CUSTOMER'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setRegType(t)}
                              className={`px-2.5 py-1 rounded border cursor-pointer ${
                                regType === t
                                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-500'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <Button type="submit" isLoading={busy} leftIcon={<UserPlus className="w-3.5 h-3.5" />}>
                          Create Account
                        </Button>
                      </form>
                    )}

                    {authTab === 'verify' && (
                      <form onSubmit={handleVerifyEmail} className="space-y-4">
                        <Input
                          label="Email Verification Token"
                          required
                          placeholder="Paste 64-char verification token"
                          value={verifyToken}
                          onChange={(e) => setVerifyToken(e.target.value)}
                        />
                        <Button type="submit" isLoading={busy} leftIcon={<MailCheck className="w-3.5 h-3.5" />}>
                          Verify Email Address
                        </Button>
                      </form>
                    )}

                    {authTab === 'reset' && (
                      <div className="space-y-6">
                        <form onSubmit={handleForgotPassword} className="space-y-3 pb-5 border-b border-slate-200 dark:border-slate-800">
                          <h4 className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">Step 1: Request Reset Token</h4>
                          <Input
                            label="Account Email"
                            type="email"
                            required
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                          />
                          <Button type="submit" size="sm" variant="secondary" isLoading={busy}>
                            Send Reset Token
                          </Button>
                        </form>

                        <form onSubmit={handleResetPassword} className="space-y-3">
                          <h4 className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">Step 2: Apply New Password</h4>
                          <Input
                            label="Reset Token"
                            required
                            value={resetToken}
                            onChange={(e) => setResetToken(e.target.value)}
                          />
                          <Input
                            label="New Password"
                            type="password"
                            required
                            value={resetNewPass}
                            onChange={(e) => setResetNewPass(e.target.value)}
                          />
                          <Button type="submit" isLoading={busy}>Reset Password & Revoke Old Sessions</Button>
                        </form>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Zero-LocalStorage Architecture
                    </h3>
                  </CardHeader>
                  <CardBody className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                    <p>
                      Access JWTs (<code className="font-mono text-indigo-500">15m</code>) and rotating refresh credentials (<code className="font-mono text-indigo-500">7d</code>) stay strictly inside signed <code className="font-mono">HttpOnly</code> + <code className="font-mono">SameSite=Lax</code> cookies.
                    </p>
                    <p>
                      Every mutating request enforces HMAC-signed double-submit CSRF headers (<code className="font-mono">X-CSRF-Token</code>) and checks live server-side revocation in <code className="font-mono">auth_sessions</code>.
                    </p>
                    <p>
                      5 consecutive wrong passwords lock the account for 15 minutes (<code className="font-mono">423 ACCOUNT_LOCKED</code>).
                    </p>
                  </CardBody>
                </Card>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {suspiciousBanner.length > 0 && (
                <div className="p-4 rounded-xl border border-amber-400 dark:border-amber-700 bg-amber-500/10 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <strong className="text-amber-900 dark:text-amber-200 block">
                      Suspicious Login Activity Detected
                    </strong>
                    <span className="text-amber-800 dark:text-amber-300">
                      Signals triggered on sign-in: {suspiciousBanner.join(', ')}. Review active devices below.
                    </span>
                  </div>
                </div>
              )}

              {/* Active Identity Summary */}
              <Card>
                <CardBody className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{currentUser.fullName}</span>
                        <Badge variant="info">{currentUser.userType}</Badge>
                        <Badge variant={currentUser.isMfaEnabled ? 'success' : 'warning'}>
                          {currentUser.isMfaEnabled ? 'MFA Active' : 'MFA Optional (Off)'}
                        </Badge>
                      </div>
                      <span className="text-xs text-slate-500 font-mono block">{currentUser.email} • Session {currentSessionId?.slice(0, 14)}...</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" isLoading={busy} onClick={handleRefreshSession} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
                      Rotate Refresh Token
                    </Button>
                    <Button size="sm" variant="secondary" isLoading={busy} onClick={() => handleLogout(false)} leftIcon={<LogOut className="w-3.5 h-3.5" />}>
                      Sign Out
                    </Button>
                    <Button size="sm" variant="danger" isLoading={busy} onClick={() => handleLogout(true)}>
                      Sign Out All Devices
                    </Button>
                  </div>
                </CardBody>
              </Card>

              {/* MFA + Password Change */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* MFA Card */}
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-indigo-500" />
                      Two-Factor Authentication (TOTP & Backup Codes)
                    </h3>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    {!currentUser.isMfaEnabled && !mfaSetupData && (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Protect your merchant dashboard with RFC 6238 TOTP authenticator codes and 8 single-use recovery codes.
                        </p>
                        <Button size="sm" isLoading={busy} onClick={handleStartMfaSetup}>
                          Setup TOTP Authenticator
                        </Button>
                      </div>
                    )}

                    {mfaSetupData && (
                      <form onSubmit={handleConfirmMfa} className="space-y-3">
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                          <span className="text-slate-500 block">Manual Base32 Secret Key:</span>
                          <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400 break-all">{mfaSetupData.secret}</code>
                          <span className="text-[11px] text-slate-400 block break-all">{mfaSetupData.otpauthUri}</span>
                        </div>
                        <Input
                          label="Enter 6-Digit Code from Authenticator"
                          required
                          placeholder="000000"
                          value={mfaConfirmCode}
                          onChange={(e) => setMfaConfirmCode(e.target.value)}
                        />
                        <Button type="submit" size="sm" isLoading={busy}>Confirm & Enable MFA</Button>
                      </form>
                    )}

                    {backupCodes.length > 0 && (
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                          Single-Use Backup Codes (Displayed Once)
                        </span>
                        <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                          {backupCodes.map((c) => (
                            <div key={c} className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-emerald-500/20 text-center">
                              {c}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentUser.isMfaEnabled && (
                      <form onSubmit={handleDisableMfa} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Disable 2FA</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            placeholder="Current password"
                            type="password"
                            required
                            value={disableMfaPass}
                            onChange={(e) => setDisableMfaPass(e.target.value)}
                          />
                          <Input
                            placeholder="6-digit TOTP"
                            required
                            value={disableMfaCode}
                            onChange={(e) => setDisableMfaCode(e.target.value)}
                          />
                        </div>
                        <Button type="submit" size="sm" variant="danger" isLoading={busy}>Disable MFA</Button>
                      </form>
                    )}
                  </CardBody>
                </Card>

                {/* Change Password Card */}
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Lock className="w-4 h-4 text-indigo-500" />
                      Secure Password Change
                    </h3>
                  </CardHeader>
                  <CardBody>
                    <form onSubmit={handleChangePassword} className="space-y-3">
                      <Input
                        label="Current Password"
                        type="password"
                        required
                        value={curPassChange}
                        onChange={(e) => setCurPassChange(e.target.value)}
                      />
                      <Input
                        label="New Password"
                        type="password"
                        required
                        helperText="Automatically revokes all other active device sessions."
                        value={newPassChange}
                        onChange={(e) => setNewPassChange(e.target.value)}
                      />
                      <Button type="submit" size="sm" isLoading={busy}>Update Password</Button>
                    </form>
                  </CardBody>
                </Card>
              </div>

              {/* Active Devices / Sessions */}
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Active Device Sessions ({sessions.length})
                  </h3>
                  <Button size="sm" variant="ghost" onClick={loadAccountSecurity} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
                    Refresh
                  </Button>
                </CardHeader>
                <CardBody className="p-0">
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {sessions.map((s) => (
                      <div key={s.sessionId} className="p-4 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">{s.deviceLabel}</span>
                            {s.isCurrent && <Badge variant="success">This Device</Badge>}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            IP {s.ipAddress} • Last active {new Date(s.lastActivityAt).toLocaleString()}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRevokeSession(s.sessionId)}
                          leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-500" />}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              {/* Login History */}
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-500" />
                    Authentication & Suspicious Login Audit History
                  </h3>
                </CardHeader>
                <CardBody className="p-0">
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {history.map((h) => (
                      <div key={h.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={
                                h.status === 'SUCCESS'
                                  ? 'success'
                                  : h.status === 'SUSPICIOUS_FLAGGED'
                                    ? 'warning'
                                    : h.status === 'LOCKED' || h.status === 'FAILED'
                                      ? 'danger'
                                      : 'info'
                              }
                            >
                              {h.status}
                            </Badge>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{h.deviceLabel}</span>
                            {h.suspiciousSignals.map((sig) => (
                              <Badge key={sig} variant="warning">
                                <ShieldAlert className="w-3 h-3 mr-1 inline" />
                                {sig}
                              </Badge>
                            ))}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono block">
                            IP {h.ipAddress} {h.failureReason ? `• Reason: ${h.failureReason}` : ''}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(h.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
};
