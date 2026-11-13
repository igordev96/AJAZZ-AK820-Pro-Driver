import { Button } from '@/components/ui/button';
import { describePendingChange, type EditorRow, type Layer } from '@/lib/editor';
import { cn } from '@/lib/utils';

/** Rows past this are counted instead of listed: a factory restore is 81. */
const VISIBLE_LIMIT = 8;

type PendingBarProps = {
  layer: Layer;
  pending: readonly EditorRow[];
  connected: boolean;
  busy: boolean;
  confirming: boolean;
  onUpload: () => void;
  onRestore: () => void;
  onConfirmRestore: () => void;
  onCancelRestore: () => void;
};

export function PendingBar({
  layer,
  pending,
  connected,
  busy,
  confirming,
  onUpload,
  onRestore,
  onConfirmRestore,
  onCancelRestore,
}: PendingBarProps) {
  const pendingCount = pending.length;
  const canWrite = connected && !busy;
  const restoreLabel = layer === 'fn' ? 'Clear all Fn overrides' : 'Restore factory map';
  const status = !connected
    ? 'Connect the keyboard to upload.'
    : pendingCount
      ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} ready`
      : 'No pending changes';

  return (
    <div className="space-y-2.5">
      {confirming ? (
        <div className="rounded-panel border border-brass/30 bg-brass/5 p-3">
          <p className="text-sm text-ivory">
            {layer === 'fn'
              ? 'Clear every Fn override? Each key returns to the firmware default.'
              : 'Restore the factory top layer? This rewrites all 81 keys. Fn overrides stay as they are.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" disabled={!canWrite} onClick={onConfirmRestore}>
              {restoreLabel}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelRestore}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {/* The keys this upload carries, not only how many there are. The bar
          stays visible while disconnected so the list can be read first. */}
      {pendingCount > 0 && !confirming ? (
        <ul
          aria-label="Changes to upload"
          className="rounded-panel border border-line bg-surface/40 px-3 py-2"
        >
          {pending.slice(0, VISIBLE_LIMIT).map((row) => (
            <li key={row.idx} className="flex min-w-0 items-baseline gap-2 py-0.5">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brass" />
              <span className="truncate font-mono text-[11px] text-ivory/90">
                {describePendingChange(row, layer)}
              </span>
            </li>
          ))}
          {pendingCount > VISIBLE_LIMIT ? (
            <li className="pt-1 pl-3.5 text-[11px] text-muted">
              and {pendingCount - VISIBLE_LIMIT} more
            </li>
          ) : null}
        </ul>
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-3 rounded-panel border bg-surface/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
          pendingCount ? 'border-brass/40' : 'border-line',
        )}
      >
        <span className="flex items-center gap-2 text-xs text-muted">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 rounded-full',
              !connected ? 'bg-muted/60' : pendingCount ? 'bg-brass' : 'bg-sage',
            )}
          />
          {status}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {confirming ? null : (
            <Button variant="ghost" size="sm" disabled={!canWrite} onClick={onRestore}>
              {restoreLabel}
            </Button>
          )}
          <Button disabled={!canWrite || pendingCount === 0} onClick={onUpload}>
            {busy
              ? 'Uploading…'
              : pendingCount
                ? `Upload ${pendingCount} change${pendingCount === 1 ? '' : 's'}`
                : 'Upload changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
