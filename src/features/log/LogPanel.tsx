import { useEffect, useRef } from 'react';
import { GitHubMark } from '@/components/github-mark';
import { Button } from '@/components/ui/button';
import type { LogLevel } from '@/lib/hid/transfer';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { formatLog, type LogEntry } from './useLog';

const REPOSITORY_URL = 'https://github.com/igordev96/AJAZZ-AK820-Pro-Driver';

const levelClass: Record<LogLevel, string> = {
  info: 'text-ivory',
  dim: 'text-muted',
  ok: 'text-sage',
  warn: 'text-brass',
  err: 'text-rust',
};

type LogPanelProps = {
  entries: readonly LogEntry[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
};

export function LogPanel({ entries, open, onToggle, onClear }: LogPanelProps) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && entries.length && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [entries, open]);

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
    <footer id="log-panel" className="border-t border-line">
      <div className="mx-auto w-full max-w-page px-4">
        <div className="flex h-11 items-center gap-4">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="log-entries"
            aria-label={open ? 'Hide log' : 'Show log'}
            className="flex h-11 min-w-0 flex-1 items-center justify-between text-xs text-muted transition-colors hover:text-ivory"
            onClick={onToggle}
          >
            <span>Log</span>
            <span>{open ? `${entries.length} entries` : 'Show'}</span>
          </button>

          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the project on GitHub"
            className="flex h-11 shrink-0 items-center gap-1.5 text-xs text-muted transition-colors hover:text-ivory"
          >
            <GitHubMark className="size-3.5" />
            <span>GitHub</span>
          </a>
        </div>

        {open ? (
          <div className="space-y-2 pb-3">
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={!entries.length} onClick={copy}>
                Copy
              </Button>
              <Button variant="ghost" size="sm" disabled={!entries.length} onClick={onClear}>
                Clear
              </Button>
            </div>
            <div
              id="log-entries"
              ref={scroller}
              role="log"
              aria-live="polite"
              className="max-h-56 overflow-y-auto rounded-control border border-line bg-ink p-3 font-mono text-xs leading-relaxed"
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
        ) : null}
      </div>
    </footer>
  );
}
