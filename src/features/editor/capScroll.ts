/** A legend has to stick out at least this far before moving it is worth the motion. */
export const MIN_SCROLL_PX = 2;

/** About nine pixels a second, so a long legend is not a slower legend. */
const PX_PER_SECOND = 9;
const MIN_DURATION = 3;
const MAX_DURATION = 10;

/** The distance a legend has to travel, or 0 when the cap already holds it. */
export function capScrollTravel(overflow: number): number {
  return overflow >= MIN_SCROLL_PX ? overflow : 0;
}

/**
 * How long one pass takes. The board measures the travel, so the duration comes
 * from the distance and not from the letter count, which used to make a short
 * label crawl and a long one sprint.
 */
export function capScrollDuration(travel: number): number {
  const seconds = Math.abs(travel) / PX_PER_SECOND;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(seconds * 10) / 10));
}
