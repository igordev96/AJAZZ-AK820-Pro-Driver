import { useEffect, useState } from 'react';
import { TabRow } from '@/components/tab-row';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { updateSettings, useSettings } from '@/features/settings/useSettings';
import type { ScreenTab } from '@/lib/settings';
import { AnimationCard, type ScreenStatus } from './AnimationCard';
import { AnimationStage } from './AnimationStage';
import { ClockCard, type ClockMode, type TimeStatus } from './ClockCard';
import { ScreenPreview } from './ScreenPreview';
import { useAnimationFile } from './useAnimationFile';

type ScreenPanelProps = {
  connected: boolean;
  screenReady: boolean;
  busy: boolean;
  status: TimeStatus;
  animationStatus: ScreenStatus;
  animationProgress: { readonly sent: number; readonly total: number } | null;
  animationSending: boolean;
  onSend: (at: Date) => void;
  onSendAnimation: (frames: Uint8Array[], delays: number[]) => void;
  /** True over the 2.4 GHz receiver, which has no screen channel. */
  wireless?: boolean;
};

export function ScreenPanel({
  connected,
  screenReady,
  busy,
  status,
  animationStatus,
  animationProgress,
  animationSending,
  onSend,
  onSendAnimation,
  wireless = false,
}: ScreenPanelProps) {
  const mode = useSettings((settings) => settings.clock.mode);
  const screenTab = useSettings((settings) => settings.screenTab);
  const [now, setNow] = useState(() => new Date());
  const [customAt, setCustomAt] = useState<Date | null>(null);
  // The file lives here, above the tabs, so looking at the clock does not throw
  // the preview away. Nothing about it is stored past a reload.
  const { picked, error, pick } = useAnimationFile();

  useEffect(() => {
    if (mode !== 'now') return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [mode]);

  const preview = mode === 'now' ? now : (customAt ?? now);

  const changeMode = (next: ClockMode) => {
    updateSettings({ clock: { mode: next } });
    if (next === 'custom' && customAt === null) setCustomAt(new Date());
  };

  const send = () => {
    const at = mode === 'now' ? new Date() : (customAt ?? new Date());
    onSend(at);
  };

  return (
    <Tabs
      value={screenTab}
      onValueChange={(next) => updateSettings({ screenTab: next as ScreenTab })}
      className="mt-5"
    >
      <TabRow
        label="Screen panel"
        items={[
          { id: 'clock', label: 'Clock' },
          { id: 'animation', label: 'Animation', badge: wireless },
        ]}
        note={
          screenTab === 'animation'
            ? wireless
              ? 'Preview the frames this page would send. This link has no screen channel, so sending waits for USB.'
              : 'Preview the frames this page would send, then send them.'
            : 'Set the clock from this computer, or from a time you pick.'
        }
        disabled={busy || animationSending}
      />

      <TabsContent value="clock">
        <div className="mt-5 grid content-start gap-5 lg:grid-cols-[minmax(0,440px)_340px] lg:justify-center">
          <section className="flex min-w-0 flex-col gap-4">
            <ScreenPreview time={preview} connected={connected} />
            <p className="max-w-prose text-xs leading-relaxed text-muted">
              One write sets the clock. Nothing else on the keyboard changes, and no key mapping is
              touched.
            </p>
          </section>

          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <ClockCard
              mode={mode}
              preview={preview}
              connected={connected}
              busy={busy}
              status={status}
              onModeChange={changeMode}
              onCustomChange={setCustomAt}
              onSend={send}
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="animation">
        <div className="mt-5 grid content-start gap-5 lg:grid-cols-[minmax(0,440px)_340px] lg:justify-center">
          <section className="flex min-w-0 flex-col gap-4">
            <AnimationStage
              picked={picked}
              sending={animationSending}
              progress={animationProgress}
            />
          </section>

          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <AnimationCard
              connected={connected}
              screenReady={screenReady}
              busy={busy}
              sending={animationSending}
              status={animationStatus}
              progress={animationProgress}
              picked={picked}
              error={error}
              onPick={pick}
              onSend={onSendAnimation}
              wireless={wireless}
            />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
