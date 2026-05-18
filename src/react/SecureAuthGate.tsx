"use client";

import React, { type ReactNode, useEffect } from 'react';
import { debugPiAuthFailure } from '../debug/pi-auth-debugger';
import { useShield } from './useShield';

export interface SecureAuthGateProps {
  children: ReactNode;
  requireKyc?: boolean;
  enforceBotCheck?: boolean;
  fallback?: ReactNode;
}

const shellStyle: React.CSSProperties = {
  minHeight: '220px',
  background: '#0A0A0F',
  border: '1px solid rgba(240, 192, 64, 0.35)',
  borderRadius: '16px',
  color: '#F7F7FA',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)'
};

const shimmerStyle: React.CSSProperties = {
  height: '12px',
  borderRadius: '999px',
  background: 'linear-gradient(90deg, rgba(240, 192, 64, 0.10), rgba(240, 192, 64, 0.35), rgba(240, 192, 64, 0.10))',
  backgroundSize: '300% 100%',
  animation: 'piShieldGateShimmer 1.5s linear infinite'
};

/**
 * Wraps sensitive routes with auth/KYC/bot gates and polished verification fallback UI.
 */
export function SecureAuthGate({
  children,
  requireKyc = true,
  enforceBotCheck = true,
  fallback
}: SecureAuthGateProps): React.ReactElement {
  const shield = useShield();

  useEffect(() => {
    if (!shield.isAuthenticated && !shield.loading) {
      debugPiAuthFailure(new Error('401 Unauthorized: SecureAuthGate denied route access.'), {
        userUid: shield.userUid ?? 'unknown',
        requireKyc,
        enforceBotCheck
      });
    }
  }, [enforceBotCheck, requireKyc, shield.isAuthenticated, shield.loading, shield.userUid]);

  useEffect(() => {
    if (!enforceBotCheck || !shield.isAuthenticated || shield.loading) {
      return;
    }

    let active = true;
    void shield.runDeviceRiskCheck().then((result) => {
      if (!active || !result.blocked) {
        return;
      }
      debugPiAuthFailure(new Error(`Blocked by device risk policy: ${result.reasons.join('; ')}`), {
        userUid: shield.userUid ?? 'unknown'
      });
    });

    return () => {
      active = false;
    };
  }, [enforceBotCheck, shield]);

  if (shield.loading) {
    return (
      <section style={shellStyle} aria-busy>
        <style>{`@keyframes piShieldGateShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        <h2 style={{ margin: 0, color: '#F0C040' }}>Verification Required</h2>
        <p style={{ margin: 0, opacity: 0.84 }}>Preparing secure session…</p>
        <div style={{ ...shimmerStyle, width: '75%' }} />
        <div style={{ ...shimmerStyle, width: '92%' }} />
        <div style={{ ...shimmerStyle, width: '68%' }} />
      </section>
    );
  }

  if (!shield.isAuthenticated || (requireKyc && !shield.isKycVerified)) {
    return (
      <>
        {fallback ?? (
          <section style={shellStyle} role="alert" aria-live="polite">
            <h2 style={{ margin: 0, color: '#F0C040' }}>Verification Required</h2>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              This route is protected by Pi Shield Gate. Authenticate with Pi and complete required checks to continue.
            </p>
            {shield.error ? <p style={{ margin: 0, color: '#FF9898' }}>{shield.error}</p> : null}
            <button
              type="button"
              onClick={() => {
                void shield.refreshAuth();
              }}
              style={{
                marginTop: '8px',
                alignSelf: 'flex-start',
                border: '1px solid #F0C040',
                color: '#F0C040',
                background: 'transparent',
                borderRadius: '10px',
                padding: '8px 14px',
                cursor: 'pointer'
              }}
            >
              Retry verification
            </button>
          </section>
        )}
      </>
    );
  }

  return <>{children}</>;
}
