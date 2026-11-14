/**
 * NEXORA Security Foundation
 * XSS Detection, HTML Entity Encoding & Payload Sanitization
 */

const DANGEROUS_XSS_PATTERNS: RegExp[] = [
  /<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi,
  /<\s*script\b[^>]*>/gi,
  /<\s*iframe\b[^>]*>/gi,
  /<\s*object\b[^>]*>/gi,
  /<\s*embed\b[^>]*>/gi,
  /<\s*svg\b[^>]*\bon\w+\s*=/gi,
  /\bon(?:load|error|click|mouseover|focus|blur|submit|input|change|keyup|keydown)\s*=/gi,
  /\b(?:javascript|vbscript)\s*:/gi,
  /\bdata\s*:\s*text\/html/gi,
];

export function containsXssPayload(value: string): boolean {
  if (typeof value !== 'string') return false;
  return DANGEROUS_XSS_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

export function stripXssVectors(input: string): string {
  let clean = input;
  clean = clean.replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  clean = clean.replace(/<\s*\/?(?:script|iframe|object|embed|applet|base)\b[^>]*>/gi, '');
  clean = clean.replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  clean = clean.replace(/\b(?:javascript|vbscript)\s*:/gi, 'blocked:');
  clean = clean.replace(/\bdata\s*:\s*text\/html/gi, 'blocked:text/plain');
  return clean.trim();
}

export function scanPayloadForXss(
  payload: unknown,
  pathPrefix = 'root',
  depth = 0
): { safe: boolean; findings: string[] } {
  const findings: string[] = [];
  if (depth > 20 || payload === null || payload === undefined) {
    return { safe: true, findings };
  }

  if (typeof payload === 'string') {
    if (containsXssPayload(payload)) {
      findings.push(`XSS vector detected at ${pathPrefix}`);
    }
    return { safe: findings.length === 0, findings };
  }

  if (typeof payload !== 'object') {
    return { safe: true, findings };
  }

  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => {
      const res = scanPayloadForXss(item, `${pathPrefix}[${idx}]`, depth + 1);
      findings.push(...res.findings);
    });
  } else {
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      const res = scanPayloadForXss(v, `${pathPrefix}.${k}`, depth + 1);
      findings.push(...res.findings);
    }
  }

  return { safe: findings.length === 0, findings };
}
