import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './AppHeader';
import type { DeviceState } from './useDevice';

const device = (patch: Partial<DeviceState> = {}): DeviceState => ({
  status: 'idle',
  device: null,
  screenDevice: null,
  name: null,
  vendorId: null,
  productId: null,
  link: null,
  configFound: false,
  screenFound: false,
  error: null,
  ...patch,
});

const baseProps = {
  device: device(),
  supported: true,
  canReconnect: false,
  busy: false,
  logOpen: false,
  onConnect: vi.fn(),
  onChooseAnother: vi.fn(),
  onDisconnect: vi.fn(),
  onAdvanced: vi.fn(),
  advancedDisabled: true,
  onToggleLog: vi.fn(),
  profileDisabled: false,
  onExportProfile: vi.fn(),
  onImportProfile: vi.fn(),
};

describe('AppHeader', () => {
  it('asks for the chooser on a first visit', () => {
    render(<AppHeader {...baseProps} />);

    expect(screen.getByRole('button', { name: /connect keyboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /other keyboards/i })).not.toBeInTheDocument();
  });

  it('reconnects from the button and reaches the chooser from the menu', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    const onChooseAnother = vi.fn();
    render(
      <AppHeader
        {...baseProps}
        canReconnect
        onConnect={onConnect}
        onChooseAnother={onChooseAnother}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^reconnect$/i }));
    expect(onConnect).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /other keyboards/i }));
    await user.click(await screen.findByRole('button', { name: /choose another keyboard/i }));
    expect(onChooseAnother).toHaveBeenCalled();
  });

  it('offers a disconnect once the keyboard is open', () => {
    render(<AppHeader {...baseProps} device={device({ status: 'connected', link: 'usb' })} />);

    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reconnect$/i })).not.toBeInTheDocument();
  });
});
