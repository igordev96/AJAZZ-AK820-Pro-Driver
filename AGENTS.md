# Agent instructions: AK820 WebHID

This project is owned by igordev96. Be a collaborator, not an autopilot.

The product is a Vite, React and TypeScript app in `src/`, deployed to Netlify from annotated tags.
It reprograms a physical keyboard, so a bad change can leave the keyboard typing the wrong thing.
Read the safety rules before editing anything that reaches the device.

Vendor binaries, layout XML, artwork and the installer are not in this repository. The private
research repository is the only place for them.

## Before you start

Read these before touching the code:

1. `README.md`: what the tool does and what it cannot do.
2. `src/App.tsx` and the feature folders: how the UI is arranged.
3. `docs/01-protocol.md`: the wire format.
4. `docs/02-hardware-tests.md`: what was actually verified on the board.

`docs/README.md` lists the full documentation order. `docs/04-code-map.md` maps the modules and
the tests in `src/`.

## Stack

Vite, React, TypeScript, Tailwind v4, shadcn/ui primitives, lucide-react, sonner for toasts and
self-hosted IBM Plex through Fontsource. Netlify runs `npm run build` and publishes `dist/`. `dist/`
is never committed.
The page makes no analytics, telemetry or external asset requests. GitHub Actions runs
`npm run verify` on `main` and pull requests (`.github/workflows/ci.yml`); a `v*` tag runs
`.github/workflows/release.yml`, which verifies that commit, deploys it and publishes the notes.

## Ask before acting

Stop and ask for approval before:

- changing the protocol constants, `FACTORY_KEYS`, `FN_LOCKED`, the keymap encoding,
  `buildTable`, `sendTable`, `waitReply` or the transfer sequence;
- changing the 2.4 GHz frame layout, its checksum, `WIRELESS_COMMANDS`, `buildWirelessFrame`,
  `toWirelessRecord`, `WirelessClient.sendKeys` or the per-key patch encoding;
- writing to a physical keyboard. Say which layer and slot will be written and how to undo it;
- adding a dependency or replacing a core library;
- changing `netlify.toml`, the build output or deployment settings;
- rewriting git history, moving tags, pushing or changing remotes;
- publishing vendor material.

Read-only commands such as `git status`, `git log`, `git diff` and reading files need no approval.

## Secrets

Never read a token out of `.git/config`, a remote URL or a log line, and never echo one into output.
Use the credential helper, or `gh` when it is installed. A token that reaches a transcript is
burned: say so, stop using it and ask for a new one. Keep secrets out of commits, docs, issues and
release notes.

## Checks

Node.js 22.12+ is required for development and the build. Node 24 is recommended.

```bat
npm install
npm run dev
npm run verify
```

`npm run verify` runs typecheck, lint, format check, tests and the production build. All five must
pass before a commit. Use `npm run format` to apply oxfmt.

Tests use Vitest and React Testing Library. HID tests use a fake device, so they run without a
keyboard. The production build runs `tsc --noEmit` first, so a type error fails the build.

`npm install` wires `.githooks` through `core.hooksPath`. The pre-commit hook runs the format check
and the linter; the pre-push hook refuses a `v*` tag that is lightweight, or whose annotation does
not lead with its version.

## Deploys

A green Release workflow does not prove the site changed. After a tag ships, open
<https://ak820-webhid.netlify.app/> and read the title, the description and whatever the release
touched, then report what the page actually says.

## Definition of done

- `npm run verify` is green.
- New library code has tests that run without a keyboard.
- A hardware test is dated in `docs/02-hardware-tests.md` when the change reaches the board.
- The pages the change invalidates move in the same commit: `01` for bytes, `02` for evidence,
  `04` for modules and tests, `05` if setup changed, `06` for lessons.
- UI work was looked at as a screenshot at a wide and a narrow width, not only in the test output.
- Public prose has had the humanize pass.

## Architecture rules

- `src/lib/keymap` and `src/lib/hid` are framework-free. They do not import React.
- React components render and dispatch. They do not call WebHID.
- HID writes happen in event handlers or the transport service, never in `useEffect` or render.
  StrictMode double-invokes effects in development, and a double upload is a hardware failure.
- One transfer at a time. The busy lock lives in the transport service, not only in disabled
  buttons.
- The page reaches the board over USB (`0xFF13`) or the 2.4 GHz receiver (`0xFF60/0x0061`), and
  `useDevice` records which in `link`. The wired path uses `TransferService`; the receiver uses
  `WirelessClient`, which writes 33-byte output reports, needs init and a heartbeat before its first
  record, and receives no reply.
- Over the receiver, `applied` moves when the frames are written, and the log says the keyboard does
  not confirm them. Do not reuse the wired wording there.
- The screen is USB only: the receiver has no `0xFF68` collection, so screen controls stay disabled
  and tagged `USB only` on that link.
- The five device settings are runtime state. The board resets them at power-on on both links, so
  the page asks for another write after a power-off. Over 2.4 GHz the Alt+F4 and Alt+Tab blocks do
  nothing, and the vendor app does no better, so they stay disabled there. The panel's draft is
  remembered with the view and light settings; that is browser memory, not board state.
- A profile import replaces drafts in the editor and the settings store. It never moves `applied`
  and never writes to the keyboard; the upload stays a separate, explicit step.
- The 576-byte table, `AA 55` at 574-575, `idx <= 142`, the begin/announce/commit order, the
  220 ms settle and the 60 ms poll do not change.
- On the Fn layer, zero means firmware default. Never seed it with factory keys.
  `fnlayer_disable` keys are read-only there.
