import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { isSymbolLabel, keycapLabel } from '@/features/editor/keyLabels';
import { BOARD_HEIGHT, BOARD_WIDTH, FACTORY_KEYS } from '@/lib/keymap';
import { cn } from '@/lib/utils';

const MAX_SCALE = 1.45;
const MIN_SCALE = 0.6;

export type PaintTool = 'brush' | 'eraser';

type PerKeyBoardProps = {
  /** Only keys with their own colour; the rest are off. */
  colors: Readonly<Record<string, string>>;
  tool: PaintTool;
  disabled: boolean;
  onPaint: (idx: number) => void;
  onErase: (idx: number) => void;
};

/** A key with its own colour shows it; every other key is unlit. */
export function PerKeyBoard({ colors, tool, disabled, onPaint, onErase }: PerKeyBoardProps) {
  const container = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastIdx = useRef<number | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 0) return;
      setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, width / BOARD_WIDTH)));
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  // A drag ends wherever the pointer is released, including outside the board.
  useEffect(() => {
    const stop = () => {
      dragging.current = false;
      lastIdx.current = null;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  const apply = (idx: number) => {
    if (disabled) return;
    if (tool === 'eraser') onErase(idx);
    else onPaint(idx);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || disabled) return;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    const key = element?.closest<HTMLElement>('[data-key-idx]');
    if (!key) return;

    const idx = Number(key.dataset.keyIdx);
    if (!Number.isInteger(idx) || idx === lastIdx.current) return;

    lastIdx.current = idx;
    apply(idx);
  };

  const painted = Object.keys(colors).length;

  return (
    <div className="rounded-panel border border-line bg-surface p-2 sm:p-3">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <p className="text-[11px] text-muted">
          {painted} of {FACTORY_KEYS.length} keys painted
        </p>
        <p className="font-mono text-[10px] text-muted/70">
          {tool === 'eraser' ? 'Eraser' : 'Brush'}
        </p>
      </div>

      <div
        ref={container}
        className="bench-mat overflow-hidden rounded-control border border-line/70 p-2 sm:p-3"
      >
        <div className="overflow-x-auto">
          <div
            className="mx-auto"
            style={{ width: BOARD_WIDTH * scale, height: BOARD_HEIGHT * scale }}
          >
            <div
              className="relative touch-none select-none"
              style={{
                width: BOARD_WIDTH,
                height: BOARD_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              role="group"
              aria-label="Per-key colour board"
              onPointerMove={handlePointerMove}
            >
              {FACTORY_KEYS.map((key) => {
                const colour = colors[String(key.idx)] ?? '';
                const label = keycapLabel(key.name);
                const size = label.length >= 5 ? 8 : label.length === 4 ? 9 : 10;
                const ink = colour
                  ? Number.parseInt(colour.slice(1, 3), 16) * 0.299 +
                      Number.parseInt(colour.slice(3, 5), 16) * 0.587 +
                      Number.parseInt(colour.slice(5, 7), 16) * 0.114 >
                    140
                    ? '#141210'
                    : '#f6f1e7'
                  : 'rgba(246,241,231,0.32)';

                return (
                  <button
                    key={key.idx}
                    type="button"
                    data-key-idx={key.idx}
                    aria-label={
                      colour
                        ? `${key.name}. Painted ${colour.toUpperCase()}.`
                        : `${key.name}. No colour; this key is off.`
                    }
                    title={
                      colour
                        ? `${key.name}. Key index ${key.idx}. Painted ${colour.toUpperCase()}.`
                        : `${key.name}. Key index ${key.idx}. No colour; off in per-key mode.`
                    }
                    disabled={disabled}
                    className={cn(
                      'absolute flex items-center justify-center overflow-hidden rounded-key border border-line/70 px-0.5 text-center leading-none transition-colors',
                      'shadow-[inset_0_-2px_0_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ivory',
                      !colour && 'bg-surface/60',
                      disabled ? 'cursor-not-allowed' : 'cursor-crosshair',
                    )}
                    style={{
                      left: key.x,
                      top: key.y,
                      width: key.w,
                      height: key.h,
                      backgroundColor: colour || undefined,
                      color: ink,
                    }}
                    onPointerDown={(event) => {
                      if (disabled || event.button !== 0) return;
                      dragging.current = true;
                      lastIdx.current = key.idx;
                      apply(key.idx);
                    }}
                    onClick={() => {
                      apply(key.idx);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Backspace' || event.key === 'Delete') {
                        event.preventDefault();
                        if (!disabled) onErase(key.idx);
                      }
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'whitespace-nowrap',
                        isSymbolLabel(label) ? 'font-mono' : 'font-medium',
                        size === 8 ? 'text-[8px]' : size === 9 ? 'text-[9px]' : 'text-[10px]',
                      )}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line/60 px-1 pt-2 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-[3px] border border-line bg-surface/60"
            aria-hidden="true"
          />
          Off
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-[3px] border border-line bg-[#3ec9fb]"
            aria-hidden="true"
          />
          Painted
        </span>
        <span className="ml-auto hidden text-muted/70 sm:inline">
          Drag to paint. Space paints the focused key, Backspace clears it.
        </span>
      </div>
    </div>
  );
}
