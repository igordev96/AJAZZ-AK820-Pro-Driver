import { useCallback, useState } from 'react';
import {
  findConfigCollection,
  findScreenCollection,
  flattenCollections,
} from '@/lib/hid/collections';
import {
  findWirelessCollection,
  findWirelessInterface,
  wirelessOutputBytes,
} from '@/lib/hid/wireless';
import type { LogFn } from '@/lib/hid/transfer';
import {
  buildWebHidFilters,
  getWebHid,
  pickDevice,
  pickScreenDevice,
  type WebHid,
  type WebHidDevice,
} from '@/lib/hid/webhid';

export type DeviceStatus = 'idle' | 'connecting' | 'connected' | 'error';

/** How the keyboard is reached: the wired configuration interface or the receiver. */
export type DeviceLink = 'usb' | 'wireless';

/** What the chooser and the open ended in, so the caller can confirm it once. */
export type ConnectOutcome =
  | { readonly status: 'connected'; readonly name: string; readonly link: DeviceLink | null }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly message: string };

export type DeviceState = {
  readonly status: DeviceStatus;
  readonly device: WebHidDevice | null;
  readonly screenDevice: WebHidDevice | null;
  readonly name: string | null;
  readonly vendorId: number | null;
  readonly productId: number | null;
  readonly link: DeviceLink | null;
  readonly configFound: boolean;
  readonly screenFound: boolean;
  readonly error: string | null;
};

const initialState: DeviceState = {
  status: 'idle',
  device: null,
  screenDevice: null,
  name: null,
  vendorId: null,
  productId: null,
  link: null,
  configFound: false,
  screenFound: false,
  error: null,
};

const hex = (value: number) => value.toString(16).toUpperCase().padStart(4, '0');

export function useDevice({ hid, log }: { hid?: WebHid; log?: LogFn } = {}) {
  const available = hid ?? getWebHid();
  const [state, setState] = useState<DeviceState>(initialState);

  const connect = useCallback(async (): Promise<ConnectOutcome> => {
    if (!available) {
      const message =
        'WebHID is not available in this browser. Use Chrome, Edge or Opera on desktop.';
      setState({ ...initialState, status: 'error', error: message });
      log?.(message, 'err');
      return { status: 'error', message };
    }

    setState({ ...initialState, status: 'connecting' });
    log?.('requesting device…', 'dim');

    try {
      const devices = await available.requestDevice({ filters: buildWebHidFilters() });
      const configDevice =
        devices.find((item) => findConfigCollection({ collections: item.collections })) ?? null;
      const wirelessDevice = configDevice ? null : findWirelessInterface(devices);
      const device = configDevice ?? wirelessDevice ?? pickDevice(devices);
      const screenCandidate = pickScreenDevice(devices);

      if (!device) {
        setState(initialState);
        log?.('no device selected', 'warn');
        return { status: 'cancelled' };
      }

      log?.(`interfaces returned: ${devices.length}`, 'dim');
      for (const [index, item] of devices.entries()) {
        const pages = flattenCollections(item.collections).map(
          ({ collection }) => `0x${hex(collection.usagePage)}/0x${hex(collection.usage)}`,
        );
        log?.(`  [${index}] ${pages.join('  ') || 'no collections'}`, 'dim');
      }

      await device.open();

      let screenDevice: WebHidDevice | null = null;
      let screenFound = false;
      if (screenCandidate === device) {
        screenDevice = device;
        screenFound = Boolean(findScreenCollection({ collections: device.collections }));
      } else if (screenCandidate) {
        try {
          await screenCandidate.open();
          screenDevice = screenCandidate;
          screenFound = true;
        } catch (error) {
          log?.(
            `screen interface failed to open: ${
              error instanceof Error ? error.message : String(error)
            }`,
            'warn',
          );
        }
      }

      const configFound = Boolean(findConfigCollection({ collections: device.collections }));
      const wirelessCollection = configFound
        ? null
        : findWirelessCollection({ collections: device.collections });
      const link: DeviceLink | null = configFound ? 'usb' : wirelessCollection ? 'wireless' : null;

      const handleDisconnect = () => {
        log?.('keyboard disconnected', 'warn');
        setState(initialState);
      };
      device.addEventListener('disconnect', handleDisconnect);
      if (screenDevice && screenDevice !== device) {
        screenDevice.addEventListener('disconnect', handleDisconnect);
      }

      setState({
        status: 'connected',
        device,
        screenDevice,
        name: device.productName ?? 'AK820',
        vendorId: device.vendorId,
        productId: device.productId,
        link,
        configFound,
        screenFound,
        error: null,
      });

      log?.(
        `selected ${device.productName ?? 'AK820'} ${hex(device.vendorId)}:${hex(device.productId)}`,
        'ok',
      );
      log?.('device opened', 'ok');
      if (link === 'wireless') {
        log?.(
          `2.4 GHz link: output reports of ${wirelessCollection ? wirelessOutputBytes(wirelessCollection) : 0} bytes. Key changes go out unconfirmed and this link has no screen channel.`,
          'warn',
        );
      } else if (link === null) {
        log?.(
          'config interface 0xFF13/0x0001 not found. Use USB mode and close the vendor app.',
          'err',
        );
      }
      // Over the receiver the missing screen is the rule, not a fault, so it
      // only deserves a warning on a link that should have offered one.
      if (!screenFound && link !== 'wireless') {
        log?.('screen interface 0xFF68/0x0061 not found. The image card stays disabled.', 'warn');
      }

      return { status: 'connected', name: device.productName ?? 'AK820', link };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ ...initialState, status: 'error', error: message });
      log?.(`connection failed: ${message}`, 'err');
      return { status: 'error', message };
    }
  }, [available, log]);

  const disconnect = useCallback(async () => {
    const device = state.device;
    const screen = state.screenDevice;
    if (!device) return;

    try {
      await device.close();
    } catch (error) {
      log?.(`close failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    }

    if (screen && screen !== device) {
      try {
        await screen.close();
      } catch (error) {
        log?.(
          `screen close failed: ${error instanceof Error ? error.message : String(error)}`,
          'warn',
        );
      }
    }

    setState(initialState);
    log?.('disconnected', 'dim');
  }, [log, state.device, state.screenDevice]);

  return {
    ...state,
    supported: Boolean(available),
    connect,
    disconnect,
  };
}
