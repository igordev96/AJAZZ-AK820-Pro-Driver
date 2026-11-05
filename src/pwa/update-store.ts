/**
 * Whether a newer build is waiting in the service worker, and how to take it.
 * The store is deliberately framework-free: register.ts fills it at startup and
 * UpdateNotice reads it through useSyncExternalStore. It never touches the
 * keyboard, the editor or the log.
 */
export type UpdateStore = {
  get(): boolean;
  markReady(): void;
  setHandler(handler: (() => void) | null): void;
  requestReload(): void;
  subscribe(listener: () => void): () => void;
};

export function createUpdateStore(): UpdateStore {
  let ready = false;
  let handler: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    get: () => ready,
    markReady: () => {
      if (ready) return;
      ready = true;
      notify();
    },
    setHandler: (next) => {
      handler = next;
    },
    requestReload: () => {
      handler?.();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The page's one store: register.ts writes, the notice reads. */
export const updateStore = createUpdateStore();
