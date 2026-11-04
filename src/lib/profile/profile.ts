import { parseRows, serializeLayer, type EditorState, type FnOverride } from '@/lib/editor';
import type { DeviceSettings } from '@/lib/device';
import { FN_LOCKED } from '@/lib/keymap';
import type { LightSettings } from '@/lib/lighting/describe';
import { readSettings, type ClockMode, type Settings } from '@/lib/settings';

export const PROFILE_APP = 'ak820-webhid';
export const PROFILE_VERSION = 1;

/** What an imported profile carries: the drafts, never a claim about the board. */
export type ParsedProfile = {
  readonly top: ReadonlyMap<number, FnOverride>;
  readonly fn: ReadonlyMap<number, FnOverride>;
  readonly device: DeviceSettings;
  readonly lighting: LightSettings;
  readonly clockMode: ClockMode;
};

export type ProfileReadResult =
  | { readonly ok: true; readonly profile: ParsedProfile }
  | { readonly ok: false; readonly problems: readonly string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (problem: string): ProfileReadResult => ({ ok: false, problems: [problem] });

/**
 * One file for a new machine: both key layers, the device settings, the
 * lighting and the clock mode. Rows use the same shape as `ak820.layers`, and
 * `applied` is left out on purpose, because a fresh keyboard has not been sent
 * anything yet.
 */
export function buildProfile(
  state: Pick<EditorState, 'top' | 'fn'>,
  settings: Settings,
  at: Date,
): string {
  return `${JSON.stringify(
    {
      app: PROFILE_APP,
      profile: PROFILE_VERSION,
      saved: at.toISOString(),
      keys: {
        top: serializeLayer(state.top).draft,
        fn: serializeLayer(state.fn).draft,
      },
      device: settings.device,
      lighting: settings.lighting,
      clock: { mode: settings.clock.mode },
    },
    null,
    2,
  )}\n`;
}

function countDropped(layer: string, raw: unknown, kept: number, problems: string[]): void {
  if (!Array.isArray(raw)) return;
  const dropped = raw.length - kept;
  if (dropped > 0) {
    problems.push(
      `${dropped} row${dropped === 1 ? '' : 's'} in the ${layer} layer could not be read.`,
    );
  }
}

/** Reads a profile file. Nothing is applied here; a failure lists what is wrong. */
export function readProfile(text: string): ProfileReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('The file is not JSON.');
  }

  if (!isRecord(raw)) return fail('The file does not hold a profile.');
  if (raw.app !== PROFILE_APP) return fail('This file was not written by this page.');
  if (raw.profile !== PROFILE_VERSION) {
    return fail(
      `This profile is version ${String(raw.profile)}; this page reads version ${PROFILE_VERSION}.`,
    );
  }

  const problems: string[] = [];
  const keys = isRecord(raw.keys) ? raw.keys : null;
  if (!keys) problems.push('The file has no key layers.');

  const top = parseRows(keys?.top);
  const fn = parseRows(keys?.fn);
  countDropped('top', keys?.top, top.size, problems);
  countDropped('Fn', keys?.fn, fn.size, problems);

  const locked = [...fn.keys()].filter((idx) => FN_LOCKED.has(idx));
  if (locked.length) {
    problems.push(
      `The Fn layer cannot hold keys ${locked.join(', ')}; the vendor layout locks them.`,
    );
  }

  if (!isRecord(raw.device)) problems.push('The file has no device settings.');
  if (!isRecord(raw.lighting)) problems.push('The file has no lighting settings.');

  if (problems.length) return { ok: false, problems };

  const settings = readSettings(
    JSON.stringify({
      lighting: raw.lighting,
      device: raw.device,
      clock: raw.clock,
      view: 'keys',
    }),
  );

  return {
    ok: true,
    profile: {
      top,
      fn,
      device: settings.device,
      lighting: settings.lighting,
      clockMode: settings.clock.mode,
    },
  };
}
