import type { Clock } from '@/lib/clock';
import { realClock } from '@/lib/clock';
import { SETTINGS_RECORD_SIZE } from '@/lib/device';
import { hex } from '@/lib/format';
import { TABLE_SIZE } from '@/lib/keymap';
import { SCREEN_BLOCK_SIZE, SCREEN_BLOCKS_PER_FRAME } from '@/lib/screen';
import { LIGHT_RECORD_SIZE } from '@/lib/lighting';
import type { HidTransport } from './client';
import {
  CHUNK_COUNT,
  CHUNK_SIZE,
  COMMANDS,
  padFrame,
  SCREEN_MODE_ANIMATION,
  STATUS,
  TIME_SLOT,
  TIMING,
} from './protocol';
import { buildTimePacket } from './time';

export type HidLayer = 'top' | 'fn';

export type LogLevel = 'info' | 'dim' | 'ok' | 'warn' | 'err';
export type LogFn = (message: string, level?: LogLevel) => void;

export type TransferReply = {
  readonly status: number | null;
  readonly raw: Uint8Array | null;
  readonly ms: number;
};

export type TransferStep =
  | { readonly step: 'begin'; readonly reply: TransferReply }
  | { readonly step: 'announce'; readonly reply: TransferReply }
  | { readonly step: 'chunks'; readonly reply: TransferReply }
  | { readonly step: 'blocks'; readonly reply: TransferReply }
  | { readonly step: 'commit'; readonly reply: TransferReply }
  | { readonly step: 'end'; readonly reply: TransferReply }
  | { readonly step: 'aborted'; readonly reply: TransferReply };

export type TransferResult = {
  readonly steps: TransferStep[];
  readonly busy?: boolean;
};

/**
 * A per-key write is two sequences: the `0x80` record that puts the board in
 * per-key mode, then the 576-byte colour table. They are reported apart so the
 * caller can tell which commit failed.
 */
export type PerKeyTransfer = {
  readonly trigger: TransferStep[];
  readonly table: TransferStep[] | null;
  readonly busy?: boolean;
};

type Sequence = {
  readonly announce: readonly number[];
  readonly body: Uint8Array;
  readonly chunkCount: number;
  readonly sendEnd: boolean;
};

/** The screen data channel, separate from the 65-byte feature transport. */
export type OutputTransport = {
  sendOutput(payload: Uint8Array): Promise<void>;
};

