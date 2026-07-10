"use client";

import type { ClockCheckResult } from "@/lib/types";
import { getClockSeverity } from "@/lib/utils";

interface SetupChecklistProps {
  registrantCount: number;
  clockCheck: ClockCheckResult | null;
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

// Registration-tab-only setup checklist — three actionable panels, each
// completable without leaving this screen. Collapses to a single calm line
// once all three are done. Deliberately doesn't include sync status: that
// already has a permanent home in SyncBadge, and duplicating it here (as an
// earlier version of this component did) was just confusing — same signal,
// unlabeled, right next to the real one. See docs/race-readiness-design.md.
export default function SetupChecklist({
  registrantCount,
  clockCheck,
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

  const allDone = registrantsLoaded && clockFine && waveTimesConfirmed;

  if (allDone) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 text-sm text-green-800">
        ✓ Setup complete — {registrantCount} registrant
        {registrantCount !== 1 ? "s" : ""}, wave times set, clock verified
      </div>
    );
  }

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
          {clockFine && `Verified — off by ${clockCheck?.diffSeconds}s`}
          {clockProblem &&
            `Off by ${clockCheck?.diffSeconds}s — every finish time will be wrong by about this much`}
          {clockSeverity === "unknown" &&
            (checkingClock ? "Checking…" : "Not checked yet")}
        </div>
        <button
          onClick={onCheckClock}
          disabled={checkingClock}
          className="w-full py-1.5 bg-purple-600 text-white rounded font-semibold text-sm hover:bg-purple-700 disabled:opacity-50"
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
          className="w-full py-1.5 bg-purple-600 text-white rounded font-semibold text-sm hover:bg-purple-700"
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
        <button
          onClick={onOpenWaveTimesModal}
          className="w-full py-1.5 bg-purple-600 text-white rounded font-semibold text-sm hover:bg-purple-700"
        >
          🕒 {waveTimesConfirmed ? "Edit" : "Set"} Wave Times
        </button>
      </div>
    </div>
  );
}
