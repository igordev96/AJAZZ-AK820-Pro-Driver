import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { WebHid, WebHidDevice } from '@/lib/hid';
import { App } from './App';

const reply = (cmd: number, status: number) => {
  const bytes = new Uint8Array(64);
  bytes[0] = 0x04;
  bytes[1] = cmd;
  bytes[3] = status;
  return bytes;
};

const installFakeKeyboard = () => {
  const queue: Uint8Array[] = [];
  const device: WebHidDevice = {
    opened: false,
    productName: 'AK820',
    vendorId: 0x0c45,
    productId: 0x8009,
    collections: [{ usagePage: 0xff13, usage: 0x0001 }],
    open: async () => {},
    close: async () => {},
    sendFeatureReport: async (_reportId, data) => {
      const bytes = new Uint8Array(data as Uint8Array);
      if (bytes[0] !== 0x04) return;

      const command = bytes[1];
      if (command === 0x18) queue.push(reply(0x18, 0x01));
      else if (command === 0x28) queue.push(reply(0x28, 0x01));
      else if (command === 0x02) queue.push(reply(0x02, 0x01));
      else if (command === 0xf0) queue.push(reply(0xf0, 0x01));
    },
    receiveFeatureReport: async () => {
      const bytes = queue.shift() ?? new Uint8Array(64);
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const hid: WebHid = {
    requestDevice: async () => [device],
    getDevices: async () => [],
  };
  Object.defineProperty(navigator, 'hid', { value: hid, configurable: true });
};

const connect = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /connect keyboard/i }));
  await screen.findByText('AK820');
};

describe('App screen view', () => {
  it('switches between keys and screen without losing the connection', async () => {
    installFakeKeyboard();
    const user = userEvent.setup();
    render(<App />);
    await connect(user);

    expect(screen.getByRole('group', { name: /keyboard board/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Screen' }));
    expect(screen.queryByRole('group', { name: /keyboard board/i })).not.toBeInTheDocument();
    expect(
      await screen.findByRole('img', { name: /screen preview showing/i }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Clock' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Animation' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Keys' }));
    expect(screen.getByRole('group', { name: /keyboard board/i })).toBeInTheDocument();
  }, 15000);

  it('sends the clock and reports it in the log', async () => {
    installFakeKeyboard();
    const user = userEvent.setup();
    render(<App />);
    await connect(user);

    await user.click(screen.getByRole('tab', { name: 'Screen' }));
    await user.click(await screen.findByRole('button', { name: 'Send time' }));

    await screen.findByText(
      /Sent\. The screen clock is set to \d{2}:\d{2}:\d{2}\./,
      {},
      { timeout: 8000 },
    );

    await user.click(screen.getByRole('button', { name: /^log$/i }));
    expect(screen.getByRole('log')).toHaveTextContent(/Time sent/);
  }, 15000);
});