export type AnimationOptions = {
  readonly onProgress?: (sentBlocks: number, totalBlocks: number) => void;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const noLog: LogFn = () => {};

/** The status of the last step with this name, or null when it never ran. */
const lastStatus = (steps: readonly TransferStep[], name: TransferStep['step']): number | null =>
  steps.filter((step) => step.step === name).at(-1)?.reply.status ?? null;

export class TransferService {
  private busy = false;

  constructor(
    private readonly transport: HidTransport,
    private readonly clock: Clock = realClock,
    private readonly log: LogFn = noLog,
    private readonly output?: OutputTransport,
  ) {}

  get isBusy(): boolean {
    return this.busy;
  }

  async sendTable(table: Uint8Array, layer: HidLayer): Promise<TransferResult> {
    if (table.length !== TABLE_SIZE) {
      throw new Error(`table must be ${TABLE_SIZE} bytes`);
    }

    if (this.busy) {
      this.log('a transfer is already running — ignoring this request', 'warn');
      return { steps: [], busy: true };
    }

    this.busy = true;
    try {
      return {
        steps: await this.runSequence({
          announce: layer === 'fn' ? COMMANDS.fn : COMMANDS.top,
          body: table,
          chunkCount: CHUNK_COUNT,
          sendEnd: true,
        }),
      };
    } finally {
      this.busy = false;
    }
  }

  /**
   * Sets the screen clock. The vendor app uses the same staged shape as a table
   * write, one 64-byte chunk and no end command:
   *
   *   04 18  →  04 28 (byte 8 = 1)  →  one 64-byte body  →  04 02
   */
  async sendTime(at: Date, slot: number = TIME_SLOT): Promise<TransferResult> {
    const body = buildTimePacket(at, slot);

    if (this.busy) {
      this.log('a transfer is already running — ignoring this request', 'warn');
      return { steps: [], busy: true };
    }

    this.busy = true;
    try {
      return {
        steps: await this.runSequence({
          announce: COMMANDS.time,
          body,
          chunkCount: 1,
          sendEnd: false,
        }),
      };
    } finally {
      this.busy = false;
    }
  }

  /**
   * Writes the device settings record: response level, sleep time and the three
   * disabled shortcuts. Captured on 2 Nov 2026; the vendor app stages one
   * 64-byte record and commits, with no end command:
   *
   *   04 18  →  04 17 01 (byte 8 = 1)  →  the record  →  04 02
   */
  async sendSettings(record: Uint8Array): Promise<TransferResult> {
    if (record.length !== SETTINGS_RECORD_SIZE) {
      throw new Error(`settings record must be ${SETTINGS_RECORD_SIZE} bytes`);
    }

    if (this.busy) {
      this.log('a transfer is already running — ignoring this request', 'warn');
      return { steps: [], busy: true };
    }

    this.busy = true;
    try {
      return {
        steps: await this.runSequence({
          announce: COMMANDS.settings,
          body: record,
          chunkCount: 1,
          sendEnd: false,
        }),
      };
    } finally {
      this.busy = false;
    }
  }

  /**
   * Uploads a screen animation: begin and announce on the config collection,
   * then 4096-byte output reports on the screen collection, then the commit.
   * The payload comes from `buildAnimationPayload`.
   */
  async sendAnimation(
    payload: Uint8Array,
    options: AnimationOptions = {},
  ): Promise<TransferResult> {
    if (payload.length === 0 || payload.length % SCREEN_BLOCK_SIZE !== 0) {
      throw new Error(`animation payload must be a multiple of ${SCREEN_BLOCK_SIZE} bytes`);
    }
    if (!this.output) {
      throw new Error('the screen data channel is not available');
    }

    const blocks = payload.length / SCREEN_BLOCK_SIZE;
    if (blocks > 0xffff) {
      throw new Error('the announce cannot carry more than 65535 blocks');
    }

    if (this.busy) {
      this.log('a transfer is already running — ignoring this request', 'warn');
      return { steps: [], busy: true };
    }

    this.busy = true;
    try {
      return { steps: await this.runAnimation(payload, options) };
    } finally {
      this.busy = false;
    }
  }

  private async runAnimation(
    payload: Uint8Array,
    options: AnimationOptions,
  ): Promise<TransferStep[]> {
    const output = this.output;
    if (!output) throw new Error('the screen data channel is not available');

    const blocks = payload.length / SCREEN_BLOCK_SIZE;
    const steps: TransferStep[] = [];

    await this.send(Uint8Array.from(COMMANDS.begin));
    const begin = await this.waitReply(COMMANDS.begin[1], 'begin 04 18');
    steps.push({ step: 'begin', reply: begin });

    if (begin.status !== STATUS.ok) {
      this.log(
        `  ⇒ begin ${
          begin.status === null ? 'got no reply' : `rejected (0x${hex([begin.status])})`
        } — aborting before any data is staged`,
        'err',
      );
      await this.abort();
      steps.push({ step: 'aborted', reply: { status: begin.status, raw: begin.raw, ms: 0 } });
      return steps;
    }

    const announce = padFrame(
      Uint8Array.from([...COMMANDS.animation, SCREEN_MODE_ANIMATION, 0, 0, 0, 0, 0]),
    );
    announce[8] = blocks & 0xff;
    announce[9] = (blocks >> 8) & 0xff;
    this.log(`SEND  ${hex(announce)}`, 'info');
    await this.transport.send(announce);

    const announced = await this.waitReply(COMMANDS.animation[1], 'announce 04 72');
    steps.push({ step: 'announce', reply: announced });

    if (announced.status !== STATUS.ok) {
      this.log(
        `  ⇒ announce ${
          announced.status === null ? 'got no reply' : `rejected (0x${hex([announced.status])})`
        } — aborting before any pixel is sent`,
        'err',
      );
      await this.abort();
      steps.push({
        step: 'aborted',
        reply: { status: announced.status, raw: announced.raw, ms: 0 },
      });
      return steps;
    }

    await this.clock.sleep(TIMING.screenStartPause);

    const started = this.clock.now();

    try {
      for (let index = 0; index < blocks; index += 1) {
        await output.sendOutput(
          payload.subarray(index * SCREEN_BLOCK_SIZE, (index + 1) * SCREEN_BLOCK_SIZE),
        );

        if (index > 0 && index % SCREEN_BLOCKS_PER_FRAME === 0) {
          const frame = index / SCREEN_BLOCKS_PER_FRAME;
          const totalFrames = Math.floor(blocks / SCREEN_BLOCKS_PER_FRAME);
          this.log(`  frame ${frame}/${totalFrames} sent`, 'dim');
        }

        options.onProgress?.(index + 1, blocks);
        if (index < blocks - 1) await this.clock.sleep(TIMING.screenBlockGap);
      }
    } catch (error) {
      this.log(`  the screen stopped accepting data: ${errorMessage(error)}`, 'err');
      steps.push({
        step: 'aborted',
        reply: { status: null, raw: null, ms: Math.round(this.clock.now() - started) },
      });
      return steps;
    }

    this.log(
      `SENT  ${blocks} x ${SCREEN_BLOCK_SIZE}-byte blocks (${payload.length} bytes) in ${Math.round(
        this.clock.now() - started,
      )} ms`,
      'dim',
    );
    steps.push({
      step: 'blocks',
      reply: { status: STATUS.ok, raw: null, ms: Math.round(this.clock.now() - started) },
    });

    await this.send(Uint8Array.from(COMMANDS.commit));
    const commit = await this.waitReply(COMMANDS.commit[1], 'commit 04 02');
    steps.push({ step: 'commit', reply: commit });

    return steps;
  }

  /**
   * Writes one lighting record. The vendor app uses the staged shape with a
   * single 64-byte chunk and the end command:
   *
   *   04 18  →  04 13 (byte 8 = 1)  →  the record  →  04 02  →  04 F0
   */
  async sendLighting(record: Uint8Array): Promise<TransferResult> {
    if (record.length !== LIGHT_RECORD_SIZE) {
      throw new Error(`lighting record must be ${LIGHT_RECORD_SIZE} bytes`);
    }

    if (this.busy) {
      this.log('a transfer is already running — ignoring this request', 'warn');
      return { steps: [], busy: true };
    }

    this.busy = true;
    try {
      return {
        steps: await this.runSequence({
          announce: COMMANDS.light,
          body: record,
          chunkCount: 1,
          sendEnd: true,
        }),
      };
    } finally {
      this.busy = false;
    }
  }

  /**
   * Writes per-key colours. The vendor app switches the board with a normal
   * light record whose mode is `0x80`, then stages the table under `04 23`:
   *
   *   04 18 → 04 13 (1 chunk) → the 0x80 record → 04 02 → 04 F0
   *   04 18 → 04 23 (9 chunks) → the 576-byte table → 04 02 → 04 F0
   *
   * Captured on 30 Oct 2026 in `re/captures/lighting-controlled.log`.
   */
  async sendPerKey(trigger: Uint8Array, table: Uint8Array): Promise<PerKeyTransfer> {
    if (trigger.length !== LIGHT_RECORD_SIZE) {
      throw new Error(`the per-key trigger must be ${LIGHT_RECORD_SIZE} bytes`);
    }
    if (table.length !== TABLE_SIZE) {
      throw new Error(`the per-key table must be ${TABLE_SIZE} bytes`);
    }

    if (this.busy) {
      this.log('a transfer is already running — ignoring this request', 'warn');
      return { trigger: [], table: null, busy: true };
    }

    this.busy = true;
    try {
      const triggerSteps = await this.runSequence({
        announce: COMMANDS.light,
        body: trigger,
        chunkCount: 1,
        sendEnd: true,
      });

      // A refused mode switch means the board is not waiting for a table, so
      // staging 576 bytes after it would only add noise.
      if (lastStatus(triggerSteps, 'commit') !== STATUS.ok) {
        this.log('  ⇒ the per-key mode switch was not confirmed — the table was not sent', 'warn');
        return { trigger: triggerSteps, table: null };
      }

      const tableSteps = await this.runSequence({
        announce: COMMANDS.perKey,
        body: table,
        chunkCount: CHUNK_COUNT,
        sendEnd: true,
      });

      return { trigger: triggerSteps, table: tableSteps };
    } finally {
      this.busy = false;
    }
  }

  private async runSequence(sequence: Sequence): Promise<TransferStep[]> {
    const steps: TransferStep[] = [];
    const { body, chunkCount } = sequence;
    const layerByte = sequence.announce[1];

    await this.send(Uint8Array.from(COMMANDS.begin));
    const begin = await this.waitReply(COMMANDS.begin[1], 'begin 04 18');
    steps.push({ step: 'begin', reply: begin });

    if (begin.status !== STATUS.ok) {
      this.log(
        `  ⇒ begin ${
          begin.status === null ? 'got no reply' : `rejected (0x${hex([begin.status])})`
        } — aborting before any data is staged`,
        'err',
      );
      await this.abort();
      steps.push({
        step: 'aborted',
        reply: { status: begin.status, raw: begin.raw, ms: 0 },
      });
      return steps;
    }

    const announce = padFrame(Uint8Array.from(sequence.announce));
    announce[8] = chunkCount;
    this.log(`SEND  ${hex(announce)}`, 'info');
    await this.transport.send(announce);

    const announced = await this.waitReply(layerByte, `announce 04 ${hex([layerByte])}`);
    steps.push({ step: 'announce', reply: announced });

    if (announced.status !== STATUS.ok) {
      this.log(
        `  ⇒ announce ${
          announced.status === null ? 'got no reply' : `rejected (0x${hex([announced.status])})`
        } — aborting before any chunk is staged`,
        'err',
      );
      await this.abort();
      steps.push({
        step: 'aborted',
        reply: { status: announced.status, raw: announced.raw, ms: 0 },
      });
      return steps;
    }

    await this.clock.sleep(TIMING.announcePause);

    const chunksStart = this.clock.now();
    for (let index = 0; index < chunkCount; index += 1) {
      const frame = body.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      let sent = false;

      for (let attempt = 1; attempt <= TIMING.chunkAttempts; attempt += 1) {
        const started = this.clock.now();
        try {
          await this.transport.send(frame);
          const ms = Math.round(this.clock.now() - started);
          this.log(
            `  chunk ${index + 1}/${chunkCount} ok in ${ms} ms${
              attempt > 1 ? ` (attempt ${attempt})` : ''
            }  ${hex(frame.subarray(0, 4))}`,
            attempt > 1 ? 'ok' : 'dim',
          );
          sent = true;
          break;
        } catch (error) {
          const ms = Math.round(this.clock.now() - started);
          this.log(
            `  chunk ${index + 1}/${chunkCount} attempt ${attempt}/${TIMING.chunkAttempts} FAILED after ${ms} ms: ${errorMessage(
              error,
            )}  ${hex(frame.subarray(0, 4))}`,
            'warn',
          );
          if (attempt < TIMING.chunkAttempts) await this.clock.sleep(TIMING.chunkRetry);
        }
      }

      if (!sent) {
        this.log(
          `  ⇒ chunk ${index + 1} refused ${TIMING.chunkAttempts} times — aborting staging`,
          'err',
        );
        await this.abort();
        steps.push({
          step: 'chunks',
          reply: {
            status: null,
            raw: null,
            ms: Math.round(this.clock.now() - chunksStart),
          },
        });
        return steps;
      }

      if (index < chunkCount - 1) await this.clock.sleep(TIMING.chunkGap);
    }

    this.log(
      `SENT  ${chunkCount} x ${CHUNK_SIZE}-byte chunks (${body.length} bytes) in ${Math.round(
        this.clock.now() - chunksStart,
      )} ms`,
      'dim',
    );

    await this.clock.sleep(TIMING.commitPause);

    await this.send(Uint8Array.from(COMMANDS.commit));
    const commit = await this.waitReply(COMMANDS.commit[1], 'commit 04 02');
    steps.push({ step: 'commit', reply: commit });

    if (sequence.sendEnd) {
      await this.send(Uint8Array.from(COMMANDS.end));
      const end = await this.waitReply(COMMANDS.end[1], 'end 04 F0');
      steps.push({ step: 'end', reply: end });
    }

    return steps;
  }

  private async send(payload: Uint8Array): Promise<void> {
    const frame = padFrame(payload);
    this.log(`SEND  ${hex(frame)}`, 'info');
    await this.transport.send(payload);
    this.log(`      → sent (${payload.length} byte payload + 64-byte frame)`, 'dim');
  }

  private async abort(): Promise<void> {
    try {
      await this.send(Uint8Array.from(COMMANDS.end));
    } catch {
      // The transfer is already dead; the end command is best effort.
    }
  }

  private async waitReply(
    cmd: number,
    label: string,
    timeoutMs = TIMING.replyTimeout,
    settleMs = TIMING.settle,
  ): Promise<TransferReply> {
    await this.clock.sleep(settleMs);
    const started = this.clock.now();
    let attempts = 0;
    const seen: string[] = [];

    while (this.clock.now() - started < timeoutMs) {
      attempts += 1;
      const result = await this.transport.read(TIMING.readTimeout);
      const ms = Math.round(this.clock.now() - started);

      if (result.ok && result.bytes.length >= 4) {
        const frame = result.bytes;
        const tag = `${hex(frame.subarray(0, 5))}@${ms}ms`;
        if (!seen.includes(tag)) seen.push(tag);

        if (frame[0] === 0x04 && frame[1] === cmd && frame[3] !== 0x00) {
          const status = frame[3] as number;
          const verdict =
            status === STATUS.ok ? 'OK' : status === STATUS.rejected ? 'REJECTED' : '?';

          this.log(
            `  ${label}: status 0x${hex([status])} ${verdict}  (${ms} ms after settle, ${attempts} read${
              attempts === 1 ? '' : 's'
            })`,
            status === STATUS.ok ? 'ok' : 'warn',
          );
          if (seen.length > 1) this.log(`    frames seen: ${seen.join('  |  ')}`, 'dim');
          return { status, raw: frame, ms };
        }
      }

      await this.clock.sleep(TIMING.poll);
    }

    this.log(
      `  ${label}: no stamped reply within ${timeoutMs} ms — saw ${
        seen.length ? seen.join('  |  ') : 'nothing'
      }`,
      'warn',
    );
    return { status: null, raw: null, ms: timeoutMs };
  }
}

export function isTransportFailed(steps: readonly TransferStep[]): boolean {
  return steps.some(
    (step) =>
      step.step === 'chunks' ||
      step.step === 'aborted' ||
      (step.step === 'begin' && step.reply.status !== STATUS.ok),
  );
}
