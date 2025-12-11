"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, clearAllData } from "@/lib/db";
import type { Registrant, Entry } from "@/lib/types";
import { downloadFile, getDateString, formatElapsedTime } from "@/lib/utils";
import SetupScreen from "@/components/SetupScreen";
import RaceMode from "@/components/RaceMode";
import ResultsTable from "@/components/ResultsTable";
import EditModal from "@/components/EditModal";
import WaveStatusBoxes from "@/components/WaveStatusBoxes";
import WaveTimeEditModal from "@/components/WaveTimeEditModal";
import CategoryLeaderboards from "@/components/CategoryLeaderboards";

export default function Home() {
  const [raceMode, setRaceMode] = useState(false);
  const [waveStartTimes, setWaveStartTimes] = useState<{
    A: Date;
    B: Date;
    C: Date;
  } | null>(null);
  const [registrants, setRegistrants] = useState<Map<string, Registrant>>(
    new Map()
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryCounter, setEntryCounter] = useState(0);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [showFullResults, setShowFullResults] = useState(false);
  const [autoBackupCounter, setAutoBackupCounter] = useState(0);
  const [activeTab, setActiveTab] = useState<"timing" | "results">("timing");
  const [resultsView, setResultsView] = useState<"overall" | "categories">(
    "overall"
  ); // ← ADD THIS
  const [editingWave, setEditingWave] = useState<"A" | "B" | "C" | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    const loadPersistedState = async () => {
      const savedState = await db.raceState.toArray();

      if (savedState.length > 0) {
        const state = savedState[0];

        if (state.entries.length > 0) {
          // Auto-restore race state
          setWaveStartTimes({
            A: new Date(state.waveStartTimes.A),
            B: new Date(state.waveStartTimes.B),
            C: new Date(state.waveStartTimes.C),
          });
          setRegistrants(new Map(state.registrants));
          setEntries(state.entries);
          setEntryCounter(state.entryCounter);
          setRaceMode(true);

          alert(
            `✅ Restored ${state.entries.length} entries from previous session`
          );
        }
      }
    };

    loadPersistedState();
  }, []);

  // Save state to IndexedDB after changes
  useEffect(() => {
    const saveState = async () => {
      if (entries.length > 0 && waveStartTimes) {
        await db.raceState.clear();
        await db.raceState.add({
          waveStartTimes: {
            A: waveStartTimes.A.toISOString(),
            B: waveStartTimes.B.toISOString(),
            C: waveStartTimes.C.toISOString(),
          },
          registrants: Array.from(registrants.entries()),
          entries,
          entryCounter,
          lastSaved: new Date().toISOString(),
        });
      }
    };

    saveState();
  }, [entries, waveStartTimes, registrants, entryCounter]);

  // Prevent accidental navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (entries.length > 0 && raceMode) {
        e.preventDefault();
        e.returnValue = "You have unsaved race data!";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [entries, raceMode]);

  const handleResetApp = async () => {
    if (
      !confirm(
        "⚠️ RESET ENTIRE APP?\n\nThis will permanently delete:\n- All timing entries\n- All registrants\n- Wave start times\n- Everything in IndexedDB\n\nThis cannot be undone!\n\nAre you sure?"
      )
    ) {
      return;
    }

    try {
      // Clear IndexedDB
      await clearAllData();

      // Reset all state
      setEntries([]);
      setRegistrants(new Map());
      setWaveStartTimes(null);
      setEntryCounter(0);
      setAutoBackupCounter(0);
      setRaceMode(false);
      setEditingEntry(null);

      alert("✅ App reset successfully! All data cleared.");
    } catch (error) {
      alert("Error resetting app: " + (error as Error).message);
    }
  };

  const handleStartRace = (config: {
    waveStartTimes: { A: string; B: string; C: string };
    registrants: Map<string, Registrant>;
  }) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    // Build local datetime strings WITHOUT converting to UTC
    setWaveStartTimes({
      A: new Date(`${year}-${month}-${day}T${config.waveStartTimes.A}`),
      B: new Date(`${year}-${month}-${day}T${config.waveStartTimes.B}`),
      C: new Date(`${year}-${month}-${day}T${config.waveStartTimes.C}`),
    });
    setRegistrants(config.registrants);
    setRaceMode(true);
  };

  const handleRecordEntry = (entry: Omit<Entry, "id">) => {
    const newEntry = {
      ...entry,
      id: entryCounter + 1,
    };

    setEntries((prev) => [...prev, newEntry]);
    setEntryCounter((prev) => prev + 1);
    setAutoBackupCounter((prev) => {
      const newCount = prev + 1;
      if (newCount >= 10) {
        handleAutoBackup();
        return 0;
      }
      return newCount;
    });
  };

  const handleEditEntry = (id: number) => {
    const entry = entries.find((e) => e.id === id);
    if (entry) {
      setEditingEntry(entry);
    }
  };

  const handleSaveEdit = (updatedEntry: Entry) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e))
    );
    setEditingEntry(null);
  };

  const handleExportCSV = () => {
    if (entries.length === 0) {
      alert("No data to export!");
      return;
    }

    const validEntries = entries.filter((e) => e.wave !== null);
    const sorted = [...validEntries].sort((a, b) => {
      if (a.elapsedMs === null || b.elapsedMs === null) return 0;
      return a.elapsedMs - b.elapsedMs;
    });

    const wavePlacements: Record<string, Entry[]> = { A: [], B: [], C: [] };
    validEntries.forEach((entry) => {
      if (entry.wave) {
        wavePlacements[entry.wave].push(entry);
      }
    });

    Object.keys(wavePlacements).forEach((wave) => {
      wavePlacements[wave].sort((a, b) => {
        if (a.elapsedMs === null || b.elapsedMs === null) return 0;
        return a.elapsedMs - b.elapsedMs;
      });
    });

    let csv =
      "Overall Place,Wave Place,Bib Number,First Name,Last Name,Wave,Finish Time,Elapsed Time,Full Timestamp\n";
    sorted.forEach((entry, index) => {
      const overallPlace = index + 1;
      const wavePlace = entry.wave
        ? wavePlacements[entry.wave].findIndex((e) => e.id === entry.id) + 1
        : "";
      csv += `${overallPlace},${wavePlace},${entry.bib},${entry.firstName},${entry.lastName},${entry.wave},${entry.finishTime},${entry.elapsedTime},${entry.timestamp}\n`;
    });

    downloadFile(csv, `EBDC-results-${getDateString()}.csv`, "text/csv");
    alert(`Exported ${sorted.length} finishers to CSV!`);
  };

  const handleExportBackup = () => {
    if (!waveStartTimes) return;

    const backup = {
      exportDate: new Date().toISOString(),
      event: "East Bay Dirt Classic - C510",
      waveStartTimes: {
        A: waveStartTimes.A.toISOString(),
        B: waveStartTimes.B.toISOString(),
        C: waveStartTimes.C.toISOString(),
      },
      registrants: Array.from(registrants.entries()),
      entryCounter,
      entries,
    };

    const json = JSON.stringify(backup, null, 2);
    downloadFile(
      json,
      `EBDC-backup-${getDateString()}.json`,
      "application/json"
    );
    alert(`Backed up ${entries.length} finishers!`);
  };

  const handleEditWaveTime = (wave: "A" | "B" | "C") => {
    setEditingWave(wave);
  };

  const handleSaveWaveTime = (wave: "A" | "B" | "C", newTimeStr: string) => {
    if (!waveStartTimes) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const newDateTime = new Date(`${year}-${month}-${day}T${newTimeStr}`);

    // Update wave start times
    const updatedWaveStartTimes = {
      ...waveStartTimes,
      [wave]: newDateTime,
    };
    setWaveStartTimes(updatedWaveStartTimes);

    // Recalculate all entries for this wave
    const updatedEntries = entries.map((entry) => {
      if (entry.wave === wave) {
        const elapsedMs = entry.finishTimeMs - newDateTime.getTime();
        const elapsedTime = formatElapsedTime(elapsedMs);

        return {
          ...entry,
          elapsedMs,
          elapsedTime,
        };
      }
      return entry;
    });

    setEntries(updatedEntries);
    setEditingWave(null);

    // Trigger another backup after change
    setTimeout(() => handleAutoBackup(), 500);

    const affectedCount = updatedEntries.filter((e) => e.wave === wave).length;
    alert(
      `✅ Wave ${wave} start time updated!\nRecalculated ${affectedCount} entries.`
    );
  };

  const handleAutoBackup = () => {
    if (!waveStartTimes) return;

    const backup = {
      exportDate: new Date().toISOString(),
      event: "East Bay Dirt Classic - C510",
      waveStartTimes: {
        A: waveStartTimes.A.getTime(), // ✅ Store as milliseconds
        B: waveStartTimes.B.getTime(),
        C: waveStartTimes.C.getTime(),
      },
      // ...
    };

    const json = JSON.stringify(backup, null, 2);
    downloadFile(
      json,
      `EBDC-auto-backup-${getDateString()}.json`,
      "application/json"
    );
  };

  const handleReturnToSetup = () => {
    if (entries.length > 0) {
      if (!confirm("Return to setup? Race data will remain in browser.")) {
        return;
      }
    }
    setRaceMode(false);
    // Don't clear registrants or waveStartTimes - keep them!
  };

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url(/timing_bg.webp)" }}
    >
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-2xl p-6">
        {/* Header */}
        <div className="text-center mb-6 border-b-4 border-purple-600 pb-4">
          <div className="text-4xl font-bold text-purple-600 mb-1">C510</div>
          <h1 className="text-3xl font-bold text-gray-800">
            East Bay Dirt Classic
          </h1>
          <p className="text-gray-600 italic">Race Timing System</p>
        </div>

        {/* Setup or Race Mode */}
        {!raceMode ? (
          <SetupScreen
            onStartRace={handleStartRace}
            onResetApp={handleResetApp}
            initialRegistrants={registrants} // ✅ Pass down existing registrants
            hasRaceData={entries.length > 0}
          />
        ) : waveStartTimes ? (
          <>
            {/* Tab Switcher */}
            <div className="flex gap-2 mb-4 border-b-2 border-gray-300">
              <button
                onClick={() => setActiveTab("timing")}
                className={`flex-1 py-3 font-bold rounded-t-lg transition ${
                  activeTab === "timing"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                🏁 TIMING MODE
              </button>
              <button
                onClick={() => setActiveTab("results")}
                className={`flex-1 py-3 font-bold rounded-t-lg transition ${
                  activeTab === "results"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                📊 FULL RESULTS
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "timing" ? (
              <RaceMode
                waveStartTimes={waveStartTimes}
                registrants={registrants}
                entries={entries}
                onRecordEntry={handleRecordEntry}
                onEditEntry={handleEditEntry}
                onExportCSV={handleExportCSV}
                onExportBackup={handleExportBackup}
                onReturnToSetup={handleReturnToSetup}
                onEditWaveTime={handleEditWaveTime}
              />
            ) : (
              <div className="space-y-4">
                {/* Sub-tabs for Results views */}
                <div className="flex gap-2 border-b-2 border-gray-200">
                  <button
                    onClick={() => setResultsView("overall")}
                    className={`px-6 py-2 font-semibold rounded-t-lg transition ${
                      resultsView === "overall"
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    📋 Overall Results
                  </button>
                  <button
                    onClick={() => setResultsView("categories")}
                    className={`px-6 py-2 font-semibold rounded-t-lg transition ${
                      resultsView === "categories"
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    🏆 Category Leaderboards
                  </button>
                </div>

                {/* Content based on selected view */}
                {resultsView === "overall" ? (
                  <>
                    <h2 className="text-2xl font-bold">
                      Complete Results - {entries.length} Finishers
                    </h2>
                    <ResultsTable
                      entries={entries}
                      onEditEntry={handleEditEntry}
                    />
                  </>
                ) : (
                  <CategoryLeaderboards
                    entries={entries}
                    registrants={registrants}
                  />
                )}

                {/* Export buttons - shown for both views */}
                <div className="flex gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="flex-1 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
                  >
                    📊 Export Results CSV
                  </button>
                  <button
                    onClick={handleExportBackup}
                    className="flex-1 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700"
                  >
                    💾 Download Backup JSON
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Edit Modal */}
        {editingEntry && waveStartTimes && (
          <EditModal
            entry={editingEntry}
            registrants={registrants}
            waveStartTimes={waveStartTimes}
            onSave={handleSaveEdit}
            onClose={() => setEditingEntry(null)}
          />
        )}

        {/* Wave Time Edit Modal - ADD THIS: */}
        {editingWave && waveStartTimes && (
          <WaveTimeEditModal
            wave={editingWave}
            currentTime={waveStartTimes[editingWave]}
            affectedEntries={
              entries.filter((e) => e.wave === editingWave).length
            }
            onSave={(newTime) => handleSaveWaveTime(editingWave, newTime)}
            onClose={() => setEditingWave(null)}
          />
        )}
      </div>
    </div>
  );
}
