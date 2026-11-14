import { Eraser, Paintbrush } from 'lucide-react';
import { useState } from 'react';
import { StatusNote } from '@/components/status-note';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { UsbOnlyBadge } from '@/components/usb-only-badge';
import { updateSettings, useSettings } from '@/features/settings/useSettings';
import { FACTORY_KEYS } from '@/lib/keymap';
import { PER_KEY_MAX_BRIGHTNESS, PER_KEY_MIN_BRIGHTNESS } from '@/lib/lighting';
import type { PerKeySettings } from '@/lib/settings';
import { PerKeyBoard, type PaintTool } from './PerKeyBoard';

export type PerKeyStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'ok'; readonly message: string }
  | { readonly kind: 'err'; readonly message: string };

type PerKeyPanelProps = {
  connected: boolean;
  busy: boolean;
  wireless: boolean;
  status: PerKeyStatus;
  onApply: (values: PerKeySettings) => void;
};

/** The vendor database's eight default colours, without the duplicate. */
const SWATCHES = ['#7f1f55', '#3ec9fb', '#00ff00', '#ffff00', '#0000ff', '#d940ff', '#ffffff'];

const countPending = (values: PerKeySettings): number => {
  const ids = new Set([...Object.keys(values.colors), ...Object.keys(values.sent)]);
  let pending = 0;
  for (const id of ids) {
    if (values.colors[id] !== values.sent[id]) pending += 1;
  }

  // Brightness is one more value the keyboard holds. After an older build, the
  // map is on the board but its brightness is not recorded, so it counts as
  // unsent until one write records it.
  const sentSomething = Object.keys(values.sent).length > 0;
  if (
    values.sentBrightness === null ? sentSomething : values.brightness !== values.sentBrightness
  ) {
    pending += 1;
  }
  return pending;
};

/**
 * Paint a colour on individual keys. Everything without a colour is dark while
 * the board runs the per-key map, which is why Clear all means "every key off".
 */
export function PerKeyPanel({ connected, busy, wireless, status, onApply }: PerKeyPanelProps) {
  const values = useSettings((settings) => settings.perKey);
  const [tool, setTool] = useState<PaintTool>('brush');

  const { colors, sent, brightness, brush } = values;
  const painted = Object.keys(colors).length;
  const pending = countPending(values);
  const disabled = busy || wireless;

  const change = (patch: Partial<PerKeySettings>) => {
    updateSettings({ perKey: { ...values, ...patch } });
  };

  const paint = (idx: number) => {
    change({ colors: { ...colors, [String(idx)]: brush } });
  };

  const erase = (idx: number) => {
    const next = { ...colors };
    delete next[String(idx)];
    change({ colors: next });
  };

  const fillAll = () => {
    const next: Record<string, string> = {};
    for (const key of FACTORY_KEYS) next[String(key.idx)] = brush;
    change({ colors: next });
  };

  const clearAll = () => change({ colors: {} });

  const discard = () =>
    change({
      colors: sent,
      brightness: values.sentBrightness ?? brightness,
    });

  const pickColour = (next: string) => {
    setTool('brush');
    change({ brush: next });
  };

  return (
    <>
      <section className="flex min-w-0 flex-col gap-4">
        <div className="rounded-panel border border-line bg-surface p-3 sm:p-4">
          <PerKeyBoard
            colors={colors}
            tool={tool}
            disabled={disabled}
            onPaint={paint}
            onErase={erase}
          />
          <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted">
            Nothing reaches the keyboard until you apply. The keyboard cannot be read back, so this
            shows the draft.
          </p>
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <aside className="h-fit rounded-panel border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Paint keys</h2>
            {wireless ? <UsbOnlyBadge /> : null}
          </div>

          <div className="mt-4">
            <ToggleGroup
              type="single"
              value={tool}
              aria-label="Paint tool"
              onValueChange={(value) => {
                if (value) setTool(value as PaintTool);
              }}
              className="inline-flex rounded-control border border-line bg-ink p-1"
            >
              <ToggleGroupItem value="brush" disabled={disabled}>
                <Paintbrush aria-hidden="true" className="size-3.5" />
                Brush
              </ToggleGroupItem>
              <ToggleGroupItem value="eraser" disabled={disabled}>
                <Eraser aria-hidden="true" className="size-3.5" />
                Eraser
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <input
              id="per-key-colour"
              type="color"
              aria-label="Brush colour"
              value={brush}
              disabled={disabled}
              className="size-10 cursor-pointer rounded-control border border-line bg-ink p-1 disabled:cursor-not-allowed disabled:opacity-40"
              onChange={(event) => pickColour(event.currentTarget.value)}
            />
            <div>
              <p className="font-mono text-xs text-ivory">{brush.toUpperCase()}</p>
              <p className="text-[11px] text-muted">Brush colour</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Use ${hex}`}
                aria-pressed={brush === hex}
                disabled={disabled}
                onClick={() => pickColour(hex)}
                className="size-6 rounded-sm border border-line/70 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ivory disabled:cursor-not-allowed aria-pressed:border-ivory"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>

          <div className="mt-4 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="per-key-brightness" className="block text-xs text-muted">
                Brightness
              </label>
              <span className="font-mono text-[11px] text-ivory/80">{brightness}</span>
            </div>
            <Slider
              id="per-key-brightness"
              aria-label="Brightness"
              min={PER_KEY_MIN_BRIGHTNESS}
              max={PER_KEY_MAX_BRIGHTNESS}
              step={1}
              value={[brightness]}
              disabled={disabled}
              onValueChange={([value]) => change({ brightness: value ?? PER_KEY_MIN_BRIGHTNESS })}
            />
            <p className="text-[10px] text-muted">One value for the whole map.</p>
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="secondary" size="sm" disabled={disabled} onClick={fillAll}>
              Fill all
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || painted === 0}
              onClick={clearAll}
            >
              Clear all
            </Button>
          </div>

          <p className="mt-3 text-[11px] text-muted">
            {pending === 0
              ? painted === 0
                ? 'Nothing painted yet.'
                : 'Everything painted has been sent.'
              : `${pending} unsent change${pending === 1 ? '' : 's'}.`}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Button
              disabled={!connected || busy || wireless || pending === 0}
              onClick={() => onApply(values)}
            >
              {busy ? 'Sending…' : 'Apply colours'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || pending === 0}
              onClick={discard}
              title="Put the draft back to what was last sent"
            >
              Discard
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
            {wireless && status.kind === 'idle' ? (
              <StatusNote tone="muted" className="mt-3">
                Per-key colours need the USB cable. The receiver has no channel for them.
              </StatusNote>
            ) : null}
            {!connected && !wireless && status.kind === 'idle' ? (
              <StatusNote tone="muted" className="mt-3">
                Connect the keyboard to send the colours.
              </StatusNote>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
