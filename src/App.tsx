import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AppHeader } from '@/features/device/AppHeader';
import { ViewTabs, type View } from '@/features/device/ViewTabs';
import { updateSettings, useSettings } from '@/features/settings/useSettings';
import { useDevice } from '@/features/device/useDevice';
import { KeyInspector } from '@/features/editor/KeyInspector';
import { KeymapBoard } from '@/features/editor/KeymapBoard';
import { LayerTabs } from '@/features/editor/LayerTabs';
import { PendingBar } from '@/features/editor/PendingBar';
import { WriteRules } from '@/features/editor/WriteRules';
import { LogPanel } from '@/features/log/LogPanel';
import { useLog } from '@/features/log/useLog';
import type { LightingStatus, LightingValues } from '@/features/lighting/LightingPanel';
import type { DeviceStatus } from '@/features/device/DevicePanel';
import type { ScreenStatus } from '@/features/screen/AnimationCard';
import type { TimeStatus } from '@/features/screen/ClockCard';
import { realClock } from '@/lib/clock';
import {
  createInitialState,
  editorReducer,
  getActiveRows,
  getPendingCount,
  getSelectedRow,
  loadLayers,
  pendingKeyPatches,
  saveLayers,
  validateUsage,
  type EditorRow,
  type EditorState,
  type Layer,
  type StorageLike,
} from '@/lib/editor';
import { hex } from '@/lib/format';
import { HidClient, STATUS, TransferService, formatClock, isTransportFailed } from '@/lib/hid';
import { buildTimePacket } from '@/lib/hid/time';
import { WirelessClient } from '@/lib/hid/wireless';
import { FN_LOCKED, buildTable } from '@/lib/keymap';
import { buildLightRecord, describeLight } from '@/lib/lighting';
import { buildAnimationPayload } from '@/lib/screen';
import { buildSettingsRecord, describeSettings, type DeviceSettings } from '@/lib/device';
import { cn } from '@/lib/utils';

// The three view panels and the drawer load on demand. A visitor who only remaps
// keys never downloads the calendar, the lighting controls or the probes.
const AdvancedDrawer = lazy(() =>
  import('@/features/advanced/AdvancedDrawer').then((module) => ({
    default: module.AdvancedDrawer,
  })),
);

const ScreenPanel = lazy(() =>
  import('@/features/screen/ScreenPanel').then((module) => ({ default: module.ScreenPanel })),
);

const LightingPanel = lazy(() =>
  import('@/features/lighting/LightingPanel').then((module) => ({
    default: module.LightingPanel,
  })),
);

const DevicePanel = lazy(() =>
  import('@/features/device/DevicePanel').then((module) => ({ default: module.DevicePanel })),
);

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="mt-5 flex min-h-40 items-center justify-center rounded-panel border border-line bg-surface text-xs text-muted">
      Loading the {label} panel…
    </div>
  );
}

function loadInitialState(storage: StorageLike | null): EditorState {
  if (!storage) return createInitialState();
  try {
    return createInitialState(loadLayers(storage));
  } catch {
    return createInitialState();
  }
}

