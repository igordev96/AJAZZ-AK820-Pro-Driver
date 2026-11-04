import { FACTORY_KEYS } from '@/lib/keymap';
import type { EditorRow, EditorState, FnOverride } from './types';

export const LAYERS_STORE = 'ak820.layers';

/** Keys written by earlier versions. Read once, then removed. */
export const FN_STORE = 'ak820.fn.overrides';
export const TOP_STORE = 'ak820.top.layer';

const LEGACY_KEYS = [FN_STORE, TOP_STORE] as const;
const VERSION = 1;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type LayerRows = {
  /** What the editor shows. */
  readonly draft: ReadonlyMap<number, FnOverride>;
  /** What the last confirmed upload sent from this browser. */
  readonly applied: ReadonlyMap<number, FnOverride>;
};

export type StoredLayers = {
  readonly top: LayerRows;
  readonly fn: LayerRows;
};

const emptyLayer = (): LayerRows => ({ draft: new Map(), applied: new Map() });

export const EMPTY_LAYERS: StoredLayers = { top: emptyLayer(), fn: emptyLayer() };

const KEY_INDICES: ReadonlySet<number> = new Set(FACTORY_KEYS.map((key) => key.idx));

const safeRead = (storage: StorageLike, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const parse = (text: string | null): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads `[idx, usage]` or `[idx, usage, 1]` rows, dropping anything unusable. */
export function parseRows(raw: unknown): Map<number, FnOverride> {
  const overrides = new Map<number, FnOverride>();
  if (!Array.isArray(raw)) return overrides;

  for (const row of raw) {
    if (!Array.isArray(row)) continue;

    const [rawIdx, rawUsage, flag] = row as unknown[];
    if (typeof rawIdx !== 'number' || typeof rawUsage !== 'number') continue;
    if (!Number.isInteger(rawIdx) || !Number.isInteger(rawUsage) || rawUsage <= 0) continue;
    if (!KEY_INDICES.has(rawIdx)) continue;

    // Old rows are [idx, usage]; media rows append 1. A stored value above 0xE7 (except Fn)
    // can only be a consumer usage, so migrate rows written before media existed.
    const media = flag === 1 || flag === true || (rawUsage > 0xe7 && rawUsage !== 0xaf);
    if (rawUsage > (media ? 0xffff : 0xff)) continue;

    overrides.set(rawIdx, { usage: rawUsage, media });
  }

  return overrides;
}

function readLayer(raw: unknown): LayerRows {
  if (!isRecord(raw)) return emptyLayer();
  return { draft: parseRows(raw.draft), applied: parseRows(raw.applied) };
}

/**
 * Earlier versions kept the Fn overrides and the top layer in separate keys and
 * separate shapes, and the Fn rows were only ever written after an upload. Both
 * arrive here as one layer object, with the two halves equal to the uploaded
 * table.
 */
function readLegacy(storage: StorageLike): StoredLayers {
  const fnRows = parseRows(parse(safeRead(storage, FN_STORE)));
  const top = parse(safeRead(storage, TOP_STORE));
  const topLayer = isRecord(top) ? readLayer(top) : emptyLayer();

  return {
    top: topLayer,
    fn: { draft: new Map(fnRows), applied: new Map(fnRows) },
  };
}

export function loadLayers(storage: StorageLike): StoredLayers {
  const current = parse(safeRead(storage, LAYERS_STORE));

  if (isRecord(current)) {
    return { top: readLayer(current.top), fn: readLayer(current.fn) };
  }

  return readLegacy(storage);
}

/**
 * The draft and applied halves of one layer in the stored
 * `[idx, usage]` / `[idx, usage, 1]` shape, which a profile reuses.
 */
export function serializeLayer(rows: readonly EditorRow[]) {
  const draft = rows
    .filter((row) => row.usage !== row.factory || row.media !== row.factoryMedia)
    .map((row) => (row.media ? [row.idx, row.usage, 1] : [row.idx, row.usage]));
  const applied = rows
    .filter((row) => row.applied !== row.factory || row.appliedMedia !== row.factoryMedia)
    .map((row) => (row.appliedMedia ? [row.idx, row.applied, 1] : [row.idx, row.applied]));

  return { draft, applied };
}

/**
 * Writes both layers in one object. Each layer keeps the draft and the table the
 * last commit sent, because the app cannot read the keyboard back: the pending
 * mark has to survive a reload to stay honest.
 */
export function saveLayers(storage: StorageLike, state: Pick<EditorState, 'top' | 'fn'>): void {
  const top = serializeLayer(state.top);
  const fn = serializeLayer(state.fn);
  const empty = !top.draft.length && !top.applied.length && !fn.draft.length && !fn.applied.length;

  if (empty) storage.removeItem(LAYERS_STORE);
  else storage.setItem(LAYERS_STORE, JSON.stringify({ version: VERSION, top, fn }));

  // The old keys are superseded; only drop them once the write above succeeded.
  for (const key of LEGACY_KEYS) storage.removeItem(key);
}
