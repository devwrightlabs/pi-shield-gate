import { ShieldAuthError } from '../core/pi-pct-auth-validator';

export type PiAuthDebugCode =
  | 'AUTH_401'
  | 'PI_SDK_NOT_FOUND'
  | 'SUPABASE_JWT_SECRET_MISMATCH'
  | 'TOKEN_EXPIRED'
  | 'NETWORK_FAILURE'
  | 'UNKNOWN';

export interface PiAuthDebugResult {
  code: PiAuthDebugCode;
  hint: string;
  originalMessage: string;
}

const DEBUG_HINTS: Record<PiAuthDebugCode, string> = {
  AUTH_401: 'Received 401. Verify RLS JWT claims and Supabase role mappings.',
  PI_SDK_NOT_FOUND: 'window.Pi missing. Test inside native Pi Browser/webview container.',
  SUPABASE_JWT_SECRET_MISMATCH: 'Check Supabase JWT secret mismatch between signer service and project settings.',
  TOKEN_EXPIRED: 'Token expired. Confirm refresh manager wiring and server clock synchronization.',
  NETWORK_FAILURE: 'Network failed during auth handshake. Verify API URL, CORS, and connectivity.',
  UNKNOWN: 'Inspect stack trace and enable verbose logging in the auth provider.'
};

/**
 * Converts runtime auth failures into actionable developer diagnostics.
 */
export function mapAuthErrorToDebugResult(error: unknown): PiAuthDebugResult {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof ShieldAuthError) {
    if (error.code === 'PI_SDK_UNAVAILABLE') {
      return { code: 'PI_SDK_NOT_FOUND', hint: DEBUG_HINTS.PI_SDK_NOT_FOUND, originalMessage: message };
    }
    if (error.code === 'PI_TOKEN_EXPIRED') {
      return { code: 'TOKEN_EXPIRED', hint: DEBUG_HINTS.TOKEN_EXPIRED, originalMessage: message };
    }
  }

  if (/401|unauthorized/i.test(message)) {
    return { code: 'AUTH_401', hint: DEBUG_HINTS.AUTH_401, originalMessage: message };
  }

  if (/jwt secret|signature|invalid token/i.test(message)) {
    return {
      code: 'SUPABASE_JWT_SECRET_MISMATCH',
      hint: DEBUG_HINTS.SUPABASE_JWT_SECRET_MISMATCH,
      originalMessage: message
    };
  }

  if (/network|fetch|cors|timeout/i.test(message)) {
    return { code: 'NETWORK_FAILURE', hint: DEBUG_HINTS.NETWORK_FAILURE, originalMessage: message };
  }

  return { code: 'UNKNOWN', hint: DEBUG_HINTS.UNKNOWN, originalMessage: message };
}

/**
 * Logs rich, human-readable diagnostics to the developer console.
 */
export function debugPiAuthFailure(error: unknown, context?: Record<string, string | number | boolean>): PiAuthDebugResult {
  const result = mapAuthErrorToDebugResult(error);

  console.groupCollapsed(`[@devright/pi-shield-gate] Auth Debug ${result.code}`);
  console.error(result.originalMessage);
  console.info(result.hint);
  if (context) {
    console.table(context);
  }
  console.groupEnd();

  return result;
}
