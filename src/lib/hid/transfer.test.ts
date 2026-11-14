import { FACTORY_KEYS, buildTable } from '@/lib/keymap';
import { buildLightRecord } from '@/lib/lighting';
import { buildSettingsRecord } from '@/lib/device';
import type { HidReadResult } from '@/lib/hid/client';
import { SCREEN_BLOCK_SIZE, SCREEN_FRAME_BYTES, buildAnimationPayload } from '@/lib/screen';
import { FakeClock, FakeTransport, reply } from '@/test/hidFakes';
import { describe, expect, it } from 'vitest';
import { buildTimePacket } from './time';
import { TransferService, isTransportFailed } from './transfer';

const table = buildTable(FACTORY_KEYS);

const topReplies = (): HidReadResult[] => [
  reply(0x18, 0x01),
  reply(0x11, 0x01),
  reply(0x02, 0x01),
  reply(0xf0, 0x01),
];

const makeService = (replies: HidReadResult[] = [], withOutput = false) => {
  const transport = new FakeTransport();
  transport.replies = replies;
  const clock = new FakeClock();
  const output = withOutput ? new FakeOutput() : undefined;
  const lines: string[] = [];
  const service = new TransferService(
    transport,
    clock,
    (message, level) => {
      lines.push(`${level ?? 'log'}: ${message}`);
    },
    output,
  );
  return { service, transport, clock, lines, output };
};

class FakeOutput {
  readonly sent: Uint8Array[] = [];
  failAt = 0;

  async sendOutput(payload: Uint8Array): Promise<void> {
    this.sent.push(payload.slice());
    if (this.failAt === this.sent.length) throw new Error('output report refused');
  }
}

const bytes = (value: Uint8Array) => Array.from(value);

