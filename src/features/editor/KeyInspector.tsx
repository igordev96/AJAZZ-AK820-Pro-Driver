import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxGroup } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { usageToken } from '@/lib/editor';
import type { EditorRow, Layer } from '@/lib/editor';
import { MEDIA_NAMES, USAGE_GROUPS, USAGE_NAMES, parseUsageToken, usageLabel } from '@/lib/keymap';
import { cn } from '@/lib/utils';
import { isSymbolLabel, keycapLabel } from './keyLabels';

type OptionGroup = {
  label: string;
  options: Array<{ value: string; label: string }>;
};

function buildOptionGroups(): OptionGroup[] {
  const groups: OptionGroup[] = [];

  for (const [label, low, high] of USAGE_GROUPS) {
    const options: Array<{ value: string; label: string }> = [];
    for (let usage = low; usage <= high; usage += 1) {
      const name = USAGE_NAMES.get(usage);
      if (name)
        options.push({
          value: usageToken(usage, false),
          label: `${name} (0x${usageToken(usage, false).slice(2)})`,
        });
    }
    if (options.length) groups.push({ label, options });
  }

  groups.push({
    label: 'Media',
    options: [...MEDIA_NAMES].map(([usage, name]) => ({
      value: usageToken(usage, true),
      label: `Media: ${name} (${usageToken(usage, true)})`,
    })),
  });

  groups.push({
    label: 'Vendor',
    options: [{ value: usageToken(0xaf, false), label: 'Fn (0xAF)' }],
  });

  return groups;
}

const OPTION_GROUPS = buildOptionGroups();

const FN_DEFAULT: ComboboxGroup = {
  label: 'Fn layer',
  options: [{ value: '0x00', label: 'Firmware default (no override)' }],
};

type KeyInspectorProps = {
  row: EditorRow | null;
  layer: Layer;
  locked: boolean;
  disabled: boolean;
  onUsage: (usage: number, media: boolean) => boolean;
  onReset: () => void;
  onInvalid: (message: string) => void;
};

function Specimen({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-14 shrink-0 flex-col items-center justify-center rounded-key border text-sm font-medium',
        muted
          ? 'border-dashed border-line/80 bg-ink/40 text-muted/40'
          : 'border-line bg-keycap text-ivory shadow-[inset_0_-3px_0_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]',
        !muted && isSymbolLabel(label) && 'font-mono text-[13px]',
      )}
    >
      {label}
    </span>
  );
}

export function KeyInspector({
  row,
  layer,
  locked,
  disabled,
  onUsage,
  onReset,
  onInvalid,
}: KeyInspectorProps) {
  const token = row ? usageToken(row.usage, row.media) : '0x00';
  const groups = useMemo(
    () => (layer === 'fn' ? [FN_DEFAULT, ...OPTION_GROUPS] : OPTION_GROUPS),
    [layer],
  );

  if (!row) {
    return (
      <aside className="h-fit rounded-panel border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <Specimen label="—" muted />
          <div>
            <p className="text-sm font-medium">No key selected</p>
            <p className="mt-1 text-xs text-muted">Select a key on the board to edit it.</p>
          </div>
        </div>
        <p className="mt-4 border-t border-line/60 pt-3 text-[11px] leading-relaxed text-muted">
          Keys that differ from the factory table are marked in brass. Nothing reaches the keyboard
          until you upload.
        </p>
      </aside>
    );
  }

  const pending = row.usage !== row.applied || row.media !== row.appliedMedia;
  const controlsDisabled = disabled || locked;
  const knownToken = OPTION_GROUPS.some((group) =>
    group.options.some((option) => option.value === token),
  );
  const isDefault = layer === 'fn' && token === '0x00';
  const custom = !knownToken && !isDefault;

  const detail =
    layer === 'fn'
      ? row.usage
        ? `Override: ${usageLabel(row.usage, row.media)}`
        : 'Firmware default'
      : `Factory default: ${usageLabel(row.factory, row.factoryMedia)}`;

  const commitRaw = (input: HTMLInputElement) => {
    const parsed = parseUsageToken(input.value);
    if (!parsed) {
      onInvalid('Use a keyboard usage like 0x04, or a media usage like c:0xE2.');
      input.value = token;
      return;
    }
    const accepted = onUsage(parsed.usage, parsed.media);
    input.value = accepted ? usageToken(parsed.usage, parsed.media) : token;
  };

  return (
    <aside className="h-fit rounded-panel border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <Specimen label={keycapLabel(row.name)} />
        <div className="min-w-0">
          <p className="text-[11px] text-muted">
            {layer === 'fn' ? 'Fn layer' : 'Top layer'}, key {row.idx}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold">
            {layer === 'fn' ? `Fn + ${row.name}` : row.name}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{detail}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line/60 pt-3">
        <span
          role="status"
          className={cn(
            'flex items-center gap-1.5 text-[11px]',
            pending ? 'text-brass' : 'text-muted',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 rounded-full',
              locked ? 'bg-muted/60' : pending ? 'bg-brass' : 'bg-sage',
            )}
          />
          {locked ? 'Firmware-owned' : pending ? 'Change pending' : 'Matches the last upload'}
        </span>
        <Button variant="ghost" size="sm" disabled={controlsDisabled} onClick={onReset}>
          {layer === 'fn' ? 'Back to firmware default' : 'Reset this key'}
        </Button>
      </div>

      <div className="mt-4 space-y-1.5">
        <span id="key-usage-label" className="block text-xs text-muted">
          Sends
        </span>
        <Combobox
          id="key-usage"
          label="Sends"
          value={token}
          valueLabel={custom ? `${usageLabel(row.usage, row.media)} (${token})` : undefined}
          groups={groups}
          searchPlaceholder="Search a key or usage"
          emptyText="No usage matches."
          disabled={controlsDisabled}
          onChange={(next) => {
            const parsed = parseUsageToken(next);
            if (!parsed) {
              onInvalid('That usage could not be read.');
              return;
            }
            onUsage(parsed.usage, parsed.media);
          }}
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="key-raw" className="block text-xs text-muted">
            Raw usage
          </label>
          <span className="font-mono text-[10px] text-muted/70">offset {row.idx * 4}</span>
        </div>
        <Input
          id="key-raw"
          key={token}
          defaultValue={token}
          spellCheck={false}
          aria-label="Raw usage"
          disabled={controlsDisabled}
          className="font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commitRaw(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>

      {locked ? (
        <p className="mt-4 border-t border-line/60 pt-3 text-[11px] leading-relaxed text-muted">
          The vendor layout marks this key fnlayer_disable. The firmware owns that Fn combination,
          so it has no slot here.
        </p>
      ) : (
        <p className="mt-4 border-t border-line/60 pt-3 text-[11px] leading-relaxed text-muted">
          Keyboard usages use 0x00 to 0xFF. Media usages use c:0xE2, c:0xE9 and so on, because 0xE2
          alone is Left Alt.
        </p>
      )}
    </aside>
  );
}
