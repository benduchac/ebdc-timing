"use client";

import { useState, useEffect, useRef } from "react";
import type { Registrant, Entry } from "@/lib/types";
import { formatElapsedTime, normalizeBib } from "@/lib/utils";
import WaveStatusBoxes from "./WaveStatusBoxes";
import TopTenLeaderboard from "./TopTenLeaderboard";
import BibChip from "./BibChip";
import TimeChip from "./TimeChip";
import { EditIcon, TrashIcon, WarningIcon } from "./icons";

interface TimingTabProps {
  waveStartTimes: { A: Date; B: Date; C: Date };
  registrants: Map<string, Registrant>;
  entries: Entry[];
  onRecordEntry: (entry: Omit<Entry, "id">) => void;
  onEditEntry: (id: number) => void;
  onDeleteEntry: (id: number) => void;
  onExportCSV: () => void;
  onEditWaveTime: (wave: "A" | "B" | "C") => void;
}

export default function TimingTab({
  waveStartTimes,
  registrants,
  entries,
  onRecordEntry,
  onEditEntry,
  onDeleteEntry,
  onExportCSV,
  onEditWaveTime,
}: TimingTabProps) {
  const [bibNumber, setBibNumber] = useState("");
  const [riderInfo, setRiderInfo] = useState<Registrant | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const bibInputRef = useRef<HTMLInputElement>(null);

  // Helper to check if a bib is duplicated
  const isDuplicateBib = (bib: string): boolean => {
    return entries.filter((e) => e.bib === bib).length > 1;
  };

  // Auto-focus bib input
  useEffect(() => {
    bibInputRef.current?.focus();
  }, [entries.length]);

  // Lookup rider as user types
  useEffect(() => {
    if (!bibNumber) {
      setRiderInfo(null);
      setErrorMessage("");
      return;
    }

    const normalizedBib = normalizeBib(bibNumber);
    const rider = registrants.get(normalizedBib);

    // Check for duplicate
    const existingEntry = entries.find((e) => e.bib === normalizedBib);

    if (rider) {
      setRiderInfo(rider);
      if (existingEntry) {
        const existingTime = new Date(
          existingEntry.finishTimeMs
        ).toLocaleTimeString("en-US", { hour12: true });
        setErrorMessage(
          `DUPLICATE! Bib #${normalizedBib} already finished at ${existingTime}. Press Enter to record again, or fix bib number.`
        );
      } else {
        setErrorMessage("");
      }
    } else {
      setRiderInfo(null);
      if (existingEntry) {
        const existingTime = new Date(
          existingEntry.finishTimeMs
        ).toLocaleTimeString("en-US", { hour12: true });
        setErrorMessage(
          `DUPLICATE! Bib #${normalizedBib} already finished at ${existingTime}. Press Enter to record again, or fix bib number.`
        );
      } else {
        setErrorMessage(
          `Bib #${normalizedBib} not found in registration. Entry will still be recorded.`
        );
      }
    }
  }, [bibNumber, registrants, entries]);

  const handleRecordFinish = () => {
    if (!bibNumber.trim()) {
      alert("Please enter a bib number!");
      bibInputRef.current?.focus();
      return;
    }

    const normalizedBib = normalizeBib(bibNumber);

    // Check for duplicate bib
    const existingEntry = entries.find((e) => e.bib === normalizedBib);
    if (existingEntry) {
      const confirmed = confirm(
        `Record duplicate bib #${normalizedBib} again?\n\n` +
          `OK = Record duplicate\n` +
          `Cancel = Fix bib number`
      );

      if (!confirmed) {
        bibInputRef.current?.select();
        return;
      }
    }

    const now = new Date();
    const rider = registrants.get(normalizedBib);

    const wave = rider ? rider.wave : null;
    const firstName = rider ? rider.firstName : "Unknown";
    const lastName = rider ? rider.lastName : "Rider";

    const entry: Omit<Entry, "id"> = {
      bib: normalizedBib,
      wave,
      firstName,
      lastName,
      finishTime: now.toLocaleTimeString("en-US", { hour12: true }),
      finishTimeMs: now.getTime(),
      elapsedTime: wave
        ? formatElapsedTime(now.getTime() - waveStartTimes[wave].getTime())
        : "N/A",
      elapsedMs: wave ? now.getTime() - waveStartTimes[wave].getTime() : null,
      timestamp: now.toISOString(),
    };

    onRecordEntry(entry);
    setBibNumber("");
    setRiderInfo(null);
    setErrorMessage("");
  };

  const handleUnknownFinisher = () => {
    const now = new Date();
    const unknownCount = entries.filter((e) => e.bib.startsWith("UNK-")).length;

    const entry: Omit<Entry, "id"> = {
      bib: `UNK-${unknownCount + 1}`,
      wave: null,
      firstName: "Unknown",
      lastName: "Rider",
      finishTime: now.toLocaleTimeString("en-US", { hour12: true }),
      finishTimeMs: now.getTime(),
      elapsedTime: "N/A",
      elapsedMs: null,
      timestamp: now.toISOString(),
    };

    onRecordEntry(entry);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRecordFinish();
    } else if (e.key === "u" || e.key === "U") {
      if (bibNumber === "") {
        handleUnknownFinisher();
      }
    }
  };

  // Get last 10 entries
  const recentEntries = [...entries].reverse().slice(0, 10);

  return (
    <div>
      {/* Wave Status Boxes */}
      <WaveStatusBoxes
        waveStartTimes={waveStartTimes}
        entries={entries}
        registrants={registrants}
        onEditWaveTime={onEditWaveTime}
      />

      {/* Two-column layout: Main timing on left, Top Ten on right */}
      <div className="flex flex-col lg:flex-row gap-4 mb-4">
        {/* Left column - Main timing interface */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* Input Section */}
          <div className="bg-sand border border-ink/10 rounded-lg p-4">
            <label className="block mb-2 font-semibold text-sm text-ink-soft">
              Bib number
            </label>
            <input
              ref={bibInputRef}
              type="text"
              inputMode="numeric"
              value={bibNumber}
              onChange={(e) => setBibNumber(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Enter bib number"
              className="w-full p-3 text-lg font-mono border-2 border-ink rounded-lg bg-chalk focus:border-clay focus:outline-none"
            />

            {/* Rider Info */}
            {riderInfo && (
              <div className="mt-3 bg-success-soft border-2 border-success rounded-lg p-3">
                <div className="text-xl font-bold text-moss-dark">
                  {riderInfo.firstName} {riderInfo.lastName}
                </div>
                <div className="text-ink-soft">
                  Wave {riderInfo.wave} · Bib #{riderInfo.bib}
                </div>
              </div>
            )}

            {/* Error/Warning Message */}
            {errorMessage && (
              <div
                className={`mt-3 border-2 rounded-lg p-3 font-semibold text-sm flex items-start gap-2 ${
                  errorMessage.includes("DUPLICATE")
                    ? "bg-warning-soft border-warning text-clay-dark"
                    : "bg-warning-soft border-warning/60 text-ink-soft"
                }`}
              >
                <WarningIcon className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Record Button */}
            <button
              onClick={handleRecordFinish}
              className="w-full mt-3 py-4 text-xl font-bold bg-success text-chalk rounded-lg hover:opacity-90 transition"
            >
              Record finish (Enter)
            </button>

            {/* Unknown Button */}
            <button
              onClick={handleUnknownFinisher}
              className="w-full mt-2 py-3 text-base font-semibold border-2 border-warning text-clay-dark rounded-lg hover:bg-warning-soft transition"
            >
              Unknown finisher (U)
            </button>
          </div>

          {/* Recent Finishers */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-display uppercase tracking-tight text-lg text-moss-dark">
                Recent finishers
              </h3>
              <button
                onClick={onExportCSV}
                className="px-3 py-1 bg-success text-chalk rounded font-semibold text-sm hover:opacity-90 transition"
              >
                Export CSV
              </button>
            </div>
            <div className="bg-chalk border border-ink/10 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-moss text-chalk">
                  <tr>
                    <th className="p-2 text-left font-semibold">Bib</th>
                    <th className="p-2 text-left font-semibold">Name</th>
                    <th className="p-2 text-left font-semibold">Wave</th>
                    <th className="p-2 text-left font-semibold">Time</th>
                    <th className="p-2 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-ink-soft">
                        No finishers yet. Record your first finish!
                      </td>
                    </tr>
                  ) : (
                    recentEntries.map((entry) => {
                      const isDuplicate = isDuplicateBib(entry.bib);

                      return (
                        <tr
                          key={entry.id}
                          className={`border-b border-ink/10 hover:bg-sand/60 ${
                            isDuplicate
                              ? "bg-warning-soft border-l-4 border-l-warning"
                              : ""
                          }`}
                        >
                          <td className="p-2">
                            <span className="inline-flex items-center gap-1">
                              {isDuplicate && (
                                <WarningIcon className="w-3.5 h-3.5 text-warning" />
                              )}
                              <BibChip bib={entry.bib} className="text-xs" />
                            </span>
                          </td>
                          <td className="p-2">
                            {entry.firstName} {entry.lastName}
                          </td>
                          <td className="p-2">
                            {entry.wave ? (
                              `Wave ${entry.wave}`
                            ) : (
                              <span className="text-clay-dark font-semibold">
                                Unknown
                              </span>
                            )}
                          </td>
                          <td className="p-2">
                            <TimeChip className="text-xs">
                              {entry.finishTime}
                            </TimeChip>
                          </td>
                          <td className="p-2">
                            <button
                              onClick={() => onEditEntry(entry.id)}
                              className="text-moss hover:text-moss-dark mr-2 inline-block align-middle"
                              title="Edit"
                            >
                              <EditIcon />
                            </button>
                            <button
                              onClick={() => onDeleteEntry(entry.id)}
                              className="text-danger hover:opacity-70 inline-block align-middle"
                              title="Delete"
                            >
                              <TrashIcon />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Top Ten Leaderboard */}
        <div className="lg:w-80 shrink-0">
          <TopTenLeaderboard entries={entries} />
        </div>
      </div>

      {/* Registrant count reminder */}
      {registrants.size === 0 && (
        <div className="bg-warning-soft border-2 border-warning rounded-lg p-3 text-center text-clay-dark font-semibold flex items-center justify-center gap-2">
          <WarningIcon className="w-4 h-4 shrink-0" />
          No registrants loaded. Go to the Registration tab to upload a CSV
          or add riders.
        </div>
      )}
    </div>
  );
}
