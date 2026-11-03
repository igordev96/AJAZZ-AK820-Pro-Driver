# 01 Â· Wire protocol

Everything here was decoded for interoperability from the vendor application and confirmed on the
keyboard. Addresses refer to the vendor disassembly, which is kept in the private research
repository and is **not** part of this project.

---

## 1. Device and interface

| Item | Value |
|---|---|
| VID | `0x0C45` (Sonix) |
| PIDs accepted by the page | `0x8009` (tested), `0x800A`, `0xFDFD` |
| Config collection | usage page **`0xFF13`**, usage **`0x0001`** |
| Report | **feature**, 65 bytes on the wire (report id `0` + 64 data bytes) |
| Screen collection | usage page **`0xFF68`**, usage **`0x0061`** |
| Screen report | **output**, 4097 bytes on the wire (report id `0` + 4096 data bytes) |
| Input reports | not used for configuration |

The board exposes several HID collections (keyboard `0x0001/0x0006`, consumer, vendor
`0xFFFF`, `0xFF13`, `0xFF68`). Chrome blocks the keyboard/consumer ones for WebHID. The page needs
`0xFF13` for commands and `0xFF68` for screen pixels. Windows exposes those as separate interfaces,
and WebHID returns them as separate devices even though they belong to one keyboard. The knob and
the normal keys keep working through their own collections.

Requirements: Chromium **desktop** (Chrome, Edge, Opera) on Windows/macOS/Linux, page served
over HTTPS or `http://localhost`. Bluetooth mode does not expose the config collection.

---

## 2. Report framing

The vendor's `Device::Write` (`0x44EED0`) builds a **65-byte** buffer:

```
byte 0      = 0x00            report id
byte 1..64  = payload         zero-padded
HidD_SetFeature(handle, buf, 65)
```

WebHID's `device.sendFeatureReport(0, new Uint8Array(64))` produces exactly the same bytes, so
the payload is always described below **without** the leading report id.

* payload â‰¤ 64 bytes â†’ one report
* payload > 64 bytes â†’ the first 64 bytes carry the command header, then
  `floor(len / 64)` **bare 64-byte chunks** follow with no per-chunk header
  (`0x44EFD5`). A 576-byte table is therefore `9` chunks.

Reads use `GET_FEATURE` (`0x4514E0`) and return the same 64-byte buffer with the report id
stripped. For payloads > 64 bytes the vendor **skips** its read-back entirely; that is why the
table chunks must be written blind and paced.

---

## 3. The mailbox (and why a read right after a write lies)

There is a single 64-byte feature buffer. `SET_FEATURE` copies the command into it; the
firmware processes it asynchronously and stamps the result. A read issued immediately returns
**our own frame** with the status byte still `0x00` (the 0â€“1 ms "status 0x00" entries in old
logs).

A real reply satisfies both:

* `byte[1] == command` â€” the reply echoes the command byte
* `byte[3] != 0x00` â€” a status has been stamped

Reply layout:

```
04 <cmd> 00 <status> [extra...]
```

| status | meaning |
|---|---|
| `0x01` | accepted |
| `0xFF` | rejected (firmware read the data and refused it) |
| other | unknown â€” treat as failure |

The commit reply occasionally carries `0x77` in `byte[4]` (seen as `04 02 00 01 77`). Its
meaning is unknown; it does not affect the verdict and was not present on every run.

`src/lib/hid/transfer.ts` implements this as `waitReply(cmd, label)`:
settle **220 ms**, then poll every **60 ms** for up to **6 s**, accepting only a stamped frame.
Never replace it with a single immediate read.

---

## 4. Writing a layer (the only write path)

There is **no single-key command**. Any change uploads a full 576-byte table.

```
SEND  04 18                                    begin / open staging
      â† 04 18 00 01 00                         status must be 0x01
SEND  04 11 00 00 00 00 00 00 09               top layer, 9 chunks
  or  04 27 00 00 00 00 00 00 09               Fn layer,  9 chunks
      â† 04 11 00 01 00  /  04 27 00 01 00
      (pause ~120 ms while the firmware enters the data phase)
SEND  9 Ã— 64-byte chunks                        no reply, 12 ms apart
SEND  04 02                                    commit
      â† 04 02 00 01 00                         validates the table (see Â§5)
SEND  04 F0                                    end
      â† 04 F0 00 01 00
```

