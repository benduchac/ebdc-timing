"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry, Race, Registrant } from "./types";
import { getDeviceId } from "./deviceId";

// "dirty" = a change just landed and is queued behind the debounce, about to
// sync — calm, expected, not an alarm. "error" = an actual attempt failed
// (offline or a bad response) — this is the alarm state. Keeping these
// separate matches "fires only when data changed but isn't confirmed
// off-device (offline, or a failed write)" rather than alarming on every
// keystroke's brief in-flight window.
//
// "conflict" = the server refused the write because another computer has a
// newer copy (see lib/syncGuard.ts). Syncing stops, with no retry, until the
// operator leaves the race.
export type SyncStatus =
  | "never"
  | "syncing"
  | "synced"
  | "dirty"
  | "error"
  | "conflict";

// What one sync attempt came to. "skipped" = a newer attempt took over before
// this one answered, or there was nothing to send.
export type SyncResult = "ok" | "conflict" | "error" | "skipped";

interface SyncInput {
  race: Race | null;
  waveStartTimes: { A: Date; B: Date; C: Date };
  waveTimesConfirmed: boolean;
  raceDate: string | null;
  waveStartAdopted: { A?: string; B?: string; C?: string };
  registrants: Map<string, Registrant>;
  entries: Entry[];
  entryCounter: number;
}

export interface CloudSync {
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  slug: string | null;
  startToken: string | null;
  photoToken: string | null;
  syncNow: () => void;
  // Sends the latest state now and resolves once the server has answered, so
  // a caller can act only after the cloud holds everything.
  flush: () => Promise<SyncResult>;
  // Drops the refusal once the page has left the race, so the next race
  // starts clean.
  clearConflict: () => void;
}

// Best-effort POST on every state change, coalesced with a short debounce so
// a burst of rapid edits doesn't fire one request per keystroke — still
// "every state change" in spirit, just batched. See
// docs/race-readiness-design.md "Backup sync behavior".
const DEBOUNCE_MS = 600;

// A failed sync used to wait for the next state change or the browser's
// `online` event to try again. Neither is dependable at the finish line:
// behind a hotspot navigator.onLine stays true when the upstream link drops,
// so `online` never fires, and after the last finisher there are no more state
// changes — leaving the final entries unsynced with nothing scheduled to fix
// it. Retry on our own timer instead, backing off so a long outage doesn't
// hammer a dying connection.
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 120_000;

