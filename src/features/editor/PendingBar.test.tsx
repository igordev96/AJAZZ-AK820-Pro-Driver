import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EditorRow } from '@/lib/editor';
import { createInitialState } from '@/lib/editor';
import { PendingBar } from './PendingBar';

const row = (name: string, patch: Partial<EditorRow> = {}): EditorRow => ({
  ...createInitialState().top.find((item) => item.name === name)!,
  ...patch,
});

const baseProps = {
  layer: 'top' as const,
  pending: [row('Esc', { usage: 0x39 }), row('CapsLock', { usage: 0x29 })],
  connected: true,
  busy: false,
  confirming: false,
  onUpload: vi.fn(),
  onRestore: vi.fn(),
  onConfirmRestore: vi.fn(),
  onCancelRestore: vi.fn(),
};

describe('PendingBar', () => {
  it('lists the keys the upload carries', () => {
    render(<PendingBar {...baseProps} />);

    expect(screen.getByText('2 changes ready')).toBeInTheDocument();
    expect(screen.getByLabelText('Changes to upload')).toHaveTextContent('Esc → CapsLock');
    expect(screen.getByLabelText('Changes to upload')).toHaveTextContent('CapsLock → Esc');
  });

  it('counts the rows past the limit instead of listing all of them', () => {
    const pending = Array.from({ length: 11 }, (_, index) => row('Esc', { usage: index + 1 }));
    render(<PendingBar {...baseProps} pending={pending} />);

    const list = screen.getByLabelText('Changes to upload');
    expect(list.querySelectorAll('li')).toHaveLength(9);
    expect(list).toHaveTextContent('and 3 more');
  });

  it('uploads the pending changes', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<PendingBar {...baseProps} onUpload={onUpload} />);

    await user.click(screen.getByRole('button', { name: /upload 2 changes/i }));
    expect(onUpload).toHaveBeenCalled();
  });

  it('keeps the list while disconnected', () => {
    render(<PendingBar {...baseProps} connected={false} />);

    expect(screen.getByText('Connect the keyboard to upload.')).toBeInTheDocument();
    expect(screen.getByLabelText('Changes to upload')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload 2 changes/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /restore factory map/i })).toBeDisabled();
  });

  it('hides the list while the restore question is up', () => {
    render(<PendingBar {...baseProps} confirming />);

    expect(screen.queryByLabelText('Changes to upload')).not.toBeInTheDocument();
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
    render(<PendingBar {...baseProps} layer="fn" pending={[]} />);

    expect(screen.getByText('No pending changes')).toBeInTheDocument();
    expect(screen.queryByLabelText('Changes to upload')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all fn overrides/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload changes/i })).toBeDisabled();
  });
});
