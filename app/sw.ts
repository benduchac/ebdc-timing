import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// This file is compiled by Serwist into public/sw.js. It is intentionally
// excluded from the app tsconfig (WebWorker types conflict with DOM types).

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time: the list of app-shell assets to precache.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Cache static assets/pages so the operator app loads with no network
  // (mobile hotspot down). Timing data lives in IndexedDB, not here.
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
