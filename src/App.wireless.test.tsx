import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { WebHid, WebHidDevice } from '@/lib/hid';
import { App } from './App';

/**
 * A receiver as Chrome presents it: no 0xFF13, one 0xFF60/0x0061 interface with
 * 32-byte output reports, and no feature reports.
 */
const installReceiver = () => {
  const frames: Uint8Array[] = [];
  const listeners: Array<() => void> = [];

  const device: WebHidDevice = {
    opened: false,
    productName: '2.4G Dongle',
    vendorId: 0x0c45,
    productId: 0xfdfd,
    collections: [
      {
        usagePage: 0xff60,
        usage: 0x0061,
        outputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 32 }] }],
        inputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 32 }] }],
      },
    ],
    open: async () => {},
    close: async () => {},
    sendFeatureReport: async () => {},
    receiveFeatureReport: async () => new DataView(new ArrayBuffer(64)),
    sendReport: async (_reportId, data) => {
      frames.push(new Uint8Array(data as Uint8Array));
    },
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
    removeEventListener: () => {},
  };

  const hid: WebHid = {
    requestDevice: async () => [device],
    getDevices: async () => [],
  };
  Object.defineProperty(navigator, 'hid', { value: hid, configurable: true });

  return { frames };
};

const connect = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /connect keyboard/i }));
  await screen.findByText('2.4G Dongle');
};

describe('App over the 2.4 GHz receiver', () => {
  it('says the link is unconfirmed and sends a key patch instead of a table', async () => {
    const { frames } = installReceiver();
    const user = userEvent.setup();
    render(<App />);
    await connect(user);

    expect(
      screen.getByText(/key changes go one at a time and the keyboard does not confirm them/i),
    ).toBeInTheDocument();

    const board = screen.getByRole('group', { name: /keyboard board/i });
    await user.click(within(board).getByRole('button', { name: 'CapsLock' }));
    await user.click(screen.getByLabelText('Sends'));
    await user.type(screen.getByLabelText('Search a key or usage'), 'a (0x04)');
    await user.click(await screen.findByRole('option', { name: 'A (0x04)' }));

    await user.click(screen.getByRole('button', { name: /upload 1 change/i }));

    await screen.findByText('No pending changes');
    await user.click(screen.getByRole('button', { name: /^log$/i }));
    await screen.findByText(/Sent 1 key change over 2\.4 GHz/);
    expect(screen.getByRole('log')).toHaveTextContent(/The keyboard does not confirm them/);

    // init, heartbeat, then one patch for the key.
    const patch = frames[2];
    expect(frames).toHaveLength(3);
    expect(patch?.[0]).toBe(0x03);
    expect(patch?.[1]).toBe(4);
    expect(patch?.[2]).toBe(55);
    expect(Array.from(patch?.slice(3, 7) ?? [])).toEqual([0x02, 0x00, 0x04, 0x00]);
  });

  it('offers the Windows block only, and says why the other two wait for USB', async () => {
    const { frames } = installReceiver();
    const user = userEvent.setup();
    render(<App />);
    await connect(user);

    await user.click(screen.getByRole('tab', { name: 'Device' }));

    expect(await screen.findByRole('checkbox', { name: 'Alt + F4' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Alt + Tab' })).toBeDisabled();
    expect(screen.getByText(/does not apply these two over 2\.4 GHz/i)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Windows key' }));
    await user.click(screen.getByRole('button', { name: 'Apply settings' }));
    // The inline status and the toast both confirm the write.
    expect(await screen.findAllByText(/the Windows key blocked/)).not.toHaveLength(0);
    expect(await screen.findByText(/Last sent/i)).toBeInTheDocument();

    // init, heartbeat, then 00 01 <altTab> <altF4> <win> 00 <sleep> 00 <level>.
    const frame = frames[2];
    expect(frame?.[0]).toBe(0x07);
    expect(frame?.[1]).toBe(16);
    expect(Array.from(frame?.slice(3, 12) ?? [])).toEqual([
      0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x02, 0x00, 0x01,
    ]);
  });

  it('marks the animation card USB only, because this link has no screen', async () => {
    installReceiver();
    const user = userEvent.setup();
    render(<App />);
    await connect(user);

    await user.click(screen.getByRole('tab', { name: /screen/i }));

    expect(await screen.findByText('USB only')).toBeInTheDocument();
    expect(screen.getByText(/has no screen channel/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Choose a file')).toBeDisabled();
    expect(screen.getByRole('button', { name: /send animation/i })).toBeDisabled();
    // The view tab carries no link badge: the clock still works over the receiver.
    expect(screen.getByRole('tab', { name: 'Screen' })).toBeInTheDocument();
  });

  it('keeps key changes pending when the receiver is not connected', async () => {
    const user = userEvent.setup();
    render(<App />);

    const board = screen.getByRole('group', { name: /keyboard board/i });
    await user.click(within(board).getByRole('button', { name: 'CapsLock' }));

    expect(screen.getByRole('button', { name: /upload changes/i })).toBeDisabled();
  });

  it('paints per-key colours over the receiver', async () => {
    const { frames } = installReceiver();
    const user = userEvent.setup();
    render(<App />);
    await connect(user);

    await user.click(screen.getByRole('tab', { name: 'Lighting' }));
    await user.click(await screen.findByRole('tab', { name: 'Per-key' }));

    const board = await screen.findByRole('group', { name: 'Per-key colour board' });
    await user.click(within(board).getByRole('button', { name: /^W\./ }));
    await user.click(screen.getByRole('button', { name: 'Apply colours' }));

    expect(
      await screen.findByText(/does not confirm the map/i, {}, { timeout: 4000 }),
    ).toBeInTheDocument();

    // init, heartbeat, the 0x80 light record, then the 21 table frames.
    expect(frames).toHaveLength(24);

    const trigger = frames[2];
    expect(trigger?.[0]).toBe(0x05);
    expect(trigger?.[1]).toBe(16);
    expect(Array.from(trigger?.slice(3, 19) ?? [])).toEqual([
      0x80, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0xaa, 0x55,
    ]);

    // W is slot 39: table bytes 156-159, frame 5, payload offset 16.
    const wFrame = frames[3 + 5];
    expect(wFrame?.[0]).toBe(0x14);
    expect(wFrame?.[2]).toBe(5);
    expect(Array.from(wFrame?.slice(3 + 16, 3 + 20) ?? [])).toEqual([0x27, 0xff, 0x80, 0x00]);

    const last = frames[23];
    expect(last?.[1]).toBe(16);
    expect(Array.from(last?.slice(3 + 14, 3 + 16) ?? [])).toEqual([0xaa, 0x55]);

    expect(screen.getByText('Everything painted has been sent.')).toBeInTheDocument();
  });
});