Byte `8` of the announce is the chunk count (`0x09`). Bytes `2..7` are zero.

Rules that matter (each was learned the hard way):

1. **One transfer at a time.** The mailbox has a single reply slot. Two overlapping uploads
   corrupt staging and steal each other's replies (observed: second `04 18` â†’ `0xFF`, first
   commit poll consumed the second commit's answer). The page holds a `kmBusy` lock and
   disables every action while a sequence runs.
2. **Abort on a refused begin or announce.** If `04 18`, or the `04 11`/`04 27` announce, is not
   `0x01` (or gets no stamped reply), send `04 F0` and stop â€” never stage chunks into a
   half-open session.
3. **Pace the chunks.** Chromium queues feature writes asynchronously; the vendor used
   synchronous `HidD_SetFeature`. 12 ms between chunks works; a 9-frame burst can outrun the
   firmware.
4. **Retry a chunk** up to 4 times with a 250 ms backoff. A refused chunk after all retries
   means the transfer is dead: `04 F0` and report "nothing changed".
5. A `0xFF` **commit** is not a transport failure â€” it means the firmware read the data and
   refused it (usually a bad trailer or bad record).

Observed timings on the tested board: begin reply ~1 ms after the 220 ms settle, each chunk
0â€“2 ms, whole 9-chunk body ~115 ms, commit ~1 ms. A full upload takes ~1.3 s wall clock.

---

## 5. The 576-byte table

```
size            576 bytes = 144 slots Ã— 4
record address  key_index Ã— 4          (0x4185E9: `[ebp + ebx*4 - 360h]`)
slot 0          never written by the vendor (its key list starts at 1)
slot 143        574..577 â€” overlaps the trailer, so key_index â‰¤ 142
bytes 574..575  AA 55 trailer, required
```

The buffer is zero-filled first (`0x4184B1`, `memset(0x30C)`), so every slot not written stays
`00 00 00 00`. The trailer is validated by the commit: a table with `574..575 = 00 00` is
rejected with `0xFF`, the identical table with `AA 55` is accepted (`0x01`). This was proven by
the in-page "validation probe".

### Record encodings

Four bytes per slot. The first byte selects the record type. "Vendor type" is the value the
vendor's key object carries at `[key+0x18]` (which comes from the DB column `macro_type`).

| byte 0 | layout | meaning | vendor type / address |
|---|---|---|---|
| `0x02` | `02 <mod> <usage> 00` | keyboard usage on the keyboard page | 2 (`0x418600`) and 7 (`0x418908`) |
| `0x03` | `03 <lo> <hi> 00` | **consumer/media usage**, little-endian | 6 (`0x418866`) and 12 (`0x4189F4`) |
| `0x05` | `05 03 00 00` | key explicitly disabled | 1 (`0x4185F1`) |
| `0x05` | `05 02 <arg> 00` | unknown special function | 8..11 (`0x418A56`) |
| `0x01` | `01 <a> <b> 00` | OS shortcut family (not decoded) | 5 (`0x4187AB`) |
| `0x06` | `06 <macro-id> <m2> <m3>` | macro reference (not decoded) | 3 (`0x418733`) |
| `0x07` | `07 <b1> <b2> <b3>` | unknown, unused by this layout | 0x0D (`0x41866F`) |

Modifier bits for record `0x02` (`0x451CA0`): `0x01` Left Ctrl, `0x02` Left Shift, `0x04` Left
Alt, `0x08` Left Win, `0x10` Right Ctrl, `0x20` Right Shift, `0x40` Right Alt, `0x80` Right Win.
A key that *is* a modifier is encoded as
`02 <bit> 00 00` â€” the usage byte stays zero (confirmed: LShift idx 73 = `02 02 00 00`,
LCtrl idx 91 = `02 01 00 00`). The vendor rewrites byte 2 back to 0 for usages `0xE0..0xE7`
(`0x418648` / `0x418662`).

The driver emits `0x02` records for keyboard keys and `0x03` records for media keys; see
`docs/03-media-keys.md`.

---

## 6. Layers

