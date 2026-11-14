# 04 · Code map

The app is a Vite, React and TypeScript project. `index.html` is only the Vite entry; the code
lives in `src/`. The keymap, HID and editor modules under `src/lib` import no React, so the same
code runs in the browser and under Vitest.

## 1. Layout

```text
index.html               Vite entry, mounts /src/main.tsx
src/main.tsx             React root, fonts and global styles
src/App.tsx              page composition, upload and restore, drawer state
src/styles/globals.css   colour, type and radius tokens, bench mat, base styles
src/components/ui/       Button, Input, Popover, Calendar, Tabs, Checkbox, Slider, Select,
                         Command, Combobox, ToggleGroup, Sheet, Sonner
src/components/          StatusNote, TabRow, UsbOnlyBadge, UpdateNotice
src/lib/keymap/          constants, factory keys, record encoding, names, parsing, table
src/lib/hid/             protocol, client, collections, wireless, WebHID types, transfer, time,
                         probes, raw
src/lib/screen/          RGB565, frame layout, animation payload
src/lib/lighting/        the 64-byte record, the per-key table, preview motion, wording
src/lib/device/          the 64-byte settings record, response levels, sleep options
src/lib/editor/          row state, reducer, validation, persistence, per-key patches
src/lib/settings/        remembered view, clock mode and light settings
src/lib/profile/         the portable JSON profile and its validation
src/lib/clock.ts         Clock type and the real timer
src/lib/format.ts        hex formatting
src/lib/build.ts         the package version, inlined by `define`
src/lib/toast.ts         the short confirmation wrapper around sonner
src/lib/download.ts      handing a text file to the browser
src/pwa/                 update store and the service worker registration
src/env.d.ts             the `APP_BUILD_VERSION` global and the PWA client types
public/manifest.webmanifest   name, colours, the five icons and two screenshots
public/icons/            the PNG set, rendered from public/favicon.svg and docs/assets/icons
public/screenshots/      the two captures the install dialog shows, outside the precache
src/features/device/     useDevice, AppHeader, ViewTabs, DevicePanel
src/features/editor/     LayerTabs, KeymapBoard, KeyInspector, PendingBar, WriteRules, keyLabels
src/features/profile/    ProfileMenu: export, import and the confirm step
src/features/screen/     ScreenPanel, ScreenPreview, ClockCard, DateTimePicker, AnimationCard
src/features/lighting/   LightingPanel, LightPreview, PerKeyPanel, PerKeyBoard
src/features/log/        useLog, LogPanel
src/features/settings/   the settings store and its React hook
src/features/advanced/   AdvancedDrawer
src/test/                Vitest setup, fake HID device and fake clock
scripts/                 release, git hooks and the precache check
```

## 2. Boundaries

`src/lib/keymap` and `src/lib/hid` are framework-free. They export functions and types; they do
not import React or touch the DOM except through the `WebHidDevice` shape the caller supplies.
`src/lib/editor` is also React-free: plain state, a reducer and storage.

`src/lib/settings` validates and serialises what the page remembers, including the device settings
draft; `src/features/settings` keeps that in a module store and exposes it through
`useSyncExternalStore`. Panels read and write their slice, so unmounting one no longer drops its
values. The store holds the values in memory and writes to `localStorage` after a 200 ms pause,
flushed on `pagehide`. Pending top-layer edits and the log stay out on purpose: a saved table would
look applied, and a saved log would describe traffic from another session.

React components render and dispatch. They never call `navigator.hid`. `useDevice` owns the
chooser, open and close, and the disconnect listener. Uploads on the wired link go through
`TransferService`; the receiver's records go through `WirelessClient`. The advanced drawer calls the
probe services. All of them receive a transport, and writes happen only in event handlers.

`classifyGranted` in `src/lib/hid/webhid.ts` decides whether a click can skip the chooser. A click
reads `navigator.hid.getDevices()`, which returns only devices this origin already has, and reopens
the board when exactly one link is granted. A second keyboard, or a cable and a receiver both
granted, goes to the chooser, because picking one would be a guess. The page reads the list on idle
and on the HID connect and disconnect events to label the button **Reconnect**; that probe never
opens a device. The caret beside **Reconnect** opens **Choose another keyboard**, which asks for the
chooser on purpose, so a granted cable does not shut the dongle out.

