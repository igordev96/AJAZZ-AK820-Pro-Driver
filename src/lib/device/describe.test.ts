import { describe, expect, it } from 'vitest';
import { describeSettings } from './describe';
import { DEFAULT_DEVICE_SETTINGS, type DeviceSettings } from './settings';

const summary = (patch: Partial<DeviceSettings> = {}) =>
  describeSettings({ ...DEFAULT_DEVICE_SETTINGS, ...patch });

describe('describeSettings', () => {
  it('names the level with its wired timing', () => {
    expect(summary().message).toBe('Sent. Level 1 (2-3 ms wired), sleep after 5 minutes.');
    expect(summary({ responseLevel: 4 }).message).toContain('Level 4 (13-14 ms wired)');
  });

  it('says no sleep when sleep is off', () => {
    expect(summary({ sleep: 0 }).message).toBe('Sent. Level 1 (2-3 ms wired), no sleep.');
  });

  it('lists one blocked shortcut', () => {
    expect(summary({ disableWindowsKey: true }).message).toBe(
      'Sent. Level 1 (2-3 ms wired), sleep after 5 minutes, the Windows key blocked.',
    );
  });

  it('joins two blocked shortcuts', () => {
    expect(summary({ disableAltF4: true, disableAltTab: true }).message).toContain(
      'Alt+Tab and Alt+F4 blocked',
    );
  });

  it('joins three without a comma before the last', () => {
    expect(
      summary({ disableAltTab: true, disableAltF4: true, disableWindowsKey: true }).message,
    ).toContain('Alt+Tab, Alt+F4 and the Windows key blocked');
  });

  it('puts every field in the log line', () => {
    const { log } = summary({
      responseLevel: 3,
      sleep: 3,
      disableAltTab: true,
      disableWindowsKey: true,
    });

    expect(log).toBe(
      'Device settings sent: level 3, sleep 30 minutes, blocked Alt+Tab and the Windows key.',
    );
  });

  it('says nothing is blocked when all flags are off', () => {
    expect(summary().log).toContain('nothing blocked');
  });
});
