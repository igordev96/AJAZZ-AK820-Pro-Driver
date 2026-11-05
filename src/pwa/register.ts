import { registerSW } from 'virtual:pwa-register';
import { updateStore } from './update-store';

/**
 * Installs the service worker that lets the page open without a network and
 * asks it for a new build on the moments someone looks at the page again. A
 * waiting build is never taken over silently: the page that is open keeps its
 * bytes until UpdateNotice asks for the reload.
 *
 * This is the only module that imports the virtual registration entry, so the
 * tests never see it.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  let reload: ((reloadPage?: boolean) => Promise<void>) | null = null;

  reload = registerSW({
    immediate: true,
    onNeedRefresh: () => updateStore.markReady(),
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      updateStore.setHandler(() => {
        void reload?.(true);
      });

      const check = () => {
        void registration.update().catch(() => {
          // Offline, or the server is gone. The cached build keeps working.
        });
      };

      // An open tab never navigates, so the only cheap moment to ask for a new
      // worker is when the page comes back into view or the network returns.
      // No interval, no polling.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('online', check);
    },
  });
}