`src/lib/profile` is framework-free: it builds and validates the JSON bundle from the editor drafts
and the settings, and knows nothing about files. `downloadText` in `src/lib/download.ts` is the only
DOM touch in that path. A profile carries drafts only, so importing one moves no `applied` value and
writes nothing to the keyboard.

Toasts are UI only. `src/lib/toast.ts` wraps sonner with the app's tones, so a component confirms an
action without knowing the library. A toast never holds information the log or the panel does not:
the inline `StatusNote` keeps the detail of a send, and the log keeps every transport line.

`useDevice` records how the keyboard was reached. A device with the `0xFF13` collection is the
wired board; a device with `0xFF60/0x0061` is the 2.4 GHz receiver, which has no feature reports
at all. The state carries `link: 'usb' | 'wireless'` and the app branches on it: wired goes through
`TransferService`, wireless through `WirelessClient` in `src/lib/hid/wireless.ts`, which sends
33-byte output reports with a checksum and the vendor's init and heartbeat first.

Over wireless the same records go out: light, clock, per-key colours and device settings as one
frame each, and key changes as one patch per key, taken from `pendingKeyPatches` at `idx * 4` of the
table the wired path would have sent, so the encoder stays the single source. Per-key colours are
the exception to the one-frame shape: the 576-byte table goes out as 21 frames of 28 bytes under
`0x14`, after the `0x80` record through the light command. Patches are paced 15 ms apart and
silent, so `applied` moves when they are sent rather than when the keyboard replies. A whole-layer
restore is 81 patches in a single run; Test 20 sent that burst and the map came back correct. The
screen has no channel on this link, so the animation card is disabled and tagged USB only, and the
connection banner uses the neutral tone rather than the error one.

## 3. Transport

`src/lib/hid/protocol.ts` holds the fixed values:

| Constant | Value | Meaning |
|---|---|---|
| `VENDOR_ID` | `0x0C45` | AJAZZ vendor id |
| `PRODUCT_IDS` | `0x8009`, `0x800A`, `0xFDFD` | accepted product ids |
| `CONFIG_USAGE_PAGE` / `CONFIG_USAGE` | `0xFF13` / `0x0001` | the configuration collection |
| `REPORT_ID` / `REPORT_SIZE` | `0` / `64` | feature report framing |
| `CHUNK_SIZE` / `CHUNK_COUNT` | `64` / `9` | 576 bytes in 9 chunks |
| `TIMING.settle` / `TIMING.poll` | `220` / `60` ms | reply wait and poll interval |

`HidClient.send` pads one payload to 64 bytes and calls `sendFeatureReport(0, frame)`.
`HidClient.read` races `receiveFeatureReport(0)` against a clock timeout and returns
`{ ok: true, bytes }` or `{ ok: false, reason }`.

`TransferService.sendTable` is the app's key-table write path:

```text
04 18  →  04 11 (top) or 04 27 (Fn)  →  9 x 64-byte chunks  →  04 02  →  04 F0
```

`waitReply` settles for 220 ms, then polls every 60 ms for up to 6 s. It accepts only a frame
where byte 1 matches the command and byte 3 is not zero. A commit `0xFF` is a firmware rejection,
not a transport failure; `isTransportFailed` keeps the two apart.

`TransferService.sendTime` uses the same staged shape for the screen clock:

```text
04 18  →  04 28 (byte 8 = 1)  →  one 64-byte body  →  04 02
```

There is no `04 F0` after the commit, which matches the vendor app. `src/lib/hid/time.ts` builds
the body; the layout is in `docs/01-protocol.md` §9.

`TransferService.sendAnimation` writes the screen. Begin and announce (`04 72`, mode 3, block
count) go over the feature transport, the 4096-byte blocks go over a separate `OutputTransport`
bound to the `0xFF68` device, then the commit. Blocks are paced 150 ms apart, which matches the
vendor's 153 ms. `src/lib/screen` builds the buffer; the layout is in `docs/01-protocol.md` §10.

