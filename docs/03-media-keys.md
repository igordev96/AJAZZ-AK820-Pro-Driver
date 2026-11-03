# 03 · Media / consumer keys

The editor assigns media functions (play/pause, volume, mute, track skip…) to a key, on either
layer. This matters most on the Fn layer, which is what those keys are for.

The encoding is **known and verified on hardware** (`docs/02-hardware-tests.md` Test 8): Mute, Volume up and
Volume down all worked on the Fn layer, and clearing the slot restored the firmware default. Test 19
sent Fn + A to Mute over the 2.4 GHz link as a single key patch, and that worked too.
Nothing here needs more reverse engineering.

Addresses refer to the vendor disassembly, which is kept in the private research repository and is
not part of this project.

---

## 1. What the vendor binary says

In the keymap encoder, after the keyboard and macro branches, there is a dispatch on the key
type. The branch for **type 6** writes:

```
0x418866  cmp eax,6                      ; key type 6 = media
0x41886F  mov eax,[edi+1Ch]              ; macro_value = function code 1..7
0x418872  mov byte ptr [slot+0],3        ; record type 0x03
0x41887A  cmp eax,1 → byte[slot+1] = 0xCD   Play/Pause
0x41888C  cmp eax,2 → byte[slot+1] = 0xB7   Stop
0x41889E  cmp eax,3 → byte[slot+1] = 0xB6   Previous track
0x4188B0  cmp eax,4 → byte[slot+1] = 0xB5   Next track
0x4188C2  cmp eax,5 → byte[slot+1] = 0xE9   Volume up
0x4188D4  cmp eax,6 → byte[slot+1] = 0xEA   Volume down
0x4188E6  cmp eax,7 → byte[slot+1] = 0xE2   Mute
```

Bytes 2 and 3 stay zero (the table is zero-filled first). So the record is:

```
03 <usage-lo> <usage-hi> 00        (little-endian consumer usage)
```

There is a second consumer branch, **type 12** (`0x4189F4`), which splits a value returned by
`0x419310` into two bytes and also writes record type `0x03` — i.e. the same layout, able to
carry usages above `0xFF` (e.g. `0x0224` = browser Back).

Corroboration: captured input reports from the knob are
`03 E9 00` / `03 EA 00` / `03 E2 00` on the consumer collection — exactly the same
`03 <usage> <hi>` shape the firmware emits. Record type `0x03` is the "send this on the consumer
page" marker.

The seven usages are standard USB HID consumer page values:

| function | usage |
|---|---|
| Play/Pause | `0x00CD` |
| Stop | `0x00B7` |
| Previous track | `0x00B6` |
| Next track | `0x00B5` |
| Volume up | `0x00E9` |
| Volume down | `0x00EA` |
| Mute | `0x00E2` |

The vendor's UI string table lists the labels for these (`0x16CEB4` Vol Down, `0x16CEC8`
Vol Mute, `0x16CEDC` Next Track, `0x16CEF4` Vol Up, `0x16CF10` Prev Track, `0x16CF34`
Play/Pause, `0x16CF64` Multimedia). The order does not match the function enum, so treat it as
label text only — the enum above comes from the encoder, which is what the device sees.

### Why not `0x07 …`?

The `0x0D` branch (`0x41866F`) also writes a 4-byte record (`07 b1 b2 b3`), but nothing in this
layout uses it. Type 6 is unambiguously the media UI. Try `0x03` first; `0x07` is a fallback
experiment only.

---

## 2. Implementation (what the page does now)

### The page is explicit, never inferred from the number

The first draft of this page proposed `usage > 0xE7 → consumer`. That rule is wrong three ways:

* **0xE2 (Mute) is also keyboard Left Alt** — the same number on two pages;
* **0xCD (Play/Pause) is 205, below 0xE7**, so it would be encoded as a keyboard usage;
* `0xB5`–`0xB8`, `0xB3` and `0xB4` (next/prev/stop/eject/FF/rewind) are also keypad or reserved
  keyboard values.

A usage number cannot select the page. Every editor row therefore carries a `media` flag, and
`encodeRecord` takes it as an argument:

```js
function encodeRecord(usage, media = false) {
  if (media) return [0x03, usage & 0xFF, (usage >> 8) & 0xFF, 0x00];
  const bit = modBit(usage);
  if (bit) return [0x02, bit, 0x00, 0x00];
  return [0x02, 0x00, usage, 0x00];
}
```

`buildTable` passes `e.media`, writes 4 bytes per slot and still leaves unset Fn slots zero. A row
also keeps `appliedMedia` and `factoryMedia`, so changing only the page (0xE2 Left Alt → 0xE2 Mute)
is a pending change and is reported correctly.

