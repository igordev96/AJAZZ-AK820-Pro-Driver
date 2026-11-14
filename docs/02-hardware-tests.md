# 02 · Hardware tests (what was actually run)

Board: **AJAZZ AK820 Pro**, VID/PID `0C45:8009`, US layout, 81 keys, firmware as shipped in
`..._RGB_V1.0.0.5`. Host: Windows, Chrome (WebHID). Every write below was accepted with
`commit 0x01`, and the *keyboard behaviour* was checked by the person at the keyboard — the
mailbox alone is not evidence (see docs/01-protocol.md §3).

Tests 1 to 8 ran on the v1 single-file app. The v2 rewrite sends the same bytes in the same order;
the byte checks now live in `src/lib/keymap/table.test.ts` and the transport checks in
`src/lib/hid/transfer.test.ts`. Test 9 records the React build on the board.

---

## Test 1 — connect, enumerate, mailbox

* Chrome exposes 3 previously authorised devices; the config collection is
  `usagePage 0xFF13 / usage 0x0001` with 65-byte in/out/feature reports.
* The keyboard and consumer collections are blocked by Chrome and are not needed.
* A read immediately after a write returns our own frame with status `0x00`; a stamped reply
  appears only after the firmware has processed the command.
* Probe result: `04 18` → `04 18 00 01 00`; `04 F5` → version reply; `04 19` echoed.

Conclusion: `SET_FEATURE` + polled `GET_FEATURE` is enough; no input reports are required.

---

## Test 2 — first write is a no-op (trailer + factory table)

Uploading the factory table unchanged (`FACTORY_KEYS`, 164 non-zero bytes) was accepted and the
keyboard kept typing normally. This proved the 576-byte layout, the trailer and the chunking
before any key was changed.

---

## Test 3 — validation probe (why `AA 55` matters)

The in-page probe sends the same table twice: **A** with bytes 574–575 zeroed, **B** with
`AA 55`.

```
A · trailer zeroed   → commit 0xFF   (rejected)
B · trailer present  → commit 0x01   (accepted)
```

So the firmware genuinely validates the packet, and a rejected commit does not mean the
transport failed. The page distinguishes "transport failed" (`04 18` refused, chunk refused,
aborted) from "firmware rejected the commit" (`0xFF`).

---

## Test 4 — top-layer remap and restore

Changes made with the editor and confirmed by typing:

| # | key_index | change | result |
|---|---|---|---|
| 1 | 55 | CapsLock `0x39` → `A` `0x04` | CapsLock types `a`, no longer toggles |
| 2 | 1 | Esc `0x29` → CapsLock `0x39` | Esc toggles caps |
| 3 | restore | both back to factory | stock behaviour |

Representative log (trimmed):

```
──── top layer upload (81 keys, 1 changed) ────
  #55 CapsLock: CapsLock 0x39 → A 0x04
SEND  04 18
begin 04 18: status 0x01 OK (1 ms after settle, 1 read)
SEND  04 11 00 00 00 00 00 00 09
announce 04 11: status 0x01 OK (1 ms)
chunk 1/9 ok in 1 ms  00 00 00 00
...
chunk 9/9 ok in 1 ms  00 00 00 00
SENT  9 x 64-byte chunks (576 bytes) in 115 ms
SEND  04 02
commit 04 02: status 0x01 OK (1 ms)
SEND  04 F0
end 04 F0: status 0x01 OK (1 ms)
⇒ Upload accepted (commit 0x01) — the top layer is now live on the keyboard.
```

Note the per-chunk preview only prints the **first 4 bytes** of each 64-byte chunk, so the
CapsLock record (offset 220, chunk 4, byte 28) never shows in the log. `tools/kmtest.js` is the
byte-level check.

---

## Test 5 — Fn layer (`04 27`)

Sequence: switch to the Fn tab, set `Fn + CapsLock` to `A`, upload, press `Fn+CapsLock`, then
clear it.

```
──── Fn layer upload (1 override, 1 changed) ────
  #55 Fn+CapsLock: default → A 0x04
SEND  04 18                     → 0x01
SEND  04 27 00 00 00 00 00 00 09 → 0x01
9 chunks (all 00 except the record slot)
SEND  04 02                     → 0x01
SEND  04 F0                     → 0x01
```

