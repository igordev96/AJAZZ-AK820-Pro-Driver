import { formatTimeInput } from '@/lib/hid';
import { cn } from '@/lib/utils';

type ScreenPreviewProps = {
  time: Date;
  connected: boolean;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * A 128 x 128 panel at the screen's own size, scaled by CSS. The keyboard draws
 * its own clock layout, so this shows the values this page sends rather than a
 * copy of the firmware's face.
 */
export function ScreenPreview({ time, connected }: ScreenPreviewProps) {
  const hours = pad2(time.getHours());
  const minutes = pad2(time.getMinutes());
  const seconds = pad2(time.getSeconds());
  const date = `${time.getFullYear()}-${pad2(time.getMonth() + 1)}-${pad2(time.getDate())}`;

  return (
    <figure className="rounded-panel border border-line bg-surface p-4">
      <div className="w-full">
        <div className="rounded-[14px] border border-line/80 bg-surface-2 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="overflow-hidden rounded-control border border-ink/60 bg-[#05080a]">
            <svg
              viewBox="0 0 128 128"
              role="img"
              aria-label={`Screen preview showing ${formatTimeInput(time)}`}
              className={cn('block h-auto w-full', !connected && 'opacity-40')}
            >
              <text
                x="64"
                y="66"
                textAnchor="middle"
                className="fill-ivory font-mono"
                fontSize="27"
                letterSpacing="-1"
              >
                {hours}:{minutes}
              </text>
              <text
                x="64"
                y="84"
                textAnchor="middle"
                className="fill-muted font-mono"
                fontSize="13"
              >
                {seconds}
              </text>
              <text
                x="64"
                y="104"
                textAnchor="middle"
                className="fill-muted/60 font-mono"
                fontSize="8"
              >
                {date}
              </text>
            </svg>
          </div>
        </div>
      </div>

      <figcaption className="mt-3 text-[11px] leading-relaxed text-muted">
        The keyboard draws its own clock face. This panel shows the values this page sends.
      </figcaption>
    </figure>
  );
}