export function useCloudSync(
  input: SyncInput,
  getPassphrase: () => string | null,
  initialLastSyncedAt: string | null = null
): CloudSync {
  const [status, setStatus] = useState<SyncStatus>("never");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initialLastSyncedAt
  );
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [startToken, setStartToken] = useState<string | null>(null);
  const [photoToken, setPhotoToken] = useState<string | null>(null);

  // Only the latest in-flight request's result may resolve the status — an
  // older, slower request landing after a newer one must not overwrite it
  // with a stale "synced".
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const latestInputRef = useRef(input);
  latestInputRef.current = input;

  // The cloud version (`lastSaved`) this device last loaded or wrote, sent so
  // the server can tell a current device from a stale one. The page's value
  // moves when a race is opened or restored; a successful sync moves it
  // sooner. Reset when the race changes so one race's version is never sent
  // for another.
  const baseSavedAtRef = useRef<string | null>(initialLastSyncedAt);
  const baseRaceIdRef = useRef<string | undefined>(input.race?.id);
  // Set on a refusal. Held in a ref as well as in status so a timer or the
  // `online` event can't start another attempt while the screen re-renders.
  // Cleared when the race changes: a refusal belongs to one race.
  const conflictRef = useRef(false);
  if (baseRaceIdRef.current !== input.race?.id) {
    baseRaceIdRef.current = input.race?.id;
    baseSavedAtRef.current = initialLastSyncedAt;
    conflictRef.current = false;
  } else if (
    initialLastSyncedAt &&
    (!baseSavedAtRef.current || initialLastSyncedAt > baseSavedAtRef.current)
  ) {
    baseSavedAtRef.current = initialLastSyncedAt;
  }

  const cancelRetry = useCallback(() => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  }, []);

  // Declared before performSync so it can schedule itself again on failure;
  // the ref indirection keeps that from being a circular initializer.
  const performSyncRef = useRef<() => Promise<SyncResult>>(async () => "skipped");

  const scheduleRetry = useCallback(() => {
    cancelRetry();
    const delay = Math.min(
      RETRY_BASE_MS * 2 ** retryAttemptRef.current,
      RETRY_MAX_MS
    );
    retryAttemptRef.current += 1;
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      void performSyncRef.current();
    }, delay);
  }, [cancelRetry]);

  const performSync = useCallback(async (): Promise<SyncResult> => {
    const {
      race,
      waveStartTimes,
      waveTimesConfirmed,
      raceDate,
      waveStartAdopted,
      registrants,
      entries,
      entryCounter,
    } = latestInputRef.current;
    if (!race) return "skipped";
    if (conflictRef.current) return "conflict";

    const passphrase = getPassphrase();
    if (!passphrase) {
      setStatus("error");
      setError("Locked — unlock the operator app to resume syncing.");
      return "error";
    }

    // A retry that fires while another attempt is already scheduled would
    // stack; the newest attempt owns the schedule.
    cancelRetry();

    const generation = ++generationRef.current;
    setStatus("syncing");

    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${passphrase}`,
        },
        body: JSON.stringify({
          raceId: race.id,
          label: race.label,
          createdAt: race.createdAt,
          waveStartTimes: {
            A: waveStartTimes.A.toISOString(),
            B: waveStartTimes.B.toISOString(),
            C: waveStartTimes.C.toISOString(),
          },
          waveTimesConfirmed,
          raceDate: raceDate ?? undefined,
          waveStartAdopted,
          registrants: Array.from(registrants.entries()),
          entries,
          entryCounter,
          writerId: getDeviceId(),
          baseSavedAt: baseSavedAtRef.current,
        }),
      });

      // A refusal outranks the generation check: even if a newer attempt is
      // queued behind this one, it would carry the same stale base.
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        conflictRef.current = true;
        cancelRetry();
        setStatus("conflict");
        setError(
          data?.error ??
            "Another computer has newer results for this race. Syncing is stopped."
        );
        return "conflict";
      }

      if (generation !== generationRef.current) return "skipped";

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setStatus("error");
        setError(data?.error ?? `Sync failed (${res.status}).`);
        scheduleRetry();
        return "error";
      }

      const data = await res.json();
      baseSavedAtRef.current = data.lastSaved;
      setStatus("synced");
      setLastSyncedAt(data.lastSaved);
      setSlug(data.slug ?? null);
      setStartToken(data.startToken ?? null);
      setPhotoToken(data.photoToken ?? null);
      setError(null);
      retryAttemptRef.current = 0;
      return "ok";
    } catch {
      if (generation !== generationRef.current) return "skipped";
      setStatus("error");
      setError("Offline or unreachable — retrying.");
      scheduleRetry();
      return "error";
    }
  }, [getPassphrase, cancelRetry, scheduleRetry]);

  performSyncRef.current = performSync;

  const syncNow = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    retryAttemptRef.current = 0;
    void performSync();
  }, [performSync]);

  const flush = useCallback(async (): Promise<SyncResult> => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    retryAttemptRef.current = 0;
    const first = await performSync();
    // Another attempt may have taken over mid-flight; ask once more so the
    // answer reflects the state as it is now.
    return first === "skipped" ? performSync() : first;
  }, [performSync]);

  const clearConflict = useCallback(() => {
    conflictRef.current = false;
    setError(null);
    setStatus("dirty");
  }, []);

  // Fires on every relevant state change (including on mount, if a race is
  // already active) — see docs/race-readiness-design.md "Backup sync
  // behavior": trigger is every state change, not a timer.
  useEffect(() => {
    if (!input.race) return;
    // A refused device stays refused until the operator leaves the race; a
    // new entry on it must not queue another attempt.
    if (conflictRef.current) return;
    setStatus((s) => (s === "syncing" ? s : "dirty"));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    retryAttemptRef.current = 0;
    debounceRef.current = setTimeout(() => void performSync(), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    input.race?.id,
    input.waveStartTimes,
    input.waveTimesConfirmed,
    input.raceDate,
    input.waveStartAdopted,
    input.registrants,
    input.entries,
    input.entryCounter,
  ]);

  // Retry immediately on regaining connectivity rather than waiting for the
  // next state change.
  useEffect(() => {
    window.addEventListener("online", syncNow);
    return () => window.removeEventListener("online", syncNow);
  }, [syncNow]);

  // Drop any pending retry when the hook goes away (race switched, tab closed).
  useEffect(() => cancelRetry, [cancelRetry]);

  return {
    status,
    lastSyncedAt,
    error,
    slug,
    startToken,
    photoToken,
    syncNow,
    flush,
    clearConflict,
  };
}
