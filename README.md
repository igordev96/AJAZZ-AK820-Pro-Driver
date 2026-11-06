# AJAZZ AK820 Pro browser driver and WebHID configurator

[![CI](https://github.com/igordev96/AJAZZ-AK820-Pro-Driver/actions/workflows/ci.yml/badge.svg)](https://github.com/igordev96/AJAZZ-AK820-Pro-Driver/actions/workflows/ci.yml)
[![Release](https://github.com/igordev96/AJAZZ-AK820-Pro-Driver/actions/workflows/release.yml/badge.svg)](https://github.com/igordev96/AJAZZ-AK820-Pro-Driver/actions/workflows/release.yml)
[![version](https://img.shields.io/github/package-json/v/igordev96/AJAZZ-AK820-Pro-Driver?color=d3a64c&label=version)](https://github.com/igordev96/AJAZZ-AK820-Pro-Driver/releases)
[![license](https://img.shields.io/github/license/igordev96/AJAZZ-AK820-Pro-Driver?color=d3a64c)](LICENSE)

![AK820 WebHID cover: a rendered keyboard beside the title and a Zero drivers badge](docs/assets/ak820-webhid-cover.jpg)

An unofficial browser driver and configurator for the AJAZZ AK820 Pro, also sold under the Epomaker
name. It talks to the keyboard's configuration interface over WebHID, so the everyday jobs need no
installer and no admin rights: remap keys, set Fn overrides, set the screen clock and play GIFs on
the 128 × 128 screen, and set the keyboard light.

Nothing is installed to use it, so "driver" here means this page, not a file on your disk. The page
can be installed as an app; that is optional, and covered below.

## Use it online

Open <https://ak820-webhid.netlify.app/> in Chrome, Edge or Opera, with the keyboard on its USB
cable or its 2.4 GHz dongle, and the vendor app closed. That is the whole setup.

Source, issues and release notes: <https://github.com/igordev96/AJAZZ-AK820-Pro-Driver>.

Developers: see [Quick start](#quick-start).

AK820 Pro is a trademark of its owner. This project is not affiliated with AJAZZ. The tool writes
the key table, so keep the vendor application available for recovery.

## Install it as a desktop app

The page can be installed as an app: its own window, a Start menu or Applications entry, and it
opens with no network once it has loaded. Use the install control in the address bar or the browser
menu. Chrome, Edge and Opera offer it on desktop; mobile browsers do not, and would not help, since
WebHID is desktop only.

A cached copy does not go stale silently. When a newer build is ready, the strip under the header
names the build you are running and offers **Reload**, and nothing changes under the open page until
you press it. Drafts live in this browser, so a reload keeps them. The log footer shows the build
number too, which is what to quote in a bug report.

## Status

The app is a Vite, React and TypeScript rewrite of the v1 single-file app, and the wire bytes it
sends are unchanged. Each feature that writes to the board has been run on an AK820 Pro: the key
table and both layers, the restore actions, the screen clock and animation channel, the light with
its 20 effects, the five device settings, and the 2.4 GHz receiver with its records, key patches and
power-cycle behaviour. Tests 9 to 24 cover the v2 build, and
[docs/02-hardware-tests.md](docs/02-hardware-tests.md) records each run, its date and what the board
did.

The five device settings reset at power-on on either link, so send them again after the keyboard has
been switched off. The key map, the light and the clock survive a power cycle.

## What it does

- Remaps any of the 81 keys on the top layer.
- Sets Fn-layer overrides. Keys you leave alone keep the firmware default.
- Assigns consumer keys: mute, volume, play/pause, track skip, browser back and forward,
  calculator and email.
- Sets the clock on the keyboard's screen, from this computer or from a time you pick.
- Plays a GIF on the screen, up to 140 frames, or one still picture. The screen has no channel over
  2.4 GHz, so that card waits for USB.
- Sets the keyboard light: 20 effects, colour, brightness, speed and direction.
- Restores the factory top map or clears every Fn override.
- Runs diagnostics, a deep probe, a mailbox probe and raw test commands from the Advanced drawer.

Top-layer and Fn-layer remapping and both restore actions were tested on an AK820 Pro (VID `0C45`,
PID `8009`) with the v1 app. The v2 build repeated the top-layer write and restore, wrote and
cleared an Fn media override with persistence across a reload, ran both restore actions and held
the upload lock, on 29 Oct 2026. Media testing covered Mute, Volume up and Volume down. The other
consumer functions use the same record format but were not each tested.

## Supported devices

VID `0C45` with PID `8009` (tested), `800A` or `FDFD`. Only the `8009` board has been used on
hardware, and it is the ANSI US model with 81 keys. Other layouts and variants may share the
protocol, but they have not been tried.

`FDFD` is the 2.4 GHz receiver. It has no feature reports, so the wired path cannot reach it; the
page talks to it over `0xFF60/0x0061` with output reports instead, and sends the light, the clock,
the device settings and key changes that way. Key changes go one at a time and the keyboard does
not confirm them. The receiver has no screen channel, so the screen cards are USB only. The protocol
is in [docs/01-protocol.md](docs/01-protocol.md) §13.

## What it cannot do

The firmware has no read-back command, so the app cannot show the layout stored on the keyboard.
It assumes the top layer is factory and treats an all-zero Fn table as the default. Your own edits
are saved in this browser; they are not read from the keyboard.

The screen is write-only too: the page cannot read the clock or anything else the screen holds.
The clock has no timezone, so it stays on the wall-clock time you sent.

The light supports 20 effects with colour, brightness, speed and direction. Per-key colours are not
built yet.

The knob is input-only, so it cannot be remapped. Bluetooth mode does not expose the
configuration interface.

## Requirements

- Chrome, Edge or Opera on desktop. Firefox, Safari and mobile browsers do not support WebHID.
- The USB cable, or the 2.4 GHz dongle. Bluetooth mode does not expose the interface.
- Close the AJAZZ desktop app while this page is connected.
- Serve the page from `http://localhost` or HTTPS. WebHID needs a secure context.

## Quick start

```bat
npm install
npm run dev
```

Open <http://localhost:5173/>, click **Connect keyboard** and choose the AK820 in the browser
chooser. Pick a key, choose a function, then click **Upload changes**.

To try the production build:

```bat
npm run build
npm run preview
```

`dist/` holds the deployable files. It is never committed.

## Using the editor

The top layer is the table the keyboard types without Fn. Click a key, search for the new function
under **Sends**, then upload. Every wired upload sends the full 576-byte table because the firmware
has no single-key command; over the 2.4 GHz link the page sends one patch per changed key instead.
Click the selected key again to clear the inspector.

The Fn layer tab edits what each key does while Fn is held. Only the keys you change are written;
every other slot stays zero, which means the firmware handles that combination. Six keys marked
`fnlayer_disable` by the vendor layout are read-only there.

The Media group assigns consumer functions. Their records use a different type, and the raw box
shows the `c:` prefix, for example `c:0xE2` for Mute. The prefix is required because `0xE2` is
also keyboard Left Alt.

**Reset this key** restores one top-layer key. **Restore factory map** rewrites the whole top
layer. On the Fn layer, **Back to firmware default** clears one override and **Clear all Fn
overrides** clears the layer.

### The screen clock

**Screen** opens the clock view. **Now** sends this computer's local time; **Custom** takes a date
and time you pick. One write sets the screen clock, and no key mapping is touched.

The keyboard has no timezone, so the clock follows the time you send. A daylight saving change
later in the year will not move it. The page never sets the clock on connect; you press **Send
time** when you want it.

### The screen animation

**Screen animation** takes a GIF, or one still picture, and plays it on the screen. Frames are
scaled to 128 × 128 in the browser and sent with their own delays, clamped to 30–500 ms. The
keyboard holds at most 140 frames; longer GIFs use the first 140 and the card says so.

The upload takes about 50 seconds for 30 frames and about four minutes for 140, so the card shows a
progress bar. A picture never leaves the page.

Let an upload finish. The keyboard is busy until the commit, and interrupting one leaves the screen
stuck on its loading indicator until you unplug the keyboard; the frames already sent stay on the
screen after the replug. There is no safe cancel for this channel.

This replaces the animation on the keyboard, which this tool cannot read back. The vendor app can
put the stock animation back.

### The keyboard light

**Lighting** offers the 20 effects the vendor app lists, from Static to LED off. Each mode shows the
controls it has: colour, Colourful, brightness, speed, and up/down or left/right direction. The
preview uses the real 81-key layout.

The preview is an approximation. It works from the mode, speed, direction and brightness, so an
effect that reacts to typing cannot be shown: the panel never sees which key you press.

Per-key colours are not built yet.

### Device settings

**Device** covers the five settings the vendor app keeps under System Settings: the key response
time, the sleep time, and blocks on the Windows key, Alt+F4 and Alt+Tab. The response time has five
levels, from about 2 ms to 18 ms over USB and 5 ms to 21 ms over 2.4 GHz; the tab lists the vendor's
figures for all three links and says which column the current link uses.

The keyboard takes a snapshot, not a patch, so one write always sends all five values together. A
field left out is turned off rather than left alone.

There is no read-back for any of them either. The page shows what it is about to send, never what
the board currently holds. It does remember the values you last chose, so a reload brings them back
ready to send; that is this browser's memory, not the keyboard's.

The board keeps none of the five through a power cycle. Tests 21, 22 and 24 switched the keyboard off
over the 2.4 GHz link, pulled the USB cable, and applied the blocks one at a time; every value came
back at its default, so send the settings once more after a power-on.

Sleep time and response level do take effect as soon as they are written, over the 2.4 GHz link as
well as over USB (Test 24).

Over 2.4 GHz the Alt+F4 and Alt+Tab blocks do nothing. The vendor app behaves the same way on that
link, and its own capture puts the flags at the same bytes this page sends, so the board does not
implement them there. The page disables those two over the receiver and sends them over USB.

**Advanced** opens the diagnostics, the deep probe, the mailbox probe and a raw command tab.
These send test commands and never write a keymap. Uploads are locked while one of them runs.

### Profiles

**Profile** in the header exports one JSON file with both key layers, the device settings and the
lighting, so another machine can start from the same drafts. Import lists what the file holds and
asks before replacing anything.

An import touches this page only. Every imported key shows as pending until you upload it, and the
device and lighting values wait for their own buttons, so a profile from another machine cannot
quietly rewrite this keyboard.

The file carries drafts, never a claim that a keyboard already has them. The screen animation is not
included: this tool cannot read the screen back, and it does not keep the frames after sending.

## The missing read-back

If you remapped keys in the vendor app, this app cannot see that layout. Uploading the factory map
will overwrite it. Restore the vendor app's defaults first if you need to keep it.

Your own edits live in this browser profile, in the storage described below. They stay until you
clear site data, and they do not travel to another browser or machine.

## What this browser remembers

The view you were on, the clock source, the light settings, the device settings you last chose and
when those were last sent are stored under `ak820.settings`, so a reload returns you to the same
place with the same values ready to send. They are read back field by field: a value that stops
making sense, such as an effect that no longer exists, falls back to its default instead of breaking
the page.

Both keymap layers are stored together under `ak820.layers`, each in two parts: the draft you were
editing and the table the last confirmed upload sent. A reload shows your drafts on the top layer
and on the Fn layer, and any key the keyboard has not been told about stays marked as pending and
counts in **Upload changes**. The second part only moves when a commit succeeds, so the board never
claims a change reached the keyboard when it did not.

An older version kept the two layers in separate keys. They are read once and rewritten in the
current shape on the first change.

The layer you were editing is not saved. The app opens on the top layer, where most edits start.

The log is deliberately not kept: lines from an earlier session would describe a device state this
page never saw.

## Recovery

Undo a single change with **Reset this key** on the top layer or **Back to firmware default** on
the Fn layer, then upload.

Undo a whole layer with **Restore factory map** or **Clear all Fn overrides**.

If the screen clock drifts, send it again from **Screen**. Opening the vendor app also sets the
clock, because it does that whenever it starts with the keyboard connected.

If you interrupt a screen upload, unplug the keyboard and plug it back in. The screen may show a mix
of the old and new animation; send the animation again to replace it.

If you want the stock animation back, import the vendor's `0.gif` in the vendor app and upload it
there. This tool cannot read what is on the screen, so it cannot save the current animation for
you.

If the app refuses a transfer, it stops before staging data, so the keyboard is unchanged. Unplug
and replug the keyboard, then try again. Close any other program that may hold the interface.

If the keyboard stops responding or types the wrong keys, unplug and replug it, upload the factory
map again, or use the vendor application's restore function.

Do not start two uploads at once. The app locks the editor during a transfer; leave that lock in
place.

## Privacy

The page makes no analytics, telemetry or external asset requests. Fonts are self-hosted. A
service worker keeps the current build on this device so the page opens offline; it stores this
site's own files and sends nothing. The only stored data is what this browser remembers: the view
and the screen, lighting and clock settings in `ak820.settings`, and the two key layers in
`ak820.layers`.

## Development

Node.js 22.12 or newer is required for development and the build. Node 24 is recommended.

```bat
npm install
npm run verify
```

`npm run verify` runs the typecheck, the linter, the format check, the Vitest suite, the production
build and the precache check. All six must pass before a commit. The last one reads `dist/sw.js` and
fails when a shipped file is missing from the offline cache, which is the failure that would leave a
panel blank with no network.

GitHub Actions runs the same command on every push to `main` and every pull request. The workflow
is `.github/workflows/ci.yml`.

`src/lib/keymap` and `src/lib/hid` import no React. Components live in `src/features` and call
those modules or the editor state. HID tests use a fake device, so the suite runs without a
keyboard. [docs/04-code-map.md](docs/04-code-map.md) maps the modules and the tests.

## Deployment

A tag ships. Pushing `v*` runs `.github/workflows/release.yml`, which verifies the tagged commit,
uploads `dist/` to Netlify and publishes the release notes. A push to `main` never reaches
production, so the live site always matches the newest tag.

The notes come from the annotated tag: the first line is the title, the body is the summary, then
GitHub's generated list of commits. `npm run release -- minor notes.md` writes the version bump,
the commit and the tag.

WebHID permission belongs to the origin, so the localhost and deployed origins keep separate device
permissions. The public site is <https://ak820-webhid.netlify.app/>. Pull requests still get a
Netlify preview; `netlify.toml` describes that build, and response headers live in
`public/_headers` so they survive a CLI deploy.

## Documentation

The full reading order is in [docs/README.md](docs/README.md).

| Page | Contents |
|---|---|
| [docs/01-protocol.md](docs/01-protocol.md) | device, report framing, mailbox, table format, layers |
| [docs/02-hardware-tests.md](docs/02-hardware-tests.md) | hardware runs and what they proved |
| [docs/03-media-keys.md](docs/03-media-keys.md) | consumer records and the explicit page marker |
| [docs/04-code-map.md](docs/04-code-map.md) | module map, state flow and test layout |
| [docs/05-setup.md](docs/05-setup.md) | setup, checks, deployment and troubleshooting |
| [docs/06-history.md](docs/06-history.md) | decisions, dead ends and lessons |
| [docs/key-index-table.md](docs/key-index-table.md) | key index, usage, Fn lock and geometry |

The protocol notes were written for interoperability. Vendor binaries, layout XML, artwork and
the installer are not distributed here. A few documents mention the private research material
they were derived from.

## License

MIT. See [LICENSE](LICENSE). The documentation uses the same license.
