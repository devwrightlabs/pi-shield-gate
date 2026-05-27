import type { PiUid } from '../types/shield';

export interface UserDataExport<Row> {
  userUid: PiUid;
  exportedAt: string;
  rowCount: number;
  rows: Row[];
}

/**
 * Builds normalized JSON export payload for user data portability requests.
 */
export function serializeUserDataExport<Row>(userUid: PiUid, rows: Row[]): string {
  const payload: UserDataExport<Row> = {
    userUid,
    exportedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Creates a downloadable JSON export in browsers; returns JSON payload for non-browser runtimes.
 */
export async function exportUserData<Row>(
  userUid: PiUid,
  fetchRows: (uid: PiUid) => Promise<Row[]>,
  fileName?: string
): Promise<string> {
  const rows = await fetchRows(userUid);
  const json = serializeUserDataExport(userUid, rows);

  if (typeof window === 'undefined') {
    return json;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName ?? `pi-user-export-${userUid}.json`;
  anchor.click();
  URL.revokeObjectURL(url);

  return json;
}
