import { useEffect, useRef, useState } from 'react';
import type { EditorRow, Layer } from '@/lib/editor';
import { BOARD_HEIGHT, BOARD_WIDTH, FN_LOCKED, usageLabel } from '@/lib/keymap';
import { cn } from '@/lib/utils';
import { isSymbolLabel, keycapLabel } from './keyLabels';

const MAX_SCALE = 1.45;
const MIN_SCALE = 0.6;

type KeymapBoardProps = {
  rows: readonly EditorRow[];
  layer: Layer;
  selected: number | null;
  disabled: boolean;
  onSelect: (idx: number) => void;
};

export function KeymapBoard({ rows, layer, selected, disabled, onSelect }: KeymapBoardProps) {
  const container = useRef<HTMLDivElement>(null);
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

  return (
    <div className="rounded-panel border border-line bg-surface p-2 sm:p-3">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <p className="text-[11px] text-muted">
          {layer === 'fn' ? 'Fn layer' : 'Top layer'}, {rows.length} keys
        </p>
        <p className="font-mono text-[10px] text-muted/70">
          {BOARD_WIDTH} × {BOARD_HEIGHT}
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
              className="relative"
              style={{
                width: BOARD_WIDTH,
                height: BOARD_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              role="group"
              aria-label="Keyboard board"
            >
              {rows.map((row) => {
                const locked = layer === 'fn' && FN_LOCKED.has(row.idx);
                const pending = row.usage !== row.applied || row.media !== row.appliedMedia;
                const custom = row.usage !== row.factory || row.media !== row.factoryMedia;
                const isSelected = selected === row.idx;
                const label = keycapLabel(row.name);

                const title = locked
                  ? `${row.name}. Key index ${row.idx}. The firmware owns this Fn combination.`
                  : layer === 'fn'
                    ? `Fn + ${row.name}. Key index ${row.idx}. ${
                        row.usage ? usageLabel(row.usage, row.media) : 'Firmware default'
                      }.`
                    : `${row.name}. Key index ${row.idx}. Sends ${usageLabel(
                        row.usage,
                        row.media,
                      )}.${custom ? ` Factory: ${usageLabel(row.factory, row.factoryMedia)}.` : ''}`;

                return (
                  <button
                    key={row.idx}
                    type="button"
                    aria-label={row.name}
                    aria-pressed={isSelected}
                    data-changed={custom ? 'true' : undefined}
                    data-pending={pending ? 'true' : undefined}
                    disabled={locked || disabled}
                    title={title}
                    className={cn(
                      'absolute flex items-center justify-center overflow-hidden rounded-key border px-0.5 text-center leading-none transition-colors',
                      locked
                        ? 'cursor-not-allowed border-line/50 bg-surface/50 text-muted/35'
                        : cn(
                            'bg-keycap text-ivory',
                            'shadow-[inset_0_-2px_0_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]',
                            'hover:border-brass/60 hover:text-brass-bright',
                          ),
                      !locked && custom && 'border-brass/45 text-brass',
                      isSelected && !locked && 'border-ivory/80 bg-surface-2',
                    )}
                    style={{
                      left: row.x,
                      top: row.y,
                      width: row.w,
                      height: row.h,
                    }}
                    onClick={() => onSelect(row.idx)}
                  >
                    {pending && !locked ? (
                      <span
                        aria-hidden="true"
                        className="absolute right-0.75 top-0.75 size-1.25 rounded-full bg-brass"
                      />
                    ) : null}
                    <span
                      className={cn(
                        'whitespace-nowrap',
                        isSymbolLabel(label) ? 'font-mono' : 'font-medium',
                        label.length >= 5
                          ? 'text-[8px]'
                          : label.length === 4
                            ? 'text-[9px]'
                            : 'text-[10px]',
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
            className="size-3 rounded-[3px] border border-brass/70 bg-brass/20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.45)]"
            aria-hidden="true"
          />
          Changed
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-[3px] border border-ivory/70 bg-keycap shadow-[inset_0_-1px_0_rgba(0,0,0,0.45)]"
            aria-hidden="true"
          />
          Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="relative size-3 rounded-[3px] border border-line bg-keycap shadow-[inset_0_-1px_0_rgba(0,0,0,0.45)]"
            aria-hidden="true"
          >
            <span className="absolute right-0.5 top-0.5 size-1 rounded-full bg-brass" />
          </span>
          Pending upload
        </span>
        {layer === 'fn' ? (
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-[3px] border border-dashed border-line bg-surface/40"
              aria-hidden="true"
            />
            Firmware-owned: {FN_LOCKED.size}
          </span>
        ) : null}
        {selected === null ? (
          <span className="ml-auto hidden text-muted/70 sm:inline">
            Select a key to edit its usage
          </span>
        ) : null}
      </div>
    </div>
  );
}
