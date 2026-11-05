import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the workbench and allows offline editing', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('AK820 Pro')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();

    const board = screen.getByRole('group', { name: /keyboard board/i });
    expect(within(board).getAllByRole('button')).toHaveLength(81);
    expect(screen.getByRole('button', { name: /connect keyboard/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /upload changes/i })).toBeDisabled();

    await user.click(within(board).getByRole('button', { name: 'CapsLock' }));

    expect(screen.getByText('CapsLock')).toBeInTheDocument();
    expect(screen.getByLabelText('Sends')).toHaveTextContent('CapsLock (0x39)');
  });

  it('switches to the Fn layer and locks six keys', async () => {
    const user = userEvent.setup();
    render(<App />);
    const board = screen.getByRole('group', { name: /keyboard board/i });

    await user.click(screen.getByRole('tab', { name: /fn layer/i }));

    expect(screen.getByRole('tab', { name: /fn layer/i })).toHaveAttribute('aria-selected', 'true');
    expect(
      within(board)
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('disabled')),
    ).toHaveLength(6);
  });

  it('marks a media edit as pending', async () => {
    const user = userEvent.setup();
    render(<App />);
    const board = screen.getByRole('group', { name: /keyboard board/i });

    await user.click(within(board).getByRole('button', { name: 'CapsLock' }));
    await user.click(screen.getByLabelText('Sends'));
    await user.type(screen.getByLabelText('Search a key or usage'), 'mute');
    await user.click(await screen.findByRole('option', { name: 'Media: Mute (c:0xE2)' }));
    expect(screen.getByText('Change pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload 1 change/i })).toBeDisabled();
  });

  it('opens the device view', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Device' }));

    expect(await screen.findByRole('button', { name: 'Apply settings' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Bluetooth' })).toBeInTheDocument();
  });

  it('links to the repository', () => {
    render(<App />);

    const link = screen.getByRole('link', { name: /open the project on github/i });

    expect(link).toHaveAttribute('href', 'https://github.com/igordev96/AJAZZ-AK820-Pro-Driver');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('opens the log drawer', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /^log$/i }));

    expect(screen.getByRole('log')).toHaveTextContent('No activity yet.');
  });

  it('clears the selected key on a second click', async () => {
    const user = userEvent.setup();
    render(<App />);
    const board = screen.getByRole('group', { name: /keyboard board/i });
    const caps = within(board).getByRole('button', { name: 'CapsLock' });

    await user.click(caps);
    expect(caps).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('CapsLock')).toBeInTheDocument();

    await user.click(caps);
    expect(caps).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('CapsLock')).not.toBeInTheDocument();
    expect(screen.getByText('No key selected')).toBeInTheDocument();
  });

  it('remembers a pending top-layer edit across a reload', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    const board = screen.getByRole('group', { name: /keyboard board/i });

    await user.click(within(board).getByRole('button', { name: 'CapsLock' }));
    await user.click(screen.getByLabelText('Sends'));
    await user.type(screen.getByLabelText('Search a key or usage'), 'mute');
    await user.click(await screen.findByRole('option', { name: 'Media: Mute (c:0xE2)' }));

    expect(screen.getByText('Change pending')).toBeInTheDocument();
    first.unmount();

    render(<App />);

    const restored = screen.getByRole('group', { name: /keyboard board/i });
    await user.click(within(restored).getByRole('button', { name: 'CapsLock' }));

    expect(screen.getByLabelText('Sends')).toHaveTextContent('Media: Mute (c:0xE2)');
    expect(screen.getByText('Change pending')).toBeInTheDocument();
  });

  it('remembers a pending Fn edit the same way', async () => {
    const user = userEvent.setup();
    const first = render(<App />);

    await user.click(screen.getByRole('tab', { name: /fn layer/i }));
    const board = screen.getByRole('group', { name: /keyboard board/i });
    await user.click(within(board).getByRole('button', { name: 'A' }));
    await user.click(screen.getByLabelText('Sends'));
    await user.type(screen.getByLabelText('Search a key or usage'), 'mute');
    await user.click(await screen.findByRole('option', { name: 'Media: Mute (c:0xE2)' }));

    expect(screen.getByText('Change pending')).toBeInTheDocument();
    first.unmount();

    render(<App />);
    await user.click(screen.getByRole('tab', { name: /fn layer/i }));
    const restored = screen.getByRole('group', { name: /keyboard board/i });
    await user.click(within(restored).getByRole('button', { name: 'A' }));

    expect(screen.getByLabelText('Sends')).toHaveTextContent('Media: Mute (c:0xE2)');
    expect(screen.getByText('Change pending')).toBeInTheDocument();
  });
});