`TransferService.sendLighting` writes one 64-byte record with the staged runner: `04 18`, `04 13`
with one chunk, the record, a 60 ms pause, `04 02`, `04 F0`. `src/lib/lighting` builds the record;
the layout is in `docs/01-protocol.md` §11.

`TransferService.sendPerKey` writes per-key colours as two staged sequences under one lock: the
mode-`0x80` light record first, then the 576-byte table under `04 23` with nine chunks and the end
command. A refused mode switch stops before the table. It returns the two sequences apart, because
the caller has to know which commit failed. The table and the trigger come from
`src/lib/lighting/perKey.ts`; the layout is in `docs/01-protocol.md` §11.

`WirelessClient.sendPerKey` sends the same two pieces over the receiver: the trigger through the
light command, then 21 frames of command `0x14`, 28 bytes each and 16 in the last, with the frame
number in the header, a 500 ms pause after the trigger and 25 ms between frames. The client beats
on a ten-second timer while the App is connected, and again before a write when the last one is
older than four seconds, with a 500 ms settle after that beat: the receiver ignores records after a
quiet spell, and a beat sent 10 ms before a record does not wake it. The receiver confirms nothing,
so the panel moves `sent` when the frames are written.

`TransferService` owns the transfer lock. A second `sendTable` or `sendTime` call returns
`{ busy: true }` instead of interleaving. `App` also keeps one busy flag for uploads, clock writes
and advanced probes, so a probe cannot run during an upload and an upload cannot start during a
probe.

## 4. Keymap

```text
FACTORY_KEYS           81 entries: idx, usage, name, x, y, w, h
modBit                 0xE0..0xE7 -> 1, 2, 4, 8, 16, 32, 64, 128
encodeRecord           keyboard -> [0x02, mod, usage, 0]
                       consumer -> [0x03, lo, hi, 0]
buildTable             576 zeroed bytes, record at idx * 4,
                       skips usage 0 and fnlayer_disable on the Fn layer,
                       writes AA 55 at bytes 574..575
parseUsageToken        "0x04" keyboard, "c:0xE2" consumer
parseMapText           "idx [c:]usage name" per line, # comments
```

`usageLabel` (keymap names) prints a human label and carries the `media` flag, so a value is never
shown without its page. `usageToken` (editor state) prints the raw token, with `c:` for media.

## 5. Editor state

```text
EditorState    { top, fn, layer, selected }
EditorRow      { idx, usage, media, name, x, y, w, h,
                 factory, factoryMedia, applied, appliedMedia }
```

Every row carries what the editor says now (`usage`, `media`), what is believed to be on the
keyboard (`applied`, `appliedMedia`), and the baseline (`factory`, `factoryMedia`). On the Fn layer
the factory baseline is zero, because zero means "firmware default".

`getPendingCount` counts rows where `usage !== applied || media !== appliedMedia`. The page matters
too: `0xE2` Left Alt to `0xE2` Mute changes only `media`.

Reducer actions:

```text
select              select a key, or clear it when it is already selected
layer               switch layer, clear the selection
usage               set usage and media on the selected row, after validation
reset-selected      return the selected row to its factory value
restore-layer       return every row on the active layer to factory
uploaded            copy usage/media into applied/appliedMedia
replace             swap in a whole state (restore confirmation)
```

`applied` moves on `uploaded`, which `App` dispatches after a `commit 0x01`, and on `replace` when a
wireless upload goes out, because the receiver confirms nothing and there is no commit to wait for.
`src/lib/editor/persistence.ts` stores both layers in one object under `ak820.layers`:

```json
{ "version": 1, "top": { "draft": [], "applied": [] }, "fn": { "draft": [], "applied": [] } }
```

