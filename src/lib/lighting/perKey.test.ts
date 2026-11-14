import { FACTORY_KEYS } from '@/lib/keymap';
import { describe, expect, it } from 'vitest';
import {
  PER_KEY_TABLE_SIZE,
  buildPerKeyRecord,
  buildPerKeyTable,
  buildPerKeyTrigger,
  describePerKey,
  parseHexColour,
  toHexColour,
} from './perKey';

const W = 39;
const E = 40;
const R = 41;
const T = 42;
const Q = 38;

const recordAt = (table: Uint8Array, slot: number) =>
  Array.from(table.subarray(slot * 4, slot * 4 + 4));

// The four colours painted in `re/captures/usb-perkey-colour.log`, 13 Nov 2026.
const captured = new Map<number, string>([
  [W, '#ff0000'],
  [E, '#00ff00'],
  [R, '#0000ff'],
  [T, '#ffffff'],
]);

describe('per-key records', () => {
  it('writes the key index and the three colour bytes', () => {
    expect(Array.from(buildPerKeyRecord(W, { r: 255, g: 0, b: 0 }))).toEqual([0x27, 0xff, 0, 0]);
    expect(Array.from(buildPerKeyRecord(E, { r: 0, g: 255, b: 0 }))).toEqual([0x28, 0, 0xff, 0]);
    expect(Array.from(buildPerKeyRecord(R, { r: 0, g: 0, b: 255 }))).toEqual([0x29, 0, 0, 0xff]);
    expect(Array.from(buildPerKeyRecord(T, { r: 255, g: 255, b: 255 }))).toEqual([
      0x2a, 0xff, 0xff, 0xff,
    ]);
  });

  it('refuses a slot outside the table', () => {
    expect(() => buildPerKeyRecord(0, { r: 0, g: 0, b: 0 })).toThrow('1 to 142');
    expect(() => buildPerKeyRecord(143, { r: 0, g: 0, b: 0 })).toThrow('1 to 142');
  });

  it('refuses a channel that is not a byte', () => {
    expect(() => buildPerKeyRecord(W, { r: 256, g: 0, b: 0 })).toThrow('0 to 255');
    expect(() => buildPerKeyRecord(W, { r: 0, g: -1, b: 0 })).toThrow('0 to 255');
  });
});

describe('per-key table', () => {
  it('matches the captured records', () => {
    const table = buildPerKeyTable(captured);

    expect(table).toHaveLength(PER_KEY_TABLE_SIZE);
    expect(recordAt(table, W)).toEqual([0x27, 0xff, 0, 0]);
    expect(recordAt(table, E)).toEqual([0x28, 0, 0xff, 0]);
    expect(recordAt(table, R)).toEqual([0x29, 0, 0, 0xff]);
    expect(recordAt(table, T)).toEqual([0x2a, 0xff, 0xff, 0xff]);
    expect(Array.from(table.subarray(574, 576))).toEqual([0xaa, 0x55]);
  });

  it('writes every known key, black when it has no colour', () => {
    const table = buildPerKeyTable(captured);

    expect(FACTORY_KEYS).toHaveLength(81);
    for (const key of FACTORY_KEYS) {
      expect(table[key.idx * 4]).toBe(key.idx);
    }

    expect(recordAt(table, Q)).toEqual([0x26, 0, 0, 0]);
    // A slot with no key at all stays zeroed, as the vendor app left it.
    expect(recordAt(table, 122)).toEqual([0, 0, 0, 0]);
  });

  it('accepts an empty map and still fills every slot and the trailer', () => {
    const table = buildPerKeyTable(new Map());

    expect(table).toHaveLength(PER_KEY_TABLE_SIZE);
    expect(table[W * 4]).toBe(W);
    expect(Array.from(table.subarray(574, 576))).toEqual([0xaa, 0x55]);
  });

  it('refuses an unknown slot in the map', () => {
    expect(() => buildPerKeyTable(new Map([[143, '#ffffff']]))).toThrow('1 to 142');
    expect(() => buildPerKeyTable(new Map([[0, '#ffffff']]))).toThrow('1 to 142');
  });
});

describe('per-key colours', () => {
  it('round-trips hex and channels', () => {
    expect(parseHexColour('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(toHexColour({ r: 255, g: 128, b: 0 })).toBe('#ff8000');
    expect(toHexColour(parseHexColour('#0a0b0c'))).toBe('#0a0b0c');
  });

  it('refuses a colour that is not #rrggbb', () => {
    expect(() => parseHexColour('ff0000')).toThrow('#rrggbb');
    expect(() => parseHexColour('#ff00')).toThrow('#rrggbb');
  });
});

describe('per-key trigger', () => {
  it('sends mode 0x80 with brightness and the trailer', () => {
    const trigger = buildPerKeyTrigger(5);

    expect(trigger).toHaveLength(64);
    expect(Array.from(trigger.subarray(0, 16))).toEqual([
      0x80, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0xaa, 0x55,
    ]);
    expect(trigger.subarray(16).every((byte) => byte === 0)).toBe(true);
  });

  it('defaults to the captured brightness', () => {
    expect(buildPerKeyTrigger()[9]).toBe(5);
  });

  it('refuses a brightness outside 1-5', () => {
    expect(() => buildPerKeyTrigger(0)).toThrow('1 to 5');
    expect(() => buildPerKeyTrigger(6)).toThrow('1 to 5');
  });
});

describe('per-key wording', () => {
  it('counts the keys in the message and the log', () => {
    expect(describePerKey(4, 5)).toEqual({
      message: 'Sent. 4 keys painted at brightness 5; every other key is off.',
      log: 'Per-key light sent: 4 keys painted, brightness 5.',
    });
    expect(describePerKey(1, 3).message).toBe(
      'Sent. 1 key painted at brightness 3; every other key is off.',
    );
  });

  it('says so when nothing is painted', () => {
    expect(describePerKey(0, 5).message).toBe(
      'Sent. No key is painted, so the board is dark in per-key mode.',
    );
  });
});
