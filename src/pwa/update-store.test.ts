import { describe, expect, it, vi } from 'vitest';
import { createUpdateStore } from './update-store';

describe('createUpdateStore', () => {
  it('starts with no build waiting', () => {
    expect(createUpdateStore().get()).toBe(false);
  });

  it('tells every subscriber once when a build becomes ready', () => {
    const store = createUpdateStore();
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);

    store.markReady();
    store.markReady();

    expect(store.get()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening after an unsubscribe', () => {
    const store = createUpdateStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.markReady();

    expect(listener).not.toHaveBeenCalled();
  });

  it('reloads through the handler the worker registered', () => {
    const store = createUpdateStore();
    const reload = vi.fn();
    store.setHandler(reload);

    store.requestReload();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when a reload is asked for before a worker registered', () => {
    expect(() => createUpdateStore().requestReload()).not.toThrow();
  });
});
