"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WaveStarts } from "@/lib/types";
import { verifySystemClock, getClockSeverity } from "@/lib/utils";
import type { ClockCheckResult } from "@/lib/types";
import { CheckIcon, WarningIcon } from "@/components/icons";

type Wave = "A" | "B" | "C";
const WAVES: Wave[] = ["A", "B", "C"];

interface WaveStartViewProps {
  token: string;
  raceLabel: string;
  initialWaveStarts: WaveStarts;
}

interface PendingTap {
  timestampMs: number;
  failed: boolean; // true once at least one send attempt has failed — flips the button to "retrying" styling instead of "sending"
}

const pendingStorageKey = (token: string) => `ebdc-wave-start-pending:${token}`;

function loadPending(token: string): Partial<Record<Wave, PendingTap>> {
  try {
    const raw = localStorage.getItem(pendingStorageKey(token));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePending(token: string, pending: Partial<Record<Wave, PendingTap>>) {
  try {
    localStorage.setItem(pendingStorageKey(token), JSON.stringify(pending));
  } catch {
    // Best-effort — a lost pending record just means the "tap again to
    // retry" UI can't resume after a reload; the retry loop while the tab
    // stays open is unaffected.
  }
}

// An unsent tap is the one thing on this page that is time-critical: until it
// lands, the laptop is scoring that wave against a draft start time. The
// requests are tiny and there are at most three, so retry briskly and never
// back off far.
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 15_000;
// How long one send may take before it is given up on and retried. It grows
// with each failed try: a connection that is slow but working (a weak
// hotspot, a cold server) needs more than 8s to finish a send, and a limit
// that never grew would abort it every time and never see the reply. Retries
// carry the same tap time, so a send that did land and is sent again is
// harmless.
const SEND_TIMEOUTS_MS = [8_000, 12_000, 20_000, 30_000];
// An attempt this old, when the signal returns or the screen wakes, is
// presumed stuck on a dead socket and is replaced. A younger one is left to
// finish, so two wake events together don't send twice.
const HUNG_AFTER_MS = 2_000;

// How often the page asks what other phones have sent. Once all three waves
// are known there is little left to learn but a correction, so it slows down:
// every refresh costs a few Redis commands and a phone may stay open for hours.
const REFRESH_MS = 15_000;
const REFRESH_SLOW_MS = 60_000;
// A request that hasn't answered by now is on a dead connection; give up on it
// so the next one can try, rather than waiting on a socket that won't return.
const REFRESH_TIMEOUT_MS = 8_000;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour12: true });

interface InFlightAttempt {
  controller: AbortController;
  startedAt: number;
  // Set when it was replaced on purpose, so its failure is not treated as one.
  cancelled: boolean;
}

interface SyncRow {
  wave: Wave;
  time: string;
  unsent: boolean;
  failed: boolean;
}

