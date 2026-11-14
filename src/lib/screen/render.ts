import { SCREEN_FRAME_BYTES, SCREEN_HEIGHT, SCREEN_WIDTH } from './animation';

/**
 * Expands one little-endian RGB565 frame to RGBA, so a canvas can draw the
 * pixels the keyboard receives instead of the picture they came from.
 */
export function rgb565ToRgba(frame: Uint8Array): Uint8ClampedArray {
  if (frame.length !== SCREEN_FRAME_BYTES) {
    throw new Error(`expected ${SCREEN_FRAME_BYTES} bytes of RGB565, got ${frame.length}`);
  }

  const rgba = new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4);

  for (let source = 0, target = 0; source < frame.length; source += 2, target += 4) {
    const value = (frame[source] ?? 0) | ((frame[source + 1] ?? 0) << 8);
    const red = (value >> 11) & 0x1f;
    const green = (value >> 5) & 0x3f;
    const blue = value & 0x1f;

    rgba[target] = (red << 3) | (red >> 2);
    rgba[target + 1] = (green << 2) | (green >> 4);
    rgba[target + 2] = (blue << 3) | (blue >> 2);
    rgba[target + 3] = 0xff;
  }

  return rgba;
}
