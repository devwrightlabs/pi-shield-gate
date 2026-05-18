import type {
  PctValidationRequest,
  PctValidationResponse,
  PiAuthResult,
  PiAuthScope,
  PiIncompletePayment
} from '../types/shield';

export class ShieldAuthError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'ShieldAuthError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface PiPctAuthValidatorOptions {
  verifyEndpoint: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  clockSkewSeconds?: number;
}

/**
 * Validates a Pi access token against a PCT-aligned backend verification endpoint.
 */
export async function validatePiAccessToken(
  accessToken: string,
  options: PiPctAuthValidatorOptions
): Promise<PctValidationResponse> {
  if (!accessToken) {
    throw new ShieldAuthError('PI_TOKEN_MISSING', 'Pi access token is missing.');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const requestBody: PctValidationRequest = { accessToken };

  try {
    const response = await fetchImpl(options.verifyEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey ? { 'X-API-Key': options.apiKey } : {})
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new ShieldAuthError(
        'PI_VALIDATION_HTTP_ERROR',
        `PCT validation failed with status ${response.status}.`
      );
    }

    const payload = (await response.json()) as Partial<PctValidationResponse>;
    if (!payload.isValid || !payload.user?.uid || !payload.expiresAt || !payload.issuedAt) {
      throw new ShieldAuthError(
        'PI_VALIDATION_SCHEMA_ERROR',
        'PCT validation response did not match required schema.'
      );
    }

    const expiresAtMs = Date.parse(payload.expiresAt);
    const clockSkewMs = (options.clockSkewSeconds ?? 15) * 1000;
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now() - clockSkewMs) {
      throw new ShieldAuthError('PI_TOKEN_EXPIRED', 'Pi access token has expired.');
    }

    const normalized: PctValidationResponse = {
      isValid: true,
      user: payload.user,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      kycVerified: Boolean(payload.kycVerified)
    };

    if (payload.countryCode !== undefined) {
      normalized.countryCode = payload.countryCode;
    }
    if (payload.kycLevel !== undefined) {
      normalized.kycLevel = payload.kycLevel;
    }
    if (payload.roles !== undefined) {
      normalized.roles = payload.roles;
    }
    if (payload.metadata !== undefined) {
      normalized.metadata = payload.metadata;
    }

    return normalized;
  } catch (error: unknown) {
    if (error instanceof ShieldAuthError) {
      throw error;
    }

    throw new ShieldAuthError('PI_VALIDATION_FAILED', 'Unable to verify Pi access token.', error);
  }
}

/**
 * Runs Pi SDK authentication and immediately verifies the returned token via backend validation.
 */
export async function authenticateAndValidatePiUser(
  scopes: readonly PiAuthScope[],
  onIncompletePaymentFound: ((payment: PiIncompletePayment) => void) | undefined,
  options: PiPctAuthValidatorOptions
): Promise<{ auth: PiAuthResult; validation: PctValidationResponse }> {
  try {
    if (typeof window === 'undefined' || !window.Pi) {
      throw new ShieldAuthError(
        'PI_SDK_UNAVAILABLE',
        'window.Pi is unavailable. Ensure this code runs in the Pi webview client.'
      );
    }

    const auth = await window.Pi.authenticate(scopes, onIncompletePaymentFound);
    const validation = await validatePiAccessToken(auth.accessToken, options);

    if (auth.user.uid !== validation.user.uid) {
      throw new ShieldAuthError(
        'PI_UID_MISMATCH',
        'Authenticated Pi UID does not match validated UID.'
      );
    }

    return { auth, validation };
  } catch (error: unknown) {
    if (error instanceof ShieldAuthError) {
      throw error;
    }
    throw new ShieldAuthError('PI_AUTH_FLOW_FAILED', 'Pi authentication flow failed.', error);
  }
}
