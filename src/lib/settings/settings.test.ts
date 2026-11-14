import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, readSettings, writeSettings } from './settings';

const stored = (value: unknown) => JSON.stringify(value);

describe('settings', () => {
  it('falls back to the defaults without stored text', () => {
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings('')).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips every field', () => {
    const settings = {
      lighting: {
        mode: 10,
        color: '#00ff00',
        brightness: 2,
        speed: 4,
        colorful: true,
        direction: 3,
      },
      clock: { mode: 'custom' as const },
      perKey: {
        colors: { '39': '#ff0000' },
        sent: { '40': '#00ff00' },
        brightness: 3,
        sentBrightness: 2,
        brush: '#00ff00',
      },
      lightTab: 'perKey' as const,
      device: {
        responseLevel: 4,
        sleep: 1 as const,
        disableAltTab: true,
        disableAltF4: false,
        disableWindowsKey: true,
      },
      deviceLastSent: null,
      view: 'light' as const,
    };

    expect(readSettings(writeSettings(settings))).toEqual(settings);
  });

  it('ignores unreadable text', () => {
    expect(readSettings('{ not json')).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(stored([]))).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(stored('nonsense'))).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the good fields beside a bad one', () => {
    const settings = readSettings(
      stored({ lighting: { mode: 10, color: 'orange', brightness: 9, speed: 4 } }),
    );

    expect(settings.lighting.mode).toBe(10);
    expect(settings.lighting.color).toBe(DEFAULT_SETTINGS.lighting.color);
    expect(settings.lighting.brightness).toBe(DEFAULT_SETTINGS.lighting.brightness);
    expect(settings.lighting.speed).toBe(4);
  });

  it('drops an effect that no longer exists', () => {
    const settings = readSettings(stored({ lighting: { mode: 99 } }));

    expect(settings.lighting.mode).toBe(DEFAULT_SETTINGS.lighting.mode);
  });

  it('only accepts the known views and clock modes', () => {
    expect(readSettings(stored({ view: 'nowhere' })).view).toBe('keys');
    expect(readSettings(stored({ view: 'screen' })).view).toBe('screen');
    expect(readSettings(stored({ clock: { mode: 'later' } })).clock.mode).toBe('now');
    expect(readSettings(stored({ clock: { mode: 'custom' } })).clock.mode).toBe('custom');
  });

  it('validates the device settings field by field', () => {
    const settings = readSettings(
      stored({
        device: {
          responseLevel: 9,
          sleep: 7,
          disableAltTab: 'yes',
          disableAltF4: true,
          disableWindowsKey: false,
        },
      }),
    );

    expect(settings.device.responseLevel).toBe(DEFAULT_SETTINGS.device.responseLevel);
    expect(settings.device.sleep).toBe(DEFAULT_SETTINGS.device.sleep);
    expect(settings.device.disableAltTab).toBe(false);
    expect(settings.device.disableAltF4).toBe(true);
    expect(settings.device.disableWindowsKey).toBe(false);
  });

  it('keeps a valid last-sent record and drops a broken one', () => {
    const sent = readSettings(
      stored({
        deviceLastSent: {
          at: 1_700_000_000_000,
          values: { responseLevel: 3, sleep: 1, disableAltTab: true },
        },
      }),
    );

    expect(sent.deviceLastSent?.at).toBe(1_700_000_000_000);
    expect(sent.deviceLastSent?.values.responseLevel).toBe(3);
    expect(sent.deviceLastSent?.values.disableAltTab).toBe(true);
    expect(sent.deviceLastSent?.values.disableWindowsKey).toBe(false);

    expect(
      readSettings(stored({ deviceLastSent: { at: 'late', values: {} } })).deviceLastSent,
    ).toBe(null);
    expect(readSettings(stored({ deviceLastSent: { at: 42 } })).deviceLastSent).toBe(null);
    expect(readSettings(stored({ deviceLastSent: 'yesterday' })).deviceLastSent).toBe(null);
  });

  it('writes a version with the values', () => {
    expect(JSON.parse(writeSettings(DEFAULT_SETTINGS))).toMatchObject({
      version: 1,
      view: 'keys',
      clock: { mode: 'now' },
    });
  });

  it('validates the per-key draft key by key', () => {
    const settings = readSettings(
      stored({
        perKey: {
          colors: {
            '39': '#FF0000',
            '40': 'green',
            '999': '#ffffff',
            abc: '#ffffff',
          },
          sent: { '41': '#0000ff' },
          brightness: 9,
          sentBrightness: 12,
          brush: 'orange',
        },
      }),
    );

    expect(settings.perKey.colors).toEqual({ '39': '#ff0000' });
    expect(settings.perKey.sent).toEqual({ '41': '#0000ff' });
    expect(settings.perKey.brightness).toBe(DEFAULT_SETTINGS.perKey.brightness);
    expect(settings.perKey.sentBrightness).toBe(null);
    expect(settings.perKey.brush).toBe(DEFAULT_SETTINGS.perKey.brush);
  });

  it('keeps a valid last-sent brightness', () => {
    expect(
      readSettings(stored({ perKey: { sentBrightness: 3, brightness: 5 } })).perKey,
    ).toMatchObject({ sentBrightness: 3, brightness: 5 });
    expect(readSettings(stored({ perKey: { sentBrightness: null } })).perKey.sentBrightness).toBe(
      null,
    );
  });

  it('only accepts the known light tabs', () => {
    expect(readSettings(stored({ lightTab: 'nowhere' })).lightTab).toBe('effect');
    expect(readSettings(stored({ lightTab: 'perKey' })).lightTab).toBe('perKey');
  });
});
