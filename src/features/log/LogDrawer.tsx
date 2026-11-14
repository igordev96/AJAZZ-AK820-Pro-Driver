import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { LogLevel } from '@/lib/hid/transfer';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { formatLog, type LogEntry } from './useLog';

const levelClass: Record<LogLevel, string> = {
  info: 'text-ivory',
  dim: 'text-muted',
  ok: 'text-sage',
  warn: 'text-brass',
  err: 'text-rust',
};

type LogDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: readonly LogEntry[];
  onClear: () => void;
};

/**
 * The session log, in the same modal drawer as Advanced. Readable with no
 * keyboard attached, because a failed connection is when it matters most.
 */
export function LogDrawer({ open, onOpenChange, entries, onClear }: LogDrawerProps) {
  const scroller = useRef<HTMLDivElement>(null);
  // Follow new lines only while the reader is already at the bottom.
  const sticky = useRef(true);

  useEffect(() => {
    if (open) sticky.current = true;
  }, [open]);

  useEffect(() => {
    const element = scroller.current;
    if (!open || entries.length === 0 || !element || !sticky.current) return;
    element.scrollTop = element.scrollHeight;
  }, [entries.length, open]);

  const track = () => {
    const element = scroller.current;
    if (!element) return;
    sticky.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
  };

  const copy = async () => {
    if (!entries.length) return;

    if (!navigator.clipboard) {
      notify.err('This browser does not offer the clipboard here.');
      return;
    }

    try {
      await navigator.clipboard.writeText(formatLog(entries));
      notify.ok(`Log copied, ${entries.length} ${entries.length === 1 ? 'line' : 'lines'}.`);
    } catch {
      notify.err('The clipboard was refused. The log stays on screen.');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div>
            <SheetTitle>Log</SheetTitle>
            <SheetDescription>
              Transport lines from this session. Nothing here is kept after a reload.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close the log">
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!entries.length}
                onClick={() => void copy()}
              >
                Copy
              </Button>
              <Button variant="ghost" size="sm" disabled={!entries.length} onClick={onClear}>
                Clear
              </Button>
            </div>
          </div>

          <div
            id="log-entries"
            ref={scroller}
            role="log"
            aria-live="polite"
            onScroll={track}
            className="min-h-0 flex-1 overflow-y-auto rounded-control border border-line bg-ink p-3 font-mono text-xs leading-relaxed"
          >
            {entries.length ? (
              entries.map((entry) => (
                <div key={entry.id} className="wrap-break-word">
                  <span className="text-muted/70">{entry.time}</span>{' '}
                  <span className={cn(levelClass[entry.level])}>{entry.message}</span>
                </div>
              ))
            ) : (
              <p className="text-muted">No activity yet.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
