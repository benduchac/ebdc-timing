"use client";

import { useState, useEffect } from "react";
import type { Entry, Registrant } from "@/lib/types";
import { formatElapsedTime, normalizeBib } from "@/lib/utils";

interface EditModalProps {
  entry: Entry | null;
  registrants: Map<string, Registrant>;
  waveStartTimes: { A: Date; B: Date; C: Date };
  onSave: (updatedEntry: Entry) => void;
  onClose: () => void;
}

export default function EditModal({
  entry,
  registrants,
  waveStartTimes,
  onSave,
  onClose,
}: EditModalProps) {
  const [editBib, setEditBib] = useState("");
  const [editWave, setEditWave] = useState<"A" | "B" | "C">("A");
  const [editFinishTime, setEditFinishTime] = useState("");
  const [lookedUpRider, setLookedUpRider] = useState<Registrant | null>(null);

  useEffect(() => {
    if (entry) {
      setEditBib(entry.bib);
      setEditWave(entry.wave || "A");

      // Convert finish time to HH:MM:SS format
      const finishDate = new Date(entry.finishTimeMs);
      const hours = String(finishDate.getHours()).padStart(2, "0");
      const minutes = String(finishDate.getMinutes()).padStart(2, "0");
      const seconds = String(finishDate.getSeconds()).padStart(2, "0");
      setEditFinishTime(`${hours}:${minutes}:${seconds}`);

      // Set initial looked-up rider
      const rider = registrants.get(entry.bib);
      setLookedUpRider(rider || null);
    }
  }, [entry, registrants]);

  // Lookup rider as bib changes
  // Lookup rider as bib changes
  useEffect(() => {
    if (editBib) {
      const rider = registrants.get(normalizeBib(editBib));
      setLookedUpRider(rider || null);

      // ✅ Auto-update wave to match the looked-up rider
      if (rider) {
        setEditWave(rider.wave);
      }
    } else {
      setLookedUpRider(null);
    }
  }, [editBib, registrants]);

  if (!entry) return null;

  const handleSave = () => {
    const normalizedBib = normalizeBib(editBib);
    const rider = registrants.get(normalizedBib);

    // Use the ORIGINAL date from the entry, not today's date
    const originalDate = new Date(entry.finishTimeMs);
    const year = originalDate.getFullYear();
    const month = String(originalDate.getMonth() + 1).padStart(2, "0");
    const day = String(originalDate.getDate()).padStart(2, "0");

    // Build new datetime with same date, new time
    const newFinishDate = new Date(`${year}-${month}-${day}T${editFinishTime}`);

    const updatedEntry: Entry = {
      ...entry,
      bib: normalizedBib,
      wave: editWave,
      firstName: rider ? rider.firstName : "Unknown",
      lastName: rider ? rider.lastName : "Rider",
      finishTimeMs: newFinishDate.getTime(),
      finishTime: newFinishDate.toLocaleTimeString("en-US", { hour12: true }),
      elapsedMs: newFinishDate.getTime() - waveStartTimes[editWave].getTime(),
      elapsedTime: formatElapsedTime(
        newFinishDate.getTime() - waveStartTimes[editWave].getTime()
      ),
    };

    onSave(updatedEntry);
  };

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
      <div className="bg-chalk rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="font-display uppercase tracking-tight text-xl mb-2 text-moss-dark">
          Edit entry #{entry.id}
        </h2>

        {/* Show current rider name if known */}
        {entry.firstName !== "Unknown" && (
          <div className="mb-4 p-3 bg-sand border border-ink/10 rounded-lg">
            <div className="text-sm text-ink-soft font-semibold">
              Currently:
            </div>
            <div className="text-lg font-bold text-ink">
              {entry.firstName} {entry.lastName}
            </div>
            <div className="text-sm text-ink-soft">
              Bib #{entry.bib} · Wave {entry.wave || "Unknown"}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Bib Number field */}
          <div>
            <label className="block mb-2 font-semibold text-sm text-ink-soft">
              Bib number
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={editBib}
              onChange={(e) => setEditBib(e.target.value)}
              className="w-full p-2 border-2 border-ink/15 bg-sand rounded-lg focus:border-clay focus:outline-none"
            />

            {/* Show live lookup results */}
            {editBib && (
              <div className="mt-2">
                {lookedUpRider ? (
                  <div className="p-2 bg-success-soft border border-success/40 rounded">
                    <div className="text-sm font-medium text-moss-dark">
                      {lookedUpRider.firstName} {lookedUpRider.lastName}
                    </div>
                    <div className="text-xs text-ink-soft">
                      Wave {lookedUpRider.wave}
                    </div>
                  </div>
                ) : editBib.startsWith("UNK-") ? (
                  <div className="p-2 bg-sand border border-ink/10 rounded text-sm text-ink-soft">
                    Unknown rider - will need manual lookup post-race
                  </div>
                ) : (
                  <div className="p-2 bg-warning-soft border border-warning/40 rounded text-sm text-clay-dark">
                    Bib not found in registration
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-ink-soft mt-1 italic">
              Changing bib updates rider info
            </p>
          </div>

          {/* Wave selection */}
          <div>
            <label className="block mb-2 font-semibold text-sm text-ink-soft">
              Wave
            </label>
            <div className="flex gap-2">
              {(["A", "B", "C"] as const).map((wave) => (
                <button
                  key={wave}
                  onClick={() => setEditWave(wave)}
                  className={`flex-1 py-2 rounded-lg font-bold transition ${
                    editWave === wave
                      ? "bg-moss text-chalk"
                      : "bg-sand text-ink-soft hover:bg-ink/10"
                  }`}
                >
                  {wave}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-soft mt-1 italic">
              Changing wave recalculates elapsed time
            </p>
          </div>

          {/* Finish Time */}
          <div>
            <label className="block mb-2 font-semibold text-sm text-ink-soft">
              Finish time (HH:MM:SS)
            </label>
            <input
              type="time"
              step="1"
              value={editFinishTime}
              onChange={(e) => setEditFinishTime(e.target.value)}
              className="w-full p-2 border-2 border-ink/15 bg-sand rounded-lg focus:border-clay focus:outline-none"
            />
            <p className="text-xs text-clay-dark mt-1 italic">
              Only change if you have photo timestamp proof
            </p>
          </div>
        </div>

        {/* Button footer */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 py-2 bg-clay text-chalk rounded-lg font-bold hover:bg-clay-dark"
          >
            Save changes
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-ink/15 text-ink rounded-lg font-bold hover:bg-ink/25"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
