"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry, Race, Registrant } from "./types";

// "dirty" = a change just landed and is queued behind the debounce, about to
// sync — calm, expected, not an alarm. "error" = an actual attempt failed
// (offline or a bad response) — this is the alarm state. Keeping these
// separate matches "fires only when data changed but isn't confirmed
// off-device (offline, or a failed write)" rather than alarming on every
// keystroke's brief in-flight window.
export type SyncStatus = "never" | "syncing" | "synced" | "dirty" | "error";

interface SyncInput {
  race: Race | null;
  waveStartTimes: { A: Date; B: Date; C: Date };
  waveTimesConfirmed: boolean;
  registrants: Map<string, Registrant>;
  entries: Entry[];
  entryCounter: number;
}

export interface CloudSync {
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  slug: string | null;
  syncNow: () => void;
}

// Best-effort POST on every state change, coalesced with a short debounce so
// a burst of rapid edits doesn't fire one request per keystroke — still
// "every state change" in spirit, just batched. See
// docs/race-readiness-design.md "Backup sync behavior".
const DEBOUNCE_MS = 600;

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

  // Only the latest in-flight request's result may resolve the status — an
  // older, slower request landing after a newer one must not overwrite it
  // with a stale "synced".
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestInputRef = useRef(input);
  latestInputRef.current = input;

  const performSync = useCallback(async () => {
    const {
      race,
      waveStartTimes,
      waveTimesConfirmed,
      registrants,
      entries,
      entryCounter,
    } = latestInputRef.current;
    if (!race) return;

    const passphrase = getPassphrase();
    if (!passphrase) {
      setStatus("error");
      setError("Locked — unlock the operator app to resume syncing.");
      return;
    }

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
          registrants: Array.from(registrants.entries()),
          entries,
          entryCounter,
        }),
      });

      if (generation !== generationRef.current) return;

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setStatus("error");
        setError(data?.error ?? `Sync failed (${res.status}).`);
        return;
      }

      const data = await res.json();
      setStatus("synced");
      setLastSyncedAt(data.lastSaved);
      setSlug(data.slug ?? null);
      setError(null);
    } catch {
      if (generation !== generationRef.current) return;
      setStatus("error");
      setError("Offline or unreachable — will retry.");
    }
  }, [getPassphrase]);

  const syncNow = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    performSync();
  }, [performSync]);

  // Fires on every relevant state change (including on mount, if a race is
  // already active) — see docs/race-readiness-design.md "Backup sync
  // behavior": trigger is every state change, not a timer.
  useEffect(() => {
    if (!input.race) return;
    setStatus((s) => (s === "syncing" ? s : "dirty"));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(performSync, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    input.race?.id,
    input.waveStartTimes,
    input.waveTimesConfirmed,
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

  return { status, lastSyncedAt, error, slug, syncNow };
}