Both layers use the same table, the same record layout and the same transport. They differ in
one announce byte and in what a zero slot means.

| Layer | Announce | Baseline | Zero slot means |
|---|---|---|---|
| Top | `04 11` | the 81 factory keys (`FACTORY_KEYS`) | that index has no key |
| Fn | `04 27` | **all zeros** | *no override â€” the firmware handles this combination* |

The Fn layer is an **override table**. The vendor builds it from
`SELECT * FROM t_key_macro_data WHERE profile = ? AND fn_layer = ?` (vendor application internals
are kept in the private research repository);
with no rows for `fn_layer = 1` it writes a table that is zero everywhere except the trailer.
That is exactly what a fresh vendor profile produces, so writing all-zero is the Fn-layer
"factory restore".

Six keys are **never written** on the Fn layer because the vendor layout marks them
`fnlayer_disable="1"`; the encoder skips them and leaves zeros (`0x4185BA`):

```
Esc #1   \| #67   LWin #92   Fn #96   Backspace #103   Home #117
```

The firmware owns those combinations. Writing a value there has no effect (the vendor never
does), so the editor greys them out.

Do **not** fill the Fn layer with `FACTORY_KEYS`: that would rebind `Fn+key` to the plain key
function instead of leaving it to the firmware. This is the single easiest way to break the
layer.

---

## 7. Worked example â€” CapsLock (idx 55) â†’ A on the top layer

```
offset = 55 Ã— 4 = 220
slot   = 02 00 04 00                  (type 2, no modifier, usage 0x04 = A)
trailer= AA 55 at 574..575
everything else = 00
```

Wire sequence:

```
04 18
04 11 00 00 00 00 00 00 09
chunk 1  offsets   0.. 63   all 00
chunk 2  offsets  64..127   all 00
chunk 3  offsets 128..191   all 00
chunk 4  offsets 192..255   ... 00 00 02 00 04 00 ...   (record at byte 28 of the chunk)
chunk 5  offsets 256..319   all 00
chunk 6  offsets 320..383   all 00
chunk 7  offsets 384..447   all 00
chunk 8  offsets 448..511   all 00
chunk 9  offsets 512..575   ... 00 AA 55
04 02
04 F0
```

The same change on the Fn layer uses `04 27` and leaves every other slot zero â€” that table is
`00` everywhere except `02 00 04 00` at 220 and `AA 55` at 574.

The stock top-layer table has **164 non-zero bytes** (81 records, some of which are
modifier-only). `src/lib/keymap/table.test.ts` asserts that.

---

## 8. Other commands seen

| Payload | Purpose | Notes |
|---|---|---|
| `04 18` | open staging | status `0x01` |
| `04 11` | announce top-layer table | byte 8 = chunk count |
| `04 27` | announce Fn-layer table | byte 8 = chunk count |
| `04 28` | announce a screen clock write | byte 8 = 1; see Â§9 |
| `04 02` | commit staged table | validates the `AA 55` trailer |
| `04 F0` | end / abort | also used to abandon a transfer |
| `04 19` | generic read | used by the mailbox probes |
| `04 F5` | firmware version | probe only |

The LED path (`0x418CC0`) is a different encoder and is **not** the key table; do not confuse
the two when reading the disassembly.

---

## 9. The screen clock

The board has a 128 Ã— 128 screen with its own clock. The vendor app sets the clock about 1.4 s
after it opens with the keyboard connected, so there is no button to press and nothing to time a
capture around. The packet below was captured from that startup burst with a Frida hook on
`HidD_SetFeature` on 29 Oct 2026, then confirmed on the board (`docs/02-hardware-tests.md` Test 10).

```
SEND  04 18
SEND  04 28 00 00 00 00 00 00 01 ...          announce, byte 8 = 1 chunk
SEND  00 01 5A 1A 0A 1D 14 28 1A 00 04 ... AA 55
SEND  04 02
```

No `04 F0` follows the commit.

### The 64-byte body

The example is 29 Oct 2026 at 20:40:26, a Thursday.

