import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildWebHidFilters,
  classifyGranted,
  pickDevice,
  type WebHid,
  type WebHidDevice,
} from '@/lib/hid';
import { useDevice } from './useDevice';

function makeDevice(overrides: Partial<WebHidDevice> = {}) {
  const listeners: Array<() => void> = [];
  const device: WebHidDevice = {
    opened: false,
    productName: 'AK820',
    vendorId: 0x0c45,
    productId: 0x8009,
    collections: [{ usagePage: 0xff13, usage: 0x0001 }],
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    sendFeatureReport: async () => {},
    receiveFeatureReport: async () => new DataView(new ArrayBuffer(64)),
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
    removeEventListener: () => {},
    ...overrides,
  };
  return { device, listeners };
}

const makeReceiver = (overrides: Partial<WebHidDevice> = {}) =>
  makeDevice({
    productName: '2.4G Dongle',
    productId: 0xfdfd,
    collections: [
      {
        usagePage: 0xff60,
        usage: 0x0061,
        outputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 32 }] }],
        inputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 32 }] }],
      },
    ],
    ...overrides,
  });

function makeHid(devices: WebHidDevice[], granted: WebHidDevice[] = []): WebHid {
  return {
    requestDevice: vi.fn(async () => devices),
    getDevices: vi.fn(async () => granted),
  };
}

describe('WebHID device helpers', () => {
  it('builds filters for both the config usage and each product id', () => {
    const filters = buildWebHidFilters();
    expect(filters).toHaveLength(6);
    expect(filters[0]).toMatchObject({ vendorId: 0x0c45, productId: 0x8009, usagePage: 0xff13 });
    expect(filters[5]).toMatchObject({ vendorId: 0x0c45, productId: 0xfdfd });
  });

  it('picks the device with the config collection', () => {
    const { device: plain } = makeDevice({ collections: [] });
    const { device: config } = makeDevice();

    expect(pickDevice([plain, config])).toBe(config);
    expect(pickDevice([])).toBeNull();
  });
});

describe('classifyGranted', () => {
  it('reopens one granted keyboard, with the screen interface beside it', () => {
    const { device: config } = makeDevice();
    const { device: screen } = makeDevice({
      collections: [{ usagePage: 0xff68, usage: 0x0061 }],
    });

    expect(classifyGranted([config, screen])).toMatchObject({ kind: 'reopen', link: 'usb' });
  });

  it('reopens the receiver when it is the only granted link', () => {
    const { device } = makeReceiver();

    expect(classifyGranted([device])).toMatchObject({ kind: 'reopen', link: 'wireless' });
  });

  it('asks the chooser when a cable and a receiver are both granted', () => {
    const { device: config } = makeDevice();
    const { device: dongle } = makeReceiver();

    expect(classifyGranted([config, dongle])).toEqual({ kind: 'chooser' });
  });

  it('asks the chooser when two keyboards are granted', () => {
    const { device: first } = makeDevice();
    const { device: second } = makeDevice();

    expect(classifyGranted([first, second])).toEqual({ kind: 'chooser' });
  });

  it('ignores other vendors and interfaces without a config collection', () => {
    const { device: other } = makeDevice({ vendorId: 0x1234 });
    const { device: boot } = makeDevice({ collections: [{ usagePage: 0x0001, usage: 0x0006 }] });

    expect(classifyGranted([other, boot])).toEqual({ kind: 'chooser' });
    expect(classifyGranted([])).toEqual({ kind: 'chooser' });
  });
});

