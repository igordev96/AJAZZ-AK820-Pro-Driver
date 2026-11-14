import { TABLE_SIZE } from '@/lib/keymap';

export const VENDOR_ID = 0x0c45;
export const PRODUCT_IDS = [0x8009, 0x800a, 0xfdfd] as const;
export const CONFIG_USAGE_PAGE = 0xff13;
export const CONFIG_USAGE = 0x0001;

export const REPORT_ID = 0;
export const REPORT_SIZE = 64;
export const CHUNK_SIZE = 64;
export const CHUNK_COUNT = TABLE_SIZE / CHUNK_SIZE;

export const COMMANDS = {
  begin: [0x04, 0x18],
  top: [0x04, 0x11],
  fn: [0x04, 0x27],
  time: [0x04, 0x28],
  light: [0x04, 0x13],
  /** Per-key colours: a 576-byte table, four bytes per key slot. */
  perKey: [0x04, 0x23],
  /** Device settings. Byte 2 is 01 in every capture; byte 8 becomes the chunk count. */
  settings: [0x04, 0x17, 0x01],
  animation: [0x04, 0x72],
  commit: [0x04, 0x02],
  end: [0x04, 0xf0],
  read: [0x04, 0x19],
  version: [0x04, 0xf5],
} as const;

/** Screen output collection: usage page 0xFF68, usage 0x0061, 4097-byte reports. */
export const SCREEN_USAGE_PAGE = 0xff68;
export const SCREEN_USAGE = 0x0061;
export const SCREEN_REPORT_SIZE = 4096;
export const SCREEN_MODE_ANIMATION = 0x03;

/** Screen slot byte the vendor app sends with a clock sync (GetCurSel + 1). */
export const TIME_SLOT = 1;
/** Tag that marks the 64-byte body as a clock update. */
export const TIME_TAG = 0x5a;
export const TIME_YEAR_MIN = 2000;
export const TIME_YEAR_MAX = 2099;

export const TIMING = {
  settle: 220,
  poll: 60,
  replyTimeout: 6000,
  readTimeout: 1500,
  announcePause: 120,
  chunkGap: 12,
  chunkAttempts: 4,
  chunkRetry: 250,
  commitPause: 60,
  screenStartPause: 250,
  screenBlockGap: 150,
} as const;

export const STATUS = {
  ok: 0x01,
  rejected: 0xff,
} as const;

export function padFrame(payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(REPORT_SIZE);
  frame.set(payload.subarray(0, REPORT_SIZE));
  return frame;
}