export function App() {
  const storage = useMemo<StorageLike | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }, []);

  const [state, dispatch] = useReducer(editorReducer, storage, loadInitialState);
  const { entries, log, clear: clearLog } = useLog();

  // Both layers live in this state, not in the keyboard: reloading must show the
  // same pending changes. `applied` only moves on a confirmed commit, so the
  // pending mark stays honest across a reload.
  useEffect(() => {
    if (!storage) return;
    try {
      saveLayers(storage, state);
    } catch {
      if (!storageWarning.current) {
        storageWarning.current = true;
        log('This browser cannot remember edits. They will be lost on reload.', 'warn');
      }
    }
  }, [state, storage, log]);
  const device = useDevice({ log });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const storageWarning = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // The drawer mounts on first use and stays mounted, so closing it can animate
  // out through Radix Presence instead of vanishing.
  const [advancedMounted, setAdvancedMounted] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const view = useSettings((settings) => settings.view);
  const [timeStatus, setTimeStatus] = useState<TimeStatus>({ kind: 'idle' });
  const [lightingStatus, setLightingStatus] = useState<LightingStatus>({ kind: 'idle' });
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({ kind: 'idle' });
  const [animationStatus, setAnimationStatus] = useState<ScreenStatus>({ kind: 'idle' });
  const [animationSending, setAnimationSending] = useState(false);
  const [animationProgress, setAnimationProgress] = useState<{
    readonly sent: number;
    readonly total: number;
  } | null>(null);

  const transfer = useMemo(() => {
    if (!device.device || !device.configFound || device.link !== 'usb') return null;
    const config = new HidClient(device.device);
    const screen = device.screenDevice ? new HidClient(device.screenDevice) : null;
    return new TransferService(config, realClock, log, screen ?? undefined);
  }, [device.device, device.screenDevice, device.configFound, device.link, log]);

  // The receiver takes records over output reports and applies patches silently.
  const wireless = useMemo(
    () =>
      device.device && device.link === 'wireless' ? new WirelessClient(device.device, log) : null,
    [device.device, device.link, log],
  );

  const rows = getActiveRows(state);
  const selectedRow = getSelectedRow(state);
  const pendingCount = getPendingCount(state);
  const connected = device.status === 'connected' && device.configFound;
  const locked = selectedRow ? state.layer === 'fn' && FN_LOCKED.has(selectedRow.idx) : false;

  const sendRows = useCallback(
    async (rowsToSend: readonly EditorRow[], layer: Layer, afterState: EditorState) => {
      if (!transfer && !wireless) {
        log('Connect the keyboard first.', 'warn');
        return false;
      }
      if (busyRef.current) return false;

      busyRef.current = true;
      setBusy(true);

      try {
        const table = buildTable(rowsToSend, { layerFn: layer === 'fn' });

        if (wireless) {
          // One patch per key; the receiver applies them as they arrive and
          // sends nothing back, so `applied` moves on a send, not a reply.
          const patches = pendingKeyPatches(rowsToSend, table);
          const sent = await wireless.sendKeys(layer, patches);
          dispatch({ type: 'replace', state: afterState });

          if (sent === 0) {
            log('Nothing to send.', 'warn');
            return false;
          }

          log(
            `Sent ${sent} key change${sent === 1 ? '' : 's'} over 2.4 GHz. The keyboard does not confirm them.`,
            'ok',
          );
          return true;
        }

        if (!transfer) return false;
        const result = await transfer.sendTable(table, layer);

        if (result.busy) {
          log('A transfer is already running.', 'warn');
          return false;
        }

        if (isTransportFailed(result.steps)) {
          log('The keyboard refused the transfer. Nothing was written.', 'err');
          return false;
        }

        const commit = result.steps.find((step) => step.step === 'commit');
        const status = commit?.reply.status ?? null;

        if (status === STATUS.ok) {
          // The settings effect writes both layers once `applied` moves here.
          dispatch({ type: 'replace', state: afterState });

          log(`Upload accepted. The ${layer === 'fn' ? 'Fn layer' : 'top layer'} is live.`, 'ok');
          return true;
        }

        log(
          `Upload rejected (${status === null ? 'no reply' : `0x${hex([status])}`}). Nothing was applied.`,
          'err',
        );
        return false;
      } catch (error) {
        log(`Upload failed: ${error instanceof Error ? error.message : String(error)}`, 'err');
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [dispatch, log, transfer, wireless],
  );

  const handleUsage = useCallback(
    (usage: number, media: boolean) => {
      if (busyRef.current) return false;
      const check = validateUsage(state, usage, media);
      if (!check.ok) {
        log(check.message, 'warn');
        return false;
      }
      dispatch({ type: 'usage', usage, media });
      return true;
    },
    [log, state],
  );

  const handleReset = useCallback(() => {
    if (busyRef.current) return;
    dispatch({ type: 'reset-selected' });
  }, []);

  const handleLayer = useCallback((layer: Layer) => {
    if (busyRef.current) return;
    dispatch({ type: 'layer', layer });
  }, []);

  const handleSelect = useCallback((idx: number) => {
    if (busyRef.current) return;
    dispatch({ type: 'select', idx });
  }, []);

  const handleUpload = useCallback(() => {
    if ((!transfer && !wireless) || busyRef.current || pendingCount === 0) return;
    const after = editorReducer(state, { type: 'uploaded' });
    void sendRows(getActiveRows(state), state.layer, after);
  }, [pendingCount, sendRows, state, transfer, wireless]);

  const handleRestore = useCallback(() => {
    if ((!transfer && !wireless) || busyRef.current) return;
    setConfirming(true);
  }, [transfer, wireless]);

  const handleConfirmRestore = useCallback(() => {
    if ((!transfer && !wireless) || busyRef.current) return;
    setConfirming(false);

    const restored = editorReducer(state, { type: 'restore-layer' });
    dispatch({ type: 'replace', state: restored });
    const after = editorReducer(restored, { type: 'uploaded' });
    void sendRows(getActiveRows(restored), restored.layer, after);
  }, [sendRows, state, transfer, wireless]);

  const handleCancelRestore = useCallback(() => setConfirming(false), []);

  const handleSendTime = useCallback(
    async (at: Date) => {
      if (!transfer && !wireless) {
        log('Connect the keyboard first.', 'warn');
        return;
      }
      if (busyRef.current) return;

      busyRef.current = true;
      setBusy(true);
      setTimeStatus({ kind: 'idle' });

      try {
        if (wireless) {
          await wireless.sendClock(buildTimePacket(at));
          setTimeStatus({ kind: 'ok', at });
          log(`Time sent. The screen clock is set to ${formatClock(at)}.`, 'ok');
          return;
        }

        if (!transfer) return;
        const result = await transfer.sendTime(at);

        if (result.busy) {
          log('A transfer is already running.', 'warn');
          return;
        }

        if (isTransportFailed(result.steps)) {
          setTimeStatus({
            kind: 'err',
            message: 'The keyboard refused the time. Nothing changed.',
          });
          log('The keyboard refused the time. Nothing changed.', 'err');
          return;
        }

        const commit = result.steps.find((step) => step.step === 'commit');
        const status = commit?.reply.status ?? null;

        if (status === STATUS.ok) {
          setTimeStatus({ kind: 'ok', at });
          log(`Time sent. The screen clock is set to ${formatClock(at)}.`, 'ok');
          return;
        }

        setTimeStatus({
          kind: 'err',
          message:
            status === null
              ? 'No reply from the keyboard. Nothing changed.'
              : 'The keyboard refused the time. Nothing changed.',
        });
        log(
          `Time rejected (${status === null ? 'no reply' : `0x${hex([status])}`}). Nothing changed.`,
          'err',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setTimeStatus({ kind: 'err', message: 'The time could not be sent. Nothing changed.' });
        log(`Time failed: ${message}`, 'err');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [log, transfer, wireless],
  );

  const handleSendAnimation = useCallback(
    async (frames: Uint8Array[], delays: number[]) => {
      if (!transfer) {
        log('Connect the keyboard first.', 'warn');
        return;
      }
      if (busyRef.current) return;

      busyRef.current = true;
      setBusy(true);
      setAnimationStatus({ kind: 'idle' });
      setAnimationProgress(null);
      setAnimationSending(true);

      let sentBlocks = 0;

      try {
        const payload = buildAnimationPayload({ frames, delaysMs: delays });
        const result = await transfer.sendAnimation(payload, {
          onProgress: (sent, total) => {
            sentBlocks = sent;
            setAnimationProgress({ sent, total });
          },
        });

        if (result.busy) {
          log('A transfer is already running.', 'warn');
          return;
        }

        if (isTransportFailed(result.steps)) {
          const done = Math.max(0, Math.floor((sentBlocks - 1) / 8));
          setAnimationStatus({
            kind: 'err',
            message: `The upload stopped after ${done} of ${frames.length} frames. Unplug and replug the keyboard if it stops responding, then send the animation again.`,
          });
          log('The screen upload stopped early. The commit was not sent.', 'err');
          return;
        }

        const commit = result.steps.find((step) => step.step === 'commit');
        const status = commit?.reply.status ?? null;

        if (status === STATUS.ok) {
          setAnimationStatus({ kind: 'ok', message: 'Sent. The screen is playing the animation.' });
          log(`Screen animation sent (${frames.length} frames).`, 'ok');
          return;
        }

        setAnimationStatus({
          kind: 'err',
          message:
            'The keyboard refused the commit. The screen may show a mix of the old and new animation; send another one to replace it.',
        });
        log(
          `Screen animation rejected (${
            status === null ? 'no reply' : `0x${hex([status])}`
          }). The screen may hold a mix of old and new frames.`,
          'err',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAnimationStatus({
          kind: 'err',
          message:
            'The upload stopped unexpectedly. If the keyboard stops responding, unplug and replug it, then send the animation again.',
        });
        log(`Screen upload failed: ${message}`, 'err');
      } finally {
        setAnimationSending(false);
        setAnimationProgress(null);
        busyRef.current = false;
        setBusy(false);
      }
    },
    [log, transfer],
  );

  const handleApplyLight = useCallback(
    async (values: LightingValues) => {
      const { mode, color, brightness, speed, colorful, direction } = values;
      if (!transfer && !wireless) {
        log('Connect the keyboard first.', 'warn');
        return;
      }
      if (busyRef.current) return;

      busyRef.current = true;
      setBusy(true);
      setLightingStatus({ kind: 'idle' });

      try {
        const record = buildLightRecord({
          mode,
          r: Number.parseInt(color.slice(1, 3), 16),
          g: Number.parseInt(color.slice(3, 5), 16),
          b: Number.parseInt(color.slice(5, 7), 16),
          brightness,
          speed,
          colorful,
          direction,
        });

        if (wireless) {
          await wireless.sendLight(record);
          const { message, log: line } = describeLight(values);
          setLightingStatus({ kind: 'ok', message });
          log(line, 'ok');
          return;
        }

        if (!transfer) return;
        const result = await transfer.sendLighting(record);

        if (result.busy) {
          log('A transfer is already running.', 'warn');
          return;
        }

        if (isTransportFailed(result.steps)) {
          setLightingStatus({
            kind: 'err',
            message: 'The light may not have been sent. Check the keyboard before trying again.',
          });
          log('The light transfer stopped early. Check the keyboard.', 'err');
          return;
        }

        const commit = result.steps.find((step) => step.step === 'commit');
        const status = commit?.reply.status ?? null;

        if (status === STATUS.ok) {
          const { message, log: line } = describeLight(values);
          setLightingStatus({ kind: 'ok', message });
          log(line, 'ok');
          return;
        }

        setLightingStatus({
          kind: 'err',
          message:
            'The keyboard did not confirm the light. It may have applied anyway; check the keys and apply again if not.',
        });
        log(
          `Light not confirmed (${status === null ? 'no reply' : `0x${hex([status])}`}). It may still have applied.`,
          'err',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLightingStatus({
          kind: 'err',
          message: 'The light could not be sent. Nothing changed.',
        });
        log(`Light failed: ${message}`, 'err');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [log, transfer, wireless],
  );

  const handleApplySettings = useCallback(
    async (values: DeviceSettings) => {
      if (!transfer && !wireless) {
        log('Connect the keyboard first.', 'warn');
        return;
      }
      if (busyRef.current) return;

      busyRef.current = true;
      setBusy(true);
      setDeviceStatus({ kind: 'idle' });

      try {
        const record = buildSettingsRecord(values);

        if (wireless) {
          await wireless.sendSettings(record);
          const { message, log: line } = describeSettings(values);
          setDeviceStatus({ kind: 'ok', message });
          log(line, 'ok');
          return;
        }

        if (!transfer) return;
        const result = await transfer.sendSettings(record);

        if (result.busy) {
          log('A transfer is already running.', 'warn');
          return;
        }

        if (isTransportFailed(result.steps)) {
          setDeviceStatus({
            kind: 'err',
            message:
              'The settings may not have been sent. Check the shortcuts before trying again.',
          });
          log('The settings transfer stopped early. Check the keyboard.', 'err');
          return;
        }

        const commit = result.steps.find((step) => step.step === 'commit');
        const status = commit?.reply.status ?? null;

        if (status === STATUS.ok) {
          const { message, log: line } = describeSettings(values);
          setDeviceStatus({ kind: 'ok', message });
          log(line, 'ok');
          return;
        }

        setDeviceStatus({
          kind: 'err',
          message:
            'The keyboard did not confirm the settings. They may have applied anyway; check the shortcuts and apply again if not.',
        });
        log(
          `Device settings not confirmed (${status === null ? 'no reply' : `0x${hex([status])}`}). They may still have applied.`,
          'err',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setDeviceStatus({
          kind: 'err',
          message: 'The settings could not be sent. Nothing changed.',
        });
        log(`Settings failed: ${message}`, 'err');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [log, transfer, wireless],
  );

  const handleOpenAdvanced = useCallback(() => {
    if (!connected || busyRef.current) return;
    setAdvancedMounted(true);
    setAdvancedOpen(true);
  }, [connected]);

  const handleCloseAdvanced = useCallback(() => setAdvancedOpen(false), []);

  const handleAdvancedBusy = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);

  const handleConnect = useCallback(() => {
    void device.connect();
    // The drawer is only reachable while connected, so warm its chunk now and
    // the first click opens it without a fetch.
    void import('@/features/advanced/AdvancedDrawer').catch(() => {});
  }, [device]);

  const handleDisconnect = useCallback(() => {
    void device.disconnect();
  }, [device]);

  // A connected link is not a problem, so only the failures take the error
  // styling. The 2.4 GHz note is neutral, and the screen caveat lives on the
  // Screen tab rather than in this line.
  const banner: { readonly tone: 'error' | 'info'; readonly text: string } | null =
    !device.supported
      ? {
          tone: 'error',
          text: 'WebHID is not available in this browser. Use Chrome, Edge or Opera on desktop.',
        }
      : device.error
        ? { tone: 'error', text: device.error }
        : device.status === 'connected' && device.link === 'wireless'
          ? {
              tone: 'info',
              text: 'Connected over 2.4 GHz. Key changes go one at a time and the keyboard does not confirm them.',
            }
          : device.status === 'connected' && !device.configFound
            ? {
                tone: 'error',
                text: 'The configuration interface was not found. Use USB mode and close the vendor app.',
              }
            : null;

  return (
    <div className="flex min-h-screen flex-col bg-ink text-ivory">
      <AppHeader
        device={device}
        supported={device.supported}
        busy={busy}
        logOpen={logOpen}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onAdvanced={handleOpenAdvanced}
        advancedDisabled={!connected || busy}
        onToggleLog={() => setLogOpen((open) => !open)}
      />

      {banner ? (
        <div
          className={cn(
            'border-b px-4 py-2 text-sm',
            banner.tone === 'error'
              ? 'border-rust/40 bg-rust/10 text-rust'
              : 'border-line bg-surface/60 text-muted',
          )}
        >
          {banner.text}
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-page flex-1 px-4 py-6">
        <Tabs value={view} onValueChange={(next) => updateSettings({ view: next as View })}>
          <ViewTabs view={view} disabled={busy} />

          <TabsContent value="keys">
            <div className="mt-5 grid content-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section className="flex min-w-0 flex-col gap-4">
                <Tabs value={state.layer} onValueChange={(next) => handleLayer(next as Layer)}>
                  <LayerTabs layer={state.layer} disabled={busy} />
                  <TabsContent value="top" className="mt-4">
                    <KeymapBoard
                      rows={rows}
                      layer={state.layer}
                      selected={state.selected}
                      disabled={busy}
                      onSelect={handleSelect}
                    />
                  </TabsContent>
                  <TabsContent value="fn" className="mt-4">
                    <KeymapBoard
                      rows={rows}
                      layer={state.layer}
                      selected={state.selected}
                      disabled={busy}
                      onSelect={handleSelect}
                    />
                  </TabsContent>
                </Tabs>
                <PendingBar
                  layer={state.layer}
                  pendingCount={pendingCount}
                  connected={connected}
                  busy={busy}
                  confirming={confirming}
                  onUpload={handleUpload}
                  onRestore={handleRestore}
                  onConfirmRestore={handleConfirmRestore}
                  onCancelRestore={handleCancelRestore}
                />
              </section>

              <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
                <KeyInspector
                  row={selectedRow}
                  layer={state.layer}
                  locked={locked}
                  disabled={busy}
                  onUsage={handleUsage}
                  onReset={handleReset}
                  onInvalid={(message) => log(message, 'warn')}
                />
                <WriteRules />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="screen">
            <Suspense fallback={<PanelLoading label="screen" />}>
              <div className="mt-5 grid content-start gap-5 lg:grid-cols-[minmax(0,440px)_340px] lg:justify-center">
                <ScreenPanel
                  connected={connected}
                  screenReady={device.screenFound}
                  busy={busy}
                  status={timeStatus}
                  animationStatus={animationStatus}
                  animationProgress={animationProgress}
                  animationSending={animationSending}
                  onSend={handleSendTime}
                  onSendAnimation={handleSendAnimation}
                  wireless={device.link === 'wireless'}
                />
              </div>
            </Suspense>
          </TabsContent>

          <TabsContent value="light">
            <Suspense fallback={<PanelLoading label="lighting" />}>
              <div className="mt-5 grid content-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <LightingPanel
                  connected={connected}
                  busy={busy}
                  status={lightingStatus}
                  onApply={handleApplyLight}
                />
              </div>
            </Suspense>
          </TabsContent>

          <TabsContent value="device">
            <Suspense fallback={<PanelLoading label="device" />}>
              <div className="mt-5 grid content-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <DevicePanel
                  connected={connected}
                  busy={busy}
                  status={deviceStatus}
                  wireless={device.link === 'wireless'}
                  onApply={handleApplySettings}
                />
              </div>
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>

      <LogPanel
        entries={entries}
        open={logOpen}
        onToggle={() => setLogOpen((open) => !open)}
        onClear={clearLog}
      />

      {advancedMounted ? (
        <Suspense fallback={null}>
          <AdvancedDrawer
            open={advancedOpen}
            device={device.device}
            log={log}
            onClose={handleCloseAdvanced}
            onBusyChange={handleAdvancedBusy}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
