import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PendingBar } from './PendingBar';

const baseProps = {
  layer: 'top' as const,
  pendingCount: 2,
  connected: true,
  busy: false,
  confirming: false,
  onUpload: vi.fn(),
  onRestore: vi.fn(),
  onConfirmRestore: vi.fn(),
  onCancelRestore: vi.fn(),
};

describe('PendingBar', () => {
  it('uploads the pending changes', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<PendingBar {...baseProps} onUpload={onUpload} />);

    expect(screen.getByText('2 changes ready')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /upload 2 changes/i }));
    expect(onUpload).toHaveBeenCalled();
  });

  it('disables writing when disconnected', () => {
    render(<PendingBar {...baseProps} connected={false} />);

    expect(screen.getByText('Connect the keyboard to upload.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload 2 changes/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /restore factory map/i })).toBeDisabled();
  });

  it('asks before restoring and can cancel', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const onCancelRestore = vi.fn();
    const { rerender } = render(
      <PendingBar {...baseProps} onRestore={onRestore} onCancelRestore={onCancelRestore} />,
    );

    await user.click(screen.getByRole('button', { name: /restore factory map/i }));
    expect(onRestore).toHaveBeenCalled();

    rerender(<PendingBar {...baseProps} confirming onCancelRestore={onCancelRestore} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancelRestore).toHaveBeenCalled();
  });

  it('confirms a restore with the destructive action', async () => {
    const user = userEvent.setup();
    const onConfirmRestore = vi.fn();
    render(<PendingBar {...baseProps} confirming onConfirmRestore={onConfirmRestore} />);

    await user.click(screen.getByRole('button', { name: /restore factory map/i }));
    expect(onConfirmRestore).toHaveBeenCalled();
  });

  it('labels the Fn restore correctly', () => {
    render(<PendingBar {...baseProps} layer="fn" pendingCount={0} />);

    expect(screen.getByText('No pending changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all fn overrides/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload changes/i })).toBeDisabled();
  });
});
