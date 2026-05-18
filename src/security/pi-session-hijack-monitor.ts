import type { NetworkSignature } from '../types/shield';

export interface SessionHijackMonitorOptions {
  pollIntervalMs?: number;
  getNetworkSignature: () => Promise<NetworkSignature>;
  onHijackDetected?: (details: { previous: NetworkSignature; current: NetworkSignature }) => Promise<void> | void;
  revokeSession: () => Promise<void>;
}

/**
 * Watches for abrupt network identity changes and revokes stolen sessions.
 */
export class PiSessionHijackMonitor {
  private readonly options: SessionHijackMonitorOptions;
  private timerId: number | null = null;
  private baseline: NetworkSignature | null = null;

  public constructor(options: SessionHijackMonitorOptions) {
    this.options = options;
  }

  /**
   * Starts periodic signature checks.
   */
  public async start(): Promise<void> {
    this.baseline = await this.options.getNetworkSignature();
    const interval = this.options.pollIntervalMs ?? 30_000;

    this.timerId = window.setInterval(async () => {
      await this.tick();
    }, interval);
  }

  /**
   * Stops periodic checks.
   */
  public stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private async tick(): Promise<void> {
    if (!this.baseline) {
      return;
    }

    const current = await this.options.getNetworkSignature();
    const isHijack = current.userAgent !== this.baseline.userAgent || current.ipHash !== this.baseline.ipHash;

    if (!isHijack) {
      return;
    }

    await this.options.onHijackDetected?.({ previous: this.baseline, current });
    await this.options.revokeSession();
    this.stop();
  }
}
