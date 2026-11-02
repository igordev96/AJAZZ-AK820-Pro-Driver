# 05 · Setup, checks and deployment

The app installs nothing on the machine. Node.js is needed to build it and to run the checks.

## 1. Requirements

| Need | Why | Notes |
|---|---|---|
| Chrome, Edge or Opera (desktop) | WebHID | Firefox, Safari and mobile do not support it |
| USB (wired) connection | the configuration collection | Bluetooth does not expose it |
| A local server or HTTPS | WebHID needs a secure context | `http://localhost` counts |
| Node.js 22.12+ | Vite, TypeScript and the checks | 24 is recommended; see `.nvmrc` |
| No administrator rights | everything is per-user | nothing is installed system-wide |

## 2. Install and run

```bat
npm install
npm run dev
```

Vite prints the local URL, normally <http://localhost:5173/>. Open it, click **Connect keyboard**
and choose the AK820 in the browser chooser.

To run the production build:

```bat
npm run build
npm run preview
```

`dist/` holds static files. Serve it from any HTTPS host or from localhost.

## 3. Checks

```bat
npm run verify
```

That runs all five steps in order:

| Step | Script | What it does |
|---|---|---|
| typecheck | `npm run typecheck` | `tsc --noEmit` |
| lint | `npm run lint` | `oxlint src vite.config.ts` |
| format | `npm run format:check` | `oxfmt --check` on the source and config files |
| tests | `npm run test` | Vitest, React Testing Library, fake HID device |
| build | `npm run build` | typecheck, then `vite build` |

`npm run format` applies the formatter. Tests do not need a keyboard: `src/test/hidFakes.ts`
provides a fake clock, a fake transport, and the app tests install a fake `navigator.hid`.

The linter reads the Tailwind stylesheet. `oxlint-tailwindcss` compiles
`src/styles/globals.css`, so a misspelt class, a class that contradicts another in the same list,
or a utility retired in Tailwind v4 fails `npm run lint`. The first run of a session takes a few
seconds to build the design system; after that it is cached and the whole lint step stays around a
second. If the stylesheet moves, update `settings.tailwindcss.entryPoint` in `.oxlintrc.json`; the
plugin reports exactly which path it tried if the setting is wrong.

Sort order is left to oxfmt, and three rules stay off on purpose: logical properties (the app is
LTR only), a blanket ban on arbitrary values (the small type sizes and inset shadows need them),
and class line wrapping.

Two blind spots are worth knowing. Strings passed as an object to a component, such as
react-day-picker's `classNames`, are not extracted, so the editor sees them and the linter does
not. And the editor suggests the `**:` descendant variant in place of `[&_selector]`; with Tailwind
4.3.3 the build does not apply that form, so `[&_…]` stays until the toolchain agrees. Check a
suggestion from the editor in the browser before trusting it.

GitHub Actions runs the same `npm run verify` on every push to `main` and every pull request. The
workflow is `.github/workflows/ci.yml`. Netlify builds `main` after the push, and its deploy status
badge is in the README.

The build fails on a type error because `build` runs `tsc --noEmit` before Vite.

## 4. Deployment

`netlify.toml` builds the site:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "24"
```

The app has no routes or server functions, so there are no redirect rules. `dist/` is generated
and never committed.

The response headers set `X-Content-Type-Options`, `Referrer-Policy` and
`Permissions-Policy: hid=(self)`. WebHID permission belongs to the origin, so a device allowed on
localhost is not automatically allowed on the deployed site. Connect once on each origin.

The Netlify deploy itself is not part of `npm run verify`. Check the production build locally with
`npm run build` and `npm run preview` before merging to `main`. The public site is
<https://ak820-webhid.netlify.app/>, deployed from `main`.

## 5. Before connecting

- **Close the AJAZZ desktop app.** Windows allows one program to hold the config interface.
  Symptom if not: `device.open()` fails, the app says the interface is unavailable, or every
  command returns `0xFF`.
- Use **USB**, not Bluetooth.
- **Disconnect in the page before opening the vendor app again.**

## 6. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| No device in the chooser | vendor app still running, Bluetooth mode, or a browser without WebHID |
| “WebHID is not available in this browser” | Firefox, Safari or a mobile browser; use desktop Chrome, Edge or Opera |
| “The configuration interface was not found” | USB mode, vendor app holding the device, or another AK820 variant |
| `device.open()` fails | the interface is already open elsewhere, or permission was denied |
| `04 18` answers `0xFF` | another transfer is in flight, or another program holds the interface |
| Chunk refused four times | the firmware is not in the data phase, usually after an aborted transfer; replug USB and retry |
| Commit `0xFF` | the staged table is invalid (trailer, slot above 142, bad record); nothing was applied |
| Upload accepted but nothing changed | wrong layer, a `fnlayer_disable` key, or a record type the firmware ignores |
| A change is still marked pending after a reload | expected: the page remembers your draft, and the keyboard has not been told yet. Upload it, or reset the key |
| A change is missing in another browser or profile | expected: edits live in this browser profile only |
| `localStorage` errors | the app was opened from `file://` or storage is blocked; use localhost or HTTPS |
| Everything looks fine but keys do not type | restore the factory map, or use the vendor app's reset |
| The deployed site does not see the keyboard | serve it over HTTPS and allow the device on that origin; permission does not carry over from localhost |
| The board is small on a phone | the page renders on mobile, but mobile browsers cannot use WebHID |

The vendor application is the last-resort recovery path. Keep it available, and do not run it at
the same time as this app.

## 7. Optional hardware probes

`tools/hidwatch.cs` enumerates every HID collection and prints input reports with timestamps;
`tools/hidcaps.cs` prints capabilities only. They are plain C# compiled with the .NET Framework
compiler (`csc.exe`) and need no installation. They are useful for checking what the firmware emits
for a key, but they are not needed to use or test the app.

## 8. The v1 app

The single-file v1.0.1 app and its Node harnesses are in the `v1.0.1` tag. They are not part of the
current build or test path. `serve.js`, `start.cmd` and the three JavaScript harnesses were removed
with the v1 code.
