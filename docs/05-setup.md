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

That runs all six steps in order:

| Step | Script | What it does |
|---|---|---|
| typecheck | `npm run typecheck` | `tsc --noEmit` |
| lint | `npm run lint` | `oxlint src vite.config.ts` |
| format | `npm run format:check` | `oxfmt --check` on the source and config files |
| tests | `npm run test` | Vitest, React Testing Library, fake HID device |
| build | `npm run build` | typecheck, then `vite build`, which also writes `dist/sw.js` |
| precache | `npm run check:precache` | reads `dist/sw.js`: every shipped file is cached, the icons are the size they claim, the worker waits for the reload |

`npm install` points git at `.githooks`, so every commit runs `format:check` and `lint` first. Both
only read: when one fails the commit stops and nothing gets rewritten under you. Run
`npm run format` and commit again. `npm run hooks` re-applies the setting if a fresh clone misses
it.

CI runs the same `npm run verify` on Node 22 and Node 24, because the README promises Node 22.12 or
newer and the build should not depend on the newer one.

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
workflow is `.github/workflows/ci.yml`. It does not deploy anything.

The build fails on a type error because `build` runs `tsc --noEmit` before Vite.

## 4. Deployment

A tag ships. `.github/workflows/release.yml` runs on `v*` and does three things in order: it
verifies the tagged commit, uploads `dist/` to Netlify with the CLI, and publishes the GitHub
release.

That means a push to `main` never reaches production. The production site is
<https://ak820-webhid.netlify.app/> and it always matches the newest tag.

The release notes come from the tag. Its first line is the title and it starts with the version, as
in `v2.10.0 — toasts, profiles and a device panel that remembers`; the body is the summary, and
GitHub's generated commit list follows both. `npm run release -- minor notes.md` writes the bump,
the commit and the annotated tag, and puts the version in front of the first line when the notes
file leaves it out. Pushing the tag starts the workflow.

Two things live outside the repository:

- `NETLIFY_AUTH_TOKEN` in the repository's Actions secrets. The release job stops before deploying
  and names the secret if it is missing. The site id is in the workflow and is not secret.
- Netlify's branch settings stay at their defaults: production branch `main`, branch deploys none,
  deploy previews on. Production builds are cancelled by the `ignore` command in `netlify.toml`,
  which exits 0 when `CONTEXT` is `production`, so a push to `main` stops at the build step while a
  pull request still gets a preview.

Response headers live in `public/_headers`, not in `netlify.toml`, because a CLI deploy only
applies what is inside the uploaded folder. They set `X-Content-Type-Options`, `Referrer-Policy`
and `Permissions-Policy: hid=(self)`. WebHID permission belongs to the origin, so a device allowed
on localhost is not automatically allowed on the deployed site. Connect once on each origin.

The same file keeps `/sw.js` at `max-age=0, must-revalidate` and serves the webmanifest as
`application/manifest+json`. Without the first rule a cached worker could never be replaced;
without the second some hosts hand the manifest over as plain text and the install prompt never
appears.

### Install and offline

`vite-plugin-pwa` runs in `generateSW` mode during the build. It writes `dist/sw.js` with a precache
list of the whole build: `index.html`, the webmanifest, the icons, every JavaScript chunk including
the four lazy panels, the stylesheet and the five woff2 subsets. That is 26 files and about
790 KiB, so the page opens with no network and a tab that survives a deploy no longer asks for
assets that were replaced.

Two settings keep it safe for a tool that writes to a keyboard: `skipWaiting` and `clientsClaim`
are off, so a new build never takes over an open page. The manifest is hand-written at
`public/manifest.webmanifest`, because its name, colours and icons are copy a reviewer should see.

A newer build is downloaded and then waits in the worker. The strip under the header says which
build is running and offers **Reload**; nothing changes under an open page until that button is
pressed. The log footer carries the same version.

Only Chromium desktop browsers install it, which is also the only place WebHID exists: Firefox,
Safari and every mobile browser can show the page but cannot use it. `npm run dev` does not
register the worker, because a worker in front of Vite's hot reload is more trouble than it is
worth. Use `npm run preview` to exercise install and offline locally.

The icons are committed as PNGs. `public/icons/icon-192.png` and `icon-512.png` come from
`public/favicon.svg`; the maskable pair and the 180 px Apple icon come from
`docs/assets/icons/maskable.svg` and `apple-touch.svg`, which keep the mark inside the safe circle.
Re-render them with `npx sharp-cli --density 600 -i <source.svg> -o <target.png> resize <n> <n>` if
the mark changes, then look at the result before committing it.

Netlify's deploy badge is not in the README. It reports the newest deploy on the production branch,
which is now the skipped build from a push to `main`, so it would read as cancelled between
releases. The README shows the Release workflow instead.

The app has no routes or server functions, so there are no redirect rules. `dist/` is generated
and never committed.

## 5. Before connecting

- **Close the AJAZZ desktop app.** Windows allows one program to hold the config interface.
  Symptom if not: `device.open()` fails, the app says the interface is unavailable, or every
  command returns `0xFF`.
- Use **USB or the 2.4 GHz dongle**, not Bluetooth.
- **Disconnect in the page before opening the vendor app again.**

## 6. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| No device in the chooser | vendor app still running, Bluetooth mode, or a browser without WebHID |
| “WebHID is not available in this browser” | Firefox, Safari or a mobile browser; use desktop Chrome, Edge or Opera |
| “The configuration interface was not found” | neither the wired interface nor the receiver was exposed: USB mode, vendor app holding the device, or another AK820 variant |
| The screen card is disabled and tagged **USB only** | expected over the 2.4 GHz receiver, which has no screen channel; use the cable |
| Alt+F4 and Alt+Tab are disabled on the dongle | expected: the receiver does not apply those two blocks, and the vendor app does no better |
| `device.open()` fails | the interface is already open elsewhere, or permission was denied |
| `04 18` answers `0xFF` | another transfer is in flight, or another program holds the interface |
| Chunk refused four times | the firmware is not in the data phase, usually after an aborted transfer; replug USB and retry |
| Commit `0xFF` | the staged table is invalid (trailer, slot above 142, bad record); nothing was applied |
| Upload accepted but nothing changed | wrong layer, a `fnlayer_disable` key, or a record type the firmware ignores |
| A change is still marked pending after a reload | expected: the page remembers your draft, and the keyboard has not been told yet. Upload it, or reset the key |
| A change is missing in another browser or profile | expected: edits live in this browser profile only |
| An imported profile changed the keys but the keyboard still types the old ones | expected: the import fills drafts. Upload the layer, and apply the device and lighting values |
| `localStorage` errors | the app was opened from `file://` or storage is blocked; use localhost or HTTPS |
| The page shows an older build | a newer one is waiting in the worker: press **Reload** on the strip, or close every tab of the app and open it again |
| The page is stuck on the copy you just replaced | the worker is doing its job. Press **Reload** on the strip. To start clean, open DevTools → Application → Service workers → Unregister, then reload |
| Install is offered but the app opens blank | a stale worker outlived a deploy; unregister it as above. `npm run check:precache` is what should have caught this before release |
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
