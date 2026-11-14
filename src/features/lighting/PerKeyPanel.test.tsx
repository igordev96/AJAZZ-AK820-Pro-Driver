import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { updateSettings } from '@/features/settings/useSettings';
import { PerKeyPanel } from './PerKeyPanel';

const W = 'W. No colour; this key is off.';
const W_RED = 'W. Painted #FF0000.';

const renderPanel = (overrides: Partial<Parameters<typeof PerKeyPanel>[0]> = {}) =>
  render(
    <PerKeyPanel
      connected
      busy={false}
      status={{ kind: 'idle' }}
      onApply={vi.fn()}
      {...overrides}
    />,
  );

describe('PerKeyPanel', () => {
  it('paints a key with the brush colour and counts it as unsent', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByText('0 of 81 keys painted')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: W }));

    expect(screen.getByRole('button', { name: 'W. Painted #FF8000.' })).toBeInTheDocument();
    expect(screen.getByText('1 of 81 keys painted')).toBeInTheDocument();
    expect(screen.getByText('1 unsent change.')).toBeInTheDocument();
  });

  it('paints with a swatch colour', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Use #0000ff' }));
    await user.click(screen.getByRole('button', { name: W }));

    expect(screen.getByRole('button', { name: 'W. Painted #0000FF.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use #0000ff' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('erases with the eraser tool', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: W }));
    await user.click(screen.getByRole('radio', { name: 'Eraser' }));
    await user.click(screen.getByRole('button', { name: 'W. Painted #FF8000.' }));

    expect(screen.getByRole('button', { name: W })).toBeInTheDocument();
    expect(screen.getByText('Nothing painted yet.')).toBeInTheDocument();
  });

  it('fills every key and clears them again', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Fill all' }));
    expect(screen.getByText('81 of 81 keys painted')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('0 of 81 keys painted')).toBeInTheDocument();
  });

  it('sends the painted map and the brightness', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onApply });

    await user.click(screen.getByRole('button', { name: W }));
    await user.click(screen.getByRole('button', { name: 'Apply colours' }));

    expect(onApply).toHaveBeenCalledWith({
      colors: { '39': '#ff8000' },
      sent: {},
      brightness: 5,
      sentBrightness: null,
      brush: '#ff8000',
    });
  });

  it('can send a brightness change after the colours went out', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    updateSettings({
      perKey: {
        colors: { '39': '#ff0000' },
        sent: { '39': '#ff0000' },
        brightness: 5,
        sentBrightness: 5,
        brush: '#ff8000',
      },
    });
    renderPanel({ onApply });

    expect(screen.getByText('Everything painted has been sent.')).toBeInTheDocument();

    const brightness = screen.getByRole('slider', { name: 'Brightness' });
    brightness.focus();
    await user.keyboard('{Home}');

    expect(screen.getByText('1 unsent change.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply colours' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ colors: { '39': '#ff0000' }, brightness: 1 }),
    );
  });

  it('puts the brightness back with the draft', async () => {
    const user = userEvent.setup();
    updateSettings({
      perKey: {
        colors: { '39': '#ff0000' },
        sent: { '39': '#ff0000' },
        brightness: 5,
        sentBrightness: 3,
        brush: '#ff8000',
      },
    });
    renderPanel();

    expect(screen.getByRole('button', { name: 'Apply colours' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByRole('slider', { name: 'Brightness' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    );
    expect(screen.getByText('Everything painted has been sent.')).toBeInTheDocument();
  });

  it('keeps apply disabled until something is unsent', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByRole('button', { name: 'Apply colours' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: W }));
    expect(screen.getByRole('button', { name: 'Apply colours' })).toBeEnabled();
  });

  it('offers a write when the last send has no recorded brightness', () => {
    updateSettings({
      perKey: {
        colors: { '39': '#ff0000' },
        sent: { '39': '#ff0000' },
        brightness: 5,
        sentBrightness: null,
        brush: '#ff8000',
      },
    });
    renderPanel();

    expect(screen.getByText('1 unsent change.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply colours' })).toBeEnabled();
  });

  it('puts the draft back to what was last sent', async () => {
    const user = userEvent.setup();
    updateSettings({
      perKey: {
        colors: { '39': '#ff0000' },
        sent: { '39': '#ff0000' },
        brightness: 5,
        sentBrightness: 5,
        brush: '#ff8000',
      },
    });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Use #0000ff' }));
    await user.click(screen.getByRole('button', { name: W_RED }));
    expect(screen.getByRole('button', { name: 'W. Painted #0000FF.' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByRole('button', { name: W_RED })).toBeInTheDocument();
    expect(screen.getByText('Everything painted has been sent.')).toBeInTheDocument();
  });

  it('asks for a connection before a write', () => {
    renderPanel({ connected: false });

    expect(screen.getByText('Connect the keyboard to send the colours.')).toBeInTheDocument();
  });

  it('reports a failure', () => {
    renderPanel({ status: { kind: 'err', message: 'The colours may not have been sent.' } });

    expect(screen.getByText('The colours may not have been sent.')).toBeInTheDocument();
  });

  it('keeps the painted map across a remount', async () => {
    const user = userEvent.setup();
    const first = renderPanel();

    await user.click(screen.getByRole('button', { name: W }));
    first.unmount();

    renderPanel();

    expect(screen.getByRole('button', { name: 'W. Painted #FF8000.' })).toBeInTheDocument();
    expect(screen.getByText('1 unsent change.')).toBeInTheDocument();
  });
});
