import { type CollectionReport, findConfigCollection, findScreenCollection } from './collections';
import { CONFIG_USAGE, CONFIG_USAGE_PAGE, PRODUCT_IDS, VENDOR_ID } from './protocol';
import { findWirelessCollection } from './wireless';

export type WebHidReportInfo = CollectionReport;

export type WebHidCollection = {
  readonly usagePage: number;
  readonly usage: number;
  readonly children?: readonly WebHidCollection[];
  readonly inputReports?: readonly WebHidReportInfo[];
  readonly outputReports?: readonly WebHidReportInfo[];
  readonly featureReports?: readonly WebHidReportInfo[];
};

export type WebHidFilter = {
  readonly vendorId: number;
  readonly productId?: number;
  readonly usagePage?: number;
  readonly usage?: number;
};

export type WebHidDevice = {
  readonly opened: boolean;
  readonly productName?: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly collections: readonly WebHidCollection[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  sendReport?(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: 'disconnect', listener: () => void): void;
  removeEventListener(type: 'disconnect', listener: () => void): void;
};

export type WebHid = {
  requestDevice(options: { filters: readonly WebHidFilter[] }): Promise<WebHidDevice[]>;
  getDevices(): Promise<WebHidDevice[]>;
  /** Fires for devices this origin was already allowed to use. */
  addEventListener?(type: 'connect' | 'disconnect', listener: () => void): void;
  removeEventListener?(type: 'connect' | 'disconnect', listener: () => void): void;
};

/**
 * What a click can do without the chooser. `getDevices` only returns devices
 * this origin already has permission for, so a reopen is a permission this
 * page holds, not a device it found on its own.
 */
export type GrantedChoice =
  | {
      readonly kind: 'reopen';
      readonly link: 'usb' | 'wireless';
      readonly devices: readonly WebHidDevice[];
    }
  | { readonly kind: 'chooser' };

/**
 * Reopen only when the answer is unambiguous. A second keyboard, or a cable
 * and a receiver both granted, goes to the chooser: picking one would be a
 * guess, and a guess writes to the wrong board.
 */
export function classifyGranted(devices: readonly WebHidDevice[]): GrantedChoice {
  const granted = devices.filter(
    (device) =>
      device.vendorId === VENDOR_ID &&
      (PRODUCT_IDS as readonly number[]).includes(device.productId),
  );
  const usb = granted.filter((device) => findConfigCollection(device) !== null);
  const wireless = granted.filter((device) => findWirelessCollection(device) !== null);

  if (usb.length > 1 || (usb.length > 0 && wireless.length > 0)) {
    return { kind: 'chooser' };
  }
  if (usb.length === 1) {
    return { kind: 'reopen', link: 'usb', devices: granted };
  }
  if (wireless.length > 0) {
    return { kind: 'reopen', link: 'wireless', devices: granted };
  }
  return { kind: 'chooser' };
}

export function buildWebHidFilters(): WebHidFilter[] {
  const filters: WebHidFilter[] = [];

  for (const productId of PRODUCT_IDS) {
    filters.push({
      vendorId: VENDOR_ID,
      productId,
      usagePage: CONFIG_USAGE_PAGE,
      usage: CONFIG_USAGE,
    });
  }
  for (const productId of PRODUCT_IDS) {
    filters.push({ vendorId: VENDOR_ID, productId });
  }

  return filters;
}

export function pickDevice(devices: readonly WebHidDevice[]): WebHidDevice | null {
  return (
    devices.find((device) => findConfigCollection({ collections: device.collections })) ??
    devices[0] ??
    null
  );
}

export function pickScreenDevice(devices: readonly WebHidDevice[]): WebHidDevice | null {
  return (
    devices.find((device) => findScreenCollection({ collections: device.collections })) ?? null
  );
}

export function getWebHid(): WebHid | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { hid?: WebHid }).hid;
}
