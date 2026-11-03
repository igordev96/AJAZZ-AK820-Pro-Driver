import { buildTable } from '@/lib/keymap';
import { describe, expect, it } from 'vitest';
import { pendingKeyPatches } from './patches';
import { createInitialState, editorReducer } from './state';
import type { EditorState } from './types';

const edit = (state: EditorState, idx: number, usage: number, media = false) =>
  editorReducer(editorReducer(state, { type: 'select', idx }), {
    type: 'usage',
    usage,
    media,
  });

const tableFor = (state: EditorState, rows = state.top) =>
  buildTable(rows, { layerFn: state.layer === 'fn' });

describe('pendingKeyPatches', () => {
  it('returns nothing when the draft matches the applied table', () => {
    expect(pendingKeyPatches(createInitialState().top, tableFor(createInitialState()))).toEqual([]);
  });

  it('takes the record the wired table would carry for that key', () => {
    const state = edit(createInitialState(), 55, 0x04);
    const [patch] = pendingKeyPatches(state.top, tableFor(state));

    expect(patch?.index).toBe(55);
    expect(Array.from(patch?.record ?? [])).toEqual([0x02, 0x00, 0x04, 0x00]);
  });

  it('keeps a media record little-endian', () => {
    const state = edit(createInitialState(), 55, 0xe2, true);
    const [patch] = pendingKeyPatches(state.top, tableFor(state));

    expect(Array.from(patch?.record ?? [])).toEqual([0x03, 0xe2, 0x00, 0x00]);
  });

  it('patches the Fn layer through the same table layout', () => {
    let state = editorReducer(createInitialState(), { type: 'layer', layer: 'fn' });
    state = edit(state, 56, 0xe2, true);
    const [patch] = pendingKeyPatches(state.fn, tableFor(state, state.fn));

    expect(patch?.index).toBe(56);
    expect(Array.from(patch?.record ?? [])).toEqual([0x03, 0xe2, 0x00, 0x00]);
  });

  it('lists one entry per pending key, in board order', () => {
    let state = edit(createInitialState(), 55, 0x04);
    state = edit(state, 20, 0x17);

    const patches = pendingKeyPatches(state.top, tableFor(state));

    expect(patches.map((patch) => patch.index)).toEqual([20, 55]);
  });
});
