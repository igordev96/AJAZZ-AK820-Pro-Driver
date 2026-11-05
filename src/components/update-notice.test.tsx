import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '@/lib/build';
import { createUpdateStore } from '@/pwa/update-store';
import { UpdateNotice } from './update-notice';

describe('UpdateNotice', () => {
  it('stays out of the way until a build is waiting', () => {
    render(<UpdateNotice store={createUpdateStore()} />);

    expect(screen.queryByText(/newer build/i)).not.toBeInTheDocument();
  });

  it('names the build that is running and the one thing to do', () => {
    const store = createUpdateStore();
    render(<UpdateNotice store={store} />);

    act(() => store.markReady());

    expect(
      screen.getByText(new RegExp(`switch from ${APP_VERSION.replaceAll('.', '\\.')}`)),
    ).toBeInTheDocument();
    expect(screen.getByText(/drafts stay in this browser/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('asks the worker to take the new build when Reload is pressed', async () => {
    const user = userEvent.setup();
    const store = createUpdateStore();
    const reload = vi.fn();
    store.setHandler(reload);
    render(<UpdateNotice store={store} />);
    act(() => store.markReady());

    await user.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
