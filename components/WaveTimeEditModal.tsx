"use client";

import { useState, useEffect } from "react";

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4 text-purple-600">
          ✏️ Edit Wave {wave} Start Time
        </h2>

        <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
          <div className="font-bold text-yellow-800 mb-1">⚠️ Important</div>
          <div className="text-sm text-yellow-700">
            Changing this will recalculate{" "}
            <strong>{affectedEntries} existing entries</strong> for Wave {wave}.
            All elapsed times will be updated based on the new start time.
          </div>
        </div>

        <div className="mb-4 p-3 bg-gray-100 rounded-lg">
          <div className="text-sm font-semibold text-gray-600 mb-1">
            Current Start Time:
          </div>
          <div className="text-xl font-mono font-bold text-gray-800">
            {currentTime.toLocaleTimeString("en-US", { hour12: true })}
          </div>
        </div>

        <div className="mb-4">
          <label className="block mb-2 font-bold text-sm">
            New Start Time (HH:MM:SS)
          </label>
          <input
            type="time"
            step="1"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="w-full p-3 text-lg font-mono border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:outline-none"
          />

          {timeDiff && timeDiff.diffSec > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              📊 This is{" "}
              <strong>
                {timeDiff.diffSec} seconds {timeDiff.direction}
              </strong>{" "}
              than current
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition"
          >
            Update & Recalculate
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-300 text-gray-800 rounded-lg font-bold hover:bg-gray-400 transition"
          >
            Cancel
          </button>
        </div>

        <div className="mt-3 text-xs text-gray-500 text-center">
          💡 Use this when start line crew radios the actual wave release time
        </div>
      </div>
    </div>
  );
}