| Offset | Example | Meaning |
|---|---|---|
| 0 | `00` | fixed |
| 1 | `01` | screen slot; the vendor sends `GetCurSel + 1` |
| 2 | `5A` | clock tag |
| 3 | `1A` | year âˆ’ 2000 |
| 4 | `0A` | month, 1â€“12 |
| 5 | `1D` | day |
| 6 | `14` | hour, 0â€“23 |
| 7 | `28` | minute |
| 8 | `1A` | second |
| 9 | `00` | fixed |
| 10 | `04` | weekday, 0 = Sunday |
| 11â€“61 | `00` | padding |
| 62â€“63 | `AA 55` | trailer |

### What is known and what is not

- **No timezone.** The device stores wall-clock time. The vendor app sends local time and so does
  this page, which means a daylight saving change does not move the clock.
- **No read-back.** The clock is write-only, like everything else on this interface.
- **Pacing.** The vendor spaces the four commands 75 ms apart and reads no reply. The page uses
  the same 220 ms settle and 60 ms poll as a table write, so the commit status is checked.
- **Slot byte.** It was `01` in the capture. The vendor computes it from `GetCurSel + 1`, so it may
  pick a screen slot; what else it controls is unknown. The page always sends `1`.
- **Power.** Whether the clock keeps running after the keyboard is unplugged was not tested.

---

## 10. The screen image and animation

The screen is 128 Ã— 128. A frame is raw **RGB565, 32768 bytes**, little-endian: red is `00 F8`,
green `E0 07`, blue `1F 00`.

Frame data does **not** go over the config collection. It goes to the second vendor interface,
usage page `0xFF68`, usage `0x0061`, as **4096-byte output reports**. Begin, announce and commit
still use `0xFF13`.

```
04 18                                  begin (feature)
04 72 03 00 00 00 00 00 <lo> <hi>      announce; block count is 16-bit LE at bytes 8-9
<blocks> x 4096-byte output reports    on 0xFF68, about 153 ms apart
04 02                                  commit (feature)
```

`blocks = frames x 8 + 1`. No `04 F0` follows the commit.

The count is **two bytes**, little-endian: a 60-frame animation is 481 blocks, `E1 01`; the vendor's
132-frame stock animation is 1057, `21 04`. Writing only the low byte makes the firmware expect a
shorter upload, apply the frames anyway, and reject the commit, which leaves a mix of old and new
frames on the screen.

Byte 2 was `03` for imported GIFs and `04` for the stock animation. What it selects is unknown; the
page sends `03`.

The blocks concatenate into one buffer:

| Offset | Contents |
|---|---|
| 0 | frame count, 1 to 140 |
| 1 â€¦ | one delay byte per frame, in 2 ms units |
| 4 â€¦ 255 | `0xFF` padding |
| 256 | frame 1, then each further frame, 32768 bytes |
| tail | `0xFF` to `blocks x 4096` |

The vendor app paces the blocks about 153 ms apart and reads no reply per block. This page waits
150 ms between reports, and Chrome's own write takes about 60 ms, so a block lands every ~215 ms. A
140-frame animation is therefore around four minutes.

On Windows the keyboard appears as several HID interfaces, and WebHID returns them as several
devices. The page keeps `0xFF13` for the command path and `0xFF68` for the pixel path; sending a
4096-byte output report on the `0xFF13` device fails.

Still unknown:

- what `mode 3` selects, and whether other modes exist;
- whether the device reads the header or only the frames;
- whether the trailing padding must be sent;
- the behaviour with one frame beyond the successful single-image upload.

**Do not interrupt an upload.** Once the announce is accepted, the firmware enters a loading state
and expects every block. `04 F0` does not end it: the keyboard stops responding, every key is dead
and the screen stays on its loading indicator until the keyboard is unplugged. The frames already
written stay, so the next animation starts from a mixed buffer. An interrupted upload is not a
cancel; it is a crash the user has to power-cycle out of.

---

## 11. Lighting

A light is one 64-byte record, written with the staged shape and the end command:

```
04 18
04 13 00 00 00 00 00 00 01      announce, one chunk
<mode> R G B 00 00 00 00 <colourful> <brightness> <speed> <direction> 00 00 AA 55
04 02
04 F0
```

The record:

