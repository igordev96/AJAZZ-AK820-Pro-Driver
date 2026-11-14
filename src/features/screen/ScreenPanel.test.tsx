import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenPanel } from './ScreenPanel';

const originalContext = HTMLCanvasElement.prototype.getContext;
const originalCreateImageBitmap = globalThis.createImageBitmap;

const renderPanel = (
  onSend = vi.fn(),
  props: {
    wireless?: boolean;
    onSendAnimation?: (frames: Uint8Array[], delays: number[]) => void;
  } = {},
) =>
  render(
    <ScreenPanel
      connected
      screenReady
      busy={false}
      status={{ kind: 'idle' }}
      animationStatus={{ kind: 'idle' }}
      animationProgress={null}
      animationSending={false}
      onSend={onSend}
      onSendAnimation={props.onSendAnimation ?? vi.fn()}
      wireless={props.wireless}
    />,
  );

beforeEach(() => {
  Object.defineProperty(globalThis, 'createImageBitmap', {
    value: async () => ({ width: 128, height: 128, close: () => {} }),
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ({
      drawImage: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(128 * 128 * 4) }),
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      putImageData: () => {},
    }),
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: originalContext,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    value: originalCreateImageBitmap,
    configurable: true,
  });
});

describe('ScreenPanel', () => {
  it('previews the local time and sends it', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderPanel(onSend);

    expect(screen.getByRole('img', { name: /screen preview showing/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send time' }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[0]).toBeInstanceOf(Date);
  });

  it('sends the custom time chosen in the picker', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderPanel(onSend);

    await user.click(screen.getByRole('tab', { name: 'Custom' }));
    await user.click(screen.getByRole('button', { name: /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/ }));
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '03:04:05' } });
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('img', { name: /03:04:05/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send time' }));

    const sent = onSend.mock.calls[0]?.[0] as Date;
    expect(sent.getHours()).toBe(3);
    expect(sent.getMinutes()).toBe(4);
    expect(sent.getSeconds()).toBe(5);
  });

  it('opens the animation tab with an empty stage', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('tab', { name: /animation/i }));

    expect(screen.getByText('No animation selected.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send animation' })).toBeDisabled();
  });

  it('keeps the picked file when you look at the clock and come back', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('tab', { name: /animation/i }));
    await user.upload(
      screen.getByLabelText('Choose a file'),
      new File(['pixels'], 'wave.png', { type: 'image/png' }),
    );

    expect(await screen.findByText(/wave\.png/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /frame 1 of 1/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Clock' }));
    await user.click(screen.getByRole('tab', { name: /animation/i }));

    expect(screen.getByRole('img', { name: /frame 1 of 1/i })).toBeInTheDocument();
  });

  it('marks the animation tab USB only over the receiver', () => {
    renderPanel(vi.fn(), { wireless: true });

    expect(screen.getByRole('tab', { name: /animation \(usb only\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Clock' })).toBeEnabled();
  });
});
