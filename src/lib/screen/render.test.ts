import { describe, expect, it } from 'vitest';
import { SCREEN_FRAME_BYTES, SCREEN_HEIGHT, SCREEN_WIDTH, encodeRgb565 } from './animation';
import { rgb565ToRgba } from './render';

const frameOf = (bytes: number[]): Uint8Array => {
  const frame = new Uint8Array(SCREEN_FRAME_BYTES);
  frame.set(bytes);
  return frame;
};

describe('rgb565ToRgba', () => {
  it('expands the first pixel of a frame', () => {
    const rgba = rgb565ToRgba(frameOf([0x00, 0xf8]));

    expect(Array.from(rgba.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it('reads green and blue in the screen order', () => {
    const green = rgb565ToRgba(frameOf([0xe0, 0x07]));
    const blue = rgb565ToRgba(frameOf([0x1f, 0x00]));

    expect(Array.from(green.slice(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(blue.slice(0, 4))).toEqual([0, 0, 255, 255]);
  });

  it('covers the whole panel', () => {
    const rgba = rgb565ToRgba(frameOf([]));

    expect(rgba).toHaveLength(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  });

  it('round trips through the encoder', () => {
    const rgba = new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
    rgba.fill(0x7a);

    const encoded = encodeRgb565(rgba);
    const again = encodeRgb565(rgb565ToRgba(encoded));

    expect(again).toEqual(encoded);
  });

  it('refuses a frame of the wrong size', () => {
    expect(() => rgb565ToRgba(new Uint8Array(4))).toThrow(/expected 32768 bytes/);
  });
});
