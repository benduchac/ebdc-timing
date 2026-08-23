import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import { NetworkOnly, Serwist } from "serwist";

// This file is compiled by Serwist into public/sw.js. It is intentionally
// excluded from the app tsconfig (WebWorker types conflict with DOM types).

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time: the list of app-shell assets to precache.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Never answer an API request from cache. defaultCache routes every
// same-origin GET under /api/ through NetworkFirst with a 24-hour cache, which
// hands back a stale answer exactly when the hotspot is slow — and two of
// those answers are load-bearing: /api/time drives the clock check (a cached
// time reads as huge drift on a clock that is fine, and the UI then tells the
// operator to change the laptop clock mid-race), and GET /api/backup?id= is
// the recovery read (a cached snapshot restores an older race, which then
// syncs back up as the latest). Nothing under /api/ is useful offline, so a
// failed fetch should fail and be handled by the caller. GET is the only
// method defaultCache caches, so one GET rule covers it.
const apiNetworkOnly: RuntimeCaching = {
  matcher: ({ sameOrigin, url: { pathname } }) =>
    sameOrigin && pathname.startsWith("/api/"),
  handler: new NetworkOnly(),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Cache static assets/pages so the operator app loads with no network
  // (mobile hotspot down). Timing data lives in IndexedDB, not here. The API
  // rule must come first — the first matching route wins.
  runtimeCaching: [apiNetworkOnly, ...defaultCache],
});

serwist.addEventListeners();