Verified by the user:

* `Fn+CapsLock` produced `a`; plain CapsLock still toggled caps → the layers are independent.
* The change was later switched to `T` and then removed with **Back to firmware default**;
  every upload committed `0x01` and the default behaviour returned.
* Several other Fn combinations were exercised before and after a zero-table write; behaviour
  was unchanged, confirming **zero slot = firmware default** and that an all-zero Fn table is a
  true no-op on a stock board.

---

## Test 6 — the double-upload race (why there is a lock)

Two overlapping "restore factory" clicks produced:

```
SEND 04 02                      ← upload #1 commit
──── keymap upload (81 keys, 1 changed) ────   ← upload #2 starts
begin 04 18: status 0xFF REJECTED              ← device still busy
commit 04 02: status 0x01 OK (726 ms, 12 reads) ← #1 consumed #2's reply
commit 04 02: no stamped reply within 6000 ms   ← #2 waited forever
⇒ Upload rejected (commit no reply)
```

Nothing was corrupted (both payloads were the factory map), but the verdict was wrong and two
sequences were interleaved. Fixes now in the page:

* `kmBusy` lock; every action button (including the layer tabs) is disabled for the duration.
* `sendTable` aborts with `04 F0` if `04 18` is not `0x01`.
* transport failures are reported separately from a `0xFF` commit.

If a future change removes one of those, expect this bug to come back.

---

## Test 7 — revalidation on the main PC (28 Oct 2026)

Same board, new machine: Windows + Chrome 156, no vendor app installed or running, fresh WebHID
authorisation. The page was the post-hardening build (announce abort, top-layer `0x00` guard);
the normal upload path is unchanged, so this run also confirms the hardening did not alter it.

* Diagnostics: all PASS. `04 19` → `04 19 00 01`, `04 F5` → `04 F5 00 01`. No input reports on
  the config collection, as expected.
* Raw `04 F0` closed the staging session diagnostics leaves open → `04 F0 00 01` (three reads).
* **Top layer, factory table, 0 changed**: every step `0x01`. Chunks 4–7 began with
  `02 00 2F 00` (idx 48 `[{`), `02 00 0F 00` (idx 64 L), `02 00 10 00` (idx 80 M) and
  `02 00 AF 00` (idx 96 Fn) — the expected `FACTORY_KEYS` records at `idx × 4`. 9 chunks in
  123 ms; commit and end `0x01`.
* **Fn layer, 0 overrides**: all-zero body, every step `0x01`; 9 chunks in 122 ms.
* The user confirmed by typing: normal keys, CapsLock, Esc, arrows and the Fn combinations all
  behaved exactly as before.

This re-establishes the baseline the page assumes: top layer = factory, Fn layer = all zeros.
It did **not** exercise the new abort path (refused/missing announce), which still needs a
deliberate failure to test.

---

## Test 8 — media keys on the Fn layer (28 Oct 2026)

Same board and PC as Test 7, media build (`03` records + the explicit `c:` page marker). Key used:
CapsLock, `key_index 55`, Fn layer only, so the top layer was never touched. Each change was one
full Fn-table upload (`04 27`, zero body except slot 220 and the trailer).

| setting | record at offset 220 | commit | observed at the keyboard |
|---|---|---|---|
| Media: Mute | `03 E2 00 00` | `0x01` | Fn+CapsLock muted / showed the Windows OSD |
| Media: Volume up | `03 E9 00 00` | `0x01` | volume raised |
| Media: Volume down | `03 EA 00 00` | `0x01` | volume lowered |
| Back to firmware default | slot zeroed | `0x01` | Fn+CapsLock returned to stock behaviour |

All four sequences: begin/announce/commit/end `0x01`, 9 chunks in 119–127 ms, no `0xFF` anywhere.
The log's per-chunk preview prints only the first four bytes of each chunk, so the record (chunk 4,
byte 28) never appears in it; `tools/kmtest.js` asserts those four bytes directly.

The user confirmed by testing at the keyboard: plain CapsLock kept toggling caps throughout, and
after the final zero upload the Fn combination stopped doing anything special.

