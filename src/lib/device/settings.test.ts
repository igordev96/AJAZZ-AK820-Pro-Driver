import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_SETTINGS,
  RESPONSE_LEVELS,
  SLEEP_OPTIONS,
  SETTINGS_RECORD_SIZE,
  buildSettingsRecord,
  type DeviceSettings,
} from './settings';

const record = (patch: Partial<DeviceSettings> = {}) =>
  buildSettingsRecord({ ...DEFAULT_DEVICE_SETTINGS, ...patch });

describe('buildSettingsRecord', () => {
  it('writes a 64-byte record with the captured header and trailer', () => {
    const bytes = record();

    expect(bytes).toHaveLength(SETTINGS_RECORD_SIZE);
    expect(bytes[0]).toBe(0x00);
    expect(bytes[1]).toBe(0x01);
    expect(bytes[62]).toBe(0xaa);
    expect(bytes[63]).toBe(0x55);
  });

  it('puts the response level at offset 8', () => {
    expect(record({ responseLevel: 1 })[8]).toBe(0x01);
    expect(record({ responseLevel: 5 })[8]).toBe(0x05);
  });

  it('puts the sleep index at offset 6', () => {
    expect(record({ sleep: 0 })[6]).toBe(0);
    expect(record({ sleep: 1 })[6]).toBe(1);
    expect(record({ sleep: 2 })[6]).toBe(2);
    expect(record({ sleep: 3 })[6]).toBe(3);
  });

  it('gives each shortcut its own byte, as the captures showed', () => {
    const altTab = record({ disableAltTab: true });
    const altF4 = record({ disableAltF4: true });
    const windows = record({ disableWindowsKey: true });

    expect([altTab[2], altTab[3], altTab[4]]).toEqual([1, 0, 0]);
    expect([altF4[2], altF4[3], altF4[4]]).toEqual([0, 1, 0]);
    expect([windows[2], windows[3], windows[4]]).toEqual([0, 0, 1]);
  });

  it('carries every field at once, because the record is a snapshot', () => {
    const bytes = record({
      responseLevel: 4,
      sleep: 3,
      disableAltTab: true,
      disableAltF4: true,
      disableWindowsKey: true,
    });

    expect(bytes[8]).toBe(4);
    expect(bytes[6]).toBe(3);
    expect([bytes[2], bytes[3], bytes[4]]).toEqual([1, 1, 1]);
  });

  it('leaves the unknown bytes at zero', () => {
    const bytes = record({ responseLevel: 5, sleep: 3, disableWindowsKey: true });

    for (const offset of [0, 5, 7, 9, 10, 61]) {
      expect(bytes[offset]).toBe(0);
    }
  });

  it('refuses a level outside 1 to 5', () => {
    expect(() => record({ responseLevel: 0 })).toThrow('1 to 5');
    expect(() => record({ responseLevel: 6 })).toThrow('1 to 5');
    expect(() => record({ responseLevel: 2.5 })).toThrow('1 to 5');
  });

  it('refuses a sleep index outside 0 to 3', () => {
    expect(() => buildSettingsRecord({ ...DEFAULT_DEVICE_SETTINGS, sleep: -1 as never })).toThrow(
      '0, 1, 2 or 3',
    );
  });
});

describe('the option lists', () => {
  it('has five response levels with the vendor figures', () => {
    expect(RESPONSE_LEVELS.map((level) => level.level)).toEqual([1, 2, 3, 4, 5]);
    expect(RESPONSE_LEVELS[0]).toMatchObject({
      wired: '2-3 ms',
      wireless: '5-6 ms',
      bluetooth: '12-13 ms',
    });
    expect(RESPONSE_LEVELS[4]).toMatchObject({ wired: '17-18 ms' });
  });

  it('offers four sleep values in the captured order', () => {
    expect(SLEEP_OPTIONS.map((option) => option.value)).toEqual([0, 1, 2, 3]);
    expect(SLEEP_OPTIONS.map((option) => option.label)).toEqual([
      'No sleep',
      '1 minute',
      '5 minutes',
      '30 minutes',
    ]);
  });
});
