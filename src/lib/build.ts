/**
 * The version from package.json, inlined at build time by `define` in
 * vite.config.ts. A cached copy of the page can be identified by it, which
 * matters once a service worker can keep an old build alive.
 */
export const APP_VERSION: string =
  typeof APP_BUILD_VERSION === 'string' ? APP_BUILD_VERSION : 'dev';
