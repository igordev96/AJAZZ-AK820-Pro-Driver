import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { StatusNote } from '@/components/status-note';
import { TabRow } from '@/components/tab-row';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { updateSettings, useSettings } from '@/features/settings/useSettings';
import {
  LIGHT_MAX_BRIGHTNESS,
  LIGHT_MAX_SPEED,
  LIGHT_MIN_BRIGHTNESS,
  LIGHT_MIN_SPEED,
  LIGHT_MODES,
  LIGHT_MODE_OFF,
  type LightSettings,
} from '@/lib/lighting';
import type { LightTab, PerKeySettings } from '@/lib/settings';
import { LightPreview } from './LightPreview';
import { PerKeyPanel, type PerKeyStatus } from './PerKeyPanel';

export type LightingStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'ok'; readonly message: string }
  | { readonly kind: 'err'; readonly message: string };

export type LightingValues = LightSettings;

type LightingPanelProps = {
  connected: boolean;
  busy: boolean;
  status: LightingStatus;
  perKeyStatus: PerKeyStatus;
  onApply: (values: LightingValues) => void;
  onApplyPerKey: (values: PerKeySettings) => void;
};

const defaultFor = (mode: number) => ({
  colorful: mode !== 1 && mode !== LIGHT_MODE_OFF,
  direction: LIGHT_MODES.find((item) => item.id === mode)?.direction === 'vertical' ? 2 : 0,
});

export function LightingPanel({
  connected,
  busy,
  status,
  perKeyStatus,
  onApply,
  onApplyPerKey,
}: LightingPanelProps) {
  const values = useSettings((settings) => settings.lighting);
  const lightTab = useSettings((settings) => settings.lightTab);
  const { mode, color, brightness, speed, colorful, direction } = values;

  const entry = LIGHT_MODES.find((item) => item.id === mode) ?? LIGHT_MODES[0]!;
  const off = mode === LIGHT_MODE_OFF;
  const controlsDisabled = busy || off;

  const change = (patch: Partial<LightSettings>) => {
    updateSettings({ lighting: { ...values, ...patch } });
  };

  const changeMode = (next: number) => {
    change({ mode: next, ...defaultFor(next) });
  };

  return (
    <Tabs
      value={lightTab}
      onValueChange={(next) => updateSettings({ lightTab: next as LightTab })}
      className="mt-5"
    >
      <TabRow
        label="Light mode"
        items={[
          { id: 'effect', label: 'Effect' },
          { id: 'perKey', label: 'Per-key' },
        ]}
        note={
          lightTab === 'perKey'
            ? 'Paint a colour on individual keys. Every key without a colour is off.'
            : 'Pick one of the 20 effects and set the controls it offers.'
        }
        disabled={busy}
      />

      <TabsContent value="effect">
        <div className="mt-5 grid content-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-w-0 flex-col gap-4">
            <div className="rounded-panel border border-line bg-surface p-3 sm:p-4">
              <LightPreview
                color={color}
                brightness={brightness}
                speed={speed}
                colorful={colorful && !off}
                off={off}
                mode={mode}
                direction={direction}
              />
              <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted">
                {off
                  ? 'The light will be off.'
                  : 'The preview approximates the effect. The keyboard runs the firmware version.'}
              </p>
            </div>
          </section>

          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <aside className="h-fit rounded-panel border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold">Set the light</h2>

              <div className="mt-4 space-y-1.5">
                <label htmlFor="light-mode" className="block text-xs text-muted">
                  Effect
                </label>
                <Select value={String(mode)} onValueChange={(value) => changeMode(Number(value))}>
                  <SelectTrigger id="light-mode" aria-label="Effect" disabled={busy}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIGHT_MODES.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {entry.color ? (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      id="light-color"
                      type="color"
                      aria-label="Colour"
                      value={color}
                      disabled={controlsDisabled || colorful}
                      className="size-10 cursor-pointer rounded-control border border-line bg-ink p-1 disabled:cursor-not-allowed disabled:opacity-40"
                      onChange={(event) => change({ color: event.currentTarget.value })}
                    />
                    <div>
                      <p className="font-mono text-xs text-ivory">{color.toUpperCase()}</p>
                      <p className="text-[11px] text-muted">Colour</p>
                    </div>
                  </div>

                  {entry.colorful ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="light-colorful"
                        checked={colorful}
                        disabled={controlsDisabled}
                        aria-labelledby="light-colorful-label"
                        onCheckedChange={(checked) => change({ colorful: checked === true })}
                      />
                      <span id="light-colorful-label" className="text-xs text-muted">
                        Colourful
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="light-brightness" className="block text-xs text-muted">
                    Brightness
                  </label>
                  <span className="font-mono text-[11px] text-ivory/80">{brightness}</span>
                </div>
                <Slider
                  id="light-brightness"
                  aria-label="Brightness"
                  min={LIGHT_MIN_BRIGHTNESS}
                  max={LIGHT_MAX_BRIGHTNESS}
                  step={1}
                  value={[brightness]}
                  disabled={controlsDisabled}
                  onValueChange={([value]) => change({ brightness: value ?? LIGHT_MIN_BRIGHTNESS })}
                />
                <div className="flex justify-between font-mono text-[10px] text-muted">
                  <span>{LIGHT_MIN_BRIGHTNESS}</span>
                  <span>{LIGHT_MAX_BRIGHTNESS}</span>
                </div>
              </div>

              {entry.speed ? (
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor="light-speed" className="block text-xs text-muted">
                      Speed
                    </label>
                    <span className="font-mono text-[11px] text-ivory/80">{speed}</span>
                  </div>
                  <Slider
                    id="light-speed"
                    aria-label="Speed"
                    min={LIGHT_MIN_SPEED}
                    max={LIGHT_MAX_SPEED}
                    step={1}
                    value={[speed]}
                    disabled={controlsDisabled}
                    onValueChange={([value]) => change({ speed: value ?? LIGHT_MIN_SPEED })}
                  />
                </div>
              ) : null}

              {entry.direction !== 'none' ? (
                <div className="mt-4 space-y-1.5">
                  <span className="block text-xs text-muted">Direction</span>
                  <ToggleGroup
                    type="single"
                    aria-label="Direction"
                    value={String(direction)}
                    disabled={controlsDisabled}
                    onValueChange={(value) => {
                      if (value) change({ direction: Number(value) });
                    }}
                    className="inline-flex rounded-control border border-line bg-ink p-1"
                  >
                    {(entry.direction === 'vertical'
                      ? [
                          { value: '2', label: 'Up', Icon: ArrowUp },
                          { value: '3', label: 'Down', Icon: ArrowDown },
                        ]
                      : [
                          { value: '1', label: 'Left', Icon: ArrowLeft },
                          { value: '0', label: 'Right', Icon: ArrowRight },
                        ]
                    ).map(({ value, label, Icon }) => (
                      <ToggleGroupItem key={value} value={value} disabled={controlsDisabled}>
                        <Icon aria-hidden="true" className="size-3.5" />
                        {label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              ) : null}

              <div className="mt-4">
                <Button disabled={!connected || busy} onClick={() => onApply(values)}>
                  {busy ? 'Sending…' : 'Apply light'}
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
                    Connect the keyboard to change the light.
                  </StatusNote>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="perKey">
        <div className="mt-5 grid content-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <PerKeyPanel
            connected={connected}
            busy={busy}
            status={perKeyStatus}
            onApply={onApplyPerKey}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
