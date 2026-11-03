import { describe, expect, it } from 'vitest';
import {
  WIRELESS_COMMANDS,
  WIRELESS_FRAME_SIZE,
  WIRELESS_RECORD_SIZE,
  WirelessClient,
  buildWirelessFrame,
  findWirelessCollection,
  findWirelessInterface,
  toWirelessRecord,
} from './wireless';

const item = (reportSize: number, reportCount: number) => ({ reportSize, reportCount });

const collection = (usagePage: number, usage: number, bytes?: number) => ({
  usagePage,
  usage,
  outputReports: bytes ? [{ reportId: 0, items: [item(8, bytes)] }] : [],
  inputReports: bytes ? [{ reportId: 0, items: [item(8, bytes)] }] : [],
});

describe('buildWirelessFrame', () => {
  it('puts the command, length, index and payload in place', () => {
    const frame = buildWirelessFrame(WIRELESS_COMMANDS.light, Uint8Array.from([0x01, 0x02]), 0);

    expect(frame).toHaveLength(WIRELESS_FRAME_SIZE);
    expect(frame[0]).toBe(0x05);
    expect(frame[1]).toBe(2);
    expect(frame[2]).toBe(0);
    expect(frame[3]).toBe(0x01);
    expect(frame[4]).toBe(0x02);
  });

  it('ends with the low byte of the sum of the first 31 bytes', () => {
    const frame = buildWirelessFrame(WIRELESS_COMMANDS.clock, Uint8Array.from([0x10, 0x20]));
    const sum = frame.slice(0, 31).reduce((total, byte) => total + byte, 0) & 0xff;

    expect(frame[31]).toBe(sum);
  });

  it('matches the captured light frame', () => {
    // 25966ms in dongle-open.log: 00 05 10 00 01 FF 80 ... AA 55 ... 9D
    const record = toWirelessRecord(
      Uint8Array.from([0x01, 0xff, 0x80, 0, 0, 0, 0, 0, 0x01, 0x05, 0x03, 0, 0, 0, 0xaa, 0x55]),
    );
    const frame = buildWirelessFrame(WIRELESS_COMMANDS.light, record);

    expect(Array.from(frame.subarray(0, 19))).toEqual([
      0x05, 0x10, 0x00, 0x01, 0xff, 0x80, 0, 0, 0, 0, 0, 0x01, 0x05, 0x03, 0, 0, 0, 0xaa, 0x55,
    ]);
    expect(frame[31]).toBe(0x9d);
  });

  it('refuses a payload longer than the frame allows', () => {
    expect(() => buildWirelessFrame(0x05, new Uint8Array(29))).toThrow('at most 28');
  });
});

describe('toWirelessRecord', () => {
  it('keeps 14 bytes and moves the trailer to 14 and 15', () => {
    const record = new Uint8Array(64);
    record.set([0, 1, 0x5a, 0x1a, 0x0b, 3, 0x15, 0x2c, 0x2e, 0, 2, 0, 0, 0]);
    record[62] = 0xaa;
    record[63] = 0x55;

    const payload = toWirelessRecord(record);

    expect(payload).toHaveLength(WIRELESS_RECORD_SIZE);
    expect(payload[0]).toBe(0);
    expect(payload[1]).toBe(1);
    expect(payload[13]).toBe(0);
    expect(payload[14]).toBe(0xaa);
    expect(payload[15]).toBe(0x55);
  });

  it('leaves a record that already ends at 14 and 15 unchanged', () => {
    const record = new Uint8Array(64);
    record.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0xaa, 0x55]);

    expect(Array.from(toWirelessRecord(record))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0xaa, 0x55,
    ]);
  });

  it('refuses a short record', () => {
    expect(() => toWirelessRecord(new Uint8Array(4))).toThrow('at least 14');
  });
});

describe('findWirelessCollection', () => {
  it('prefers the 32-byte interface when the receiver exposes two', () => {
    const large = collection(0xff60, 0x61, 64);
    const small = collection(0xff60, 0x61, 32);
    const device = { collections: [large, small] };

    expect(findWirelessCollection(device)).toBe(small);
  });

  it('ignores a keyboard collection', () => {
    expect(findWirelessCollection({ collections: [collection(0x0001, 0x06, 8)] })).toBeNull();
  });

  it('picks the interface out of a list', () => {
    const keyboard = { collections: [collection(0x0001, 0x06, 8)] };
    const receiver = { collections: [collection(0xff60, 0x61, 32)] };
    const other = { collections: [collection(0x000c, 0x01, 3)] };

    expect(findWirelessInterface([keyboard, other, receiver])).toBe(receiver);
    expect(findWirelessInterface([keyboard, other])).toBeNull();
  });

  it('prefers the 32-byte interface when two receivers are offered', () => {
    const large = { collections: [collection(0xff60, 0x61, 64)] };
    const small = { collections: [collection(0xff60, 0x61, 32)] };

    expect(findWirelessInterface([large, small])).toBe(small);
  });
});

