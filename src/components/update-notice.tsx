import { RefreshCw } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/build';
import { updateStore, type UpdateStore } from '@/pwa/update-store';

type UpdateNoticeProps = {
  store?: UpdateStore;
};

/**
 * The strip that says a newer build has arrived. It stays until the reload
 * happens and never reloads on its own. The drafts live in this browser, so the
 * sentence has to say a reload costs nothing.
 */
export function UpdateNotice({ store = updateStore }: UpdateNoticeProps) {
  const ready = useSyncExternalStore(store.subscribe, store.get, store.get);

  if (!ready) return null;

  return (
    <div className="border-b border-brass/40 bg-brass/10 text-sm text-brass">
      <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <RefreshCw aria-hidden="true" className="size-4 shrink-0" />
        <p className="min-w-0 flex-1 basis-64">
          A newer build is ready. Reload to switch from {APP_VERSION}. Drafts stay in this browser.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => store.requestReload()}
        >
          Reload
        </Button>
      </div>
    </div>
  );
}