describe('TransferService', () => {
  it('sends the full top-layer sequence', async () => {
    const { service, transport, lines } = makeService(topReplies());

    const result = await service.sendTable(table, 'top');

    expect(result.busy).toBeUndefined();
    expect(result.steps.map((step) => step.step)).toEqual(['begin', 'announce', 'commit', 'end']);
    expect(isTransportFailed(result.steps)).toBe(false);
    expect(transport.sent).toHaveLength(13);

    expect(bytes(transport.sent[0] ?? new Uint8Array())).toEqual([0x04, 0x18]);

    const announce = transport.sent[1] ?? new Uint8Array();
    expect(announce).toHaveLength(64);
    expect(bytes(announce.subarray(0, 2))).toEqual([0x04, 0x11]);
    expect(announce[8]).toBe(9);

    for (let index = 0; index < 9; index += 1) {
      expect(bytes(transport.sent[2 + index] ?? new Uint8Array())).toEqual(
        bytes(table.subarray(index * 64, (index + 1) * 64)),
      );
    }

    expect(bytes(transport.sent[11] ?? new Uint8Array())).toEqual([0x04, 0x02]);
    expect(bytes(transport.sent[12] ?? new Uint8Array())).toEqual([0x04, 0xf0]);
    expect(lines.some((line) => line.includes('begin 04 18: status 0x01 OK'))).toBe(true);
  });

  it('uses the Fn announce byte', async () => {
    const { service, transport } = makeService([
      reply(0x18, 0x01),
      reply(0x27, 0x01),
      reply(0x02, 0x01),
      reply(0xf0, 0x01),
    ]);

    await service.sendTable(table, 'fn');

    expect((transport.sent[1] ?? new Uint8Array())[1]).toBe(0x27);
  });

  it('aborts before staging when begin is refused', async () => {
    const { service, transport } = makeService([reply(0x18, 0xff)]);

    const result = await service.sendTable(table, 'top');

    expect(result.steps.map((step) => step.step)).toEqual(['begin', 'aborted']);
    expect(isTransportFailed(result.steps)).toBe(true);
    expect(transport.sent).toHaveLength(2);
    expect(bytes(transport.sent[0] ?? new Uint8Array())).toEqual([0x04, 0x18]);
    expect(bytes(transport.sent[1] ?? new Uint8Array())).toEqual([0x04, 0xf0]);
  });

  it('aborts before staging when the announce is refused', async () => {
    const { service, transport } = makeService([reply(0x18, 0x01), reply(0x11, 0xff)]);

    const result = await service.sendTable(table, 'top');

    expect(result.steps.map((step) => step.step)).toEqual(['begin', 'announce', 'aborted']);
    expect(isTransportFailed(result.steps)).toBe(true);
    expect(transport.sent).toHaveLength(3);
    expect(bytes(transport.sent[2] ?? new Uint8Array())).toEqual([0x04, 0xf0]);
  });

  it('retries a refused chunk once', async () => {
    const { service, transport, lines } = makeService(topReplies());
    transport.failAt.set(3, 1);

    const result = await service.sendTable(table, 'top');

    expect(isTransportFailed(result.steps)).toBe(false);
    expect(transport.sent).toHaveLength(14);
    expect(lines.some((line) => line.includes('(attempt 2)'))).toBe(true);
  });

  it('stops after four refused attempts on one chunk', async () => {
    const { service, transport } = makeService([reply(0x18, 0x01), reply(0x11, 0x01)]);
    for (const call of [3, 4, 5, 6]) transport.failAt.set(call, 1);

    const result = await service.sendTable(table, 'top');

    expect(result.steps.map((step) => step.step)).toEqual(['begin', 'announce', 'chunks']);
    expect(isTransportFailed(result.steps)).toBe(true);
    expect(transport.sent).toHaveLength(7);
    expect(transport.sent.some((payload) => payload.length === 2 && payload[1] === 0x02)).toBe(
      false,
    );
  });

  it('sends the end command even when the commit is rejected', async () => {
    const { service, transport } = makeService([
      reply(0x18, 0x01),
      reply(0x11, 0x01),
      reply(0x02, 0xff),
      reply(0xf0, 0x01),
    ]);

    const result = await service.sendTable(table, 'top');

    expect(result.steps.at(-1)?.step).toBe('end');
    expect(isTransportFailed(result.steps)).toBe(false);
    expect(bytes(transport.sent.at(-1) ?? new Uint8Array())).toEqual([0x04, 0xf0]);
  });

  it('refuses a second transfer while one is running', async () => {
    const { service, transport } = makeService(topReplies());

    const first = service.sendTable(table, 'top');
    const second = await service.sendTable(table, 'top');
    await first;

    expect(second).toEqual({ steps: [], busy: true });
    expect(transport.sent).toHaveLength(13);
    expect(service.isBusy).toBe(false);
  });

  it('gives up when begin never answers', async () => {
    const { service, clock } = makeService([]);

    const result = await service.sendTable(table, 'top');

    expect(result.steps[0]?.reply.status).toBeNull();
    expect(result.steps.at(-1)?.step).toBe('aborted');
    expect(clock.now()).toBeGreaterThan(6000);
  });

  it('rejects a table that is not 576 bytes', async () => {
    const { service } = makeService();

    await expect(service.sendTable(new Uint8Array(575), 'top')).rejects.toThrow('576');
  });
});

const timeReplies = (): HidReadResult[] => [
  reply(0x18, 0x01),
  reply(0x28, 0x01),
  reply(0x02, 0x01),
];

describe('TransferService clock', () => {
  const at = new Date(2026, 9, 29, 20, 40, 26);
  const packet = buildTimePacket(at);

  it('sends begin, one 04 28 chunk and commit, with no end command', async () => {
    const { service, transport } = makeService(timeReplies());

    const result = await service.sendTime(at);

    expect(result.steps.map((step) => step.step)).toEqual(['begin', 'announce', 'commit']);
    expect(isTransportFailed(result.steps)).toBe(false);
    expect(transport.sent).toHaveLength(4);

    expect(bytes(transport.sent[0] ?? new Uint8Array())).toEqual([0x04, 0x18]);

    const announce = transport.sent[1] ?? new Uint8Array();
    expect(announce).toHaveLength(64);
    expect(bytes(announce.subarray(0, 2))).toEqual([0x04, 0x28]);
    expect(announce[8]).toBe(1);

    expect(bytes(transport.sent[2] ?? new Uint8Array())).toEqual(bytes(packet));
    expect(bytes(transport.sent[3] ?? new Uint8Array())).toEqual([0x04, 0x02]);
  });

  it('shares the lock with a table transfer', async () => {
    const { service, transport } = makeService(timeReplies());

    const first = service.sendTable(table, 'top');
    const second = await service.sendTime(at);
    await first;

    expect(second).toEqual({ steps: [], busy: true });
    expect(service.isBusy).toBe(false);
    expect(transport.sent.some((payload) => payload[0] === 0x04 && payload[1] === 0x28)).toBe(
      false,
    );
  });

  it('aborts without staging when begin is refused', async () => {
    const { service, transport } = makeService([reply(0x18, 0xff)]);

    const result = await service.sendTime(at);

    expect(result.steps.map((step) => step.step)).toEqual(['begin', 'aborted']);
    expect(isTransportFailed(result.steps)).toBe(true);
    expect(bytes(transport.sent[1] ?? new Uint8Array())).toEqual([0x04, 0xf0]);
  });

  it('stops after a rejected commit and sends no end command', async () => {
    const { service, transport } = makeService([
      reply(0x18, 0x01),
      reply(0x28, 0x01),
      reply(0x02, 0xff),
    ]);

    const result = await service.sendTime(at);

    expect(result.steps.at(-1)?.step).toBe('commit');
    expect(result.steps.at(-1)?.reply.status).toBe(0xff);
    expect(transport.sent).toHaveLength(4);
    expect(bytes(transport.sent.at(-1) ?? new Uint8Array())).toEqual([0x04, 0x02]);
  });
});