| Offset | Meaning |
|---|---|
| 0 | mode id, 1-20 |
| 1-3 | red, green, blue, 0-255 |
| 8 | colourful, 1 or 0 |
| 9 | brightness, 1-5 |
| 10 | speed, 1-5 |
| 11 | direction: 0 right, 1 left, 2 up, 3 down |
| 12 | zero |
| 14-15 | `AA 55` |

The modes, in the order the vendor app lists them: Static, Single on, Single off, Glittering,
Falling, Colourful, Breath, Spectrum, Outward, Scrolling, Rolling, Rotating, Explode, Launch,
Ripples, Flowing, Pulsating, Tilt, Shuttle, LED off. LED off (20) is a zeroed record with only the
trailer.

The vendor database gives each mode its controls in `config_func`. The bits: `0x01` brightness,
`0x02` speed, `0x04` horizontal direction, `0x08` vertical direction, `0x10` colour, `0x20`
colourful. Static is `0x31` and has no speed; Colourful and Spectrum are `0x03`, always multi-colour
with no picker; Scrolling is `0x3B` (up/down); Rolling is `0x37` (left/right).

The vendor leaves about 75 ms between the record and the commit; this page waits 60 ms there, which
stopped an intermittent unconfirmed commit at brightness 2.

Per-key colours use a different path: `04 23` with nine chunks and a 576-byte table, 4 bytes per
key slot. Its inner format is not implemented.

---

## 12. Device settings

Captured from the vendor app on 2 Nov 2026, one setting changed per run. The page has five settings:
Key Response Time, Sleep Time, Disable Windows Key, Disable ALT + F4 and Disable ALT + TAB.

Like a light, they travel as one 64-byte record, but with `04 17` and **no end command**:

```
04 18
04 17 01 00 00 00 00 00 01      announce, byte 2 = 01, byte 8 = one chunk
00 01 00 00 00 00 02 00 01 ...  the record
04 02
```

The record:

| Offset | Meaning |
|---|---|
| 0 | fixed `00` |
| 1 | fixed `01` |
| 2 | disable ALT + TAB, 1 or 0 |
| 3 | disable ALT + F4, 1 or 0 |
| 4 | disable Windows key, 1 or 0 |
| 5 | zero in every capture, meaning unknown |
| 6 | sleep: 0 no sleep, 1 one minute, 2 five minutes, 3 thirty minutes |
| 7 | zero in every capture, meaning unknown |
| 8 | Key Response Time, 1-5 |
| 9-61 | zero |
| 62-63 | `AA 55` |

**The record is a snapshot, not a patch.** Toggling only the Windows key still sent byte 8 with the
current response level, and every other field at its current value. A zero means "off" or "no
sleep", not "leave alone", so a write that omits a field turns it off on the keyboard. The page
therefore always sends all five fields together.

The three shortcut flags are separate bytes, not bits of one. The responses to the captures:

| Change | Bytes that moved |
|---|---|
| level 1 to 5 | 8: `01` to `05` |
| 5 min to No Sleep | 6: `02` to `00` |
| 1 min, 30 min | 6: `01`, `03` |
| disable Windows key | 4: `00` to `01` |
| disable ALT + F4 | 3: `00` to `01` |
| disable ALT + TAB | 2: `00` to `01` |

The vendor app writes the clock (`04 28`) on startup in the same capture, which matches §9. It does
not write settings on startup, so there is no read-back to lean on: the page can only show what it
last sent.

**Unknowns.** Bytes 5 and 7 never left zero in any capture, and announce byte 2 is `01` in every
settings write while the clock announce has `00` there. They are kept at their captured values.

Confirmed on the board in `docs/02-hardware-tests.md` Test 17: the three shortcut blocks work. Test 24
then saw the sleep time and the response level take effect over the 2.4 GHz link as soon as they were
written. The blocks reset when the board loses power (Tests 21 and 22), so those are runtime state;
sleep and response behave as settings the board uses while it runs.



---

## 13. The 2.4 GHz dongle

The receiver enumerates as `VID_0C45 PID_FDFD`. It exposes **no `0xFF13` and no feature reports
at all**, so the wired transport cannot reach it. The configuration channel is `0xFF60/0x0061`
with 33-byte output and input reports. Chrome shows it in the WebHID chooser; the wired page
selects it and then reports that the configuration interface is missing.

