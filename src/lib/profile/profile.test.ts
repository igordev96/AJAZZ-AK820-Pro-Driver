import { describe, expect, it } from 'vitest';
import { createInitialState, editorReducer, type EditorState } from '@/lib/editor';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { PROFILE_APP, PROFILE_VERSION, buildProfile, readProfile } from './profile';

const edit = (state: EditorState, idx: number, usage: number, media = false) =>
  editorReducer(editorReducer(state, { type: 'select', idx }), { type: 'usage', usage, media });

const sample = () => {
  let state = edit(createInitialState(), 55, 0x04);
  state = editorReducer(state, { type: 'layer', layer: 'fn' });
  state = edit(state, 56, 0xe2, true);

  return {
    state,
    settings: {
      ...DEFAULT_SETTINGS,
      device: { ...DEFAULT_SETTINGS.device, responseLevel: 4, disableWindowsKey: true },
      lighting: { ...DEFAULT_SETTINGS.lighting, mode: 5, color: '#00ff00' },
      perKey: {
        ...DEFAULT_SETTINGS.perKey,
        colors: { '39': '#ff0000' },
        sent: { '40': '#00ff00' },
        brightness: 3,
      },
      clock: { mode: 'custom' as const },
    },
  };
};

describe('profiles', () => {
  it('round-trips both layers, the device, the lighting and the clock mode', () => {
    const { state, settings } = sample();
    const text = buildProfile(state, settings, new Date('2026-11-04T10:00:00Z'));
    const result = readProfile(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect([...result.profile.top]).toEqual([[55, { usage: 0x04, media: false }]]);
    expect([...result.profile.fn]).toEqual([[56, { usage: 0xe2, media: true }]]);
    expect(result.profile.device.responseLevel).toBe(4);
    expect(result.profile.device.disableWindowsKey).toBe(true);
    expect(result.profile.lighting.mode).toBe(5);
    expect(result.profile.perKey.colors).toEqual({ '39': '#ff0000' });
    expect(result.profile.perKey.brightness).toBe(3);
    expect(result.profile.clockMode).toBe('custom');
  });

  it('writes the app tag, the version and the save date', () => {
    const { state, settings } = sample();
    const raw = JSON.parse(buildProfile(state, settings, new Date('2026-11-04T10:00:00Z')));

    expect(raw.app).toBe(PROFILE_APP);
    expect(raw.profile).toBe(PROFILE_VERSION);
    expect(raw.saved).toBe('2026-11-04T10:00:00.000Z');
    expect(raw.keys.applied).toBeUndefined();
    expect(raw.perKey.sent).toBeUndefined();
  });

  it('reads a file written before per-key colours existed', () => {
    const result = readProfile(
      JSON.stringify({
        app: PROFILE_APP,
        profile: 1,
        keys: { top: [], fn: [] },
        device: DEFAULT_SETTINGS.device,
        lighting: DEFAULT_SETTINGS.lighting,
        clock: { mode: 'now' },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.profile.perKey.colors).toEqual({});
    expect(result.profile.perKey.brightness).toBe(DEFAULT_SETTINGS.perKey.brightness);
  });

  it('reports painted keys it cannot read', () => {
    const result = readProfile(
      JSON.stringify({
        app: PROFILE_APP,
        profile: 1,
        keys: { top: [], fn: [] },
        device: DEFAULT_SETTINGS.device,
        lighting: DEFAULT_SETTINGS.lighting,
        perKey: { colors: { '39': 'red', '999': '#ffffff' }, brightness: 5 },
        clock: { mode: 'now' },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' ')).toMatch(/2 painted keys could not be read/);
  });

  it('refuses a file that is not one of ours', () => {
    expect(readProfile('{ not json').ok).toBe(false);
    expect(readProfile('[]').ok).toBe(false);

    const wrongApp = readProfile(JSON.stringify({ app: 'other', profile: 1 }));
    expect(wrongApp.ok).toBe(false);
    if (!wrongApp.ok) expect(wrongApp.problems[0]).toMatch(/not written by this page/);

    const future = readProfile(JSON.stringify({ app: PROFILE_APP, profile: 2 }));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.problems[0]).toMatch(/version 2/);
  });

  it('refuses a file with missing sections', () => {
    const result = readProfile(JSON.stringify({ app: PROFILE_APP, profile: 1 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContain('The file has no key layers.');
      expect(result.problems).toContain('The file has no device settings.');
      expect(result.problems).toContain('The file has no lighting settings.');
    }
  });

  it('reports rows it cannot use instead of dropping them silently', () => {
    const result = readProfile(
      JSON.stringify({
        app: PROFILE_APP,
        profile: 1,
        keys: {
          top: [
            [55, 4],
            [999, 4],
          ],
          fn: [[56, 0xe2, 1]],
        },
        device: DEFAULT_SETTINGS.device,
        lighting: DEFAULT_SETTINGS.lighting,
        clock: { mode: 'now' },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/1 row in the top layer/);
  });

  it('refuses an Fn row the vendor layout locks', () => {
    const result = readProfile(
      JSON.stringify({
        app: PROFILE_APP,
        profile: 1,
        keys: { top: [], fn: [[1, 0xe2, 1]] },
        device: DEFAULT_SETTINGS.device,
        lighting: DEFAULT_SETTINGS.lighting,
        clock: { mode: 'now' },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/locks them/);
  });
});