const screenReplies = (): HidReadResult[] => [
  reply(0x18, 0x01),
  reply(0x72, 0x01),
  reply(0x02, 0x01),
];

describe('TransferService screen', () => {
  const frame = new Uint8Array(SCREEN_FRAME_BYTES);
  const payload = buildAnimationPayload({ frames: [frame], delaysMs: [100] });

  it('announces mode 3 and streams the blocks without an end command', async () => {
    const { service, transport, output } = makeService(screenReplies(), true);
    const progress: Array<[number, number]> = [];

    const result = await service.sendAnimation(payload, {
      onProgress: (sent, total) => {
        progress.push([sent, total]);
      },
    });

    expect(result.steps.map((step) => step.step)).toEqual([
      'begin',
      'announce',
      'blocks',
      'commit',
    ]);
    expect(isTransportFailed(result.steps)).toBe(false);
    expect(transport.sent).toHaveLength(3);

    const announce = transport.sent[1] ?? new Uint8Array();
    expect(announce[1]).toBe(0x72);
    expect(announce[2]).toBe(3);
    expect(announce[8]).toBe(9);
    expect(announce[9]).toBe(0);

    expect(output?.sent).toHaveLength(9);
    expect(bytes(output?.sent[0] ?? new Uint8Array())).toEqual(
      bytes(payload.subarray(0, SCREEN_BLOCK_SIZE)),
    );
    expect(progress.at(-1)).toEqual([9, 9]);
    expect(bytes(transport.sent.at(-1) ?? new Uint8Array())).toEqual([0x04, 0x02]);
  });

  it('stops and skips the commit when a block is refused', async () => {
    const { service, transport, output } = makeService(
      [reply(0x18, 0x01), reply(0x72, 0x01)],
      true,
    );
    if (output) output.failAt = 3;

    const result = await service.sendAnimation(payload);

    expect(result.steps.map((step) => step.step)).toEqual(['begin', 'announce', 'aborted']);
    expect(isTransportFailed(result.steps)).toBe(true);
    expect(transport.sent).toHaveLength(2);
    expect(output?.sent).toHaveLength(3);
  });

  it('shares the lock with a table transfer', async () => {
    const { service, output } = makeService(topReplies(), true);

    const first = service.sendTable(table, 'top');
    const second = await service.sendAnimation(payload);
    await first;

    expect(second).toEqual({ steps: [], busy: true });
    expect(output?.sent).toHaveLength(0);
    expect(service.isBusy).toBe(false);
  });

  it('rejects a payload that is not block aligned', async () => {
    const { service } = makeService([], true);

    await expect(service.sendAnimation(new Uint8Array(100))).rejects.toThrow(/4096/);
    await expect(service.sendAnimation(new Uint8Array(0))).rejects.toThrow(/4096/);
  });

  it('writes the block count as a 16-bit value', async () => {
    const { service, transport, output } = makeService(screenReplies(), true);
    const big = new Uint8Array(256 * SCREEN_BLOCK_SIZE);

    await service.sendAnimation(big);

    const announce = transport.sent[1] ?? new Uint8Array();
    expect(announce[8]).toBe(0);
    expect(announce[9]).toBe(1);
    expect(output?.sent).toHaveLength(256);
  });
});