describe('useDevice', () => {
  it('opens the selected device and exposes its state', async () => {
    const { device } = makeDevice();
    const hid = makeHid([device]);
    const log = vi.fn();
    const { result } = renderHook(() => useDevice({ hid, log }));

    expect(result.current.supported).toBe(true);

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe('connected');
    expect(result.current.device).toBe(device);
    expect(result.current.name).toBe('AK820');
    expect(result.current.configFound).toBe(true);
    expect(result.current.link).toBe('usb');
    expect(hid.requestDevice).toHaveBeenCalledWith({ filters: buildWebHidFilters() });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('selected AK820'), 'ok');
  });

  it('connects over the 2.4 GHz receiver through the 0xFF60 collection', async () => {
    const { device } = makeDevice({
      productName: '2.4G Dongle',
      productId: 0xfdfd,
      collections: [
        { usagePage: 0x000c, usage: 0x0001 },
        {
          usagePage: 0xff60,
          usage: 0x0061,
          outputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 32 }] }],
          inputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 32 }] }],
        },
      ],
    });
    const log = vi.fn();
    const { result } = renderHook(() => useDevice({ hid: makeHid([device]), log }));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe('connected');
    expect(result.current.device).toBe(device);
    expect(result.current.link).toBe('wireless');
    expect(result.current.configFound).toBe(false);
    expect(result.current.screenFound).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('2.4 GHz link'), 'warn');
    // The receiver never exposes a screen channel, so that miss is not a warning.
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('screen interface'), 'warn');
  });

  it('prefers the receiver interface over a composite one without config', async () => {
    const { device: composite } = makeDevice({
      productName: 'Composite',
      collections: [{ usagePage: 0x0001, usage: 0x0006 }],
    });
    const { device: receiver } = makeDevice({
      productName: '2.4G Dongle',
      productId: 0xfdfd,
      collections: [
        {
          usagePage: 0xff60,
          usage: 0x0061,
          outputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 32 }] }],
        },
      ],
    });
    const { result } = renderHook(() =>
      useDevice({ hid: makeHid([composite, receiver]), log: vi.fn() }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.device).toBe(receiver);
    expect(result.current.link).toBe('wireless');
  });

  it('returns to idle when the device disconnects', async () => {
    const { device, listeners } = makeDevice();
    const { result } = renderHook(() => useDevice({ hid: makeHid([device]), log: vi.fn() }));

    await act(async () => {
      await result.current.connect();
    });
    act(() => listeners[0]?.());

    expect(result.current.status).toBe('idle');
    expect(result.current.device).toBeNull();
  });

  it('closes the device on disconnect', async () => {
    const { device } = makeDevice();
    const { result } = renderHook(() => useDevice({ hid: makeHid([device]), log: vi.fn() }));

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.disconnect();
    });

    expect(device.close).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('reports a missing config interface but keeps the device open', async () => {
    const { device } = makeDevice({ collections: [{ usagePage: 0x0001, usage: 0x0006 }] });
    const { result } = renderHook(() => useDevice({ hid: makeHid([device]), log: vi.fn() }));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe('connected');
    expect(result.current.configFound).toBe(false);
    expect(result.current.link).toBeNull();
  });

  it('reports a permission or open failure', async () => {
    const hid: WebHid = {
      requestDevice: vi.fn(async () => {
        throw new Error('permission denied');
      }),
      getDevices: vi.fn(async () => []),
    };
    const { result } = renderHook(() => useDevice({ hid, log: vi.fn() }));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('permission denied');
  });

  it('treats a cancelled chooser as idle', async () => {
    const hid = makeHid([]);
    const log = vi.fn();
    const { result } = renderHook(() => useDevice({ hid, log }));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe('idle');
    expect(log).toHaveBeenCalledWith('no device selected', 'warn');
  });
});

describe('reconnect', () => {
  it('reopens a granted keyboard without the chooser', async () => {
    const { device: config } = makeDevice();
    const { device: screen } = makeDevice({
      collections: [{ usagePage: 0xff68, usage: 0x0061 }],
    });
    const hid = makeHid([], [config, screen]);
    const log = vi.fn();
    const { result } = renderHook(() => useDevice({ hid, log }));

    await act(async () => {
      await result.current.connect();
    });

    expect(hid.requestDevice).not.toHaveBeenCalled();
    expect(result.current.device).toBe(config);
    expect(result.current.screenDevice).toBe(screen);
    expect(result.current.link).toBe('usb');
    expect(screen.open).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('reopening a previously granted keyboard', 'dim');
  });

  it('reopens the receiver without the chooser', async () => {
    const { device } = makeReceiver();
    const hid = makeHid([], [device]);
    const { result } = renderHook(() => useDevice({ hid, log: vi.fn() }));

    await act(async () => {
      await result.current.connect();
    });

    expect(hid.requestDevice).not.toHaveBeenCalled();
    expect(result.current.device).toBe(device);
    expect(result.current.link).toBe('wireless');
  });

  it('opens the chooser when both links are granted', async () => {
    const { device: config } = makeDevice();
    const { device: dongle } = makeReceiver();
    const hid = makeHid([config], [config, dongle]);
    const { result } = renderHook(() => useDevice({ hid, log: vi.fn() }));

    await act(async () => {
      await result.current.connect();
    });

    expect(hid.requestDevice).toHaveBeenCalled();
    expect(result.current.link).toBe('usb');
  });

  it('always opens the chooser when the picker is asked for', async () => {
    const { device: granted } = makeDevice();
    const { device: chosen } = makeDevice({ productName: 'Chosen' });
    const hid = makeHid([chosen], [granted]);
    const { result } = renderHook(() => useDevice({ hid, log: vi.fn() }));

    await act(async () => {
      await result.current.connect({ picker: true });
    });

    expect(hid.requestDevice).toHaveBeenCalled();
    expect(result.current.device).toBe(chosen);
  });

  it('falls back to the chooser when the granted list fails', async () => {
    const { device } = makeDevice();
    const hid: WebHid = {
      requestDevice: vi.fn(async () => [device]),
      getDevices: vi.fn(async () => {
        throw new Error('not allowed');
      }),
    };
    const log = vi.fn();
    const { result } = renderHook(() => useDevice({ hid, log }));

    await act(async () => {
      await result.current.connect();
    });

    expect(hid.requestDevice).toHaveBeenCalled();
    expect(result.current.status).toBe('connected');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('could not list granted devices'),
      'warn',
    );
  });

  it('offers a reconnect without opening anything', async () => {
    const { device } = makeDevice();
    const { result } = renderHook(() => useDevice({ hid: makeHid([], [device]), log: vi.fn() }));

    await waitFor(() => expect(result.current.canReconnect).toBe(true));
    expect(device.open).not.toHaveBeenCalled();
  });

  it('stays with the plain connect label when nothing is granted', async () => {
    const { result } = renderHook(() => useDevice({ hid: makeHid([]), log: vi.fn() }));

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.canReconnect).toBe(false);
  });
});
