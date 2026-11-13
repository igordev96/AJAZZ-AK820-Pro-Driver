import { usageLabel } from '@/lib/keymap';
import type { EditorRow, Layer } from './types';

/**
 * One pending row as one line: what the key becomes when this upload lands.
 * The media page stays explicit, the same way the inspector shows it, and a
 * cleared Fn override says what the firmware will handle instead.
 */
export function describePendingChange(row: EditorRow, layer: Layer): string {
  const key = layer === 'fn' ? `Fn + ${row.name}` : row.name;
  const target =
    layer === 'fn' && row.usage === 0 ? 'firmware default' : usageLabel(row.usage, row.media);
  return `${key} → ${target}`;
}
