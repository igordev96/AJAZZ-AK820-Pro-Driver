import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREEN_BLOCKS_PER_FRAME, SCREEN_FRAME_BYTES } from '@/lib/screen';
import { AnimationStage } from './AnimationStage';
import type { PickedAnimation } from './useAnimationFile';

const putImageData = vi.fn();
const createImageData = vi.fn((width: number, height: number) => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
}));

const originalContext = HTMLCanvasElement.prototype.getContext;
const originalMatchMedia = window.matchMedia;

const frame = (red: number) => {
  const bytes = new Uint8Array(SCREEN_FRAME_BYTES);
  const value = (red & 0x1f) << 11;
  bytes[0] = value & 0xff;
  bytes[1] = value >> 8;
  return bytes;
};

const picked: PickedAnimation = {
  frames: [frame(31), frame(0)],
  delays: [100, 100],
  frameCount: 2,
  truncated: false,
  name: 'demo.gif',
};

beforeEach(() => {
  putImageData.mockClear();
  createImageData.mockClear();
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ({ createImageData, putImageData }),
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: originalContext,
    configurable: true,
  });
  Object.defineProperty(window, 'matchMedia', {
    value: originalMatchMedia,
    configurable: true,
  });
});

describe('AnimationStage', () => {
  it('says nothing is selected yet', () => {
    render(<AnimationStage picked={null} sending={false} progress={null} />);

    expect(screen.getByText('No animation selected.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws the first frame of the picked file', () => {
    render(<AnimationStage picked={picked} sending={false} progress={null} />);

    expect(screen.getByRole('img', { name: /frame 1 of 2/i })).toBeInTheDocument();
    expect(putImageData).toHaveBeenCalledTimes(1);
  });

  it('advances on each frame delay', () => {
    vi.useFakeTimers();
    render(<AnimationStage picked={picked} sending={false} progress={null} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByRole('img', { name: /frame 2 of 2/i })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByRole('img', { name: /frame 1 of 2/i })).toBeInTheDocument();
  });

  it('pauses on the frame being written while sending', () => {
    render(
      <AnimationStage
        picked={picked}
        sending
        progress={{ sent: SCREEN_BLOCKS_PER_FRAME + 1, total: SCREEN_BLOCKS_PER_FRAME * 2 + 1 }}
      />,
    );

    expect(screen.getByRole('img', { name: /frame 2 of 2/i })).toBeInTheDocument();
    expect(screen.getByText('Sending frame 2 of 2')).toBeInTheDocument();
  });

  it('starts paused when the reader asked for less motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
      configurable: true,
    });

    render(<AnimationStage picked={picked} sending={false} progress={null} />);

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /frame 1 of 2/i })).toBeInTheDocument();
  });
});