Each half holds `[idx, usage]` or `[idx, usage, 1]` rows, only for keys that differ from that
layer's factory value. `App` writes the object from an effect on the editor state, so a draft edit
is remembered at once and `applied` is remembered when `uploaded` moves it. That is why a reload
can show a pending change on either layer without implying it reached the keyboard.
`createInitialState` takes the loaded object and seeds each row's `usage` from `draft` and
`applied` from `applied`. The active layer and the selected key are not stored, so the editor always
opens on the top layer with nothing selected.

The older keys, `ak820.fn.overrides` and `ak820.top.layer`, are still read once when the new object
is missing, then removed after the first successful write. The Fn rows arrive as both halves, which
matches how that version only ever stored uploaded overrides.

## 6. UI

The board is data-driven from `FACTORY_KEYS`. Each key is an absolutely positioned button at
`x/y/w/h` on the `BOARD_WIDTH × BOARD_HEIGHT` canvas, which both boards take from
`src/lib/keymap/factoryKeys.ts`. A `ResizeObserver` scales the canvas between 0.6× and 1.45× to fit
its container. Keys are not re-laid out on mobile; the whole board scales.

The view tabs and the layer tabs are the same control, so both render through `TabRow`. A result
under a send button is a `StatusNote`: one dot, one sentence, and a colour that says whether the
keyboard accepted it. The four view tabs carry no link badge: the clock still goes over the
receiver from the Screen view, and Lighting and Device keep working there. The controls that need
USB mark themselves, with a brass dot on the Per-key tab and the `UsbOnlyBadge` pill on the
animation card and the two blocked shortcut rows. `TabRow` can still dot a tab whose whole panel
cannot work on the link. `LightPreview` paints from the theme tokens with `fill-*` and `stroke-*`
utilities, so a palette change reaches it too.

Visual states are separate: brass edge and brass legend mean "differs from factory", a brass dot
means "not uploaded", an ivory edge means "selected", and a dashed cap means "firmware-owned on the
Fn layer". Brass is never used as decoration: on the board the legend gives it meaning, and on a
control it marks what the current link cannot do.

The inspector mirrors the board and is the only place that edits a usage. The `Sends` picker is a
searchable combobox grouped by the usage table, so a keyboard key, a media key or the Fn default
is a few letters away instead of a scroll through 200 rows. Its raw field accepts a token like
`0x04` or `c:0xE2`. The layer tabs switch between `top` and `fn`. The pending bar stages the
upload and lists the keys it will carry, one `describePendingChange` line per row, capped at eight
with a count for the rest. The list stays visible while disconnected, and it hides while the
restore question is up. The restore confirmation lives beside it, and the log drawer keeps every
transport line.

`ViewTabs` switches the workbench between the board and the screen. The screen view keeps the same
two-column grid: the 128 × 128 preview takes the board's place, and `ClockCard` takes the
inspector's. The card owns the Now/Custom choice, the live clock and the send status. A clock write
is never started by connecting or by switching views; it needs the **Send time** button.

`AnimationCard` sits under the clock card. It decodes a GIF with the browser's `ImageDecoder`
(`src/lib/screen/decode.ts`), composites each frame to 128 × 128, converts it to RGB565 and keeps
the delays. The file never leaves the page. Uploads show block progress; there is no cancel,
because the firmware cannot abort a stream it has started. The card is disabled when WebHID did not
return the `0xFF68` interface, and on the 2.4 GHz link it is disabled, badged `USB only` and explains
that the receiver has no screen channel.

`LightingPanel` shows the 20 effects. Each mode's controls come from the vendor database:
colour and Colourful, brightness, speed, and the direction pair for its axis. The controls are
shadcn-style Radix primitives, so tabs own their panels, sliders expose their values and the
select is keyboard-driven. `LightPreview` is the real 81-key board; it animates an approximation
of the selected effect from the mode, speed, direction, brightness and Colourful state, and stops
under `prefers-reduced-motion`. The mode-to-motion table and each key's position in the wave live
in `src/lib/lighting/preview.ts`, so the travel direction of a row or column and the rotation
flip are tested without a keyboard. Effects that react to a key press are not modelled: the panel
has no keystroke to react to. After a confirmed commit, `src/lib/lighting/describe.ts` writes the
confirmation and the log line from the mode's own flags, so a mode without a speed control never
reports one, and a mode that cycles through colours never promises the picker's hex.

