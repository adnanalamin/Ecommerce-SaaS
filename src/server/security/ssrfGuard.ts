/**
 * NEXORA Security Foundation
 * SSRF (Server-Side Request Forgery) Protection Guard
 *
 * Validates all outbound server-side URLs (webhooks, media import, gateway callbacks):
 * - Enforces HTTPS (or HTTP in explicitly allowed dev modes)
 * - Blocks userinfo credentials in URLs
 * - Blocks private, loopback, link-local, metadata, and multicast IPv4/IPv6 ranges
 * - Resolves DNS hostnames before fetching to prevent DNS-rebinding bypasses
 */

import dns from 'node:dns/promises';
import net from 'node:net';
import { logSecurityEvent } from './securityLogger.ts';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isInIpv4Cidr(ip: string, base: string, prefixLen: number): boolean {
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const cleanIp = ip.split('%')[0].trim().toLowerCase();

  if (net.isIPv4(cleanIp)) {
    const blockedCidrs: Array<[string, number]> = [
      ['0.0.0.0', 8],       // Current network
      ['10.0.0.0', 8],      // RFC 1918 Private
      ['100.64.0.0', 10],   // Carrier-Grade NAT (RFC 6598)
      ['127.0.0.0', 8],     // Loopback
      ['169.254.0.0', 16],  // Link-Local & Cloud Metadata (169.254.169.254)
      ['172.16.0.0', 12],   // RFC 1918 Private
      ['192.0.0.0', 24],    // IETF Protocol Assignments
      ['192.0.2.0', 24],    // TEST-NET-1
      ['192.168.0.0', 16],  // RFC 1918 Private
      ['198.18.0.0', 15],   // Benchmarking
      ['224.0.0.0', 4],     // Multicast
      ['240.0.0.0', 4],     // Reserved / Broadcast
    ];
    return blockedCidrs.some(([base, prefix]) => isInIpv4Cidr(cleanIp, base, prefix));
  }

  if (net.isIPv6(cleanIp)) {
    if (cleanIp === '::' || cleanIp === '::1') {
      return true;
    }
    // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (cleanIp.startsWith('::ffff:')) {
      const mapped = cleanIp.slice(7);
      if (net.isIPv4(mapped)) {
        return isPrivateOrReservedIp(mapped);
      }
      // Hex form e.g. ::ffff:7f00:0001
      const hexParts = mapped.split(':');
      if (hexParts.length === 2) {
        const high = parseInt(hexParts[0], 16);
        const low = parseInt(hexParts[1], 16);
        if (!Number.isNaN(high) && !Number.isNaN(low)) {
          const reconstructed = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
          return isPrivateOrReservedIp(reconstructed);
        }
      }
      return true;
    }
    // Unique Local Addresses fc00::/7 (fc.. or fd..)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true;
    }
    // Link-Local fe80::/10
    if (/^fe[89ab][0-9a-f]:/i.test(cleanIp)) {
      return true;
    }
    // Multicast ff00::/8
    if (cleanIp.startsWith('ff')) {
      return true;
    }
    return false;
  }

  return true; // Unknown IP family rejected by default (fail-closed)
}

export interface SsrfValidationResult {
  allowed: boolean;
  reason?: string;
  normalizedUrl?: string;
  resolvedIps?: string[];
}

export async function validateOutboundUrl(
  rawUrl: string,
  options: { allowHttp?: boolean; skipDnsResolution?: boolean } = {}
): Promise<SsrfValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'Malformed URL syntax.' };
  }

  const allowedProtocols = options.allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    return { allowed: false, reason: `Disallowed URL protocol "${parsed.protocol}". Only HTTPS is permitted.` };
  }

  if (parsed.username || parsed.password) {
    return { allowed: false, reason: 'URLs containing embedded credentials are forbidden.' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    return { allowed: false, reason: `Access to internal hostname "${hostname}" is blocked.` };
  }

  // If hostname is a direct IP literal
  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      return { allowed: false, reason: `Target IP "${hostname}" falls within a private or reserved network range.` };
    }
    return { allowed: true, normalizedUrl: parsed.toString(), resolvedIps: [hostname] };
  }

  if (options.skipDnsResolution) {
    return { allowed: true, normalizedUrl: parsed.toString(), resolvedIps: [] };
  }

  // Resolve DNS records and check every returned IP
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { allowed: false, reason: 'DNS resolution returned no addresses.' };
    }

    const ips = records.map((r) => r.address);
    for (const ip of ips) {
      if (isPrivateOrReservedIp(ip)) {
        return {
          allowed: false,
          reason: `DNS resolved "${hostname}" to blocked internal IP "${ip}".`,
        };
      }
    }

    return { allowed: true, normalizedUrl: parsed.toString(), resolvedIps: ips };
  } catch {
    return { allowed: false, reason: `Unable to safely resolve DNS for "${hostname}".` };
  }
}

export async function safeServerFetch(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number; allowHttp?: boolean } = {}
): Promise<globalThis.Response> {
  const check = await validateOutboundUrl(rawUrl, { allowHttp: init.allowHttp });
  if (!check.allowed || !check.normalizedUrl) {
    logSecurityEvent({
      eventType: 'SSRF_ATTEMPT_BLOCKED',
      severity: 'HIGH',
      message: `Blocked outbound server fetch: ${check.reason}`,
      metadata: { targetHost: (() => { try { return new URL(rawUrl).hostname; } catch { return 'invalid'; } })() },
    });
    throw new Error(`SSRF Guard Blocked Request: ${check.reason}`);
  }

  return fetch(check.normalizedUrl, {
    ...init,
    redirect: 'error', // Prevents open-redirect SSRF bypasses into internal IPs
    signal: init.signal ?? AbortSignal.timeout(init.timeoutMs ?? 8000),
  });
}