describe('WirelessClient', () => {
  const sent = () => {
    const frames: Uint8Array[] = [];
    return {
      frames,
      device: {
        sendReport: async (_id: number, data: BufferSource) => {
          frames.push(new Uint8Array(data as Uint8Array));
        },
      },
    };
  };

  it('sends the init frame with no payload', async () => {
    const recorder = sent();
    await new WirelessClient(recorder.device).init();

    expect(recorder.frames).toHaveLength(2);
    expect(recorder.frames[0]?.[0]).toBe(WIRELESS_COMMANDS.init);
    expect(recorder.frames[0]?.[1]).toBe(0);
    expect(recorder.frames[1]?.[0]).toBe(WIRELESS_COMMANDS.heartbeat);
    expect(recorder.frames[1]?.[1]).toBe(1);
  });

  it('sends init and the heartbeat before the first record, and only once', async () => {
    const recorder = sent();
    const client = new WirelessClient(recorder.device);
    const record = new Uint8Array(64);

    await client.sendLight(record);
    await client.sendClock(record);

    expect(recorder.frames.map((frame) => frame[0])).toEqual([
      WIRELESS_COMMANDS.init,
      WIRELESS_COMMANDS.heartbeat,
      WIRELESS_COMMANDS.light,
      WIRELESS_COMMANDS.clock,
    ]);
  });

  it('logs the frame it sends', async () => {
    const recorder = sent();
    const lines: string[] = [];
    const client = new WirelessClient(recorder.device, (message) => lines.push(message));

    await client.init();

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('02 00 00');
  });

  it('sends the light, clock and settings under their own commands', async () => {
    const recorder = sent();
    const client = new WirelessClient(recorder.device);
    const record = new Uint8Array(64);

    await client.init();
    await client.sendLight(record);
    await client.sendClock(record);
    await client.sendSettings(record);

    expect(recorder.frames.map((frame) => frame[0])).toEqual([
      WIRELESS_COMMANDS.init,
      WIRELESS_COMMANDS.heartbeat,
      WIRELESS_COMMANDS.light,
      WIRELESS_COMMANDS.clock,
      WIRELESS_COMMANDS.settings,
    ]);
    expect(recorder.frames.slice(2).every((frame) => frame[1] === 16)).toBe(true);
  });

  it('fails clearly when the browser cannot send output reports', async () => {
    await expect(new WirelessClient({}).init()).rejects.toThrow('output reports');
  });

  it('patches one key with its index and four-byte record', async () => {
    const recorder = sent();
    const client = new WirelessClient(recorder.device);

    const sentCount = await client.sendKeys('top', [
      { index: 55, record: Uint8Array.from([0x02, 0x00, 0x04, 0x00]) },
    ]);

    expect(sentCount).toBe(1);
    const patch = recorder.frames[2];
    expect(patch?.[0]).toBe(WIRELESS_COMMANDS.top);
    expect(patch?.[1]).toBe(4);
    expect(patch?.[2]).toBe(55);
    expect(Array.from(patch?.slice(3, 7) ?? [])).toEqual([0x02, 0x00, 0x04, 0x00]);
  });

  it('uses the Fn command for the Fn layer', async () => {
    const recorder = sent();
    const client = new WirelessClient(recorder.device);

    await client.sendKeys('fn', [{ index: 56, record: Uint8Array.from([0x03, 0xe2, 0, 0]) }]);

    expect(recorder.frames[2]?.[0]).toBe(WIRELESS_COMMANDS.fn);
    expect(recorder.frames[2]?.[2]).toBe(56);
  });

  it('sends one frame per key and paces them', async () => {
    const recorder = sent();
    const slept: number[] = [];
    const clock = {
      now: () => 0,
      sleep: async (ms: number) => {
        slept.push(ms);
      },
    };
    const client = new WirelessClient(recorder.device, () => {}, clock);

    const sentCount = await client.sendKeys('top', [
      { index: 20, record: Uint8Array.from([0x02, 0, 0x17, 0]) },
      { index: 55, record: Uint8Array.from([0x02, 0, 0x04, 0]) },
    ]);

    expect(sentCount).toBe(2);
    expect(recorder.frames).toHaveLength(4);
    expect(slept).toHaveLength(1);
  });

  it('refuses a record that is not four bytes', async () => {
    const client = new WirelessClient(sent().device);

    await expect(client.sendKeys('top', [{ index: 1, record: new Uint8Array(3) }])).rejects.toThrow(
      '4-byte',
    );
  });
});
