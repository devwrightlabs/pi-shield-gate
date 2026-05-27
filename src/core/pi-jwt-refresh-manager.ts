import type { ShieldSession } from '../types/shield';

export interface JwtRefreshLogger {
  info: (message: string, meta?: Record<string, string | number | boolean>) => void;
  warn: (message: string, meta?: Record<string, string | number | boolean>) => void;
  error: (message: string, meta?: Record<string, string | number | boolean>) => void;
}

export interface PiJwtRefreshManagerOptions {
  getSession: () => Promise<ShieldSession | null>;
  refreshSession: (refreshToken: string) => Promise<ShieldSession>;
  onSessionUpdate?: (session: ShieldSession) => Promise<void> | void;
  onRefreshFailure?: (error: unknown) => Promise<void> | void;
  expiryLeewaySeconds?: number;
  logger?: JwtRefreshLogger;
}

/**
 * Prevents silent failures by refreshing expiring/expired tokens behind the scenes.
 */
export class PiJwtRefreshManager {
  private readonly options: PiJwtRefreshManagerOptions;
  private refreshInFlight: Promise<ShieldSession> | null = null;

  public constructor(options: PiJwtRefreshManagerOptions) {
    this.options = options;
  }

  /**
   * Returns a valid access token, refreshing the session if needed.
   */
  public async getValidAccessToken(): Promise<string | null> {
    const session = await this.options.getSession();
    if (!session) {
      return null;
    }

    if (this.isSessionExpiring(session)) {
      const refreshed = await this.refreshSafely(session.refreshToken);
      return refreshed.accessToken;
    }

    return session.accessToken;
  }

  /**
   * Wraps a network callback with guaranteed token freshness.
   */
  public async withFreshToken<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    const token = await this.getValidAccessToken();
    if (!token) {
      throw new Error('No active session is available for token refresh.');
    }

    return operation(token);
  }

  private isSessionExpiring(session: ShieldSession): boolean {
    const leewayMs = (this.options.expiryLeewaySeconds ?? 60) * 1000;
    return session.expiresAt <= Date.now() + leewayMs;
  }

  private async refreshSafely(refreshToken: string): Promise<ShieldSession> {
    if (!this.refreshInFlight) {
      this.options.logger?.info('Refreshing Pi/Supabase session token.');
      this.refreshInFlight = this.options
        .refreshSession(refreshToken)
        .then(async (nextSession) => {
          await this.options.onSessionUpdate?.(nextSession);
          return nextSession;
        })
        .catch(async (error: unknown) => {
          this.options.logger?.error('Token refresh failed.', { hasRefreshToken: Boolean(refreshToken) });
          await this.options.onRefreshFailure?.(error);
          throw error;
        })
        .finally(() => {
          this.refreshInFlight = null;
        });
    }

    return this.refreshInFlight;
  }
}
