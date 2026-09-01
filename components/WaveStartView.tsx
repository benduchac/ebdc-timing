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

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour12: true });

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

  const armTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutsRef = useRef<Partial<Record<Wave, ReturnType<typeof setTimeout>>>>({});
  const retryAttemptsRef = useRef<Partial<Record<Wave, number>>>({});

  const runClockCheck = useCallback(async () => {
    setCheckingClock(true);
    setClockCheck(await verifySystemClock());
    setCheckingClock(false);
  }, []);

  useEffect(() => {
    runClockCheck();
    // Catches up in case this device successfully posted a wave start in an
    // earlier visit (different tab, or the page was left open across a
    // longer gap) — cheap, and removes any doubt about what SSR handed us.
    fetch(`/api/wave-start?token=${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok) setWaveStarts(data.waveStarts ?? {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attemptSend = useCallback(
    async (wave: Wave, timestampMs: number) => {
      const existingTimeout = retryTimeoutsRef.current[wave];
      if (existingTimeout) clearTimeout(existingTimeout);

      try {
        const res = await fetch("/api/wave-start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, wave, timestampMs }),
        });
        if (!res.ok) throw new Error("send failed");
        const data = await res.json();

        setWaveStarts((prev) => ({ ...prev, [wave]: data.startedAt }));
        setPending((prev) => {
          const next = { ...prev };
          delete next[wave];
          savePending(token, next);
          return next;
        });
      } catch {
        setPending((prev) => {
          const current = prev[wave];
          // The tap may have been superseded (reset+retapped) while this
          // attempt was in flight — don't resurrect a stale one.
          if (!current || current.timestampMs !== timestampMs) return prev;
          const next = { ...prev, [wave]: { ...current, failed: true } };
          savePending(token, next);
          return next;
        });
        const attempt = retryAttemptsRef.current[wave] ?? 0;
        retryAttemptsRef.current[wave] = attempt + 1;
        const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
        retryTimeoutsRef.current[wave] = setTimeout(
          () => attemptSend(wave, timestampMs),
          delay
        );
      }
    },
    [token]
  );

  // Resume any tap that didn't finish sending before the last reload.
  useEffect(() => {
    for (const wave of WAVES) {
      const p = pending[wave];
      if (p) attemptSend(wave, p.timestampMs);
    }
    // Deliberately once on mount only — attemptSend reschedules itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const retryTimeouts = retryTimeoutsRef.current;
    return () => {
      if (armTimeoutRef.current) clearTimeout(armTimeoutRef.current);
      Object.values(retryTimeouts).forEach((t) => t && clearTimeout(t));
    };
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
    setPending((prev) => {
      const next = { ...prev, [wave]: { timestampMs, failed: false } };
      savePending(token, next);
      return next;
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

        <div className="space-y-3">
          {WAVES.map((wave) => {
            const startedAt = waveStarts[wave];
            const tap = pending[wave];
            const armed = confirmArmed === wave;

            let state: "idle" | "armed" | "sending" | "retrying" | "confirmed";
            if (armed) state = "armed";
            else if (startedAt) state = "confirmed";
            else if (tap?.failed) state = "retrying";
            else if (tap) state = "sending";
            else state = "idle";

            const displayTime = startedAt
              ? formatTime(startedAt)
              : tap
              ? formatTime(new Date(tap.timestampMs).toISOString())
              : null;

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
                    Started at {displayTime} — sending...
                  </div>
                )}
                {state === "retrying" && (
                  <div className="text-danger font-semibold mt-1">
                    Started at {displayTime} — not sent yet, retrying...
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

        <p className="text-sand/70 text-xs text-center mt-6 pb-6">
          Each button records the moment you tap it. Tap a wave twice to
          correct its start time.
        </p>
      </div>
    </div>
  );
}
