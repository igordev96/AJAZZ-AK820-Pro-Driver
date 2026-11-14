export {
  LIGHT_MAX_BRIGHTNESS,
  LIGHT_MAX_SPEED,
  LIGHT_MIN_BRIGHTNESS,
  LIGHT_MIN_SPEED,
  LIGHT_MODE_OFF,
  LIGHT_MODES,
  LIGHT_RECORD_SIZE,
  buildLightRecord,
} from './record';
export type { LightDirection, LightMode, LightRecord } from './record';
export { lightMotion, lightPhase } from './preview';
export type { LightKey, LightMotion } from './preview';
export { describeLight } from './describe';
export type { LightDescription, LightSettings } from './describe';
export {
  PER_KEY_DEFAULT_BRIGHTNESS,
  PER_KEY_MAX_BRIGHTNESS,
  PER_KEY_MIN_BRIGHTNESS,
  PER_KEY_MODE,
  PER_KEY_SLOT_LIMIT,
  PER_KEY_TABLE_SIZE,
  PER_KEY_TRAILER_OFFSET,
  buildPerKeyRecord,
  buildPerKeyTable,
  buildPerKeyTrigger,
  describePerKey,
  parseHexColour,
  toHexColour,
} from './perKey';
export type { PerKeyDescription, Rgb } from './perKey';
