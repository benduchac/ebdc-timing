"use client";

import { useState, useEffect } from "react";
import { formatDurationHMS } from "@/lib/utils";

interface WaveTimeEditModalProps {
  wave: "A" | "B" | "C";
  currentTime: Date;
  affectedEntries: number;
  onSave: (newTime: string) => void;
  onClose: () => void;
}

export default function WaveTimeEditModal({
  wave,
  currentTime,
  affectedEntries,
  onSave,
  onClose,
}: WaveTimeEditModalProps) {
  const [newTime, setNewTime] = useState("");

  useEffect(() => {
    const hours = String(currentTime.getHours()).padStart(2, "0");
    const minutes = String(currentTime.getMinutes()).padStart(2, "0");
    const seconds = String(currentTime.getSeconds()).padStart(2, "0");
    setNewTime(`${hours}:${minutes}:${seconds}`);
  }, [currentTime]);

  const handleSave = () => {
    if (!newTime) {
      alert("Please enter a valid start time!");
      return;
    }
    onSave(newTime);
  };

  const getTimeDiff = () => {
    if (!newTime) return null;

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const oldTime = currentTime.getTime();
    const newDateTime = new Date(`${dateStr}T${newTime}`).getTime();
    const diffMs = newDateTime - oldTime;
    const diffSec = Math.abs(Math.floor(diffMs / 1000));
    const direction = diffMs > 0 ? "later" : "earlier";

    return { diffSec, direction };
  };

  const timeDiff = getTimeDiff();

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
      <div className="bg-chalk rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="font-display uppercase tracking-tight text-xl mb-4 text-moss-dark">
          Edit wave {wave} start time
        </h2>

        <div className="mb-4 p-3 bg-warning-soft border-2 border-warning/50 rounded-lg">
          <div className="font-bold text-clay-dark mb-1">Important</div>
          <div className="text-sm text-ink-soft">
            Changing this will recalculate{" "}
            <strong>{affectedEntries} existing entries</strong> for Wave {wave}.
            All elapsed times will be updated based on the new start time.
          </div>
        </div>

        <div className="mb-4 p-3 bg-sand rounded-lg">
          <div className="text-sm font-semibold text-ink-soft mb-1">
            Current start time:
          </div>
          <div className="text-xl font-mono font-bold text-ink tabular-nums">
            {currentTime.toLocaleTimeString("en-US", { hour12: true })}
          </div>
        </div>

        <div className="mb-4">
          <label className="block mb-2 font-semibold text-sm text-ink-soft">
            New start time (HH:MM:SS)
          </label>
          <input
            type="time"
            step="1"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="w-full p-3 text-lg font-mono border-2 border-clay/40 bg-sand rounded-lg focus:border-clay focus:outline-none"
          />

          {timeDiff && timeDiff.diffSec > 0 && (
            <div className="mt-2 text-sm text-ink-soft">
              This is{" "}
              <strong>
                {formatDurationHMS(timeDiff.diffSec)} {timeDiff.direction}
              </strong>{" "}
              than current
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-clay text-chalk rounded-lg font-bold hover:bg-clay-dark transition"
          >
            Update &amp; recalculate
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-ink/15 text-ink rounded-lg font-bold hover:bg-ink/25 transition"
          >
            Cancel
          </button>
        </div>

        <div className="mt-3 text-xs text-ink-soft text-center">
          Use this when start line crew radios the actual wave release time
        </div>
      </div>
    </div>
  );
}