Conclusion: record type `0x03` is accepted on the Fn layer and produces real consumer reports. The
`07 …` fallback (vendor type `0x0D`) is not needed. The 0xE2 / 0xCD / 0xB5 number collisions are
handled by the explicit `media` flag, not by a numeric range.

## Observed timings (useful for sanity checks)

| step | time |
|---|---|
| begin reply | ~1 ms after the 220 ms settle |
| announce reply | ~1 ms after settle |
| each 64-byte chunk | 0–2 ms |
| 9 chunks with 12 ms pacing | 110–120 ms |
| commit reply | 0–1 ms (occasionally hundreds of ms under load) |
| whole upload | ~1.3 s including settles |

## How to reproduce (v1)

```
start.cmd                  → http://localhost:8765
```

1. Close the AJAZZ desktop app (only one program can hold the interface).
2. Connect → **6 · Key editor**.
3. Change one key, upload, test by typing. Restore with **Restore factory map**.
4. Fn tab: upload with no edits first (writes zeros) and check that Fn behaviour is unchanged;
   then add one override and test it.

Every run logs the full 64-byte frames; copy the log with **Copy report** before closing.

## How to reproduce (v2)

```bat
npm install
npm run dev
```

1. Close the AJAZZ desktop app.
2. Open <http://localhost:5173/>, click **Connect keyboard**, choose the AK820.
3. Change one key, upload, test by typing. Restore with **Restore factory map**.
4. Fn tab: upload with no edits first (writes zeros) and check that Fn behaviour is unchanged;
   then add one override and test it.

The log drawer has **Copy**. The app has no numbered cards.

## Test 9 — v2 React build on the board (29 Oct 2026)

Build: `refactor/react` at `220169a`, dev server on `http://localhost:5173`, Chrome on Windows.
The board was in USB mode and the AJAZZ desktop app was closed. The user ran the app and typed at
the keyboard.

### 9A — top layer, slot 55 (CapsLock) to A

Change: key 55 (CapsLock, offset 220) from `02 00 39 00` to `02 00 04 00`, inside the full
576-byte factory table. Upload, then **Reset this key** and upload the factory table back.

The log showed the same sequence twice, with every reply status `0x01`:

```
begin 04 18: status 0x01 OK  (2 ms after settle, 1 read)
announce 04 11: status 0x01 OK  (2 ms after settle, 1 read)
chunk 1/9 ... chunk 9/9 ok in 2–3 ms
SENT 9 x 64-byte chunks (576 bytes) in 118 ms
commit 04 02: status 0x01 OK  (2 ms after settle, 1 read)
end 04 F0: status 0x01 OK  (2 ms after settle, 1 read)
Upload accepted. The top layer is live.
```

The second run took 116 ms for the chunks, and its commit and end replies were also `0x01`.

Behaviour: after the first upload, CapsLock typed `a`. After the reset upload, CapsLock toggled
caps as before. The user confirmed both by typing.

The per-chunk preview prints only the first four bytes, so the slot 55 record at offset 220 does
not appear in the log. The byte-level check is `src/lib/keymap/table.test.ts`.

Conclusion: the React build writes the top layer and restores it. The full sequence, the commit
gate and the rollback by re-upload behave as on v1.

### 9B — Fn layer, slot 55 (Fn+CapsLock) to Media: Mute

Change: key 55 on the Fn layer from zero to `03 E2 00 00`. Every other Fn slot stayed zero and the
trailer stayed `AA 55`. This writes the Fn table with `04 27`, not the top layer.

```
begin 04 18: status 0x01 OK  (2 ms after settle, 1 read)
announce 04 27: status 0x01 OK  (2 ms after settle, 1 read)
chunk 1/9 ... chunk 9/9 ok in 1–2 ms
SENT 9 x 64-byte chunks (576 bytes) in 119 ms
commit 04 02: status 0x01 OK  (2 ms after settle, 1 read)
end 04 F0: status 0x01 OK  (3 ms after settle, 1 read)
Upload accepted. The Fn layer is live.
```