A second tab row inside **Lighting** switches between **Effect** and **Per-key**. Per-key paints
colours on the same 81-key geometry: brush and eraser, a colour picker with the vendor's default
swatches, brightness, Fill all, Clear all, and one Apply for the whole 576-byte table. Painting
works with a click, a drag, or Space and Backspace on the focused key. The draft and the map last
sent both live in the settings store, so a reload still shows which keys are unsent. A key without
a colour is off while the board runs the per-key map, which is why Clear all means every key off.
The tab works on both links; over the receiver the confirmation says the map is not confirmed.

The **Device** view is two columns. The left one is the vendor's response-time table, all three
links, with the selected level in ivory so the numbers can be compared before choosing. The right
one holds the two selects and the three checkboxes, and one Apply writes them together, because the
record is a snapshot. The values live in the settings store, so a reload shows the last choices
rather than the defaults, and a line under Apply says when they were last sent. On the 2.4 GHz link
the Alt+F4 and Alt+Tab rows are disabled and badged, since the receiver ignores those two flags.
`src/lib/device` holds the record, the option lists and the wording, and `docs/01-protocol.md` §12
holds the captured layout.

`ProfileMenu` sits in the header beside Advanced and Log. Export calls `buildProfile` and hands the
text to `downloadText`; import reads the file through `readProfile`, shows the counts, and only after
**Replace drafts** hands the parsed profile to `App`, which swaps the editor drafts and writes the
device, lighting and clock-mode values to the settings store. The menu is disabled while a transfer
runs, and a bad file lists its problems instead of applying half of it.

The `Toaster` mounts once in `App` and sits bottom right, above the log footer. Tones come from the
sonner variables set in `src/components/ui/sonner.tsx`: surface background, sage for success, rust
for failure, brass for a warning. Sends confirm through both the toast and the inline `StatusNote`,
and the toast stays the short version.

`UpdateNotice` is the strip between the header and the connection banner, and it renders nothing
until the worker reports a waiting build. It uses brass because a waiting build is not a failure,
and it stays on the page until someone acts on it, which is why it is not a toast. `src/pwa` holds
the framework-free store it reads through `useSyncExternalStore` and the single module that imports
`virtual:pwa-register`; `App` only mounts the strip. The log footer carries `build 2.10.2` from
`src/lib/build.ts`, so a cached page can still be identified.

`AdvancedDrawer` is a `Sheet`: a Radix dialog that slides in from the right, traps focus, locks the
page scroll and returns focus to the Advanced button on close. Escape and a click on the overlay
both close it, and both are refused while a probe is running. The slide and the overlay fade are
CSS keyframes in `globals.css`, so the drawer keeps its lazy chunk: `App` mounts it on first use
and leaves it mounted, which is what lets Radix Presence play the exit animation. Its four tabs
(diagnostics, deep probe, mailbox, raw command) use the same `Tabs` primitive as the rest of the
page, so each has a real panel and arrow keys move between them. It takes a `clock` prop, which is
the real clock in the app and a fake clock in tests. Probes report through the same log and set the
app busy flag through `onBusyChange`.

## 7. Tests

