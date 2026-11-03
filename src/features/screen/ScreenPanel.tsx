import { useEffect, useState } from 'react';
import { updateSettings, useSettings } from '@/features/settings/useSettings';
import { AnimationCard, type ScreenStatus } from './AnimationCard';
import { ClockCard, type ClockMode, type TimeStatus } from './ClockCard';
import { ScreenPreview } from './ScreenPreview';

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
  const [now, setNow] = useState(() => new Date());
  const [customAt, setCustomAt] = useState<Date | null>(null);

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
    <>
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
        <AnimationCard
          connected={connected}
          screenReady={screenReady}
          busy={busy}
          sending={animationSending}
          status={animationStatus}
          progress={animationProgress}
          onSend={onSendAnimation}
          wireless={wireless}
        />
      </div>
    </>
  );
}
