"use client";

import React, { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authenticateAndValidatePiUser, ShieldAuthError, type PiPctAuthValidatorOptions } from '../core/pi-pct-auth-validator';
import { createSupabaseRlsSession, type PiSupabaseRlsAdapterOptions } from '../core/pi-supabase-rls-adapter';
import { createDeviceFingerprint, evaluateFingerprintRisk } from '../security/pi-device-fingerprint';
import { evaluateKycGate, type KycGateRequirements, type KycGateResult } from '../security/pi-zk-kyc-gate';
import { debugPiAuthFailure } from '../debug/pi-auth-debugger';
import type { PiAuthScope, PctValidationResponse, SupabaseRlsMappingProfile } from '../types/shield';

export interface ShieldState {
  isAuthenticated: boolean;
  isKycVerified: boolean;
  userUid: string | null;
  loading: boolean;
  error: string | null;
}

export interface ShieldContextValue extends ShieldState {
  refreshAuth: () => Promise<void>;
  runKycGate: (requirements: KycGateRequirements) => KycGateResult;
  runDeviceRiskCheck: () => Promise<{ blocked: boolean; reasons: string[] }>;
}

export const ShieldContext = createContext<ShieldContextValue | null>(null);

export interface ShieldProviderProps {
  children: ReactNode;
  scopes?: readonly PiAuthScope[];
  onIncompletePaymentFound?: (payment: { identifier: string; amount: number; memo?: string }) => void;
  authValidatorOptions: PiPctAuthValidatorOptions;
  rlsProfile: SupabaseRlsMappingProfile;
  supabaseAdapterOptions: PiSupabaseRlsAdapterOptions;
  onSupabaseToken?: (token: string) => void;
}

/**
 * Initializes Pi auth validation, anti-bot checks, and Supabase RLS token exchange.
 */
export function ShieldProvider({
  children,
  scopes = ['username', 'payments', 'wallet_address', 'kyc'],
  onIncompletePaymentFound,
  authValidatorOptions,
  rlsProfile,
  supabaseAdapterOptions,
  onSupabaseToken
}: ShieldProviderProps): React.ReactElement {
  const [state, setState] = useState<ShieldState>({
    isAuthenticated: false,
    isKycVerified: false,
    userUid: null,
    loading: true,
    error: null
  });
  const [validation, setValidation] = useState<PctValidationResponse | null>(null);

  const refreshAuth = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const { validation: validated } = await authenticateAndValidatePiUser(
        scopes,
        onIncompletePaymentFound,
        authValidatorOptions
      );

      const rls = await createSupabaseRlsSession(validated, rlsProfile, supabaseAdapterOptions);
      onSupabaseToken?.(rls.token);
      setValidation(validated);

      setState({
        isAuthenticated: true,
        isKycVerified: validated.kycVerified,
        userUid: validated.user.uid,
        loading: false,
        error: null
      });
    } catch (error: unknown) {
      debugPiAuthFailure(error, { from: 'ShieldProvider.refreshAuth' });
      setValidation(null);
      setState({
        isAuthenticated: false,
        isKycVerified: false,
        userUid: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown authentication error.'
      });

      if (error instanceof ShieldAuthError) {
        return;
      }
    }
  }, [authValidatorOptions, onIncompletePaymentFound, onSupabaseToken, rlsProfile, scopes, supabaseAdapterOptions]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const runKycGate = useCallback(
    (requirements: KycGateRequirements): KycGateResult => {
      const kycPayload = {
        kycVerified: validation?.kycVerified ?? false,
        ...(validation?.kycLevel !== undefined ? { kycLevel: validation.kycLevel } : {})
      };
      return evaluateKycGate(kycPayload, requirements);
    },
    [validation]
  );

  const runDeviceRiskCheck = useCallback(async (): Promise<{ blocked: boolean; reasons: string[] }> => {
    try {
      const fingerprint = await createDeviceFingerprint(state.userUid ?? undefined);
      const assessment = evaluateFingerprintRisk(fingerprint);
      return { blocked: assessment.blocked, reasons: assessment.reasons };
    } catch (error: unknown) {
      return {
        blocked: true,
        reasons: [error instanceof Error ? error.message : 'Fingerprint collection failed.']
      };
    }
  }, [state.userUid]);

  const contextValue = useMemo<ShieldContextValue>(
    () => ({
      ...state,
      refreshAuth,
      runKycGate,
      runDeviceRiskCheck
    }),
    [refreshAuth, runDeviceRiskCheck, runKycGate, state]
  );

  return <ShieldContext.Provider value={contextValue}>{children}</ShieldContext.Provider>;
}
