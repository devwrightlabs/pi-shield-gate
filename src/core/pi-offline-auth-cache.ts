import type { ShieldSession } from '../types/shield';

interface CachedEnvelope {
  iv: number[];
  ciphertext: number[];
}

export interface OfflineAuthCacheOptions {
  dbName?: string;
  storeName?: string;
  keyName?: string;
  encryptionKeyProvider: () => Promise<ArrayBuffer>;
}

const DEFAULT_DB_NAME = 'pi_shield_gate';
const DEFAULT_STORE_NAME = 'auth_cache';
const DEFAULT_KEY_NAME = 'active_session';

/**
 * Encrypted IndexedDB session cache for instant app boot while network auth verifies.
 */
export class PiOfflineAuthCache {
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly keyName: string;
  private readonly encryptionKeyProvider: () => Promise<ArrayBuffer>;

  public constructor(options: OfflineAuthCacheOptions) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME;
    this.keyName = options.keyName ?? DEFAULT_KEY_NAME;
    this.encryptionKeyProvider = options.encryptionKeyProvider;
  }

  /**
   * Writes encrypted session payload to IndexedDB.
   */
  public async saveSession(session: ShieldSession): Promise<void> {
    if (!this.isSupported()) {
      return;
    }

    const encrypted = await this.encrypt(JSON.stringify(session));
    const db = await this.openDb();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(encrypted, this.keyName);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to store encrypted session.'));
    });

    db.close();
  }

  /**
   * Reads and decrypts cached session payload from IndexedDB.
   */
  public async loadSession(): Promise<ShieldSession | null> {
    if (!this.isSupported()) {
      return null;
    }

    const db = await this.openDb();

    const envelope = await new Promise<CachedEnvelope | undefined>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(this.keyName);
      request.onsuccess = () => resolve(request.result as CachedEnvelope | undefined);
      request.onerror = () => reject(request.error ?? new Error('Failed to read encrypted session.'));
    });

    db.close();

    if (!envelope) {
      return null;
    }

    const decrypted = await this.decrypt(envelope);
    return JSON.parse(decrypted) as ShieldSession;
  }

  /**
   * Clears cached session data.
   */
  public async clearSession(): Promise<void> {
    if (!this.isSupported()) {
      return;
    }

    const db = await this.openDb();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(this.keyName);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear encrypted session.'));
    });

    db.close();
  }

  private isSupported(): boolean {
    return typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && Boolean(crypto.subtle);
  }

  private async openDb(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB cache.'));
    });
  }

  private async importKey(): Promise<CryptoKey> {
    const keyBuffer = await this.encryptionKeyProvider();
    return crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  private async encrypt(plaintext: string): Promise<CachedEnvelope> {
    const key = await this.importKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

    return {
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext))
    };
  }

  private async decrypt(envelope: CachedEnvelope): Promise<string> {
    const key = await this.importKey();
    const iv = new Uint8Array(envelope.iv);
    const ciphertext = new Uint8Array(envelope.ciphertext);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  }
}
