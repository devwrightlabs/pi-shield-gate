export interface EphemeralInsertResult<Row> {
  row: Row;
  expiresAt: number;
  cleanup: () => Promise<void>;
}

export interface EphemeralInsertOptions<Row> {
  ttlMs: number;
  insert: () => Promise<Row>;
  deleteRow: (row: Row) => Promise<void>;
}

/**
 * Wraps inserts in a strict TTL envelope and provides guaranteed cleanup hooks.
 */
export async function insertEphemeralRow<Row>(options: EphemeralInsertOptions<Row>): Promise<EphemeralInsertResult<Row>> {
  const row = await options.insert();
  const expiresAt = Date.now() + options.ttlMs;

  const cleanup = async (): Promise<void> => {
    await options.deleteRow(row);
  };

  return {
    row,
    expiresAt,
    cleanup
  };
}

/**
 * Binds cleanup callback to browser session termination events.
 */
export function bindEphemeralCleanup(cleanup: () => Promise<void>): () => void {
  const handler = (): void => {
    void cleanup();
  };

  window.addEventListener('pagehide', handler);
  window.addEventListener('beforeunload', handler);

  return () => {
    window.removeEventListener('pagehide', handler);
    window.removeEventListener('beforeunload', handler);
  };
}