| File | Covers |
|---|---|
| `src/lib/keymap/constants.test.ts` | table size, index limit, trailer offset, Fn lock set |
| `src/lib/keymap/encode.test.ts` | record type, modifier bits, media bytes |
| `src/lib/keymap/table.test.ts` | factory table, 164 non-zero bytes, trailer, Fn zeroing, bounds |
| `src/lib/keymap/parse.test.ts` | map text, `c:` tokens, comments and malformed lines |
| `src/lib/keymap/names.test.ts` | labels, hex fallback, token parsing |
| `src/lib/hid/protocol.test.ts` | product ids, commands, frame padding |
| `src/lib/hid/client.test.ts` | feature send/read, timeout and errors |
| `src/lib/hid/transfer.test.ts` | the full sequence, abort paths, busy lock, byte order, clock |
| `src/lib/hid/time.test.ts` | clock body, year offset, weekday, input parser |
| `src/lib/screen/animation.test.ts` | RGB565, header, delays, frame placement |
| `src/lib/lighting/record.test.ts` | solid-light bytes, colour order, ranges |
| `src/lib/lighting/preview.test.ts` | effect motion, wave direction, rotation flip |
| `src/lib/lighting/describe.test.ts` | confirmed-light wording, per-mode fields |
| `src/lib/lighting/perKey.test.ts` | slot record, colour bytes, 81-key table, trigger, wording |
| `src/lib/settings/settings.test.ts` | stored-field validation, defaults, version |
| `src/lib/hid/collections.test.ts` | flattening and config collection lookup |
| `src/lib/hid/diagnostics.test.ts` | pass, refused write, silent read, missing collection |
| `src/lib/hid/deepProbe.test.ts` | echo, silent device |
| `src/lib/hid/mailboxProbe.test.ts` | probe lines and conclusions |
| `src/lib/hid/raw.test.ts` | hex parsing, chunking, reply listening |
| `src/lib/editor/state.test.ts` | reducer, pending count, validation, map apply |
| `src/lib/editor/persistence.test.ts` | one stored object, draft/applied, legacy migration |
| `src/lib/editor/patches.test.ts` | per-key records sliced from the table, media, Fn, order |
| `src/lib/editor/describe.test.ts` | one pending line: top, media, Fn, cleared override |
| `src/lib/profile/profile.test.ts` | bundle round-trip, bad files, dropped rows, locked Fn keys |
| `src/lib/hid/wireless.test.ts` | frame, checksum, record, interface choice, patches, per-key frames, handshake retry |
| `src/features/log/LogPanel.test.tsx` | copy confirmation, refused clipboard, empty log |
| `src/features/profile/ProfileMenu.test.tsx` | export, confirm step, broken file |
| `src/features/device/DevicePanel.test.tsx` | link wording, apply, last send, receiver limits |
| `src/features/device/useDevice.test.ts` | granted-link choice, chooser, open, disconnect, receiver, no config interface |
| `src/features/editor/*.test.tsx` | board, inspector, staging bar and its pending list |
| `src/features/advanced/AdvancedDrawer.test.tsx` | each tab, close paths, busy state |
| `src/features/screen/ClockCard.test.tsx` | clock modes, validation, status, busy state |
| `src/features/screen/DateTimePicker.test.tsx` | day and time selection, Now, close |
| `src/features/screen/ScreenPanel.test.tsx` | preview, custom input, send payload |
| `src/features/lighting/LightingPanel.test.tsx` | colour, brightness, preview labels, status, the Effect/Per-key switch |
| `src/features/lighting/PerKeyPanel.test.tsx` | painting, eraser, fill and clear, unsent count, receiver limits |
| `src/features/settings/store.test.ts` | change notification, delayed write, flush, reset |
| `src/pwa/update-store.test.ts` | ready once, subscribers, unsubscribe, reload handler |
| `src/components/update-notice.test.tsx` | hidden until waiting, build named, Reload asks the worker |
| `scripts/check-precache.mjs` | not a test: the build check that every shipped file is precached |
| `src/App.test.tsx` | offline editing, layers, log |
| `src/App.upload.test.tsx` | fake HID end to end: connect, edit, upload, commit |
| `src/App.screen.test.tsx` | view switch and a fake-HID clock send |
| `src/App.wireless.test.tsx` | fake receiver: key patch, settings frame, USB-only screen card |

The suite needs no keyboard. `src/test/hidFakes.ts` provides `FakeClock` and `FakeTransport`, and
the app tests install a fake `navigator.hid`.

`src/lib/screen/decode.ts` needs the browser's `ImageDecoder`, so it has no jsdom test; Test 12
exercises it on the board.

`npm run verify` runs the typecheck, the linter, the format check, Vitest and the production build.
All five must pass before a commit.

`src/App.tsx` loads the screen panel, the lighting panel and the advanced drawer with
`React.lazy`, so the first visit downloads the key editor alone: about 108 kB gzipped instead of
166 kB. The drawer chunk is warmed when a keyboard connects, because it cannot open before that.
A lazy panel shows a short `Loading the … panel` placeholder while its chunk arrives, which is why
the app tests wait with `findBy` after switching views.

