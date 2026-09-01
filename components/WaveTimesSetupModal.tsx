"use client";

import { useState } from "react";
import LinkWithCopy from "@/components/LinkWithCopy";

interface WaveTimesSetupModalProps {
  currentTimes: { A: Date; B: Date; C: Date };
  startToken?: string;
  onSave: (times: { A: string; B: string; C: string }) => void;
  onClose: () => void;
}

const toTimeString = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}:${String(d.getSeconds()).padStart(2, "0")}`;

// Setup-time entry for all three waves at once — deliberately distinct from
// WaveTimeEditModal (Timing tab), which is for correcting one wave mid/post-
// race and explicitly warns about recalculating existing entries. This one
// is for "give me your best estimate before the race starts," usually
// before any entries exist at all.
export default function WaveTimesSetupModal({
  currentTimes,
  startToken,
  onSave,
  onClose,
}: WaveTimesSetupModalProps) {
  const [times, setTimes] = useState({
    A: toTimeString(currentTimes.A),
    B: toTimeString(currentTimes.B),
    C: toTimeString(currentTimes.C),
  });

  const handleSave = () => {
    if (!times.A || !times.B || !times.C) {
      alert("Please enter a start time for every wave.");
      return;
    }
    onSave(times);
  };

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
      <div className="bg-chalk rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="font-display uppercase tracking-tight text-xl mb-2 text-moss-dark">
          Set wave start times
        </h2>
        <p className="text-sm text-ink-soft mb-4">
          Best estimates are fine — these can be changed later, and any
          finishers already recorded will be recalculated automatically.
        </p>

        <div className="space-y-3 mb-6">
          {(["A", "B", "C"] as const).map((wave) => (
            <div key={wave}>
              <label className="block mb-1 font-semibold text-sm text-ink-soft">
                Wave {wave}
              </label>
              <input
                type="time"
                step="1"
                value={times[wave]}
                onChange={(e) =>
                  setTimes({ ...times, [wave]: e.target.value })
                }
                className="w-full p-2 text-lg font-mono border-2 border-clay/40 bg-sand rounded-lg focus:border-clay focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-clay text-chalk rounded-lg font-bold hover:bg-clay-dark transition"
          >
            Save wave times
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-ink/15 text-ink rounded-lg font-bold hover:bg-ink/25 transition"
          >
            Cancel
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-ink/10">
          <div className="text-xs font-semibold text-ink-soft mb-1">
            Wave start line
          </div>
          {startToken ? (
            <LinkWithCopy
              path={`/start/${startToken}`}
              copyTitle="Copy wave-start link"
            />
          ) : (
            <div className="text-xs text-ink-soft">
              Link pending first sync — connect to the internet once to
              generate it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