// Whether this phone's wave times have reached the server, in words and colour
// a volunteer can read at a glance, and laid out so that a screenshot of it is
// a usable record. Amber only once an attempt has actually failed: a tap on a
// good connection is on the server before anyone could read an amber box.
function SyncStatusBox({ rows }: { rows: SyncRow[] }) {
  const unsent = rows.some((r) => r.unsent);
  const failed = rows.some((r) => r.failed);
  const state = failed
    ? "unsent"
    : unsent
    ? "sending"
    : rows.length > 0
    ? "synced"
    : "empty";

  const title = {
    unsent: "Waiting to sync — take a screenshot for backup",
    sending: "Sending wave times…",
    synced: "All wave times synced to the server",
    empty: "No wave times yet",
  }[state];

  // Plain text beside a coloured bar, with no fill, border box or rounded
  // corners: the buttons above are filled, rounded blocks, and this must not
  // read as one more of them.
  const accent = {
    unsent: "border-warning",
    sending: "border-sand/40",
    synced: "border-success",
    empty: "border-sand/25",
  }[state];

  return (
    <div
      role="group"
      aria-label="Wave time sync status"
      data-state={state}
      className={`mt-6 border-l-4 pl-3 ${accent}`}
    >
      <div
        className={`flex items-center gap-2 text-sm font-semibold ${
          state === "unsent" ? "text-warning" : "text-chalk"
        }`}
      >
        {state === "unsent" && <WarningIcon className="w-4 h-4 shrink-0" />}
        {state === "synced" && (
          <CheckIcon className="w-4 h-4 shrink-0 text-success" />
        )}
        <span>{title}</span>
      </div>
      {rows.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs font-mono tabular-nums text-sand/80">
          {rows.map((r) => (
            <li key={r.wave} className="flex justify-between gap-3">
              <span>Wave {r.wave}</span>
              <span>
                {r.time}
                {r.unsent ? (r.failed ? " — not sent" : " — sending") : " — synced"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Phone-first page for the start-line volunteer: three big buttons, one tap
// each, right when a wave's lead rider crosses. Captures the tap's timestamp
// immediately (before the network call, same principle as
// TimingTab.handleRecordFinish stamping before anything that can block) so a
// slow or dropped hotspot connection never skews the recorded start time —
// only when it's *sent* is uncertain, never *what time it was*.
export default function WaveStartView({
  token,
  raceLabel,
  initialWaveStarts,
}: WaveStartViewProps) {
  const [waveStarts, setWaveStarts] = useState<WaveStarts>(initialWaveStarts);
  const [pending, setPending] = useState<Partial<Record<Wave, PendingTap>>>(
    () => loadPending(token)
  );
  const [confirmArmed, setConfirmArmed] = useState<Wave | null>(null);
  const [clockCheck, setClockCheck] = useState<ClockCheckResult | null>(null);
  const [checkingClock, setCheckingClock] = useState(false);
  // When the cloud last answered, and whether the latest try failed. The wave
  // times already on screen are never cleared by a failure: a start-line phone
  // loses signal, and the buttons have to stay.
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [refreshFailing, setRefreshFailing] = useState(false);
  const refreshInFlightRef = useRef(false);
  // When this phone's own last tap finished sending. A reply to a refresh that
  // began before then may predate that tap and must not undo it.
  const lastPostOkAtRef = useRef(0);

  const armTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutsRef = useRef<Partial<Record<Wave, ReturnType<typeof setTimeout>>>>({});
  const retryAttemptsRef = useRef<Partial<Record<Wave, number>>>({});
  // Attempts on the wire, by wave and tap time, so a signal-returns retry
  // doesn't stack a second copy of one that is still in flight. Keyed by tap
  // time as well because a restart is a different tap and must not be blocked
  // by the one it replaces.
  const inFlightRef = useRef<Map<string, InFlightAttempt>>(new Map());
  // The unsent taps as of right now, kept in step with state by hand wherever
  // a tap is made, because an attempt starts in the same breath as the tap,
  // before React has rendered it.
  const pendingRef = useRef<Partial<Record<Wave, PendingTap>>>(pending);
  // The time of the newest tap made on this phone, per wave. A reply for an
  // older tap that arrives late must not put its time back on screen.
  const latestTapRef = useRef<Partial<Record<Wave, number>>>(
    Object.fromEntries(
      WAVES.filter((w) => pending[w]).map((w) => [w, pending[w]!.timestampMs])
    )
  );
  const mountedRef = useRef(false);

  const runClockCheck = useCallback(async () => {
    setCheckingClock(true);
    setClockCheck(await verifySystemClock());
    setCheckingClock(false);
  }, []);

  // Asks the cloud what every phone has sent, so a wave started on another
  // phone shows up here without a reload. Merges rather than replaces: a
  // failed or partial answer can only add to what's on screen.
  const refreshWaveStarts = useCallback(async () => {
    // One at a time. A timer and an `online` event can land together.
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const res = await fetch(
        `/api/wave-start?token=${encodeURIComponent(token)}`,
        { signal: controller.signal, cache: "no-store" }
      );
      const data = res.ok ? await res.json() : null;
      if (!data?.ok) throw new Error("refresh failed");
      setRefreshFailing(false);
      setLastRefreshedAt(Date.now());
      // A tap of this phone's finished while the request was out, so the
      // answer may be older than what the buttons show. Skip it; the next
      // refresh has the right answer.
      if (lastPostOkAtRef.current > startedAt) return;
      setWaveStarts((prev) => ({ ...prev, ...(data.waveStarts ?? {}) }));
    } catch {
      setRefreshFailing(true);
    } finally {
      clearTimeout(timeout);
      refreshInFlightRef.current = false;
    }
  }, [token]);

  useEffect(() => {
    runClockCheck();
    // Catches up in case this device successfully posted a wave start in an
    // earlier visit (different tab, or the page was left open across a
    // longer gap) — cheap, and removes any doubt about what SSR handed us.
    refreshWaveStarts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allStarted = WAVES.every((w) => !!waveStarts[w]);
  const allStartedRef = useRef(allStarted);
  allStartedRef.current = allStarted;

  // Keeps asking while the page is open. Each try is scheduled after the last
  // one ends, so a slow connection can't stack requests, and a failure just
  // means trying again at the next interval. Coming back online or returning
  // to the tab refreshes at once: phones throttle timers in the background
  // and nothing else says the signal is back.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timer = setTimeout(async () => {
        await refreshWaveStarts();
        if (!cancelled) schedule();
      }, allStartedRef.current ? REFRESH_SLOW_MS : REFRESH_MS);
    };
    schedule();

    const refreshNow = () => {
      if (document.visibilityState === "hidden") return;
      refreshWaveStarts();
    };
    window.addEventListener("online", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
    };
  }, [refreshWaveStarts]);

  // The one place unsent taps change. The record, the saved copy and the state
  // are written together from a value computed once, never inside a state
  // updater: updaters run when React chooses, and a tap made in between would
  // build on a record that is out of date.
  const commitPending = useCallback(
    (next: Partial<Record<Wave, PendingTap>>) => {
      pendingRef.current = next;
      savePending(token, next);
      setPending(next);
    },
    [token]
  );

  const attemptSend = useCallback(
    async (wave: Wave, timestampMs: number) => {
      if (!mountedRef.current) return;
      // A retry for a tap that has since been replaced (restarted) or already
      // confirmed must not go out: it would put an older time over the newer
      // one on the server.
      if (pendingRef.current[wave]?.timestampMs !== timestampMs) return;

      const attemptKey = `${wave}:${timestampMs}`;
      if (inFlightRef.current.has(attemptKey)) return;

      const existingTimeout = retryTimeoutsRef.current[wave];
      if (existingTimeout) clearTimeout(existingTimeout);

      const tries = retryAttemptsRef.current[wave] ?? 0;
      const attempt: InFlightAttempt = {
        controller: new AbortController(),
        startedAt: Date.now(),
        cancelled: false,
      };
      inFlightRef.current.set(attemptKey, attempt);
      const timeout = setTimeout(
        () => attempt.controller.abort(),
        SEND_TIMEOUTS_MS[Math.min(tries, SEND_TIMEOUTS_MS.length - 1)]
      );
      try {
        const res = await fetch("/api/wave-start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, wave, timestampMs }),
          signal: attempt.controller.signal,
        });
        if (!res.ok) throw new Error("send failed");
        const data = await res.json();
        lastPostOkAtRef.current = Date.now();

        // Show this reply only if no newer tap has been made since: when a
        // restart and the tap it replaced are both out, the replies can come
        // back in either order.
        if (timestampMs >= (latestTapRef.current[wave] ?? 0)) {
          setWaveStarts((prev) => ({ ...prev, [wave]: data.startedAt }));
        }
        // Clear this tap's own record only. A restart made meanwhile is a
        // newer tap with its own send still to come.
        if (pendingRef.current[wave]?.timestampMs === timestampMs) {
          const next = { ...pendingRef.current };
          delete next[wave];
          commitPending(next);
        }
      } catch {
        // Replaced on purpose, or the page is gone: nothing to retry.
        if (attempt.cancelled || !mountedRef.current) return;
        const current = pendingRef.current[wave];
        // The tap was replaced or confirmed while this was out.
        if (!current || current.timestampMs !== timestampMs) return;

        commitPending({
          ...pendingRef.current,
          [wave]: { ...current, failed: true },
        });
        const delay = Math.min(RETRY_BASE_MS * 2 ** tries, RETRY_MAX_MS);
        retryAttemptsRef.current[wave] = tries + 1;
        retryTimeoutsRef.current[wave] = setTimeout(
          () => attemptSend(wave, timestampMs),
          delay
        );
      } finally {
        clearTimeout(timeout);
        if (inFlightRef.current.get(attemptKey) === attempt) {
          inFlightRef.current.delete(attemptKey);
        }
      }
    },
    [token, commitPending]
  );

  // Sends every unsent tap now, instead of at the next backoff step. The signal
  // coming back, or the screen waking, is the moment that matters, and a phone
  // may have paused this page's timers for as long as it was away. A send that
  // has been out a while is stuck on a dead socket, so it is dropped and sent
  // afresh rather than waited on; a fresh one is left alone.
  const sendPendingNow = useCallback(() => {
    for (const wave of WAVES) {
      const tap = pendingRef.current[wave];
      if (!tap) continue;
      retryAttemptsRef.current[wave] = 0;
      const key = `${wave}:${tap.timestampMs}`;
      const inFlight = inFlightRef.current.get(key);
      if (inFlight) {
        if (Date.now() - inFlight.startedAt < HUNG_AFTER_MS) continue;
        inFlight.cancelled = true;
        inFlight.controller.abort();
        inFlightRef.current.delete(key);
      }
      attemptSend(wave, tap.timestampMs);
    }
  }, [attemptSend]);

  useEffect(() => {
    // The signal returning is worth a send even if the page is hidden: it may
    // still be alive. Waking the screen only counts once it is showing.
    const onVisible = () => {
      if (document.visibilityState !== "hidden") sendPendingNow();
    };
    window.addEventListener("online", sendPendingNow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", sendPendingNow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sendPendingNow]);

  // First among the effects: the resume effect below sends on mount, and a send
  // is skipped unless the page is marked as mounted.
  useEffect(() => {
    mountedRef.current = true;
    const retryTimeouts = retryTimeoutsRef.current;
    const inFlight = inFlightRef.current;
    return () => {
      // After this, a failing send must not schedule another retry.
      mountedRef.current = false;
      if (armTimeoutRef.current) clearTimeout(armTimeoutRef.current);
      Object.values(retryTimeouts).forEach((t) => t && clearTimeout(t));
      inFlight.forEach((a) => {
        a.cancelled = true;
        a.controller.abort();
      });
      inFlight.clear();
    };
  }, []);

  // Resume any tap that didn't finish sending before the last reload.
  useEffect(() => {
    for (const wave of WAVES) {
      const p = pending[wave];
      if (p) attemptSend(wave, p.timestampMs);
    }
    // Deliberately once on mount only — attemptSend reschedules itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = (wave: Wave) => {
    const alreadyStarted = !!waveStarts[wave] || !!pending[wave];

    if (alreadyStarted && confirmArmed !== wave) {
      setConfirmArmed(wave);
      if (armTimeoutRef.current) clearTimeout(armTimeoutRef.current);
      armTimeoutRef.current = setTimeout(() => setConfirmArmed(null), 6000);
      return;
    }

    // Capture the moment of the tap first — everything after this can be
    // slow (state updates, the network call) without touching the recorded
    // time.
    const timestampMs = Date.now();

    setConfirmArmed(null);
    retryAttemptsRef.current[wave] = 0;
    latestTapRef.current[wave] = timestampMs;
    commitPending({
      ...pendingRef.current,
      [wave]: { timestampMs, failed: false },
    });
    attemptSend(wave, timestampMs);
  };

  const clockSeverity = getClockSeverity(clockCheck);

  return (
    <div className="min-h-screen bg-moss-dark p-4 flex flex-col items-center">
      <div className="w-full max-w-md">
        <div className="text-center text-chalk pt-6 pb-4">
          <div className="font-mono text-xs tracking-[0.25em] uppercase opacity-80">
            C510
          </div>
          <h1 className="font-display uppercase tracking-tight text-2xl mt-1">
            {raceLabel}
          </h1>
          <div className="text-sm text-sand/90 mt-1">Wave start line</div>
        </div>

        {/* Clock check — compact, always visible so a bad phone clock is
            caught before the gun, not after. */}
        <div
          className={`rounded-lg p-3 mb-4 text-sm flex items-center gap-2 ${
            clockSeverity === "fine"
              ? "bg-success-soft text-moss-dark"
              : clockSeverity === "caution"
              ? "bg-warning-soft text-clay-dark"
              : clockSeverity === "alert"
              ? "bg-danger-soft text-danger"
              : "bg-chalk/90 text-ink-soft"
          }`}
        >
          {clockSeverity === "fine" ? (
            <CheckIcon className="w-4 h-4 shrink-0" />
          ) : (
            <WarningIcon className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1">
            {checkingClock
              ? "Checking phone clock..."
              : clockSeverity === "fine"
              ? "Phone clock OK"
              : clockSeverity === "unknown"
              ? "Can't verify phone clock — offline?"
              : `Phone clock is off by ~${clockCheck?.diffSeconds}s`}
          </span>
          <button
            onClick={runClockCheck}
            disabled={checkingClock}
            className="underline text-xs shrink-0"
          >
            Recheck
          </button>
        </div>

        {/* Whether the times below are current. The buttons stay either way. */}
        <div
          role="status"
          className={`text-xs text-center mb-3 ${
            refreshFailing ? "text-warning font-semibold" : "text-sand/70"
          }`}
        >
          {refreshFailing
            ? `Can't reach the server${
                lastRefreshedAt
                  ? ` — wave times as of ${formatTime(
                      new Date(lastRefreshedAt).toISOString()
                    )}`
                  : ""
              }. Taps still work and send when the signal is back.`
            : lastRefreshedAt
            ? `Wave times up to date as of ${formatTime(
                new Date(lastRefreshedAt).toISOString()
              )}`
            : "Checking wave times…"}
        </div>

        <div className="space-y-3">
          {WAVES.map((wave) => {
            const startedAt = waveStarts[wave];
            const tap = pending[wave];
            const armed = confirmArmed === wave;

            // An unsent tap outranks the server's time: it is the newer one,
            // and showing the old confirmed time instead made a restart made
            // offline look as though the tap had done nothing.
            let state: "idle" | "armed" | "sending" | "retrying" | "confirmed";
            if (armed) state = "armed";
            else if (tap) state = tap.failed ? "retrying" : "sending";
            else if (startedAt) state = "confirmed";
            else state = "idle";

            const displayTime = tap
              ? formatTime(new Date(tap.timestampMs).toISOString())
              : startedAt
              ? formatTime(startedAt)
              : null;
            const verb = tap && startedAt ? "Restarted" : "Started";

            return (
              <button
                key={wave}
                onClick={() => handleTap(wave)}
                className={`w-full rounded-xl p-5 text-left transition border-2 ${
                  state === "confirmed"
                    ? "bg-success-soft border-success"
                    : state === "armed"
                    ? "bg-warning-soft border-warning"
                    : state === "retrying"
                    ? "bg-danger-soft border-danger/60"
                    : state === "sending"
                    ? "bg-sand border-ink/10"
                    : "bg-chalk border-ink/10 active:border-clay"
                }`}
              >
                <div className="font-display uppercase tracking-tight text-2xl text-moss-dark">
                  Wave {wave}
                </div>
                {state === "idle" && (
                  <div className="text-ink-soft mt-1">Tap when the lead rider crosses</div>
                )}
                {state === "armed" && (
                  <div className="text-clay-dark font-semibold mt-1">
                    Already started at {displayTime} — tap again to restart
                  </div>
                )}
                {state === "sending" && (
                  <div className="text-ink-soft mt-1">
                    {verb} at {displayTime} — sending...
                  </div>
                )}
                {state === "retrying" && (
                  <div className="text-danger font-semibold mt-1">
                    {verb} at {displayTime} — not sent yet, retrying...
                  </div>
                )}
                {state === "confirmed" && (
                  <div className="text-moss-dark font-semibold mt-1">
                    Started at {displayTime}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <SyncStatusBox
          rows={WAVES.filter((w) => pending[w] || waveStarts[w]).map((w) => ({
            wave: w,
            time: formatTime(
              pending[w]
                ? new Date(pending[w]!.timestampMs).toISOString()
                : waveStarts[w]!
            ),
            unsent: !!pending[w],
            failed: !!pending[w]?.failed,
          }))}
        />

        <p className="text-sand/70 text-xs text-center mt-6 pb-6">
          Each button records the moment you tap it. Tap a wave twice to
          correct its start time.
        </p>
      </div>
    </div>
  );
}