Behaviour: Fn+CapsLock showed the Windows mute OSD. Plain CapsLock still toggled caps. After a page
reload and a new connect, the override was still listed on the Fn layer, which confirms the
`localStorage` copy. The user cleared it with **Back to firmware default** and an upload; after
that, Fn+CapsLock returned to its stock behaviour.

Conclusion: the React build writes the Fn layer, the firmware accepts the consumer record on this
build, and clearing the override restores the firmware combination. Persistence works across a
reload.

### 9C — restore actions and the upload lock

Top layer: **Restore factory map** wrote the full factory table with `04 11`. The chunks took
116 ms, and begin, announce, commit and end were all `0x01`. The keyboard kept typing normally.

Fn layer: **Clear all Fn overrides** wrote the all-zero Fn table with `04 27`. The chunks took
120 ms, and every reply was `0x01`. Fn combinations stayed stock.

Lock: the top layer was set to CapsLock → A, then Upload was clicked twice in quick succession.
The log contains one sequence for that burst, starting at `00:29:11` (begin `0x01`, 117 ms of
chunks, commit and end `0x01`). The next top-layer sequence starts at `00:29:21`, which is the
reset upload, ten seconds later. No second begin appeared inside the first transfer.

The reset upload put the factory record back. CapsLock typed normally afterwards, and the user
confirmed that everything worked.

### Test 9 conclusion

The React build writes the top layer and the Fn layer, writes and persists a media override, clears
it, runs both restore actions and keeps one transfer at a time. Every reply was the expected
`0x01`, and each change was confirmed by typing or by the Windows OSD at the keyboard, not by the
mailbox alone.

## Test 10 — screen clock (29 Oct 2026)

Build: the working tree that added the clock, dev server on `http://localhost:5173`, Chrome on
Windows. The keyboard was connected over USB and the vendor app was closed. The packet was first
captured from the vendor app with a Frida hook on `HidD_SetFeature`; the layout is in
`docs/01-protocol.md` §9.

### 10A — this computer's time

**Screen** tab, then **Send time**. The sequence is `04 18`, `04 28` with byte 8 = 1, the 64-byte
body, then `04 02`. No key table is staged and no `04 F0` follows the commit.

The screen showed the current time. The user confirmed it by looking at the keyboard.

### 10B — a custom time

The user switched to **Custom**, entered a different date and time, and sent it. The screen showed
that value. The user then pressed **Use now** and sent again, and the screen returned to the
current time. Both changes were confirmed by the user at the keyboard.

### Test 10 conclusion

The screen accepts the clock packet this page builds, for both the browser's time and a time typed
by hand. The clock is a settings write, not a key-table write: it uses its own announce command
and leaves the top and Fn layers untouched. Whether the clock survives a power loss was not tested.

## Test 11 — screen image (29 Oct 2026)

Build: the working tree that added the image channel, dev server on `http://localhost:5173`,
Chrome on Windows. Keyboard in USB mode, vendor app closed.

### Connection

`requestDevice` returned three interfaces for the one keyboard:

```
[0] 0x000C/0x0001  0xFFFF/0x0001
[1] 0xFF68/0x0061
[2] 0xFF13/0x0001
```

The page keeps `0xFF13` for commands and opens `0xFF68` for the 4096-byte output reports. Sending
the output report on the `0xFF13` device fails with "Failed to write the report", which is what the
first attempt did. The two interfaces are separate HID devices in Windows even though WebHID
returns them together.

### The write

One 128 x 128 image, sent as a single frame:

```
begin 04 18            status 0x01
announce 04 72 03 … 09  status 0x01, nine blocks
9 x 4096-byte output reports   on 0xFF68, 1788 ms
commit 04 02           status 0x01
```

The log reported `SENT 9 x 4096-byte blocks (36864 bytes) in 1788 ms` and `Screen image sent`.

### Result

The screen showed the chosen image. The user confirmed it at the keyboard. No key mapping or clock
was touched.

### Test 11 conclusion

This page can write the screen data channel: the 0xFF68 interface, 4096-byte output reports, the
same announce and commit as the vendor app. The image is one frame of the animation format, so the
same path carries a multi-frame upload.

## Test 12 — screen animation (29 Oct 2026)

