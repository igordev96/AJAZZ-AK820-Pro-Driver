import { describe, expect, it } from 'vitest';
import { MIN_SCROLL_PX, capScrollDuration, capScrollTravel } from './capScroll';

describe('capScrollTravel', () => {
  it('moves a legend only when the cap really cuts it', () => {
    expect(capScrollTravel(0)).toBe(0);
    expect(capScrollTravel(1.9)).toBe(0);
    expect(capScrollTravel(3.9)).toBe(0);
    expect(capScrollTravel(MIN_SCROLL_PX)).toBe(MIN_SCROLL_PX);
    expect(capScrollTravel(46)).toBe(46);
  });
});

describe('capScrollDuration', () => {
  it('clamps a short travel to the slowest pass and a long one to the quickest', () => {
    expect(capScrollDuration(2)).toBe(3);
    expect(capScrollDuration(500)).toBe(10);
  });

  it('takes the pass from the distance, so the speed is steady', () => {
    const near = capScrollDuration(18);
    const far = capScrollDuration(45);

    expect(near).toBe(3);
    expect(far).toBe(5);
    expect(far).toBeGreaterThan(near);
  });
});
