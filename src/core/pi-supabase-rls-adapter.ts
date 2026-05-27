import type { PctValidationResponse, ShieldJwtClaims, ShieldSignedJwt, SupabaseRlsMappingProfile } from '../types/shield';
import { ShieldAuthError } from './pi-pct-auth-validator';

export interface SupabaseJwtSignerResponse {
  token: string;
  expiresAt: number;
}

export interface PiSupabaseRlsAdapterOptions {
  signer: (claims: ShieldJwtClaims) => Promise<SupabaseJwtSignerResponse>;
  now?: () => number;
}

/**
 * Creates PCT-aligned JWT claims for Supabase RLS authorization.
 */
export function buildSupabaseRlsClaims(
  validation: PctValidationResponse,
  profile: SupabaseRlsMappingProfile,
  now: number = Date.now()
): ShieldJwtClaims {
  const iat = Math.floor(now / 1000);
  const exp = iat + profile.ttlSeconds;

  const claims: ShieldJwtClaims = {
    sub: validation.user.uid,
    aud: profile.audience,
    iss: profile.issuer,
    iat,
    exp,
    role: profile.role,
    pi_uid: validation.user.uid,
    pi_username: validation.user.username,
    pi_kyc_verified: validation.kycVerified
  };

  if (validation.countryCode !== undefined) {
    claims.pi_country = validation.countryCode;
  }
  if (profile.includeAppMetadata && validation.metadata !== undefined) {
    claims.app_metadata = validation.metadata;
  }
  if (profile.includeUserMetadata) {
    claims.user_metadata = {
      username: validation.user.username,
      walletAddress: validation.user.walletAddress ?? null
    };
  }

  return claims;
}

/**
 * Exchanges validated Pi identity for a backend-signed Supabase JWT token.
 */
export async function createSupabaseRlsSession(
  validation: PctValidationResponse,
  profile: SupabaseRlsMappingProfile,
  options: PiSupabaseRlsAdapterOptions
): Promise<ShieldSignedJwt> {
  try {
    const claims = buildSupabaseRlsClaims(validation, profile, options.now?.() ?? Date.now());
    const signed = await options.signer(claims);

    if (!signed.token || !Number.isFinite(signed.expiresAt) || signed.expiresAt <= Date.now()) {
      throw new ShieldAuthError('SUPABASE_JWT_INVALID', 'Supabase signer returned an invalid token.');
    }

    return {
      token: signed.token,
      expiresAt: signed.expiresAt,
      claims
    };
  } catch (error: unknown) {
    if (error instanceof ShieldAuthError) {
      throw error;
    }

    throw new ShieldAuthError(
      'SUPABASE_JWT_EXCHANGE_FAILED',
      'Failed to exchange Pi identity for Supabase JWT.',
      error
    );
  }
}
