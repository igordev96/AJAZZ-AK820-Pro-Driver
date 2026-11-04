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
import { UsbOnlyBadge } from '@/components/usb-only-badge';
import { updateSettings, useSettings } from '@/features/settings/useSettings';
import {
  RESPONSE_LEVELS,
  SLEEP_OPTIONS,
  sameDeviceSettings,
  type DeviceSettings,
  type SleepIndex,
} from '@/lib/device';
import type { DeviceLastSent } from '@/lib/settings';
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
  /** The last write this browser completed, if there is one. */
  lastSent?: DeviceLastSent | null;
};

const flagRow = 'rounded-control border border-line bg-ink px-3 py-2.5';

const sentTime = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function DevicePanel({
  connected,
  busy,
  status,
  onApply,
  wireless = false,
  lastSent = null,
}: DevicePanelProps) {
  // The draft lives in the settings store, next to the clock and the light, so
  // a reload shows the values that would be sent instead of the defaults.
  const settings = useSettings((stored) => stored.device);
  const change = (patch: Partial<DeviceSettings>) => {
    updateSettings({ device: { ...settings, ...patch } });
  };

  const unchanged = lastSent ? sameDeviceSettings(settings, lastSent.values) : false;
  const sentLabel = lastSent ? sentTime.format(new Date(lastSent.at)) : null;

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

            <div className={cn(flagRow, 'flex items-center gap-3', wireless && 'opacity-70')}>
              <Checkbox
                id="device-altf4"
                checked={settings.disableAltF4}
                disabled={busy || wireless}
                aria-labelledby="device-altf4-label"
                aria-describedby={wireless ? 'device-wireless-blocks' : undefined}
                onCheckedChange={(checked) => change({ disableAltF4: checked === true })}
              />
              <span id="device-altf4-label" className="text-xs text-ivory">
                Alt + F4
              </span>
              {wireless ? <UsbOnlyBadge className="ml-auto" /> : null}
            </div>

            <div className={cn(flagRow, 'flex items-center gap-3', wireless && 'opacity-70')}>
              <Checkbox
                id="device-alttab"
                checked={settings.disableAltTab}
                disabled={busy || wireless}
                aria-labelledby="device-alttab-label"
                aria-describedby={wireless ? 'device-wireless-blocks' : undefined}
                onCheckedChange={(checked) => change({ disableAltTab: checked === true })}
              />
              <span id="device-alttab-label" className="text-xs text-ivory">
                Alt + Tab
              </span>
              {wireless ? <UsbOnlyBadge className="ml-auto" /> : null}
            </div>
          </fieldset>

          {wireless ? (
            <p
              id="device-wireless-blocks"
              className="mt-3 border-l-2 border-brass/50 pl-3 text-[11px] leading-relaxed text-muted"
            >
              The board does not apply these two over 2.4 GHz, and the vendor app does no better on
              this link (Test 23). The Windows key block works here.
            </p>
          ) : null}

          <div className="mt-4">
            <Button disabled={!connected || busy} onClick={() => onApply(settings)}>
              {busy ? 'Sending…' : 'Apply settings'}
            </Button>
          </div>

          <p
            className={cn(
              'mt-2 text-[11px] leading-relaxed',
              lastSent && !unchanged ? 'text-brass' : 'text-muted',
            )}
          >
            {lastSent === null
              ? 'Not sent from this browser yet.'
              : unchanged
                ? `Last sent ${sentLabel}. The board forgets these when it is switched off.`
                : 'Changed since the last send. Apply to send them again.'}
          </p>

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
            Windows key typed its shortcut again, over USB and over 2.4 GHz (Tests 21 and 22), so
            send the settings once more after switching the keyboard off.
          </p>
        </aside>
      </div>
    </>
  );
}