- The record page is explicit. `media` selects record `0x03`; never infer it from the usage
  number. `0xE2` is Left Alt and Mute, and `0xCD` is below `0xE7`. Raw text uses `c:0x...`.
- `applied` and `appliedMedia` move only on `commit 0x01`, and persistence happens only after
  success.
- The mailbox is not behavioural evidence. Only typing on the board proves a remap. Record the
  user's confirmation in `docs/02-hardware-tests.md`.
- WebHID needs HTTPS or localhost. The deployed Netlify origin and the local dev origin are
  separate permissions.

## Protocol work

Never guess a byte. The vendor app and its disassembly live in the private research repository, and
`re/hooks/hid-log.js` records what the app sends through Frida. Decode from the capture, reproduce
it in `src/lib`, and write the layout into `docs/01-protocol.md`. When the capture and the
disassembly disagree, the capture wins.

The 2.4 GHz receiver has its own captures (`re/captures/dongle-*.log`), and a wired frame proves
nothing about it. Test a wireless command against a dongle capture before believing the record
travels unchanged.

A new command needs three things before it ships: a packet test, a fake-transport test that proves
the sequence, and a dated hardware test. The mailbox is not evidence; the user looking at the
keyboard is.

## Design work

Load the `frontend-design` skill before reshaping the UI or adding a view. Keep the visual language
narrow. Brass is the accent, and on the keyboard board it means "this key differs from factory", so
it never decorates. It also marks a control the current link cannot use (`USB only`); that second
meaning is about availability, and errors stay rust.

- Spend boldness in one place. Here that is the keyboard board and the 128 × 128 screen panel;
  everything around them stays quiet.
- Reuse the tokens in `src/styles/globals.css`. Do not add a colour that carries no meaning, and do
  not give one signal two meanings.
- Copy names the outcome and stays consistent. The button that says **Send time** produces "Sent.
  The screen clock is set to 20:41:07."
- A toast confirms the action and never holds the only copy of a fact. Sends keep their inline
  `StatusNote`, the log keeps every transport line, and only the headline goes to the toast. The
  tones are sage, rust, brass and plain, in `src/components/ui/sonner.tsx`.
- Before calling UI work done, screenshot it at a wide and a narrow width and look at it. The
  layout usually needs one more pass after the first screenshot.
- No new dependency for a control that can be built with what is already here. If a well-tested
  library is clearly better, use it, and say which packages you added and why. Date and time
  pickers are the example: `react-day-picker` and Radix Popover beat a hand-rolled calendar.

## Public text

Everything in this repository is public. Before you commit prose a reader will see, run it through
the `humanizer` skill and apply the result. This is the humanize pass. It covers the README, docs,
UI copy, commit messages and release notes. The rule applies to new text and to sections you
rewrite.

Leave code, commands, paths, byte sequences and quoted material as written. Humanize the prose
around them. The existing documentation predates this rule, so run the pass on any page you edit.

## Commit convention

Conventional Commits:

```
<type>(<scope>): <imperative summary, <=72 chars>

Why the change was needed, what it does and what was verified on hardware.
Keep paragraphs at 72 columns.

Test: docs/02-hardware-tests.md Test N    (when verified on the board)
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`, `style`, `perf`.

Scopes: `app`, `editor`, `keymap`, `media`, `transport`, `wireless`, `device`, `protocol`, `log`,
`profile`, `styles`, `docs`, `tools`, `repo`, `release`, `deps`, `history`.

- one logical change per commit; code, tests and the docs it invalidates belong together;
- no `wip`, `update`, `fix stuff` or pasted file lists;
- never commit with a failing check;
- public text has had the humanizer pass;
- tags are annotated and need approval.

## Documentation duties

| File | Role |
|---|---|
| `README.md` | user-facing state, quick start, limits, recovery |
| `docs/01-protocol.md` | wire format; update when the bytes or commands change |
| `docs/02-hardware-tests.md` | dated evidence, Test N; append, do not rewrite |
| `docs/03-media-keys.md` | consumer records and the media result |
| `docs/04-code-map.md` | module map, state flow and test layout |
| `docs/05-setup.md` | install, dev server, checks, Netlify |
| `docs/06-history.md` | milestones, lessons, open threads |

Never claim "works" from a `0x01` commit. Keep `docs/02-hardware-tests.md` factual and dated.

## Release state

The v2 rewrite is finished. `main` is the release line, each version has an annotated tag, and the
site runs at https://ak820-webhid.netlify.app/. The keymap, HID transport and transfer service,
editor, screen, lighting, device settings and the advanced drawer are in place, and `npm run verify`
gates all of them.

Hardware evidence lives in `docs/02-hardware-tests.md`. Tests 9 to 24 cover the React rewrite, the
screen clock and animation channel, the light with its 20 effects, the device settings, and the
2.4 GHz receiver with its records, key patches and power-cycle behaviour. A release that changes a
byte needs its own dated test; one that changes only the interface does not. The newest tag is
whatever `git tag --sort=-v:refname` prints first, so read it instead of pinning it here.

The v1 `serve.js`, `start.cmd` and its JavaScript harnesses are gone; their last copy is in the
`v1.0.1` tag. `tools/` now holds two C# HID helpers, `hidcaps.cs` and `hidwatch.cs`. The npm scripts
are the check path, and CI runs them. The root `index.html` is the Vite entry, not the old product.

Keep the protocol behaviour identical between releases. Do not fold a byte change into an
interface change.

## Reporting

When a checkpoint is done, state:

1. what changed;
2. what you verified, including commands, output and whether hardware confirmed it;
3. what you did not do or could not verify;
4. what you need next.
