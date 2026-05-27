export interface RateLimitSnapshot {
  endpoint: string;
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
  usageRatio: number;
}

export interface PiRateLimitTrackerOptions {
  warningThreshold?: number;
  criticalThreshold?: number;
  logger?: Pick<Console, 'warn' | 'error' | 'info'>;
}

/**
 * Tracks API limit headroom and warns before request loops trigger bans.
 */
export class PiRateLimitTracker {
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;
  private readonly logger: Pick<Console, 'warn' | 'error' | 'info'>;

  public constructor(options: PiRateLimitTrackerOptions = {}) {
    this.warningThreshold = options.warningThreshold ?? 0.8;
    this.criticalThreshold = options.criticalThreshold ?? 0.95;
    this.logger = options.logger ?? console;
  }

  /**
   * Consumes response headers and returns parsed rate-limit telemetry.
   */
  public recordResponse(endpoint: string, response: Response): RateLimitSnapshot | null {
    const limit = Number(response.headers.get('x-ratelimit-limit'));
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const resetEpochSeconds = Number(response.headers.get('x-ratelimit-reset'));

    if (![limit, remaining, resetEpochSeconds].every(Number.isFinite) || limit <= 0) {
      return null;
    }

    const usageRatio = 1 - remaining / limit;
    const snapshot: RateLimitSnapshot = {
      endpoint,
      limit,
      remaining,
      resetEpochSeconds,
      usageRatio
    };

    if (usageRatio >= this.criticalThreshold) {
      this.logger.error('[pi-shield-gate] Critical API rate usage', snapshot);
    } else if (usageRatio >= this.warningThreshold) {
      this.logger.warn('[pi-shield-gate] Elevated API rate usage', snapshot);
    } else {
      this.logger.info('[pi-shield-gate] Rate usage', snapshot);
    }

    return snapshot;
  }
}
