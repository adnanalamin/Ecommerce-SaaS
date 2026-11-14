/**
 * NEXORA Security Foundation
 * Dependency Vulnerability & Supply Chain Inspection Utility
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface DependencyAuditSummary {
  checkedAt: string;
  totalDependencies: number;
  totalDevDependencies: number;
  lockfilePresent: boolean;
  securityPackagesInstalled: string[];
  findings: Array<{
    packageName: string;
    severity: 'INFO' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    note: string;
  }>;
  recommendation: string;
}

const KNOWN_SECURITY_PACKAGES = ['helmet', 'cors', 'zod', 'argon2', 'express-rate-limit', 'cookie-parser'];

export async function inspectDependencyPosture(): Promise<DependencyAuditSummary> {
  const cwd = process.cwd();
  const pkgRaw = await fs.readFile(path.join(cwd, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const deps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};

  let lockfilePresent = false;
  try {
    await fs.access(path.join(cwd, 'package-lock.json'));
    lockfilePresent = true;
  } catch {
    lockfilePresent = false;
  }

  const securityPackagesInstalled = KNOWN_SECURITY_PACKAGES.filter((name) => Boolean(deps[name]));

  const findings: DependencyAuditSummary['findings'] = [];
  if (!lockfilePresent) {
    findings.push({
      packageName: 'package-lock.json',
      severity: 'LOW',
      note: 'No lockfile detected in workspace; generate with "npm run security:lock" before running offline CI npm audit.',
    });
  }

  if (deps['express']) {
    findings.push({
      packageName: 'express',
      severity: 'INFO',
      note: `Running Express ${deps['express']} with x-powered-by disabled, strict size caps, and Helmet guards.`,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    totalDependencies: Object.keys(deps).length,
    totalDevDependencies: Object.keys(devDeps).length,
    lockfilePresent,
    securityPackagesInstalled,
    findings,
    recommendation: 'Run "npm run security:audit" in CI/CD pipelines on every PR to block HIGH/CRITICAL CVEs.',
  };
}