Build: the working tree that added the animation card, dev server on `http://localhost:5173`,
Chrome on Windows, keyboard in USB mode.

The user chose a 31-frame GIF of their own from the **Screen animation** card and uploaded it.

```
begin 04 18                 status 0x01
announce 04 72 03 … F9      status 0x01, 0xF9 = 249 blocks
249 x 4096-byte reports     on 0xFF68, frame progress every 8 blocks
commit 04 02                status 0x01
```

The log reported `SENT 249 x 4096-byte blocks (1019904 bytes) in 53937 ms` and `Screen animation
sent (31 frames)`. The user confirmed the screen played the GIF.

Timing: about **216 ms per block**, against the vendor app's 153 ms. Chrome's output report takes
roughly 60 ms, and the page keeps its 150 ms gap on top, so a 140-frame animation is about four
minutes.

### Test 12 conclusion

The page plays a multi-frame GIF of arbitrary length up to the vendor's 140-frame limit. Frame
delays come from the GIF and are clamped to 30-500 ms. Cancel was not exercised on the board; the
abort path is covered by unit tests only.

## Test 13 — 60 frames and the 16-bit count (29 Oct 2026)

Build: the working tree that fixed the announce, dev server on `http://localhost:5173`, Chrome on
Windows. The user sent the same 60-frame GIF that had failed before.

```
begin 04 18                   status 0x01
announce 04 72 03 … E1 01     status 0x01; 0x01E1 = 481 blocks
481 x 4096-byte reports       on 0xFF68
commit 04 02                  status 0x01
```

The log reported `SENT 481 x 4096-byte blocks (1970176 bytes) in 108719 ms` and `Screen animation
sent (60 frames)`. The user confirmed the screen played the GIF.

The earlier run with the same file wrote only the low byte, `E1` = 225 blocks. The firmware accepted
all the data, rejected the commit with `0xFF`, and left a mix of the new 60 frames, the previous
31-frame GIF and the still older colour test on the screen. The vendor capture of the 132-frame
stock animation showed the count is two bytes, `21 04` = 1057, and the page now writes both.

Timing: about 226 ms per block, so 30 frames is around 55 seconds and 140 frames about four minutes.

## Test 14 — interrupting an animation (29 Oct 2026)

Build: 2.2.1, dev server on `http://localhost:5173`, Chrome on Windows. The stock 132-frame GIF,
1057 blocks.

The upload reached frame 40, then the user pressed **Cancel**. The page sent `04 F0` on the feature
collection (`cancelled by the user — sending 04 F0`, 22:34:20).

Result: the keyboard stopped responding. Every key was dead and the screen stayed on its loading
indicator at 30%. Unplugging and replugging the keyboard brought it back. The screen then showed a
mix of the interrupted animation and the previous 60-frame GIF, in an order that did not match
either.

Conclusion: `04 F0` does not abort an animation once the announce is accepted. The firmware stays
in its loading state until power is removed, and the frames already written stay in the buffer.
Cancel was removed from the animation card; the page now sends every block and commits, and the
card tells the user to let it finish.

## Test 15 — keyboard light (30 Oct 2026)

Build: the working tree for lighting v1, dev server on `http://localhost:5173`, Chrome on Windows.

The user applied several colours and brightness levels from the **Lighting** tab. Each apply is:

```
04 18
04 13 … 01              announce, one 64-byte chunk
01 R G B … <brightness> 03 … AA 55
04 02
04 F0
```

The keyboard changed colour and brightness every time, and the user confirmed it by looking at the
board.

**Issue found.** At brightness 2 the light applied, but the page sometimes reported that the commit
was not confirmed. The vendor capture leaves about 75 ms between the last chunk and `04 02`; the
page sent them back to back. A 60 ms pause before the commit was added, and the user confirmed that
brightness 2 became stable. The failure message was also corrected: an unconfirmed commit no longer
claims that nothing changed.

Not tested: effect modes and per-key colours. Only the solid colour record (`01 03`) is built.

## Test 16 — lighting effects and controls (30 Oct 2026)

Build: the working tree for the effects release, dev server on `http://localhost:5173`, Chrome on
Windows.

