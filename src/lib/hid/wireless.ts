import type { Clock } from '@/lib/clock';
import { realClock } from '@/lib/clock';
import type { LogFn } from './transfer';
import { hex } from '@/lib/format';
import type { CollectionNode, CollectionReport } from './collections';
import { flattenCollections } from './collections';

/** The 2.4 GHz receiver's configuration collection, output and input reports. */
export const WIRELESS_USAGE_PAGE = 0xff60;
export const WIRELESS_USAGE = 0x0061;

/** Output report payload, without the report id: 32 bytes, checksum last. */
export const WIRELESS_FRAME_SIZE = 32;

/** The records the receiver carries: the wired record's first 14 bytes and `AA 55`. */
export const WIRELESS_RECORD_SIZE = 16;

export const WIRELESS_COMMANDS = {
  init: 0x02,
  top: 0x03,
  light: 0x05,
  settings: 0x07,
  clock: 0x0c,
  fn: 0x0d,
  heartbeat: 0x20,
} as const;

const reportBytes = (report: CollectionReport): number =>
  report.items.reduce<number>((total, item) => {
    const { reportSize = 0, reportCount = 0 } = item as {
      reportSize?: number;
      reportCount?: number;
    };
    return total + Math.ceil((reportSize * reportCount) / 8);
  }, 0);

/** The payload size of the collection's report 0, in bytes. */
export function wirelessOutputBytes(collection: CollectionNode): number {
  const report = collection.outputReports?.find((entry) => entry.reportId === 0);
  return report ? reportBytes(report) : 0;
}

/**
 * The configuration collection, preferring the one whose output report matches
 * our frame. The receiver exposes two `0xFF60/0x0061` interfaces, 32 and 64
 * bytes; only the smaller one carries the captured frames.
 */
export function findWirelessCollection(device: {
  collections: readonly CollectionNode[];
}): CollectionNode | null {
  const matches = flattenCollections(device.collections)
    .map(({ collection }) => collection)
    .filter(
      (collection) =>
        collection.usagePage === WIRELESS_USAGE_PAGE && collection.usage === WIRELESS_USAGE,
    );

  return (
    matches.find((collection) => wirelessOutputBytes(collection) === WIRELESS_FRAME_SIZE) ??
    matches.find((collection) => wirelessOutputBytes(collection) > 0) ??
    null
  );
}

/** The first selected interface that can carry wireless frames. */
export function findWirelessInterface<T extends { collections: readonly CollectionNode[] }>(
  devices: readonly T[],
): T | null {
  const candidates = devices
    .map((device) => ({ device, collection: findWirelessCollection(device) }))
    .filter(
      (entry): entry is { device: T; collection: CollectionNode } => entry.collection !== null,
    );

  // The receiver exposes a 32-byte and a 64-byte interface; only the smaller
  // one accepts the captured frames, so size decides before order does.
  const exact = candidates.find(
    ({ collection }) => wirelessOutputBytes(collection) === WIRELESS_FRAME_SIZE,
  );

  return (exact ?? candidates[0])?.device ?? null;
}

const checksum = (frame: Uint8Array): number => {
  let sum = 0;
  for (let index = 0; index < frame.length - 1; index += 1) {
    sum = (sum + (frame[index] ?? 0)) & 0xff;
  }
  return sum;
};

/**
 * A 32-byte output report the receiver accepts, captured on 3 Nov 2026:
 *
 *   command, payload length, key index, payload, zero padding, checksum
 *
 * The checksum is the sum of the first 31 bytes, low byte.
 */
export function buildWirelessFrame(
  command: number,
  payload: Uint8Array = new Uint8Array(),
  index = 0,
): Uint8Array<ArrayBuffer> {
  if (payload.length > WIRELESS_FRAME_SIZE - 4) {
    throw new Error(`a wireless frame carries at most ${WIRELESS_FRAME_SIZE - 4} payload bytes`);
  }

  const frame = new Uint8Array(WIRELESS_FRAME_SIZE);
  frame[0] = command;
  frame[1] = payload.length;
  frame[2] = index;
  frame.set(payload, 3);
  frame[WIRELESS_FRAME_SIZE - 1] = checksum(frame);
  return frame;
}

/**
 * The receiver takes the wired record without its long tail: the first 14
 * bytes, then the `AA 55` trailer, which the wired record keeps at 62-63 for
 * the clock and the settings, and at 14-15 for the light.
 */
export function toWirelessRecord(record: Uint8Array): Uint8Array {
  if (record.length < 14) {
    throw new Error('a wireless record needs at least 14 bytes');
  }

  const payload = new Uint8Array(WIRELESS_RECORD_SIZE);
  payload.set(record.subarray(0, 14));
  payload[14] = 0xaa;
  payload[15] = 0x55;
  return payload;
}

export type WirelessDevice = {
  sendReport?(reportId: number, data: BufferSource): Promise<void>;
};

/** How long to wait between key patches. The vendor only ever sent one at a time. */
const KEY_GAP_MS = 15;

/**
 * Sends the records the receiver applies without a reply. Key patches are
 * silent, so nothing here waits for confirmation.
 */
export class WirelessClient {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly device: WirelessDevice,
    private readonly log: LogFn = () => {},
    private readonly clock: Clock = realClock,
  ) {}

  /** Init and heartbeat, once, before the first record, as the vendor app does. */
  private ensureReady(): Promise<void> {
    this.ready ??= (async () => {
      await this.write(WIRELESS_COMMANDS.init);
      await this.write(WIRELESS_COMMANDS.heartbeat, Uint8Array.from([0x00]));
    })().catch((error: unknown) => {
      // A handshake that failed must be tried again by the next write, so a
      // rejected promise is not kept as readiness.
      this.ready = null;
      throw error;
    });

    return this.ready;
  }

  async init(): Promise<void> {
    await this.ensureReady();
  }

  async sendLight(record: Uint8Array): Promise<void> {
    await this.send(WIRELESS_COMMANDS.light, toWirelessRecord(record));
  }

  async sendClock(body: Uint8Array): Promise<void> {
    await this.send(WIRELESS_COMMANDS.clock, toWirelessRecord(body));
  }

  async sendSettings(record: Uint8Array): Promise<void> {
    await this.send(WIRELESS_COMMANDS.settings, toWirelessRecord(record));
  }

  /**
   * One patch per key: the four-byte record the wired table would carry at that
   * slot, with the key index in the frame header. There is no commit.
   */
  async sendKeys(
    layer: 'top' | 'fn',
    patches: readonly { readonly index: number; readonly record: Uint8Array }[],
  ): Promise<number> {
    if (patches.length === 0) return 0;

    await this.ensureReady();

    const command = layer === 'fn' ? WIRELESS_COMMANDS.fn : WIRELESS_COMMANDS.top;
    let sent = 0;

    for (const patch of patches) {
      if (patch.record.length !== 4) {
        throw new Error('a key patch carries a 4-byte record');
      }
      await this.write(command, patch.record, patch.index);
      sent += 1;
      if (sent < patches.length && KEY_GAP_MS > 0) {
        await this.clock.sleep(KEY_GAP_MS);
      }
    }

    return sent;
  }

  private async send(command: number, payload?: Uint8Array): Promise<void> {
    await this.ensureReady();
    await this.write(command, payload);
  }

  private async write(command: number, payload?: Uint8Array, index = 0): Promise<void> {
    if (!this.device.sendReport) {
      throw new Error('this browser cannot send output reports');
    }

    const frame = buildWirelessFrame(command, payload, index);
    this.log(`SEND  ${hex(frame)}`, 'info');
    await this.device.sendReport(0, frame);
  }
}
