import type { DeviceSettings, SleepIndex } from '../device';
import { DEFAULT_DEVICE_SETTINGS } from '../device';
import type { LightSettings } from '../lighting/describe';
import {
  LIGHT_MAX_BRIGHTNESS,
  LIGHT_MAX_SPEED,
  LIGHT_MIN_BRIGHTNESS,
  LIGHT_MIN_SPEED,
  LIGHT_MODES,
} from '../lighting/record';

export const SETTINGS_STORE = 'ak820.settings';

const VERSION = 1;

export type View = 'keys' | 'screen' | 'light' | 'device';

export type ClockMode = 'now' | 'custom';

export type DeviceLastSent = {
  /** The values that were sent, so the panel can tell them from the draft. */
  readonly values: DeviceSettings;
  /** When the write succeeded, as a Unix timestamp in milliseconds. */
  readonly at: number;
};

export type Settings = {
  readonly lighting: LightSettings;
  readonly clock: { readonly mode: ClockMode };
  readonly device: DeviceSettings;
  readonly deviceLastSent: DeviceLastSent | null;
  readonly view: View;
};

export const DEFAULT_SETTINGS: Settings = {
  lighting: {
    mode: 1,
    color: '#ff8000',
    brightness: 5,
    speed: 3,
    colorful: false,
    direction: 0,
  },
  clock: { mode: 'now' },
  device: DEFAULT_DEVICE_SETTINGS,
  deviceLastSent: null,
  view: 'keys',
};

const HEX = /^#[0-9a-f]{6}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const whole = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;

function readLighting(raw: unknown): LightSettings {
  const fallback = DEFAULT_SETTINGS.lighting;
  if (!isRecord(raw)) return fallback;

  const mode = LIGHT_MODES.find((item) => item.id === raw.mode)?.id ?? fallback.mode;

  return {
    mode,
    color:
      typeof raw.color === 'string' && HEX.test(raw.color)
        ? raw.color.toLowerCase()
        : fallback.color,
    brightness: whole(
      raw.brightness,
      LIGHT_MIN_BRIGHTNESS,
      LIGHT_MAX_BRIGHTNESS,
      fallback.brightness,
    ),
    speed: whole(raw.speed, LIGHT_MIN_SPEED, LIGHT_MAX_SPEED, fallback.speed),
    colorful: typeof raw.colorful === 'boolean' ? raw.colorful : fallback.colorful,
    direction: whole(raw.direction, 0, 3, fallback.direction),
  };
}

const sleepIndex = (value: unknown): SleepIndex =>
  value === 0 || value === 1 || value === 2 || value === 3 ? value : DEFAULT_DEVICE_SETTINGS.sleep;

function readDeviceLastSent(raw: unknown): DeviceLastSent | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.at !== 'number' || !Number.isFinite(raw.at) || raw.at <= 0) return null;
  if (!isRecord(raw.values)) return null;

  return { values: readDevice(raw.values), at: raw.at };
}

function readDevice(raw: unknown): DeviceSettings {
  const fallback = DEFAULT_DEVICE_SETTINGS;
  if (!isRecord(raw)) return fallback;

  return {
    responseLevel: whole(raw.responseLevel, 1, 5, fallback.responseLevel),
    sleep: sleepIndex(raw.sleep),
    disableAltTab:
      typeof raw.disableAltTab === 'boolean' ? raw.disableAltTab : fallback.disableAltTab,
    disableAltF4: typeof raw.disableAltF4 === 'boolean' ? raw.disableAltF4 : fallback.disableAltF4,
    disableWindowsKey:
      typeof raw.disableWindowsKey === 'boolean'
        ? raw.disableWindowsKey
        : fallback.disableWindowsKey,
  };
}

/**
 * Reads the stored settings. Every field is validated on its own, so one bad
 * value costs only that value; unreadable JSON falls back to the defaults.
 */
export function readSettings(text: string | null): Settings {
  if (!text) return DEFAULT_SETTINGS;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }

  if (!isRecord(raw)) return DEFAULT_SETTINGS;

  const clock = isRecord(raw.clock) ? raw.clock.mode : null;
  const view = raw.view;

  return {
    lighting: readLighting(raw.lighting),
    clock: { mode: clock === 'custom' ? 'custom' : 'now' },
    device: readDevice(raw.device),
    deviceLastSent: readDeviceLastSent(raw.deviceLastSent),
    view: view === 'screen' || view === 'light' || view === 'device' ? view : 'keys',
  };
}

export function writeSettings(settings: Settings): string {
  return JSON.stringify({ version: VERSION, ...settings });
}
