import { FACTORY_KEYS, TABLE_SIZE } from '@/lib/keymap';

/**
 * Per-key colours. Captured from the vendor app on 13 Nov 2026
 * (`re/captures/usb-perkey-colour.log` in the private lab).
 *
 * The board is put into per-key mode with a normal light record whose mode is
 * `0x80`; then the colours travel as a 576-byte table under `04 23`, four
 * bytes per key slot:
 *
 *   <key index> <red> <green> <blue>
 *
 * W red was `27 ff 00 00`, E green `28 00 ff 00`, R blue `29 00 00 ff` and T
 * white `2a ff ff ff`. A key without a colour is written as
 * `<index> 00 00 00`, and the vendor app always writes all 81 keys, not only
 * the painted ones. `AA 55` closes the table at bytes 574-575.
 */

/** The mode id of the record that switches the board to per-key colours. */
export const PER_KEY_MODE = 0x80;

/** Same 576-byte shape as the keymap: four bytes per key slot. */
export const PER_KEY_TABLE_SIZE = TABLE_SIZE;

/** The last slot with a whole record; slot 143 overlaps the `AA 55` trailer. */
export const PER_KEY_SLOT_LIMIT = 142;

export const PER_KEY_TRAILER_OFFSET = 574;

export const PER_KEY_MIN_BRIGHTNESS = 1;
export const PER_KEY_MAX_BRIGHTNESS = 5;

/** The brightness the vendor app sent in every captured mode-`0x80` record. */
export const PER_KEY_DEFAULT_BRIGHTNESS = 5;

export type Rgb = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

const HEX = /^#[0-9a-f]{6}$/i;

const channel = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${name} must be a whole number from 0 to 255`);
  }
  return value;
};

const hexPart = (value: number): string => channel(value, 'colour').toString(16).padStart(2, '0');

/** Reads `#rrggbb`. The picker and the stored draft both use this form. */
export function parseHexColour(hex: string): Rgb {
  if (!HEX.test(hex)) throw new Error(`a colour must be #rrggbb, got ${JSON.stringify(hex)}`);
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function toHexColour(colour: Rgb): string {
  return `#${hexPart(colour.r)}${hexPart(colour.g)}${hexPart(colour.b)}`;
}

/** One four-byte slot: the key index, then its red, green and blue. */
export function buildPerKeyRecord(idx: number, colour: Rgb): Uint8Array {
  if (!Number.isInteger(idx) || idx < 1 || idx > PER_KEY_SLOT_LIMIT) {
    throw new Error(`a per-key slot must be a whole number from 1 to ${PER_KEY_SLOT_LIMIT}`);
  }

  return Uint8Array.from([
    idx,
    channel(colour.r, 'red'),
    channel(colour.g, 'green'),
    channel(colour.b, 'blue'),
  ]);
}

/**
 * The whole table: every key the board has, painted or not, then `AA 55`.
 * Keys missing from `colours` are written as black, which is what the vendor
 * app sent for a key with no colour of its own.
 */
export function buildPerKeyTable(colours: ReadonlyMap<number, string>): Uint8Array {
  const parsed = new Map<number, Rgb>();
  for (const [idx, hex] of colours) {
    if (!Number.isInteger(idx) || idx < 1 || idx > PER_KEY_SLOT_LIMIT) {
      throw new Error(`a per-key slot must be a whole number from 1 to ${PER_KEY_SLOT_LIMIT}`);
    }
    parsed.set(idx, parseHexColour(hex));
  }

  const table = new Uint8Array(PER_KEY_TABLE_SIZE);

  for (const key of FACTORY_KEYS) {
    const colour = parsed.get(key.idx) ?? { r: 0, g: 0, b: 0 };
    table.set(buildPerKeyRecord(key.idx, colour), key.idx * 4);
  }

  table[PER_KEY_TRAILER_OFFSET] = 0xaa;
  table[PER_KEY_TRAILER_OFFSET + 1] = 0x55;
  return table;
}

/**
 * The record that switches the board to per-key colours. Every captured write
 * carried mode `0x80`, a zero colour and brightness 5, with `AA 55` at 14-15:
 *
 *   80 00 00 00 00 00 00 00 00 05 00 00 00 00 AA 55
 */
export function buildPerKeyTrigger(brightness: number = PER_KEY_DEFAULT_BRIGHTNESS): Uint8Array {
  if (
    !Number.isInteger(brightness) ||
    brightness < PER_KEY_MIN_BRIGHTNESS ||
    brightness > PER_KEY_MAX_BRIGHTNESS
  ) {
    throw new Error(
      `brightness must be a whole number from ${PER_KEY_MIN_BRIGHTNESS} to ${PER_KEY_MAX_BRIGHTNESS}`,
    );
  }

  const record = new Uint8Array(64);
  record[0] = PER_KEY_MODE;
  record[9] = brightness;
  record[14] = 0xaa;
  record[15] = 0x55;
  return record;
}

export type PerKeyDescription = {
  /** The sentence the panel shows after a confirmed commit. */
  readonly message: string;
  /** The log line, with the count and the brightness. */
  readonly log: string;
};

/** Describes a per-key write the keyboard has accepted. */
export function describePerKey(painted: number, brightness: number): PerKeyDescription {
  const keys = `${painted} key${painted === 1 ? '' : 's'}`;
  const message =
    painted === 0
      ? 'Sent. No key is painted, so the board is dark in per-key mode.'
      : `Sent. ${keys} painted at brightness ${brightness}; every other key is off.`;

  return { message, log: `Per-key light sent: ${keys} painted, brightness ${brightness}.` };
}