The user went through all 20 modes on the board, from Static to LED off. Every mode worked. On
Scrolling and Rolling the user checked the controls: colour, Colourful, brightness, speed and
direction.

**Bug found.** Horizontal direction was written to byte 12, which the firmware ignores, so Left
behaved like Right. The captured records show both axes use **byte 11**: `0` right, `1` left,
`2` up, `3` down. After moving horizontal direction to byte 11, the user confirmed that Left and
Right point opposite ways, and that Up and Down still work.

The capabilities per mode come from `config_func` in the vendor database: brightness, speed,
horizontal direction, vertical direction, colour and Colourful. Colourful is on by default for every
mode except Static, which matches the vendor app.

## Test 17 — device settings (2 Nov 2026)

Build: the working tree at `c2ba541` (the Device tab), dev server on `http://localhost:5173`, Chrome
on Windows.

The user applied settings from the **Device** view and the panel reported **Sent.** every time. One
write is:

```
04 18
04 17 01 .. 01              announce, one 64-byte chunk
00 01 00 00 00 00 02 00 01 .. AA 55
04 02
```

What the user reported, one setting at a time:

- **Disable Windows key**: the key was blocked while the box was ticked, and worked again when it
  was cleared.
- **Disable Alt+F4**: the window stopped closing while it was on, and closed again when it was off.
- **Disable Alt+Tab**: switching windows stopped while it was on, and worked again when it was off.
- **Sleep time**: set to 1 minute and the transfer was accepted. The board was not left idle long
  enough to see it sleep.
- **Response level**: changed and accepted. The difference in typing was not measured.

No problem surfaced in the session. The three shortcut blocks are the part this test proves.

Not tested: whether the board sleeps after the interval, and whether the response levels feel
different. Nothing in the UI or the README claims either.

## Test 18 — the 2.4 GHz receiver (3 Nov 2026)

Build: the working tree at `92c1301`, dev server on `http://localhost:5173`, Chrome on Windows, the
keyboard in 2.4 GHz mode with the vendor app closed.

The page selected the receiver, `0C45:FDFD`, took the 32-byte `0xFF60/0x0061` interface and logged
the link. Three writes went out and the user confirmed each on the board:

- **Light**: the light changed colour.
- **Clock**: the screen clock changed.
- **Device settings**: the Windows key was blocked while the box was ticked, and worked again when
  it was cleared.

**Found.** The receiver ignores records until it has seen the init frame (`02`) and a heartbeat
(`20 01 00`). Without them the first light write changed nothing on the board; with them the same
record applied on the first try. The frame bytes and the checksum were identical in both attempts,
so the missing piece was the handshake, not the record.

Key uploads are not sent over this link yet. The pending bar says so and disables the upload and
restore buttons rather than letting a click do nothing.

*Added later: that was the build at the time. Test 19 sent key patches over the same link, and Test
20 restored the whole top layer with them.*

Not tested: whether these writes survive a power cycle, and how the keyboard sleeps on this link.

## Test 19 — key changes over the 2.4 GHz receiver (3 Nov 2026)

Build: the working tree at `ec22077`, dev server on `http://localhost:5173`, Chrome on Windows, the
keyboard in 2.4 GHz mode with the vendor app closed.

The user changed CapsLock to `A` and uploaded. The page sent one patch:

```
03 04 37 02 00 04 00 … 44     command 0x03, index 0x37 = 55, record 02 00 04 00
```

CapsLock typed `a` afterwards. Fn + A to Mute went out as `0D 04 38 03 E2 00 00 … 2E` and worked.
Both were then restored: `03 04 37 02 00 39 00 … 79` put CapsLock back, and `0D 04 38 00 00 00 00 …
49` cleared the Fn override with the zero record the wired Fn table uses.

The checksums in the log are the ones `buildWirelessFrame` computes, so the page's frames and the
vendor's captured frames agree byte for byte.

The keyboard confirmed nothing, and the log says so: *"Sent 1 key change over 2.4 GHz. The keyboard
does not confirm them."*

Not tested: restoring the whole top layer, which is 81 patches in one run, and whether these
patches survive a power cycle.

---

## Test 20 — restore the whole map over the 2.4 GHz receiver (3 Nov 2026)

