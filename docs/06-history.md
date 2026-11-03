# 06 · History and decisions

Short record of how the project got here, so the next maintainer does not re-litigate settled
choices or repeat dead ends.

Paths such as `vendor/`, `dist/` and `re/` refer to the private research repository where the
vendor material and disassembly live. They are not part of this project.

---

## 1. Starting problem

The user could not install the vendor app on a locked-down PC (no admin rights) and wanted key
remapping that works “everywhere”. Two threads came out of that:

1. **A per-user repack of the vendor app** — delivered first, works, and is still the recovery
   path (`dist/`). It repacks the unmodified vendor application with `PrivilegesRequired=lowest`
   and an `%LOCALAPPDATA%` install dir.
2. **A browser driver** — this project. No install at all; WebHID talks to the same config
   interface the vendor app uses.

## 2. Options considered and rejected

| Option | Why not |
|---|---|
| Port the MFC app to WASM | the HID calls (`HidD_*`) are native; would still need a bridge |
| Electron / Tauri wrapper | still an install, and re-implements the UI for no benefit |
| Python + `hidapi` | needs Python on every machine; WebHID needs nothing |
| Reverse-engineer the whole protocol first | too slow; the mailbox was cracked incrementally instead |

WebHID won because it is the only option with zero install and a stable API for feature reports.

## 3. Milestones

1. **Enumeration** — found the config collection `0xFF13/0x0001` with 65-byte feature reports;
   Chrome hides the keyboard/consumer collections, which is fine.
2. **Mailbox semantics** — a read right after a write returns our own frame; real replies are
   stamped in byte 3 and echo the command in byte 1. This explained a week of “status 0x00”.
3. **`Device::Write`** (`0x44EED0`) — 65-byte buffer, report id 0, `HidD_SetFeature`, read-back
   only for payloads ≤ 64 bytes, `floor(len/64)` bare chunks above that.
4. **Keymap protocol** — `04 18` → `04 11 … 09` → 9 chunks → `04 02` → `04 F0`, all `0x01`.
5. **Encoder decoded** (`0x418420`) — 576-byte zeroed buffer, record at `key_index × 4`,
   `AA 55` trailer, type dispatch. Reproduced byte-exactly in `buildTable` (164 non-zero bytes).
6. **First hardware write** — factory table unchanged, accepted, keyboard still stock. Then
   Esc→CapsLock and CapsLock→A, verified by typing, then restored.
7. **Editor** — 81-key board from XML geometry, usage picker, raw hex, dirty list, restore.
8. **Race fix** — a double-clicked restore exposed overlapping transfers; added the bus lock,
   abort-on-refused-begin, and transport-vs-commit error split.
9. **Fn layer** — found the data source (`SELECT … fn_layer = ?`, empty DB), the
   `fnlayer_disable` skip list, and that zero = firmware default. Implemented the layer toggle,
   zero-slot semantics, locked keys, persistence, and verified overrides + clearing on hardware.
10. **Main-PC revalidation and hygiene** — fresh WebHID authorisation on the new machine, no-op
    factory/zero uploads accepted, stock behaviour confirmed by typing (`docs/02-hardware-tests.md` Test 7).
    Removed a stray `?` before the doctype (the page had always been rendering in quirks mode),
    made `sendTable` abort when the announce is refused, and refused top-layer usage `0x00`.
11. **Media keys** — the editor now stores the usage page per key instead of guessing it from the
    number (`0xE2` is Left Alt *and* Mute; `0xCD` is below `0xE7`). Added a Media picker group,
    the `c:` raw-text token, `03 <lo> <hi> 00` records and Fn persistence with `[idx, usage, 1]`.
    Mute, Volume up and Volume down verified on the Fn layer, then cleared (`docs/02-hardware-tests.md` Test 8).
12. **Repository hygiene** — added `AGENTS.md`, `.editorconfig`/`.gitattributes`, and LF
    normalisation for project-owned text. The private lab also moved to Conventional Commits and
    stopped tracking `re/node_modules`; this public repository starts with a clean history and
    carries only the publishable driver, tests and documentation.
13. **React rewrite (v2)** — ported the tool to Vite, React and TypeScript without changing the
    wire bytes. The keymap, HID and editor code became pure modules with Vitest coverage;
    `TransferService` kept the single-transfer lock; the editor gained a scale-to-fit board, a
    log drawer and an Advanced drawer for diagnostics and raw commands. Hardware Test 9 passed on
    29 Oct 2026: top layer, Fn media, both restore actions and the upload lock.
