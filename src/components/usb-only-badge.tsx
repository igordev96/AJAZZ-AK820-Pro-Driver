import { cn } from '@/lib/utils';

/**
 * Marks a control the 2.4 GHz receiver cannot use. The accent colour, not the
 * error one: the link works, this part of it does not exist.
 */
export function UsbOnlyBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border border-brass/40 bg-brass/10 px-2 py-0.5 text-[10px] font-medium text-brass',
        className,
      )}
    >
      USB only
    </span>
  );
}
