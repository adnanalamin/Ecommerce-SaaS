/**
 * NEXORA Security Foundation
 * Safe File Upload Validator (Magic Bytes + MIME Allowlist + Path Traversal Prevention)
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from '../../../packages/config/src/index.ts';
import { logSecurityEvent } from './securityLogger.ts';

export type AllowedMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const ALLOWED_EXTENSIONS: Record<AllowedMimeType, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.dll', '.sh', '.bash', '.bat', '.cmd', '.ps1', '.php', '.jsp',
  '.asp', '.aspx', '.js', '.mjs', '.cjs', '.html', '.htm', '.svg', '.xml',
]);

export interface FileUploadCandidate {
  originalName: string;
  declaredMimeType: string;
  buffer: Buffer;
}

export interface FileValidationResult {
  valid: boolean;
  sanitizedFilename?: string;
  detectedMimeType?: AllowedMimeType;
  sizeBytes: number;
  reason?: string;
}

/**
 * Inspects leading binary magic bytes to determine true file type.
 */
export function detectMagicMimeType(buf: Buffer): AllowedMimeType | null {
  if (!buf || buf.length < 4) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WEBP: "RIFF".... "WEBP"
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // PDF: "%PDF-"
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }

  return null;
}

/**
 * Prevents path traversal, null-byte injection, and generates an isolated UUID filename.
 */
export function sanitizeUploadFilename(originalName: string, validatedMime: AllowedMimeType): string {
  const cleanBase = path.basename(originalName.replace(/\0/g, ''));
  const ext = path.extname(cleanBase).toLowerCase();
  const allowedExts = ALLOWED_EXTENSIONS[validatedMime];
  const safeExt = allowedExts.includes(ext) ? ext : allowedExts[0];
  return `${randomUUID()}${safeExt}`;
}

export function validateFileUpload(
  file: FileUploadCandidate,
  maxBytes = env.MAX_UPLOAD_FILE_BYTES
): FileValidationResult {
  const sizeBytes = file.buffer?.length ?? 0;

  if (!file.originalName || file.originalName.includes('\0')) {
    return { valid: false, sizeBytes, reason: 'Invalid or null-byte filename.' };
  }

  if (file.originalName.includes('..') || file.originalName.includes('/') || file.originalName.includes('\\')) {
    logSecurityEvent({
      eventType: 'INVALID_UPLOAD_BLOCKED',
      severity: 'HIGH',
      message: 'Path traversal attempt in upload filename blocked.',
    });
    return { valid: false, sizeBytes, reason: 'Path traversal characters are forbidden in filenames.' };
  }

  if (sizeBytes === 0) {
    return { valid: false, sizeBytes, reason: 'Empty file upload rejected.' };
  }

  if (sizeBytes > maxBytes) {
    return {
      valid: false,
      sizeBytes,
      reason: `File size (${sizeBytes} bytes) exceeds maximum limit (${maxBytes} bytes).`,
    };
  }

  const ext = path.extname(file.originalName).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    logSecurityEvent({
      eventType: 'INVALID_UPLOAD_BLOCKED',
      severity: 'HIGH',
      message: `Blocked executable or active-content upload extension: ${ext}`,
    });
    return { valid: false, sizeBytes, reason: `File extension "${ext}" is prohibited.` };
  }

  const normalizedMime = file.declaredMimeType.toLowerCase() as AllowedMimeType;
  if (!(normalizedMime in ALLOWED_EXTENSIONS)) {
    return { valid: false, sizeBytes, reason: `Unsupported MIME type "${file.declaredMimeType}".` };
  }

  if (!ALLOWED_EXTENSIONS[normalizedMime].includes(ext)) {
    return {
      valid: false,
      sizeBytes,
      reason: `Extension "${ext}" does not match declared MIME type "${normalizedMime}".`,
    };
  }

  const magicMime = detectMagicMimeType(file.buffer);
  if (!magicMime || magicMime !== normalizedMime) {
    logSecurityEvent({
      eventType: 'INVALID_UPLOAD_BLOCKED',
      severity: 'HIGH',
      message: `File magic-byte mismatch: declared=${normalizedMime}, detected=${magicMime ?? 'unknown'}`,
    });
    return {
      valid: false,
      sizeBytes,
      reason: `Magic-byte signature mismatch. Content does not match declared type "${normalizedMime}".`,
    };
  }

  return {
    valid: true,
    sizeBytes,
    detectedMimeType: magicMime,
    sanitizedFilename: sanitizeUploadFilename(file.originalName, magicMime),
  };
}