Build: the working tree at `44d4ad9`, dev server on `http://localhost:5173`, Chrome on Windows, the
keyboard in 2.4 GHz mode with the vendor app closed.

Test 19 left one case open: a run that writes far more than a single key.

The user pressed **Restore factory map** on the top layer and confirmed. The page sent one `03`
patch per key, 15 ms apart, 81 frames in the log, with no commit and no reply to any of them. The
burst took a little over a second of writing.

The user then typed across the board: the keys they had changed were back to their factory
functions and the rest of the map was untouched.

**Found.** The 15 ms gap copied from the vendor's one-at-a-time writes is enough on its own. No
slower pacing and no acknowledgement was needed for the burst. The run also covers what Test 19
could not, since a patch to one key leaves the other positions alone and a full restore does not
depend on the order the frames go out in.

Not tested: whether the restored map survives a power cycle, and what the receiver does when a frame
in the middle of such a run is lost.

---

## Test 21 — power cycle over the 2.4 GHz receiver (3 Nov 2026)

Build: the working tree at `d083ef7`, dev server on `http://localhost:5173`, Chrome on Windows, the
keyboard in 2.4 GHz mode with the vendor app closed.

The user switched the keyboard off and on several times, and looked at the board after each power-on.

What held:

- **Light**: the static colour sent in Test 18 came back.
- **Clock**: the screen clock still had the time that was sent.
- **Key map**: the factory restore from Test 20 was still in place.

What did not:

- **Device settings**: the Windows key block was gone after the first power-on, and the key typed
  its shortcut again.

**Found.** The light and clock records and the key patches are written somewhere the keyboard keeps,
while the settings record is not: it behaves like runtime state that a power-on ends.

The page now says so under the settings and asks for another write after the keyboard has been
powered off, since nothing is read back and it cannot notice the change on its own.

Not tested: whether the wired link keeps the shortcuts through a power cycle, and whether the
Alt+F4 and Alt+Tab blocks behave like the Windows key block.

*Added later: Test 22 answered the first question. The wired link loses the block as well, so the
reset is the board's, not the link's.*

---

## Test 22 — a power cycle clears the shortcut blocks over USB too (3 Nov 2026)

Build: the same working tree as Test 21 (`d083ef7`), dev server on `http://localhost:5173`, Chrome on
Windows, the keyboard over USB with the vendor app closed.

The user sent the settings with the Windows key blocked, then power-cycled the keyboard two ways:
unplugging the USB cable and plugging it back in, and switching the keyboard off with the cable still
attached. The block was gone both times, and the Windows key typed its shortcut again.

**Found.** The reset is the board's own behaviour rather than anything about the 2.4 GHz link, since
Test 21 saw the same result there. The board keeps the five settings only while it is powered. The
page asks for another write after a power-off, which is what the vendor app does whenever it applies
them.

Key remaps have survived a power cycle over USB for as long as this project has existed, and the
light and the clock came back the same way over the receiver in Test 21. Only the settings record
behaves like runtime state.

Not tested: whether the Alt+F4 and Alt+Tab blocks also reset, and whether sleep and response time do.
The page was applied with one block on each run, so the other fields were off and their survival was
not visible.

*Added later: Test 24 answered both. The two blocks reset as well, and sleep and response take effect
over the receiver.*

---

## Test 23 — the Alt+F4 and Alt+Tab blocks over 2.4 GHz (3 Nov 2026)

Build: the working tree at `391fa32`, dev server on `http://localhost:5173`, Chrome on Windows, the
keyboard in 2.4 GHz mode with the vendor app closed.

The user ticked **Alt + F4** and **Alt + Tab** on the Device tab and applied. The page sends the
settings record as `07 10` with record bytes 0 to 13 and `AA 55`; a test on a fake receiver now
checks those bytes, and with these two flags the frame starts `00 01 01 01 01 00 02 00 01`, so
record bytes 2 and 3 do leave the page.

Nothing changed on the board. Alt+F4 still closed the window and Alt+Tab still switched. The Windows
key block, sent the same way on the same link, works (Test 18), and all three blocks work over USB
(Test 17).

