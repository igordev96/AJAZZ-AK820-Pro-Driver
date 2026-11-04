import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/lib/toast';
import { LogPanel } from './LogPanel';
import type { LogEntry } from './useLog';

vi.mock('@/lib/toast', () => ({
  notify: { ok: vi.fn(), err: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const entries: LogEntry[] = [
  { id: 1, time: '10:00:00', level: 'info', message: 'SEND  02 00 00' },
  { id: 2, time: '10:00:01', level: 'ok', message: 'device opened' },
];

const renderPanel = (overrides: { entries?: LogEntry[] } = {}) =>
  render(
    <LogPanel entries={overrides.entries ?? entries} open onToggle={vi.fn()} onClear={vi.fn()} />,
  );

beforeEach(() => {
  vi.mocked(notify.ok).mockClear();
  vi.mocked(notify.err).mockClear();
});

describe('LogPanel', () => {
  it('disables Copy while the log is empty', () => {
    renderPanel({ entries: [] });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('confirms a copy with the line count', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(notify.ok).toHaveBeenCalledWith('Log copied, 2 lines.');
  });

  it('says so when the clipboard is refused', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(notify.err).toHaveBeenCalledWith('The clipboard was refused. The log stays on screen.');
  });
});
