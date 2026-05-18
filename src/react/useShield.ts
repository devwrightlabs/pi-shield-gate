"use client";

import { useContext } from 'react';
import { ShieldContext, type ShieldContextValue } from './ShieldProvider';

/**
 * Returns the active Shield context, including auth state and defense utilities.
 */
export function useShield(): ShieldContextValue {
  const context = useContext(ShieldContext);
  if (!context) {
    throw new Error('useShield must be used within ShieldProvider.');
  }
  return context;
}
