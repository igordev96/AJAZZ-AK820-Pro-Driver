import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusNote } from '@/components/status-note';
import {
  SCREEN_BLOCKS_PER_FRAME,
  SCREEN_HEIGHT,
  SCREEN_MAX_FRAMES,
  SCREEN_WIDTH,
  decodeAnimation,
  encodeRgb565,
} from '@/lib/screen';
import { cn } from '@/lib/utils';

export type ScreenStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'ok'; readonly message: string }
  | { readonly kind: 'err'; readonly message: string };

type Picked = {
  readonly frames: Uint8Array[];
  readonly delays: number[];
  readonly frameCount: number;
  readonly truncated: boolean;
  readonly url: string;
  readonly name: string;
};

type AnimationCardProps = {
  connected: boolean;
  screenReady: boolean;
  busy: boolean;
  sending: boolean;
  status: ScreenStatus;
  progress: { readonly sent: number; readonly total: number } | null;
  onSend: (frames: Uint8Array[], delays: number[]) => void;
  /** True over the 2.4 GHz receiver, where the keyboard exposes no screen channel. */
  wireless?: boolean;
};

const stillDelay = 100;

async function decodeStill(file: File): Promise<Omit<Picked, 'url' | 'name'>> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no canvas');

    const scale = Math.max(SCREEN_WIDTH / bitmap.width, SCREEN_HEIGHT / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (SCREEN_WIDTH - width) / 2,
      (SCREEN_HEIGHT - height) / 2,
      width,
      height,
    );

    const frame = encodeRgb565(
      context.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).data,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
    );
    return { frames: [frame], delays: [stillDelay], frameCount: 1, truncated: false };
  } finally {
    bitmap.close();
  }
}

export function AnimationCard({
  connected,
  screenReady,
  busy,
  sending,
  status,
  progress,
  onSend,
  wireless = false,
}: AnimationCardProps) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    try {
      const animated = file.type === 'image/gif' || /\.gif$/i.test(file.name);
      const decoded = animated
        ? await decodeAnimation(file).then((result) => ({
            frames: result.frames,
            delays: result.delaysMs,
            frameCount: result.frameCount,
            truncated: result.truncated,
          }))
        : await decodeStill(file);

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      setPicked({ ...decoded, url, name: file.name });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'That file could not be read. Use a GIF, PNG, JPEG or WebP.',
      );
      setPicked(null);
    }
  };

  const totalMs = picked ? picked.delays.reduce((sum, delay) => sum + delay, 0) : 0;
  const blocks = picked ? picked.frames.length * SCREEN_BLOCKS_PER_FRAME + 1 : 0;
  // Measured on the board: a 4096-byte output report plus the 150 ms gap lands
  // every ~215 ms in Chrome. The vendor's WriteFile path is ~153 ms.
  const estimateSeconds = Math.ceil((blocks * 215) / 1000);
  const percent =
    progress && progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0;
  const framesDone = progress
    ? Math.min(
        picked?.frames.length ?? 0,
        Math.max(0, Math.floor((progress.sent - 1) / SCREEN_BLOCKS_PER_FRAME)),
      )
    : 0;

  return (
    <aside className="rounded-panel border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Screen animation</h2>
        {wireless ? <span className="text-[10px] text-muted">USB only</span> : null}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        A GIF, or one still picture. It replaces the animation on the keyboard, which this tool
        cannot read back.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <label
          className={cn(
            'inline-flex h-8 cursor-pointer items-center rounded-control border border-line bg-keycap px-3 text-xs font-medium text-ivory transition-colors hover:border-muted/50',
            (busy || sending || wireless) && 'pointer-events-none opacity-45',
          )}
        >
          Choose a file
          <input
            type="file"
            accept="image/gif,image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy || sending || wireless}
            onChange={(event) => {
              void pick(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </label>

        {picked ? (
          <img
            src={picked.url}
            alt=""
            className="size-12 rounded-key border border-line object-cover"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : null}
      </div>

      {picked ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          <span className="text-ivory/90">{picked.frameCount} frames</span>,{' '}
          {(totalMs / 1000).toFixed(1)} s, about {estimateSeconds} s to send.
          {picked.truncated ? ` Only the first ${SCREEN_MAX_FRAMES} frames are used.` : ''}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rust">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          disabled={!connected || !screenReady || busy || !picked}
          onClick={() => {
            if (picked) onSend(picked.frames, picked.delays);
          }}
        >
          {sending ? 'Sending…' : 'Send animation'}
        </Button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Let it finish. The keyboard is busy until the commit, and interrupting an upload can leave
        the screen stuck until you unplug it.
      </p>

      {progress ? (
        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-sage transition-[width] duration-150"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted">
            frame {framesDone}/{picked?.frames.length ?? 0}, {percent}%
          </p>
        </div>
      ) : null}

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
        {!connected && status.kind === 'idle' && !picked ? (
          <StatusNote tone="muted" className="mt-3">
            Connect the keyboard to send an animation.
          </StatusNote>
        ) : null}
        {connected && !screenReady && !wireless ? (
          <p className="mt-2 text-[11px] leading-relaxed text-rust">
            This browser did not expose the screen interface. Reconnect and allow the keyboard
            again.
          </p>
        ) : null}
        {wireless ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            The 2.4 GHz receiver has no screen channel, so this card waits for the USB cable. The
            clock above is sent on both links.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