Captured on 3 Nov 2026 with `dongle-open.log`, `dongle-keymap.log`, `dongle-keymap2.log`,
`dongle-fn.log` and `dongle-settings.log`, all against the vendor app in 2.4 GHz mode.

### The frame

Every output report is 33 bytes:

```
byte 0    report id, 0x00
byte 1    command
byte 2    payload length
byte 3    key index for 0x03 and 0x0D, 0x00 otherwise
byte 4..  payload
byte 32   checksum = sum(bytes 0..31) & 0xFF
```

The checksum is arithmetic and holds for every captured frame, including the heartbeat.

### Commands

| Command | Index | Payload | Meaning |
|---|---|---|---|
| `0x02` | 0 | none | init, sent once when the vendor app connects |
| `0x03` | key | 4-byte record | top-layer key patch |
| `0x0D` | key | 4-byte record | Fn-layer key patch |
| `0x05` | 0 | fields 0-13 + `AA 55` | lighting, §11 |
| `0x0C` | 0 | fields 0-13 + `AA 55` | clock, §9 |
| `0x07` | 0 | fields 0-13 + `AA 55` | device settings, §12 |
| `0x20` | 0 | `00` | heartbeat, every 15 s |

The payloads are the wired records, compacted: the meaningful prefix of the 14-byte record and
the `AA 55` trailer moved to bytes 14 and 15. The light, clock and settings captures show this
directly. A key patch carries the same 4-byte record as the wired table (`02 <mod> <usage> 00`,
`03 <lo> <hi> 00`), with the key index in byte 3 instead of a table slot.

### What the captures show

- **Single key at a time.** The vendor app never sends the 576-byte table over the dongle. One
  `0x03` write changes one key and takes effect immediately, with no commit.
- **The layer is the command.** `0x03` for the top layer, `0x0D` for Fn; the index stays the
  physical key. Fn + A to Mute was `0D 04 38 03 E2 00 00`.
- **No replies to patches.** Two key changes produced no input report. The vendor app does not
  wait for one. The heartbeat and the clock write did echo.
- **Init and heartbeat.** `02 00 00` at connect and `20 01 00` every fifteen seconds. The receiver
  needs both before it accepts a record: on 3 Nov 2026 the same light frame did nothing until the
  page sent init and a heartbeat first, and applied immediately once it did.
- **Two shortcut blocks do not exist on this link.** The Windows key block works from the page, and
  so do the sleep time and the response level (Test 24). Alt+Tab (byte 2) and Alt+F4 (byte 3) go out
  at the offsets the wired record uses, the vendor's own dongle capture puts them there too
  (`dongle-altf4.log`, 3 Nov 2026), and the board ignores both (Test 23). The vendor app's box does
  nothing on this link either, so the receiver or its firmware does not implement them. The page
  disables those two over the receiver and points at USB.
- **Confirmed on the board** (Test 18): the light, the screen clock and the device settings all
  arrived over this link. Key patches were confirmed with the page itself (Test 19): CapsLock → A
  and Fn + A → Mute went out as `03` and `0D` frames and worked, and both were cleared again with
  the zero record. Test 20 sent a whole-layer restore as 81 patches, 15 ms apart, and the map came
  back correct, which also shows that one patch leaves the other keys alone.

### What survives a power cycle

Test 21 switched the keyboard off and on several times over the 2.4 GHz link. The light, the clock
and the key map all came back as they were left. The device settings did not: the Windows key block
was gone after the first power-on, and the key typed its shortcut again.

Test 22 did the same over USB, by unplugging the cable and by switching the keyboard off with the
cable attached. The block was gone both times, so the reset belongs to the board and not to the
transport.

The three records differ in what the board keeps. The light and the clock are stored on the keyboard,
and the key patches go to the same place the wired table goes. The five settings exist only while the
board is powered, so the page asks for another write after it has been switched off instead of
implying the blocks stay.

The screen has no channel on this link. The receiver exposes no `0xFF68` collection, so the page
disables the animation card and tags it USB only while it is connected through the receiver. A
firmware update could add one; nothing in the captures suggests one.

### Not known

- What the receiver does with a malformed checksum. Nothing in the captures is malformed.