const lightReplies = (): HidReadResult[] => [
  reply(0x18, 0x01),
  reply(0x13, 0x01),
  reply(0x02, 0x01),
  reply(0xf0, 0x01),
];

describe('TransferService lighting', () => {
  const record = buildLightRecord({
    mode: 1,
    r: 255,
    g: 128,
    b: 0,
    brightness: 3,
    speed: 3,
    colorful: false,
    direction: 0,
  });

  it('sends the record as one chunk, then the commit and the end', async () => {
    const { service, transport } = makeService(lightReplies());

    const result = await service.sendLighting(record);

    expect(result.steps.map((step) => step.step)).toEqual(['begin', 'announce', 'commit', 'end']);
    expect(isTransportFailed(result.steps)).toBe(false);
    expect(transport.sent).toHaveLength(5);
    expect(bytes(transport.sent[0] ?? new Uint8Array())).toEqual([0x04, 0x18]);

    const announce = transport.sent[1] ?? new Uint8Array();
    expect(bytes(announce.subarray(0, 2))).toEqual([0x04, 0x13]);
    expect(announce[8]).toBe(1);

    expect(bytes(transport.sent[2] ?? new Uint8Array())).toEqual(bytes(record));
    expect(bytes(transport.sent[3] ?? new Uint8Array())).toEqual([0x04, 0x02]);
    expect(bytes(transport.sent[4] ?? new Uint8Array())).toEqual([0x04, 0xf0]);
  });

  it('shares the lock with a table transfer', async () => {
    const { service, transport } = makeService(topReplies());

    const first = service.sendTable(table, 'top');
    const second = await service.sendLighting(record);
    await first;

    expect(second).toEqual({ steps: [], busy: true });
    expect(transport.sent).toHaveLength(13);
    expect(service.isBusy).toBe(false);
  });

  it('refuses a record that is not 64 bytes', async () => {
    const { service } = makeService();

    await expect(service.sendLighting(new Uint8Array(10))).rejects.toThrow('64');
  });
});

const perKeyReplies = (): HidReadResult[] => [
  reply(0x18, 0x01),
  reply(0x13, 0x01),
  reply(0x02, 0x01),
  reply(0xf0, 0x01),
  reply(0x18, 0x01),
  reply(0x23, 0x01),
  reply(0x02, 0x01),
  reply(0xf0, 0x01),
];