14. **Interface and persistence pass** — the controls moved to Radix primitives in the shadcn
    style, and the screen, lighting and advanced panels now load on demand, which took the first
    visit from 166 kB to 108 kB gzipped. Both key layers are remembered in `ak820.layers` as a
    draft plus the last confirmed upload, so a reload can show a pending change without implying
    the keyboard has it. The light preview follows the selected effect and stops under
    `prefers-reduced-motion`; it cannot show the effects that answer a key press. No bytes changed,
    so there is no new hardware test.
15. **Device settings (v2.8.0)** — five captures on the board decoded the `04 17` record: response
    level at byte 8, sleep at byte 6, and the three shortcut blocks at bytes 2, 3 and 4. It is a
    snapshot rather than a patch, so every write carries all five values. Test 17 confirmed the
    blocks in both directions; the sleep and response writes were accepted but their effects were
    not observed.
16. **2.4 GHz receiver (v2.9.0)** — the dongle (`0C45:FDFD`) exposes no feature reports, so it got a
    second transport on `0xFF60/0x0061`: 33-byte output reports, a sum checksum, and one record per
    frame. Key changes go one patch at a time, `0x03` on the top layer and `0x0D` on Fn, and nothing
    comes back. Tests 18 to 20 confirmed the records, the patches and an 81-patch whole-map restore
    on the board.

## 4. Lessons that cost time

* **The mailbox lies.** Never treat a feature read as evidence without checking byte 1 and
  byte 3.
* **Chromium is not `HidD_SetFeature`.** Writes are queued; the vendor's synchronous call hid
  that. Pace chunks.
* **One reply slot.** Two sequences cannot overlap, not even for “harmless” no-op uploads.
* **A commit can be `0xFF` on purpose.** Missing trailer → rejected; that became the validation
  probe.
* **No read-back.** Every design decision about baselines follows from this: top = XML, Fn =
  zeros, persistence in `localStorage`.
* **The vendor's DB is the source of truth for its own UI.** Empty `t_key_macro_data` proved the
  device had never been written by the vendor app, which made the first Fn write safe.
* **A stray byte before `<!DOCTYPE>` is not just a parse warning.** The page spent its whole life
  in quirks mode and rendered that byte as a text line; it still “worked”, which is why nobody
  noticed. Check `document.compatMode` when a layout looks subtly off.
* **The mailbox is not behavioural evidence.** Every revalidation still ends with the user
  typing on the board; the log only proves the firmware accepted the packet.
* **A usage number never identifies the page.** 0xE2 is Left Alt and Mute, and 0xCD (Play/Pause)
  is below 0xE7 while also being a reserved keyboard usage. Carry the page explicitly (`media` /
  `c:`); range heuristics are wrong.
* **Right-hand modifiers use the high bits.** `0x451CA0` maps `0xE0..0xE7` to
  `1,2,4,8,16,32,64,128`, not a repeat of the left-hand values. The old prose said otherwise; the
  encoder was already correct, and the docs were fixed during the React refactor.
* **A quiet device may be waiting for its handshake.** The receiver ignored the light frame until
  the page sent the vendor's init and heartbeat, with the same bytes and the same checksum that
  failed before. Capture the startup burst before deciding a record itself is wrong.
* **An unconfirmed write is not a confirmed one.** Over the dongle nothing comes back, so `applied`
  moves when the frames go out and the log says the keyboard does not confirm them. The wired
  wording, which reports an accepted commit, would be a claim the page cannot support there.
* **A record and its storage are separate questions.** The light, the clock and the key patches came
  back after a power cycle; the shortcut blocks did not, over USB or over 2.4 GHz (Tests 21 and 22).
  A write that is accepted can still be runtime state, so ask what happens after a power-on before
  promising anything lasts.
* **A vendor feature that fails is not your bug yet.** The Alt+F4 and Alt+Tab blocks did nothing over
  the receiver with bytes that match the vendor's own dongle capture, and the vendor app's box did
  nothing on that link either (Test 23). Running the vendor app first turns a suspected encoder bug
  into a one-line limitation.
* **A colour that encodes state cannot also decorate.** The first v2 build gave the Fn cap a brass
  edge for looks, while the legend says brass means a key differs from the factory table. The first
  question from the user was whether Fn had been remapped. Keep one meaning per visual signal.

## 5. Open threads

* Media/consumer records — **done and verified** (`docs/02-hardware-tests.md` Test 8); the `07 …` form was not
  needed.
* `0x0D` record (`07 …`), internal types 5 and 8–11, macro records — undecoded, not needed.
* Commit reply byte 4 (`0x77`) — unexplained.
* `t_config_data.fn_layer` / `fn_switch` — unknown meaning.
* The driver is a Vite and React app in `src/`. Vendor artwork, layout XML and the installer stay
  private and are not distributed.