### Picker, inspector and text

* `MEDIA_NAMES` drives a **Media** optgroup: the seven vendor functions first, then Eject,
  fast-forward/rewind, relative volume, brightness, browser back/forward/home, calculator, email.
* The inspector shows `Media: Mute c:0xE2`, not a raw usage.
* Raw input and map text use a **`c:` prefix**. Without it the value is keyboard:
  `55 c:0xE2` is Mute, `55 0xE2` is Left Alt. Keyboard usages above `0xE7` (except `0xAF` Fn) are
  rejected with a hint to use `c:`.
* `localStorage` rows gain a third element for media: `[idx, usage, 1]`. Old `[idx, usage]` rows
  stay keyboard; stored values above `0xE7` (written before media existed) are migrated to media.

### Tests

`src/lib/keymap/table.test.ts` and `src/lib/keymap/encode.test.ts` assert the new encoder byte for
byte:

```
buildTable([{idx:55, usage:0xE2, media:true}])               → 03 E2 00 00
buildTable([{idx:55, usage:0xE9, media:true}])               → 03 E9 00 00
buildTable([{idx:55, usage:0xCD, media:true}])               → 03 CD 00 00
buildTable([{idx:55, usage:0x0224, media:true}])             → 03 24 02 00
buildTable([{idx:55, usage:0xB5, media:true}], false, true)  → 03 B5 00 00 (Fn, all else zero)
buildTable([{idx:55, usage:0xE2}])                           → 02 04 00 00 (Left Alt)
parseMapText('55 c:0xE2') → media=true;  parseMapText('55 0xE2') → media=false
```

`src/features/editor/KeyInspector.test.tsx` and `src/lib/editor/persistence.test.ts` cover the Media
optgroup, the inspector label, the `c:` token round-trip and media persistence across a reload.

---

## 3. Hardware experiment (reversible)

Use the **Fn layer** so the top layer is not involved. Mute is the best first test — Windows
shows its volume OSD, so no music is needed.

1. Fn tab → pick a key that is *not* `fnlayer_disable` (e.g. CapsLock #55 or F1 #2).
2. Set it to **Media: Mute** in the picker (the raw box shows `c:0xE2`) and upload.
   Expected log: `#55 Fn+CapsLock: default → Media: Mute c:0xE2`, then `commit 0x01`. Over the
   2.4 GHz link the page sends one patch instead, and the log says the keyboard does not confirm it.
3. Press `Fn+CapsLock`. Expected: the Windows mute OSD appears / audio mutes.
4. If it works, try `0xE9` (Volume up) and `0xCD` (Play/Pause) on the same key.
5. **Back to firmware default** → upload → the combination stops doing anything special.

If the commit comes back `0xFF`:

* the record layout is wrong → inspect the exact staged bytes with the **Preview packet** panel
  and compare with `03 E2 00 00`;
* or the firmware refuses record type `0x03` in that layer → try the top layer to see if the
  layer matters;
* as a last resort, test the `0x07 …` form (type `0x0D`).

If the commit is `0x01` but nothing happens:

* the slot may not be read on the Fn layer for that key (try F1 #2, definitely part of the
  media row);
* or the firmware needs the function *code* (1..7) rather than the usage — the vendor stores
  the code in `macro_value` and converts it in the encoder, but the device only ever sees the
  usage, so this is unlikely;
* check the keyboard's own consumer collection with the HID probe in `tools/` while pressing the
  combination — if the firmware emits `03 E2 00`, the host should act on it even if nothing
  visible happens.

Record the result in `docs/02-hardware-tests.md` and update the “what works” table in the
README.

### Result (28 Oct 2026)

Verified, see `docs/02-hardware-tests.md` Test 8. All four uploads committed `0x01` and the user confirmed the
behaviour at the keyboard:

* Mute (`03 E2 00 00`) → Windows mute/OSD;
* Volume up (`03 E9 00 00`) → volume raised;
* Volume down (`03 EA 00 00`) → volume lowered;
* back to firmware default → the combination stopped doing anything special.

The `0x03` record is correct on the Fn layer; the `0x07 …` fallback was not needed.

---

## 4. Do not forget

* **The page is part of the record.** `media:true` (shown as `c:`) selects record `0x03`; never
  infer the page from the usage number (0xE2 and 0xCD are the traps).
* The Fn layer is still “zero = firmware default”; do not start writing factory keyboard
  records into it.
* Keep the transport untouched: one transfer at a time, `04 18` → `04 27` → 9 chunks → `04 02`
  → `04 F0`, `AA 55` trailer.
* Persisting overrides to `localStorage` must keep the consumer usage as-is; all current values
  fit in 16 bits.
