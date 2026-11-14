export {
  SCREEN_BLOCKS_PER_FRAME,
  SCREEN_BLOCK_SIZE,
  SCREEN_DELAY_UNIT_MS,
  SCREEN_FRAME_BYTES,
  SCREEN_FRAMES_OFFSET,
  SCREEN_HEIGHT,
  SCREEN_MAX_DELAY_MS,
  SCREEN_MAX_FRAMES,
  SCREEN_MIN_DELAY_MS,
  SCREEN_WIDTH,
  buildAnimationPayload,
  encodeRgb565,
  normalizeDelayMs,
} from './animation';
export type { AnimationInput } from './animation';
export { decodeAnimation, supportsAnimationDecoding } from './decode';
export type { DecodedAnimation } from './decode';
export { rgb565ToRgba } from './render';
