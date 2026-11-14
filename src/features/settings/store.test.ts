import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_STORE, writeSettings, type Settings } from '@/lib/settings';
import type { StorageLike } from '@/lib/editor';
import { createSettingsStore } from './store';

const memoryStorage = (seed?: string) => {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set(SETTINGS_STORE, seed);

  const storage: StorageLike & { values: Map<string, string> } = {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };

  return storage;
};

const custom: Settings = {
  lighting: { mode: 10, color: '#00ff00', brightness: 2, speed: 4, colorful: true, direction: 3 },
  perKey: {
    colors: { '39': '#ff0000' },
    sent: {},
    brightness: 3,
    sentBrightness: null,
    brush: '#00ff00',
  },
  lightTab: 'perKey',
  screenTab: 'animation',
  clock: { mode: 'custom' },
  device: {
    responseLevel: 4,
    sleep: 1,
    disableAltTab: true,
    disableAltF4: false,
    disableWindowsKey: true,
  },
  deviceLastSent: null,
  view: 'light',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('createSettingsStore', () => {
  it('starts from the stored settings', () => {
    const store = createSettingsStore(memoryStorage(writeSettings(custom)));

    expect(store.get()).toEqual(custom);
  });

  it('starts from the defaults when the stored text is junk', () => {
    const store = createSettingsStore(memoryStorage('{ oops'));

    expect(store.get().view).toBe('keys');
  });

  it('falls back to the clock when the stored screen tab is unknown', () => {
    const stored = JSON.parse(writeSettings({ ...custom, screenTab: 'animation' }));
    stored.screenTab = 'something-else';
    const store = createSettingsStore(memoryStorage(JSON.stringify(stored)));

    expect(store.get().screenTab).toBe('clock');
  });

  it('remembers the open screen tab', () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);

    store.set({ screenTab: 'animation' });
    store.flush();

    expect(createSettingsStore(storage).get().screenTab).toBe('animation');
  });

  it('tells its listeners about a change', () => {
    const store = createSettingsStore(memoryStorage());
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ view: 'light' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().view).toBe('light');
  });

  it('waits before writing to storage', () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    store.subscribe(() => {});

    store.set({ clock: { mode: 'custom' } });
    expect(storage.getItem(SETTINGS_STORE)).toBeNull();

    vi.advanceTimersByTime(200);
    expect(storage.getItem(SETTINGS_STORE)).toBe(writeSettings({ ...store.get() }));
  });

  it('writes at once when flushed', () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const store = createSettingsStore(storage);

    store.set({ view: 'screen' });
    store.flush();

    expect(storage.getItem(SETTINGS_STORE)).not.toBeNull();
  });

  it('forgets a reset', () => {
    const storage = memoryStorage(writeSettings(custom));
    const store = createSettingsStore(storage);

    store.reset();

    expect(store.get().view).toBe('keys');
    expect(storage.getItem(SETTINGS_STORE)).toBeNull();
  });

  it('works without storage at all', () => {
    const store = createSettingsStore(null);

    store.set({ view: 'light' });
    store.flush();

    expect(store.get().view).toBe('light');
  });
});
