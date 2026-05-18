export type PiUid = string;
export type Iso8601String = string;

export type PiAuthScope =
  | 'username'
  | 'payments'
  | 'wallet_address'
  | 'kyc'
  | 'profile'
  | 'roles';

export interface PiAuthUserProfile {
  uid: PiUid;
  username: string;
  walletAddress?: string;
}

export interface PiAuthResult {
  accessToken: string;
  user: PiAuthUserProfile;
}

export interface PiAuthenticateCallbacks {
  onIncompletePaymentFound?: (payment: PiIncompletePayment) => void;
}

export interface PiIncompletePayment {
  identifier: string;
  amount: number;
  memo?: string;
  createdAt?: Iso8601String;
}

export interface PiSdk {
  authenticate: (
    scopes: readonly PiAuthScope[],
    onIncompletePaymentFound?: (payment: PiIncompletePayment) => void
  ) => Promise<PiAuthResult>;
}

export interface ShieldWindow {
  Pi?: PiSdk;
}

export interface PctValidationRequest {
  accessToken: string;
}

export interface PctValidationResponse {
  isValid: boolean;
  user: PiAuthUserProfile;
  issuedAt: Iso8601String;
  expiresAt: Iso8601String;
  countryCode?: string;
  kycVerified: boolean;
  kycLevel?: 'none' | 'basic' | 'full';
  roles?: readonly string[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ShieldJwtHeader {
  alg: 'HS256' | 'RS256' | 'EdDSA';
  typ: 'JWT';
  kid?: string;
}

export interface ShieldJwtClaims {
  sub: PiUid;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  nbf?: number;
  role: string;
  pi_uid: PiUid;
  pi_username: string;
  pi_country?: string;
  pi_kyc_verified: boolean;
  app_metadata?: Record<string, string | number | boolean | null>;
  user_metadata?: Record<string, string | number | boolean | null>;
}

export interface ShieldSignedJwt {
  token: string;
  expiresAt: number;
  claims: ShieldJwtClaims;
}

export interface SupabaseRlsMappingProfile {
  role: string;
  audience: string;
  issuer: string;
  ttlSeconds: number;
  includeUserMetadata?: boolean;
  includeAppMetadata?: boolean;
}

export interface ShieldSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userUid: PiUid;
}

export interface NetworkSignature {
  ipHash: string;
  userAgent: string;
  asn?: string;
}

declare global {
  interface Window extends ShieldWindow {}
}
