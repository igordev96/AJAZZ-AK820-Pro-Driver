export const SETTINGS_RECORD_SIZE = 64;

/** Sleep index, captured 2 Nov 2026: 0 no sleep, 1 one minute, 2 five, 3 thirty. */
export type SleepIndex = 0 | 1 | 2 | 3;

export type DeviceSettings = {
  /** Key Response Time, 1 to 5. */
  readonly responseLevel: number;
  readonly sleep: SleepIndex;
  readonly disableAltTab: boolean;
  readonly disableAltF4: boolean;
  readonly disableWindowsKey: boolean;
};

export type ResponseLevel = {
  readonly level: number;
  /** The vendor app's figures, not measurements. Only wired is actionable here. */
  readonly wired: string;
  readonly wireless: string;
  readonly bluetooth: string;
};

export const RESPONSE_LEVELS: readonly ResponseLevel[] = [
  { level: 1, wired: '2-3 ms', wireless: '5-6 ms', bluetooth: '12-13 ms' },
  { level: 2, wired: '5-6 ms', wireless: '7-9 ms', bluetooth: '15-16 ms' },
  { level: 3, wired: '8-9 ms', wireless: '10-12 ms', bluetooth: '18-19 ms' },
  { level: 4, wired: '13-14 ms', wireless: '15-17 ms', bluetooth: '23-24 ms' },
  { level: 5, wired: '17-18 ms', wireless: '19-21 ms', bluetooth: '27-28 ms' },
];

export const SLEEP_OPTIONS: readonly { readonly value: SleepIndex; readonly label: string }[] = [
  { value: 0, label: 'No sleep' },
  { value: 1, label: '1 minute' },
  { value: 2, label: '5 minutes' },
  { value: 3, label: '30 minutes' },
];

/**
 * The vendor app's state when it wrote for the first time in the captures:
 * level 1 and a five minute sleep, with the three shortcuts left alone.
 */
export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  responseLevel: 1,
  sleep: 2,
  disableAltTab: false,
  disableAltF4: false,
  disableWindowsKey: false,
};

const flag = (value: boolean) => (value ? 1 : 0);

/**
 * The 64-byte settings record, from the captures of 2 Nov 2026:
 *
 *   00 01 00 00 00 00 00 00 00 00 … AA 55
 *      │  │  │  └ 4: disable Windows key
 *      │  │  └ 3: disable Alt+F4
 *      │  └ 2: disable Alt+Tab
 *      └ 1: fixed 01
 *
 * Byte 6 is the sleep index, byte 8 the response level, and both unknowns (5,
 * 7) are always zero in the captures. Every write carries the whole record, so
 * a field left out becomes zero on the keyboard.
 */
export function buildSettingsRecord(settings: DeviceSettings): Uint8Array {
  const { responseLevel, sleep } = settings;

  if (!Number.isInteger(responseLevel) || responseLevel < 1 || responseLevel > 5) {
    throw new Error('response level must be a whole number from 1 to 5');
  }
  if (!Number.isInteger(sleep) || sleep < 0 || sleep > 3) {
    throw new Error('sleep must be 0, 1, 2 or 3');
  }

  const record = new Uint8Array(SETTINGS_RECORD_SIZE);
  record[1] = 0x01;
  record[2] = flag(settings.disableAltTab);
  record[3] = flag(settings.disableAltF4);
  record[4] = flag(settings.disableWindowsKey);
  record[6] = sleep;
  record[8] = responseLevel;
  record[62] = 0xaa;
  record[63] = 0x55;

  return record;
}
