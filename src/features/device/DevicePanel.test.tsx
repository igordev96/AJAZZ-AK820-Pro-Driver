import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEVICE_SETTINGS } from '@/lib/device';
import { DevicePanel, type DevicePanelProps } from './DevicePanel';

const renderPanel = (overrides: Partial<DevicePanelProps> = {}) =>
  render(
    <DevicePanel
      connected
      busy={false}
      status={{ kind: 'idle' }}
      onApply={vi.fn()}
      {...overrides}
    />,
  );

const choose = async (user: ReturnType<typeof userEvent.setup>, label: string, option: string) => {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
};

describe('DevicePanel', () => {
  it('names the link the page writes over', () => {
    const { container } = renderPanel({ wireless: true });

    expect(container.textContent).toContain('writes over 2.4 GHz');
    expect(container.textContent).toContain('2.4 GHz column is the one it applies');
  });

  it('shows the response time for each level and link', () => {
    renderPanel();

    expect(screen.getByRole('columnheader', { name: 'Wired' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '2.4 GHz' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Bluetooth' })).toBeInTheDocument();
    expect(screen.getByText('2-3 ms')).toBeInTheDocument();
    expect(screen.getByText('27-28 ms')).toBeInTheDocument();
  });

  it('applies the defaults in one write', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onApply });

    await user.click(screen.getByRole('button', { name: 'Apply settings' }));

    expect(onApply).toHaveBeenCalledWith(DEFAULT_DEVICE_SETTINGS);
  });

  it('sends a changed level and sleep time', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onApply });

    await choose(user, 'Key response time', 'Level 3');
    await choose(user, 'Sleep time', '30 minutes');
    await user.click(screen.getByRole('button', { name: 'Apply settings' }));

    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_DEVICE_SETTINGS,
      responseLevel: 3,
      sleep: 3,
    });
  });

  it('sends each blocked shortcut', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onApply });

    await user.click(screen.getByRole('checkbox', { name: 'Windows key' }));
    await user.click(screen.getByRole('checkbox', { name: 'Alt + Tab' }));
    await user.click(screen.getByRole('button', { name: 'Apply settings' }));

    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_DEVICE_SETTINGS,
      disableWindowsKey: true,
      disableAltTab: true,
    });
  });

  it('disables the controls while a transfer runs', () => {
    renderPanel({ busy: true });

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Key response time' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Alt + F4' })).toBeDisabled();
  });

  it('asks for a connection before offering a write', () => {
    renderPanel({ connected: false });

    expect(screen.getByRole('button', { name: 'Apply settings' })).toBeDisabled();
    expect(screen.getByText('Connect the keyboard to change these.')).toBeInTheDocument();
  });

  it('reports success', () => {
    renderPanel({
      status: { kind: 'ok', message: 'Sent. Level 1 (2-3 ms wired), sleep after 5 minutes.' },
    });

    expect(screen.getByText(/Sent\. Level 1/)).toBeInTheDocument();
  });

  it('reports a failed write', () => {
    renderPanel({ status: { kind: 'err', message: 'The settings could not be sent.' } });

    expect(screen.getByText(/could not be sent/)).toBeInTheDocument();
  });

  it('keeps the chosen values after a remount', async () => {
    const user = userEvent.setup();
    const first = renderPanel();
    await user.click(screen.getByRole('checkbox', { name: 'Windows key' }));
    first.unmount();

    renderPanel();

    expect(screen.getByRole('checkbox', { name: 'Windows key' })).toBeChecked();
  });

  it('disables the two blocks the receiver ignores', () => {
    renderPanel({ wireless: true });

    expect(screen.getByRole('checkbox', { name: 'Alt + F4' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Alt + Tab' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Windows key' })).toBeEnabled();
    expect(screen.getAllByText('USB only')).toHaveLength(2);
  });

  it('says when nothing has been sent from this browser', () => {
    renderPanel();

    expect(screen.getByText('Not sent from this browser yet.')).toBeInTheDocument();
  });

  it('shows the last send when the draft still matches it', () => {
    renderPanel({ lastSent: { values: DEFAULT_DEVICE_SETTINGS, at: Date.now() } });

    expect(
      screen.getByText(/Last sent .*forgets these when it is switched off/),
    ).toBeInTheDocument();
  });

  it('marks a draft that moved since the last send', async () => {
    const user = userEvent.setup();
    renderPanel({
      lastSent: { values: DEFAULT_DEVICE_SETTINGS, at: Date.now() },
    });

    await user.click(screen.getByRole('checkbox', { name: 'Windows key' }));

    expect(
      screen.getByText('Changed since the last send. Apply to send them again.'),
    ).toBeInTheDocument();
  });
});
