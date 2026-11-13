import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { describePendingChange } from './describe';
import type { EditorRow } from './types';

const rowFor = (name: string): EditorRow =>
  createInitialState().top.find((row) => row.name === name)!;

describe('describePendingChange', () => {
  it('names the key and what it will send on the top layer', () => {
    expect(describePendingChange({ ...rowFor('Esc'), usage: 0x39, applied: 0x29 }, 'top')).toBe(
      'Esc → CapsLock',
    );
  });

  it('keeps the media page explicit', () => {
    expect(
      describePendingChange({ ...rowFor('A'), usage: 0xe2, media: true, applied: 0x04 }, 'top'),
    ).toBe('A → Media: Mute');
  });

  it('prefixes the key with Fn on the Fn layer', () => {
    expect(
      describePendingChange({ ...rowFor('A'), usage: 0xe9, media: true, applied: 0 }, 'fn'),
    ).toBe('Fn + A → Media: Volume up');
  });

  it('says the firmware handles a cleared Fn override', () => {
    expect(
      describePendingChange(
        { ...rowFor('A'), usage: 0, media: false, applied: 0xe2, appliedMedia: true },
        'fn',
      ),
    ).toBe('Fn + A → firmware default');
  });
});