describe('TransferService per-key', () => {
  const trigger = new Uint8Array(64);
  trigger[0] = 0x80;
  trigger[9] = 5;
  trigger[14] = 0xaa;
  trigger[15] = 0x55;

  const perKeyTable = new Uint8Array(576);
  perKeyTable[4] = 1;
  perKeyTable[574] = 0xaa;
  perKeyTable[575] = 0x55;

  it('sends the 0x80 record, then the table under 04 23', async () => {
    const { service, transport } = makeService(perKeyReplies());

    const result = await service.sendPerKey(trigger, perKeyTable);

    expect(result.busy).toBeUndefined();
    expect(result.trigger.map((step) => step.step)).toEqual(['begin', 'announce', 'commit', 'end']);
    expect(result.table?.map((step) => step.step)).toEqual(['begin', 'announce', 'commit', 'end']);
    expect(transport.sent).toHaveLength(18);

    const triggerAnnounce = transport.sent[1] ?? new Uint8Array();
    expect(bytes(triggerAnnounce.subarray(0, 2))).toEqual([0x04, 0x13]);
    expect(triggerAnnounce[8]).toBe(1);
    expect(bytes(transport.sent[2] ?? new Uint8Array())).toEqual(bytes(trigger));

    expect(bytes(transport.sent[0] ?? new Uint8Array())).toEqual([0x04, 0x18]);
    expect(bytes(transport.sent[5] ?? new Uint8Array())).toEqual([0x04, 0x18]);

    const tableAnnounce = transport.sent[6] ?? new Uint8Array();
    expect(bytes(tableAnnounce.subarray(0, 2))).toEqual([0x04, 0x23]);
    expect(tableAnnounce[8]).toBe(9);

    for (let index = 0; index < 9; index += 1) {
      expect(bytes(transport.sent[7 + index] ?? new Uint8Array())).toEqual(
        bytes(perKeyTable.subarray(index * 64, (index + 1) * 64)),
      );
    }

    expect(bytes(transport.sent[16] ?? new Uint8Array())).toEqual([0x04, 0x02]);
    expect(bytes(transport.sent[17] ?? new Uint8Array())).toEqual([0x04, 0xf0]);
  });

  it('skips the table when the mode switch is rejected', async () => {
    const { service, transport } = makeService([
      reply(0x18, 0x01),
      reply(0x13, 0x01),
      reply(0x02, 0xff),
      reply(0xf0, 0x01),
    ]);

    const result = await service.sendPerKey(trigger, perKeyTable);

    expect(result.table).toBeNull();
    expect(transport.sent).toHaveLength(5);
    expect(transport.sent.some((payload) => payload[1] === 0x23)).toBe(false);
  });

  it('skips the table when the mode switch never begins', async () => {
    const { service, transport } = makeService([reply(0x18, 0xff)]);

    const result = await service.sendPerKey(trigger, perKeyTable);

    expect(result.table).toBeNull();
    expect(transport.sent).toHaveLength(2);
    expect(bytes(transport.sent[1] ?? new Uint8Array())).toEqual([0x04, 0xf0]);
  });

  it('reports a rejected table commit after both sequences', async () => {
    const { service, transport } = makeService([
      reply(0x18, 0x01),
      reply(0x13, 0x01),
      reply(0x02, 0x01),
      reply(0xf0, 0x01),
      reply(0x18, 0x01),
      reply(0x23, 0x01),
      reply(0x02, 0xff),
      reply(0xf0, 0x01),
    ]);

    const result = await service.sendPerKey(trigger, perKeyTable);

    expect(result.table?.at(-1)?.step).toBe('end');
    expect(result.table?.filter((step) => step.step === 'commit').at(-1)?.reply.status).toBe(0xff);
    expect(transport.sent).toHaveLength(18);
  });

  it('shares the lock with a table transfer', async () => {
    const { service, transport } = makeService(topReplies());

    const first = service.sendTable(table, 'top');
    const second = await service.sendPerKey(trigger, perKeyTable);
    await first;

    expect(second).toEqual({ trigger: [], table: null, busy: true });
    expect(transport.sent).toHaveLength(13);
    expect(service.isBusy).toBe(false);
  });

  it('refuses buffers of the wrong size', async () => {
    const { service } = makeService();

    await expect(service.sendPerKey(new Uint8Array(10), perKeyTable)).rejects.toThrow('64');
    await expect(service.sendPerKey(trigger, new Uint8Array(575))).rejects.toThrow('576');
  });
});

describe('TransferService settings', () => {
  const settings = buildSettingsRecord({
    responseLevel: 4,
    sleep: 3,
    disableAltTab: true,
    disableAltF4: false,
    disableWindowsKey: true,
  });

  it('stages one record under 04 17 and commits, with no end command', async () => {
    const { service, transport } = makeService([
      reply(0x18, 0x01),
      reply(0x17, 0x01),
      reply(0x02, 0x01),
    ]);

    const result = await service.sendSettings(settings);

    expect(result.steps.map((step) => step.step)).toEqual(['begin', 'announce', 'commit']);
    expect(isTransportFailed(result.steps)).toBe(false);
    expect(transport.sent).toHaveLength(4);
    expect(bytes(transport.sent[0] ?? new Uint8Array())).toEqual([0x04, 0x18]);

    const announce = transport.sent[1] ?? new Uint8Array();
    expect(bytes(announce.subarray(0, 3))).toEqual([0x04, 0x17, 0x01]);
    expect(announce[8]).toBe(1);

    expect(bytes(transport.sent[2] ?? new Uint8Array())).toEqual(bytes(settings));
    expect(bytes(transport.sent[3] ?? new Uint8Array())).toEqual([0x04, 0x02]);
  });

  it('refuses a record that is not 64 bytes', async () => {
    const { service } = makeService();

    await expect(service.sendSettings(new Uint8Array(10))).rejects.toThrow('64');
  });

  it('shares the lock with a table transfer', async () => {
    const { service } = makeService(topReplies());

    const first = service.sendTable(table, 'top');
    const second = await service.sendSettings(settings);
    await first;

    expect(second).toEqual({ steps: [], busy: true });
    expect(service.isBusy).toBe(false);
  });
});
