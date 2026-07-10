"use client";

import { useEffect, useState } from "react";
import type { ClockCheckResult } from "@/lib/types";
import {
  getClockSeverity,
  formatRelativeTime,
  TIME_SOURCE_LABEL,
} from "@/lib/utils";

interface SetupChecklistProps {
  registrantCount: number;
  clockCheck: ClockCheckResult | null;
  clockCheckedAt: number | null;
  checkingClock: boolean;
  onCheckClock: () => void;
  waveStartTimes: { A: Date; B: Date; C: Date };
  waveTimesConfirmed: boolean;
  onOpenWaveTimesModal: () => void;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Green, light-weight secondary style — these are routine setup actions, not
// primary calls to action, so a heavy solid button read as too visually loud.
const ACTION_BUTTON =
  "w-full py-1.5 bg-green-100 text-green-800 rounded font-semibold text-sm hover:bg-green-200 disabled:opacity-50 disabled:hover:bg-green-100";

// Registration-tab-only setup checklist — three actionable panels, each
// completable without leaving this screen. Collapses to a single calm line
// once all three are done. Deliberately doesn't include sync status: that
// already has a permanent home in SyncBadge, and duplicating it here (as an
// earlier version of this component did) was just confusing — same signal,
// unlabeled, right next to the real one. See docs/race-readiness-design.md.
export default function SetupChecklist({
  registrantCount,
  clockCheck,
  clockCheckedAt,
  checkingClock,
  onCheckClock,
  waveStartTimes,
  waveTimesConfirmed,
  onOpenWaveTimesModal,
}: SetupChecklistProps) {
  const registrantsLoaded = registrantCount > 0;
  const clockSeverity = getClockSeverity(clockCheck);
  const clockFine = clockSeverity === "fine";
  const clockProblem =
    clockSeverity === "caution" || clockSeverity === "alert";

  // Re-render periodically so the clock panel's "Xs/Xm ago" stays current
  // without needing a state change to trigger it.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const allDone = registrantsLoaded && clockFine && waveTimesConfirmed;

  if (allDone) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 text-sm text-green-800">
        ✓ Setup complete — {registrantCount} registrant
        {registrantCount !== 1 ? "s" : ""}, wave times set, clock verified
      </div>
    );
  }

  const clockDetail = (): string => {
    if (clockSeverity === "unknown") {
      return checkingClock ? "Checking…" : "Not checked yet";
    }
    const checkedAgo =
      clockCheckedAt !== null ? ` ${formatRelativeTime(clockCheckedAt, now)}` : "";
    const base = `Verified via ${TIME_SOURCE_LABEL}${checkedAgo} — off by ${clockCheck?.diffSeconds}s`;
    return clockProblem
      ? `${base}. Every finish time will be wrong by about this much.`
      : base;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      {/* 1. Clock */}
      <div
        className={`rounded-lg border-2 p-3 ${
          clockProblem
            ? "bg-red-50 border-red-300"
            : clockFine
            ? "bg-green-50 border-green-300"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className="font-bold text-sm mb-1">
          {clockFine ? "✓" : clockProblem ? "⚠" : "○"} 1. Check Clock
        </div>
        <div className="text-xs text-gray-600 mb-2 min-h-[2.5em]">
          {clockDetail()}
        </div>
        <button
          onClick={onCheckClock}
          disabled={checkingClock}
          className={ACTION_BUTTON}
        >
          {checkingClock
            ? "Checking…"
            : clockSeverity === "unknown"
            ? "Check Now"
            : "Recheck"}
        </button>
      </div>

      {/* 2. Registrants */}
      <div
        className={`rounded-lg border-2 p-3 ${
          registrantsLoaded
            ? "bg-green-50 border-green-300"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className="font-bold text-sm mb-1">
          {registrantsLoaded ? "✓" : "○"} 2. Load Registrants
        </div>
        <div className="text-xs text-gray-600 mb-2 min-h-[2.5em]">
          {registrantsLoaded
            ? `${registrantCount} loaded`
            : "Upload a CSV to get started"}
        </div>
        <button
          onClick={() => document.getElementById("csvInput")?.click()}
          className={ACTION_BUTTON}
        >
          📄 Upload CSV
        </button>
      </div>

      {/* 3. Wave times */}
      <div
        className={`rounded-lg border-2 p-3 ${
          waveTimesConfirmed
            ? "bg-green-50 border-green-300"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className="font-bold text-sm mb-1">
          {waveTimesConfirmed ? "✓" : "○"} 3. Set Wave Times
        </div>
        <div className="text-xs text-gray-600 mb-2 min-h-[2.5em]">
          {waveTimesConfirmed
            ? `A ${formatTime(waveStartTimes.A)} · B ${formatTime(
                waveStartTimes.B
              )} · C ${formatTime(waveStartTimes.C)}`
            : "Estimates are fine — adjust later as needed"}
        </div>
        <button onClick={onOpenWaveTimesModal} className={ACTION_BUTTON}>
          🕒 {waveTimesConfirmed ? "Edit" : "Set"} Wave Times
        </button>
      </div>
    </div>
  );
}
