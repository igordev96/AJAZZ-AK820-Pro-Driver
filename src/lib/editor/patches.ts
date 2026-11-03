import type { EditorRow } from './types';

export type PendingPatch = {
  /** The key's index on the board. */
  readonly index: number;
  /** The four bytes the wired table would carry in that key's slot. */
  readonly record: Uint8Array;
};

/**
 * The per-key writes the 2.4 GHz receiver takes: the record at `idx * 4` in the
 * table the wired path would have sent, one entry per pending key. Using the
 * table keeps the encoder (modifier rewrites, media records, disabled keys) as
 * the only place a record is built.
 */
export function pendingKeyPatches(rows: readonly EditorRow[], table: Uint8Array): PendingPatch[] {
  const patches: PendingPatch[] = [];

  for (const row of rows) {
    if (row.usage === row.applied && row.media === row.appliedMedia) continue;

    const start = row.idx * 4;
    patches.push({ index: row.idx, record: table.slice(start, start + 4) });
  }

  return patches;
}
