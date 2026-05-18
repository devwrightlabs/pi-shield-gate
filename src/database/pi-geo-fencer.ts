export interface GeoFencePayload {
  countryCode?: string;
}

export interface GeoFenceDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Prevents region-mismatched database operations.
 */
export function evaluateGeoFence(payload: GeoFencePayload, allowedCountries: readonly string[]): GeoFenceDecision {
  const countryCode = payload.countryCode?.toUpperCase();
  const normalizedAllowed = new Set(allowedCountries.map((item) => item.toUpperCase()));

  if (!countryCode) {
    return { allowed: false, reason: 'Country code missing from validated payload.' };
  }

  if (!normalizedAllowed.has(countryCode)) {
    return { allowed: false, reason: `Country ${countryCode} is outside the allowed marketplace.` };
  }

  return { allowed: true };
}

/**
 * Throws when geofence constraints are not met.
 */
export function enforceGeoFence(payload: GeoFencePayload, allowedCountries: readonly string[]): void {
  const decision = evaluateGeoFence(payload, allowedCountries);
  if (!decision.allowed) {
    throw new Error(decision.reason ?? 'Geofence blocked this request.');
  }
}
