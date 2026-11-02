import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ComboboxOption = {
  readonly value: string;
  readonly label: string;
};

export type ComboboxGroup = {
  readonly label: string;
  readonly options: readonly ComboboxOption[];
};

type ComboboxProps = {
  id?: string;
  value: string;
  groups: readonly ComboboxGroup[];
  /** The accessible name of the picker. */
  label: string;
  /** Shown on the trigger when the value is in no group. */
  valueLabel?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function Combobox({
  id,
  value,
  groups,
  label,
  valueLabel,
  searchPlaceholder = 'Search…',
  emptyText = 'Nothing found.',
  disabled = false,
  onChange,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = groups
    .flatMap((group) => group.options)
    .find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-control border border-line bg-ink px-3 text-left text-sm text-ivory',
            'transition-colors hover:border-muted/50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          <span className="truncate">{selected?.label ?? valueLabel ?? label}</span>
          <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        aria-label={label}
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandInput aria-label={searchPlaceholder} placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      aria-hidden="true"
                      className={cn(
                        'size-3.5 shrink-0 text-brass',
                        option.value === value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