## 8. Invariants

1. **One transfer at a time.** `TransferService` owns the lock; the app busy flag serializes probes
   against uploads.
2. **Never stage after a bad begin or announce.** Send `04 F0` and stop.
3. **Poll for a stamped reply.** Never replace `waitReply` with one read.
4. **The table is always 576 bytes.** Records at `idx * 4`, trailer `AA 55`, `idx ≤ 142`.
5. **Fn layer: zero means firmware default.** Never seed it with `FACTORY_KEYS`.
6. **`fnlayer_disable` keys are read-only on the Fn layer.** Refuse the edit and disable the key.
7. **`applied` and `appliedMedia` move only on `commit 0x01`.**
8. **Persist only after success.** `saveFnOverrides` runs inside the accepted branch.
9. **The record page is explicit.** `media` selects `0x03`; never infer it from the usage number.
   The raw token for media is `c:0x…`.
10. **No HID writes in render or `useEffect`.** StrictMode double-invokes effects, and a double
    upload is a hardware failure.
11. **The screen clock shares the transfer lock.** It stages one 64-byte chunk, commits, and sends
    no end command. It never touches the key table, and it is never written on connect.
12. **Screen pixels use their own interface.** The 4096-byte output reports go to the `0xFF68`
    device; the `0xFF13` feature transport only carries begin, announce and commit.
13. **The animation block count is 16 bits.** `announce[8]` is the low byte and `announce[9]` the
    high byte. Truncating it makes the firmware expect a shorter upload, accept the frames anyway
    and reject the commit, which leaves a mix of old and new frames on the screen.
14. **An animation upload is never interrupted.** Once the announce is accepted, the firmware
    expects every block. `04 F0` does not abort it, the keyboard stops responding until replug, and
    the frames already written stay. No cancel button, no signal, no timeout.
15. **The light is one 64-byte record with `AA 55` at offset 14.** Byte 8 is colourful, 9 brightness,
    10 speed and 11 direction (0 right, 1 left, 2 up, 3 down). Announce `04 13` with one chunk, then
    commit and end. Leave 60 ms before the commit.
16. **The worker never takes over by itself.** `skipWaiting` and `clientsClaim` stay off, and the
    only way a new build replaces a running one is the **Reload** button. `npm run check:precache`
    fails when a shipped file, an icon size or the `SKIP_WAITING` handler is missing, because a lazy
    panel left out of the precache shows a blank tab with no network.
17. **Per-key colours are four bytes a slot.** `key_index × 4`, then red, green and blue, `AA 55`
    at 574-575. All 81 keys are written, with black for a key that has no colour; a key without a
    colour is off, there is no follow-the-global flag.
18. **The per-key mode switch comes first.** `04 13` with mode `0x80` and brightness at byte 9, then
    the table under `04 23`. A refused mode switch stops before the table. Over the receiver the
    same two pieces go out as a light frame and 21 `0x14` frames; nothing confirms them, so `sent`
    moves on the write.

## 9. Common changes

To add a usage or a media function, edit `USAGE_NAMES`, `USAGE_GROUPS` and `MEDIA_NAMES` in
`src/lib/keymap/names.ts`. The picker and the labels follow.

To accept another product id, add it to `PRODUCT_IDS` in `src/lib/hid/protocol.ts`. The WebHID
filters are built from that list.

To change the board, edit `FACTORY_KEYS` and then `docs/key-index-table.md`. The geometry is baked
into those numbers; the vendor XML is not distributed.

To add a record type, change `encodeRecord`, widen `validateUsage`, extend the token parser if the
value no longer fits its page, and add byte tests.

Only two layers exist on this board, `0x11` and `0x27`. A third needs new evidence from the
firmware.

## 10. The v1 code

The single-file v1 app and its Node harnesses are at tag `v1.0.1`. Nothing in the v2 test path
reads `index.html`; the npm scripts are the only check path.
