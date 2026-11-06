#!/usr/bin/env node
/**
 * Checks the service worker the build just produced, without a browser.
 *
 * The failure this exists for: a panel that loads on demand is left out of the
 * precache, so the page works online and shows a blank tab offline. The list
 * comes from dist/sw.js, which is the only thing the browser will trust.
 *
 * Run by `npm run verify` after `npm run build`.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = 'dist';

const ROOT_FILES = ['index.html', 'manifest.webmanifest', 'favicon.svg'];

const problems = [];
const fail = (message) => problems.push(message);
const normalize = (path) => path.replaceAll('\\', '/').replace(/^\.?\//, '');

async function listing(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listing(path)));
    else files.push(normalize(relative(DIST, path)));
  }
  return files;
}

function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const sw = await readFile(join(DIST, 'sw.js'), 'utf8').catch(() => null);
if (sw === null) {
  console.error('check-precache: dist/sw.js is missing. Run `npm run build` first.');
  process.exit(1);
}

const precached = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((match) => normalize(match[1]));
if (!precached.length) fail('the precache list is empty, so the worker would cache nothing');

// Everything the page asks for after the first load. `woff` is left out on
// purpose: the woff2 face wins in every browser that runs WebHID. The worker
// and its Workbox runtime are fetched by the worker itself, so they are not
// precached and are not the page's business.
const shipped = (await listing(DIST)).filter(
  (path) =>
    path !== 'sw.js' &&
    !/^workbox-[\da-f]+\.js$/.test(path) &&
    (/\.(js|css|woff2)$/.test(path) || ROOT_FILES.includes(path) || path.startsWith('icons/')),
);

for (const path of shipped) {
  if (!precached.includes(path)) fail(`${path} is shipped but not precached, so it fails offline`);
}

for (const path of precached) {
  const exists = await stat(join(DIST, path)).then(
    () => true,
    () => false,
  );
  if (!exists) fail(`the precache lists ${path}, which is not in dist`);
}

for (const path of ROOT_FILES) {
  if (!precached.includes(path)) fail(`${path} is not precached`);
}

// Every image the manifest promises. A declared size that the file does not have
// is a broken install icon or a stretched dialog screenshot.
const manifest = JSON.parse(await readFile(join(DIST, 'manifest.webmanifest'), 'utf8'));
const declared = [
  ...(manifest.icons ?? []).map((entry) => ({ ...entry, kind: 'icon' })),
  ...(manifest.screenshots ?? []).map((entry) => ({ ...entry, kind: 'screenshot' })),
];

const expected = new Map();
for (const entry of declared) {
  const path = normalize(entry.src ?? '');
  const [width, height] = String(entry.sizes ?? '')
    .split('x')
    .map(Number);
  if (!width || !height) {
    fail(`the manifest gives ${path || '(no src)'} no usable pixel size`);
    continue;
  }
  expected.set(path, { width, height, kind: entry.kind });
}
expected.set('icons/apple-touch-icon.png', { width: 180, height: 180, kind: 'Apple touch icon' });

for (const [path, { width, height, kind }] of expected) {
  const buffer = await readFile(join(DIST, path)).catch(() => null);
  if (buffer === null) {
    fail(`the manifest's ${kind} ${path} is missing from dist`);
    continue;
  }

  const actual = pngSize(buffer);
  if (actual === null) {
    fail(`${path} is not a PNG`);
    continue;
  }
  if (actual.width !== width || actual.height !== height) {
    fail(`${path} is ${actual.width}x${actual.height}, but the manifest says ${width}x${height}`);
  }
}

const iconSizes = new Set((manifest.icons ?? []).map((entry) => entry.sizes));
for (const size of ['192x192', '512x512']) {
  if (!iconSizes.has(size)) fail(`the manifest declares no ${size} icon`);
}
if (!(manifest.icons ?? []).some((entry) => String(entry.purpose).includes('maskable'))) {
  fail('the manifest declares no maskable icon, so an Android or Windows mask would crop the mark');
}

// The Reload button posts this message; without the listener it does nothing.
if (!sw.includes('SKIP_WAITING')) {
  fail('dist/sw.js has no SKIP_WAITING handler, so the update button cannot take the new build');
}

// One self.skipWaiting call, inside that handler, and nothing at install time:
// a worker that activates on its own would swap bytes under an open tab.
const skipWaitingCalls = (sw.match(/skipWaiting\(\)/g) ?? []).length;
if (skipWaitingCalls !== 1) {
  fail(
    `dist/sw.js calls skipWaiting ${skipWaitingCalls} times, expected only the SKIP_WAITING handler`,
  );
}
if (sw.includes('clientsClaim()')) {
  fail('dist/sw.js claims clients on activation, which reloads an open tab by itself');
}

if (!sw.includes('"/index.html"')) {
  fail('dist/sw.js has no navigation fallback to index.html');
}

if (problems.length) {
  console.error('check-precache: the worker would not survive offline.\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const fonts = precached.filter((path) => path.endsWith('.woff2')).length;
console.log(
  `check-precache: ${precached.length} files precached, ${fonts} font subsets, ` +
    `${expected.size} images match the manifest.`,
);
