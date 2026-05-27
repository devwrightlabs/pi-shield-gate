import type { PctValidationResponse } from '../types/shield';

export interface KycGateRequirements {
  requireVerified: boolean;
  minimumLevel?: 'basic' | 'full';
}

export interface KycGateResult {
  allowed: boolean;
  reason?: string;
}

const levelWeight: Record<'none' | 'basic' | 'full', number> = {
  none: 0,
  basic: 1,
  full: 2
};

/**
 * Enforces KYC gating without exposing or storing personally identifying documents.
 */
export function evaluateKycGate(
  validation: Pick<PctValidationResponse, 'kycVerified' | 'kycLevel'>,
  requirements: KycGateRequirements
): KycGateResult {
  if (!requirements.requireVerified) {
    return { allowed: true };
  }

  if (!validation.kycVerified) {
    return { allowed: false, reason: 'KYC verification is required for this feature.' };
  }

  if (requirements.minimumLevel) {
    const current = levelWeight[validation.kycLevel ?? 'none'];
    const expected = levelWeight[requirements.minimumLevel];
    if (current < expected) {
      return {
        allowed: false,
        reason: `KYC level ${requirements.minimumLevel} is required.`
      };
    }
  }

  return { allowed: true };
}