**Found.** The wired captures put Alt+Tab at byte 2, Alt+F4 at byte 3 and the Windows key at byte 4,
and the page writes those positions. The vendor's two dongle settings captures only toggle byte 4,
so bytes 2 and 3 were never set over the receiver in any capture we hold. Either the receiver drops
them or it expects them elsewhere in its record.

The page now says this under the checkboxes when it is connected over 2.4 GHz, and points those two
blocks at USB.

Next step: capture the vendor app over the dongle with Alt+F4 ticked. If its frame matches ours, the
limit is the receiver or its firmware, and the note stays. If the bytes differ, the wireless record
needs its own offsets.

**Answered the same day.** A capture of the vendor app over the dongle (`dongle-altf4.log`, 3 Nov
2026) holds four settings writes, one per click:

```
07 10 00 | 00 01 00 01 00 00 02 00 01 ...   record[3] = 1, Alt+F4 ticked
07 10 00 | 00 01 00 00 00 00 02 00 01 ...   unticked
07 10 00 | 00 01 01 00 00 00 02 00 01 ...   record[2] = 1, Alt+Tab ticked
07 10 00 | 00 01 00 00 00 00 02 00 01 ...   unticked
```

Those are the same offsets as the wired record, and the page's frame for the same settings is
identical, so the encoding was never the problem. Nothing follows the write: no second command and
no commit.

The user then ticked the box in the vendor app on the same link and tried the shortcut, and it still
worked. The board does not apply either block over 2.4 GHz, for the vendor's app as much as for this
page. The page now disables those two on that link and says why, instead of sending a flag the
receiver ignores.

---

## Test 24 — sleep and response over 2.4 GHz, and the blocks after a power cycle (3 Nov 2026)

Build: the working tree at `c9dcae3`, dev server on `http://localhost:5173`, Chrome on Windows, the
keyboard in 2.4 GHz mode with the vendor app closed.

Sleep and response time were the two values Test 17 left as "accepted, effect not observed". The
user set both over the receiver and confirmed on the board that they take effect: the keyboard
sleeps at the chosen interval, and the response level changes how it types.

The same session answered the other open question from Test 22. After a power cycle over USB, the
**Alt+F4 and Alt+Tab blocks were gone as well**, exactly like the Windows key block. So all five
settings are runtime state, and none of them survives a power-off, on either link.

**Found.** The settings record is not partly persistent. Whatever the board does with level, sleep
and the three blocks, it forgets all of it at power-on, and the page's advice to send the settings
again after switching the keyboard off covers the whole panel rather than just the blocks.

The two blocks are still USB-only for the reason Test 23 gives: the receiver ignores them while it
is running, which is a separate thing from losing them at power-on.

Not tested: nothing in the record is left open. The remaining unknown is the wireless link's own
sleep behaviour, which is the receiver's, not a setting.

---

## Test 25 — per-key colours (14 Nov 2026)

Build: the working tree for the per-key release, dev server on `http://localhost:5173`, Chrome on
Windows, the keyboard on USB with the vendor app closed.

The capture of 13 Nov (`usb-perkey-colour.log` in the private lab) had already fixed the layout:
four bytes a slot, the key index then red, green and blue, with an `0x80` light record first. This
session proved the page writes it the way the vendor app does.

What the user did, one action at a time:

- Painted W, A, S and D red, then applied. Those four keys lit red and every other key went dark.
- **Fill all** with blue, applied. The whole board turned blue.
- **Clear all**, applied. The board went dark, which is what an all-black table means here.
- Painted Esc green, applied at brightness 1, then applied again at brightness 5. The key dimmed
  and brightened with the rest of the map, so byte 9 of the mode record is one value for the whole
  map, not a per-key field.
- Unplugged the cable, waited five seconds and plugged it back in. The colour map was still on the
  board.
- Switched to the 2.4 GHz link. The Per-key tab is disabled and badged `USB only`, and the other
  views still open; the Screen view still sends the clock.

**Found.** A brightness-only change was not offered as a send: the panel compared colours and
ignored the brightness it had last sent. It now records that value and counts it as an unsent
change, and Discard restores it.

Not tested: the 576-byte table over the receiver, which needs its own dongle capture, and a second
keyboard or profile with a different map.
