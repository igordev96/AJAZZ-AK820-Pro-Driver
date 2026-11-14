import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SCREEN_BLOCKS_PER_FRAME, SCREEN_HEIGHT, SCREEN_WIDTH, rgb565ToRgba } from '@/lib/screen';
import type { PickedAnimation } from './useAnimationFile';

type AnimationStageProps = {
  picked: PickedAnimation | null;
  /** True while the frames are going to the keyboard. */
  sending: boolean;
  progress: { readonly sent: number; readonly total: number } | null;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The 128 x 128 panel from the Screen view, playing the frames this page would
 * send. It never claims to show the keyboard: the screen is write-only.
 */
export function AnimationStage({ picked, sending, progress }: AnimationStageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  // The index belongs to the file it was counted on, so a new pick starts at
  // frame one without an effect that resets state.
  const [playback, setPlayback] = useState<{ picked: PickedAnimation | null; index: number }>({
    picked,
    index: 0,
  });

  const frames = picked?.frames ?? [];
  const index = playback.picked === picked ? playback.index : 0;

  const lastIndex = Math.max(0, frames.length - 1);
  const written =
    sending && progress
      ? Math.min(lastIndex, Math.floor((progress.sent - 1) / SCREEN_BLOCKS_PER_FRAME))
      : null;
  const shown = written ?? Math.min(index, lastIndex);

  // One timer per frame, so each one keeps the delay stored with it.
  useEffect(() => {
    const count = picked?.frames.length ?? 0;
    if (sending || !playing || count < 2) return;

    const id = window.setTimeout(() => {
      setPlayback({ picked, index: (index + 1) % count });
    }, picked?.delays[index] ?? 100);

    return () => window.clearTimeout(id);
  }, [index, picked, playing, sending]);

  useEffect(() => {
    const element = canvas.current;
    const frame = picked?.frames[shown];
    if (!element || !frame) return;

    const context = element.getContext('2d');
    if (!context) return;

    const image = context.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    image.data.set(rgb565ToRgba(frame));
    context.putImageData(image, 0, 0);
  }, [picked, shown]);

  return (
    <figure className="rounded-panel border border-line bg-surface p-4">
      <div className="w-full">
        <div className="rounded-[14px] border border-line/80 bg-surface-2 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="overflow-hidden rounded-control border border-ink/60 bg-[#05080a]">
            {picked ? (
              <canvas
                ref={canvas}
                width={SCREEN_WIDTH}
                height={SCREEN_HEIGHT}
                role="img"
                aria-label={`Animation preview, frame ${shown + 1} of ${frames.length}`}
                className="block h-auto w-full"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center px-8">
                <p className="text-center text-xs leading-relaxed text-muted">
                  No animation selected.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {picked ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {frames.length > 1 ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={sending}
              onClick={() => setPlaying((current) => !current)}
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {playing ? 'Pause' : 'Play'}
            </Button>
          ) : null}
          <span className="font-mono text-[11px] text-muted">
            {written === null
              ? `Frame ${shown + 1} of ${frames.length}`
              : `Sending frame ${shown + 1} of ${frames.length}`}
          </span>
        </div>
      ) : null}

      <figcaption className="mt-3 text-[11px] leading-relaxed text-muted">
        {picked ? (
          <>
            <span className="text-ivory/90">{picked.name}</span>. The page draws the frames it would
            send. The keyboard's screen is write-only, so this is never what is on it now.
          </>
        ) : (
          'Choose a GIF or a picture in the panel beside this one. Its frames fill this square.'
        )}
      </figcaption>
    </figure>
  );
}
