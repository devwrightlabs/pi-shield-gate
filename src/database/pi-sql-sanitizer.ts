const INJECTION_PATTERNS: readonly RegExp[] = [
  /\b(?:OR|AND)\b\s+\d+\s*=\s*\d+/i,
  /;\s*DROP\s+TABLE/i,
  /UNION\s+SELECT/i,
  /\$where\s*:/i,
  /\{\s*\$ne\s*:/i,
  /<\s*script/i,
  /--\s*$/m
];

export interface SanitizerDecision {
  safe: boolean;
  reason?: string;
}

function hasInjectionPattern(value: string): SanitizerDecision {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      return {
        safe: false,
        reason: `Matched suspicious pattern: ${pattern.source}`
      };
    }
  }

  return { safe: true };
}

/**
 * Evaluates an unknown payload recursively and rejects SQL/NoSQL injection-like input.
 */
export function sanitizeDatabaseInput(payload: unknown): SanitizerDecision {
  if (typeof payload === 'string') {
    return hasInjectionPattern(payload);
  }

  if (typeof payload === 'number' || typeof payload === 'boolean' || payload === null || payload === undefined) {
    return { safe: true };
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const result = sanitizeDatabaseInput(item);
      if (!result.safe) {
        return result;
      }
    }
    return { safe: true };
  }

  if (typeof payload === 'object') {
    for (const value of Object.values(payload as Record<string, unknown>)) {
      const result = sanitizeDatabaseInput(value);
      if (!result.safe) {
        return result;
      }
    }
    return { safe: true };
  }

  return { safe: false, reason: 'Unsupported payload type for sanitizer.' };
}
