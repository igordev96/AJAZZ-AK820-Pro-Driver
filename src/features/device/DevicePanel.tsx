import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusNote } from '@/components/status-note';
import {
  DEFAULT_DEVICE_SETTINGS,
  RESPONSE_LEVELS,
  SLEEP_OPTIONS,
  type DeviceSettings,
  type SleepIndex,
} from '@/lib/device';
import { cn } from '@/lib/utils';

export type DeviceStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'ok'; readonly message: string }
  | { readonly kind: 'err'; readonly message: string };

export type DevicePanelProps = {
  connected: boolean;
  busy: boolean;
  status: DeviceStatus;
  onApply: (settings: DeviceSettings) => void;
  /** True when the page reached the keyboard through the 2.4 GHz receiver. */
  wireless?: boolean;
};

const flagRow = 'rounded-control border border-line bg-ink px-3 py-2.5';

export function DevicePanel({
  connected,
  busy,
  status,
  onApply,
  wireless = false,
}: DevicePanelProps) {
  const [settings, setSettings] = useState<DeviceSettings>(DEFAULT_DEVICE_SETTINGS);
  const change = (patch: Partial<DeviceSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  return (
    <>
      <section className="flex min-w-0 flex-col gap-4">
        <div className="rounded-panel border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Response time</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            The vendor app's figures. This page writes over {wireless ? '2.4 GHz' : 'USB'}, so the{' '}
            {wireless ? '2.4 GHz' : 'wired'} column is the one it applies; the other two describe
            the keyboard on its other links.
          </p>

          <table className="mt-3 w-full text-left text-xs">
            <caption className="sr-only">Key response time per level and link</caption>
            <thead>
              <tr className="text-[11px] text-muted">
                <th scope="col" className="pb-1.5 font-medium">
                  Level
                </th>
                <th scope="col" className="pb-1.5 font-medium">
                  Wired
                </th>
                <th scope="col" className="pb-1.5 font-medium">
                  2.4 GHz
                </th>
                <th scope="col" className="pb-1.5 font-medium">
                  Bluetooth
                </th>
              </tr>
            </thead>
            <tbody>
              {RESPONSE_LEVELS.map((level) => (
                <tr
                  key={level.level}
                  className={cn(
                    'border-t border-line/60',
                    level.level === settings.responseLevel ? 'text-ivory' : 'text-muted',
                  )}
                >
                  <td className="py-1.5 font-mono">{level.level}</td>
                  <td className="py-1.5 font-mono">{level.wired}</td>
                  <td className="py-1.5 font-mono">{level.wireless}</td>
                  <td className="py-1.5 font-mono">{level.bluetooth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <aside className="h-fit rounded-panel border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Set the device</h2>

          <div className="mt-4 space-y-1.5">
            <label htmlFor="device-level" className="block text-xs text-muted">
              Key response time
            </label>
            <Select
              value={String(settings.responseLevel)}
              onValueChange={(value) => change({ responseLevel: Number(value) })}
            >
              <SelectTrigger id="device-level" aria-label="Key response time" disabled={busy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESPONSE_LEVELS.map((level) => (
                  <SelectItem key={level.level} value={String(level.level)}>
                    Level {level.level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 space-y-1.5">
            <label htmlFor="device-sleep" className="block text-xs text-muted">
              Sleep time
            </label>
            <Select
              value={String(settings.sleep)}
              onValueChange={(value) => change({ sleep: Number(value) as SleepIndex })}
            >
              <SelectTrigger id="device-sleep" aria-label="Sleep time" disabled={busy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLEEP_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="mt-4 space-y-2">
            <legend className="mb-1.5 block text-xs text-muted">Block these shortcuts</legend>

            <div className={cn(flagRow, 'flex items-center gap-3')}>
              <Checkbox
                id="device-win"
                checked={settings.disableWindowsKey}
                disabled={busy}
                aria-labelledby="device-win-label"
                onCheckedChange={(checked) => change({ disableWindowsKey: checked === true })}
              />
              <span id="device-win-label" className="text-xs text-ivory">
                Windows key
              </span>
            </div>

            <div className={cn(flagRow, 'flex items-center gap-3')}>
              <Checkbox
                id="device-altf4"
                checked={settings.disableAltF4}
                disabled={busy}
                aria-labelledby="device-altf4-label"
                onCheckedChange={(checked) => change({ disableAltF4: checked === true })}
              />
              <span id="device-altf4-label" className="text-xs text-ivory">
                Alt + F4
              </span>
            </div>

            <div className={cn(flagRow, 'flex items-center gap-3')}>
              <Checkbox
                id="device-alttab"
                checked={settings.disableAltTab}
                disabled={busy}
                aria-labelledby="device-alttab-label"
                onCheckedChange={(checked) => change({ disableAltTab: checked === true })}
              />
              <span id="device-alttab-label" className="text-xs text-ivory">
                Alt + Tab
              </span>
            </div>
          </fieldset>

          <div className="mt-4">
            <Button disabled={!connected || busy} onClick={() => onApply(settings)}>
              {busy ? 'Sending…' : 'Apply settings'}
            </Button>
          </div>

          <div aria-live="polite">
            {status.kind === 'ok' ? (
              <StatusNote tone="ok" className="mt-3">
                {status.message}
              </StatusNote>
            ) : null}
            {status.kind === 'err' ? (
              <StatusNote tone="err" className="mt-3">
                {status.message}
              </StatusNote>
            ) : null}
            {!connected && status.kind === 'idle' ? (
              <StatusNote tone="muted" className="mt-3">
                Connect the keyboard to change these.
              </StatusNote>
            ) : null}
          </div>

          <p className="mt-4 border-t border-line/60 pt-3 text-[11px] leading-relaxed text-muted">
            The keyboard does not report these values back, so this page shows what it will send,
            not what the board holds. One write sends all five.
          </p>

          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            The board does not keep the shortcut blocks through a power cycle. After a power-off the
            Windows key typed its shortcut again (Test 21, over 2.4 GHz), so send the settings once
            more after switching the keyboard off. The wired link is untested.
          </p>
        </aside>
      </div>
    </>
  );
}
