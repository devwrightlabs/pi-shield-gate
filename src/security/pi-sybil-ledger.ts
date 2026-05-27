import type { PiUid } from '../types/shield';

export interface SybilLedgerOptions {
  initialBlockedUids?: Iterable<PiUid>;
  registryEndpoint?: string;
  fetchImpl?: typeof fetch;
}

export interface SybilDecision {
  blocked: boolean;
  source: 'local' | 'remote' | 'none';
}

interface RemoteLookupResponse {
  blocked: boolean;
}

async function hashUid(uid: string): Promise<string> {
  const bytes = new TextEncoder().encode(uid);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Maintains local/remote bad-actor checks to terminate known Sybil participants quickly.
 */
export class PiSybilLedger {
  private readonly blockedUids: Set<PiUid>;
  private readonly registryEndpoint: string | undefined;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: SybilLedgerOptions = {}) {
    this.blockedUids = new Set(options.initialBlockedUids ?? []);
    this.registryEndpoint = options.registryEndpoint;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Adds UID to local deny-list.
   */
  public blockUid(uid: PiUid): void {
    this.blockedUids.add(uid);
  }

  /**
   * Resolves whether a UID should be blocked based on local and remote registries.
   */
  public async evaluate(uid: PiUid): Promise<SybilDecision> {
    if (this.blockedUids.has(uid)) {
      return { blocked: true, source: 'local' };
    }

    if (!this.registryEndpoint) {
      return { blocked: false, source: 'none' };
    }

    const hashedUid = await hashUid(uid);
    const url = new URL(this.registryEndpoint);
    url.searchParams.set('uid_hash', hashedUid);

    const response = await this.fetchImpl(url.toString(), { method: 'GET' });
    if (!response.ok) {
      return { blocked: false, source: 'none' };
    }

    const data = (await response.json()) as Partial<RemoteLookupResponse>;
    if (data.blocked) {
      this.blockedUids.add(uid);
      return { blocked: true, source: 'remote' };
    }

    return { blocked: false, source: 'none' };
  }
}
