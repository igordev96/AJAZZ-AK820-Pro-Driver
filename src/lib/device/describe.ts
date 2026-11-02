import { RESPONSE_LEVELS, SLEEP_OPTIONS, type DeviceSettings } from './settings';

export type SettingsDescription = {
  readonly message: string;
  readonly log: string;
};

const blocked = (settings: DeviceSettings): string[] => {
  const list: string[] = [];
  if (settings.disableAltTab) list.push('Alt+Tab');
  if (settings.disableAltF4) list.push('Alt+F4');
  if (settings.disableWindowsKey) list.push('the Windows key');
  return list;
};

const list = (items: readonly string[]): string => {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

/**
 * The confirmation after a settings write, built from the values that were
 * sent. There is no read-back, so it never claims what the keyboard holds now.
 */
export function describeSettings(settings: DeviceSettings): SettingsDescription {
  const level = RESPONSE_LEVELS.find((item) => item.level === settings.responseLevel);
  const sleep = SLEEP_OPTIONS.find((item) => item.value === settings.sleep);
  const sleepText = settings.sleep === 0 ? 'no sleep' : `sleep after ${sleep?.label.toLowerCase()}`;
  const levelText = level
    ? `Level ${level.level} (${level.wired} wired)`
    : `Level ${settings.responseLevel}`;
  const blockedText = blocked(settings);

  const message = `Sent. ${levelText}, ${sleepText}${blockedText.length ? `, ${list(blockedText)} blocked` : ''}.`;

  const log = [
    `Device settings sent: level ${settings.responseLevel}`,
    settings.sleep === 0 ? 'no sleep' : `sleep ${sleep?.label.toLowerCase()}`,
    blockedText.length ? `blocked ${list(blockedText)}` : 'nothing blocked',
  ].join(', ');

  return { message, log: `${log}.` };
}
