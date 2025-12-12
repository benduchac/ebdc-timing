"use client";

import { useState, useEffect } from "react";
import { db, clearAllData } from "@/lib/db";
import type { Registrant, Entry, RaceState } from "@/lib/types";
import { downloadFile, getDateString, formatElapsedTime } from "@/lib/utils";
import RegistrationTab from "@/components/RegistrationTab";
import TimingTab from "@/components/TimingTab";
import ResultsTable from "@/components/ResultsTable";
import CategoryLeaderboards from "@/components/CategoryLeaderboards";
import EditModal from "@/components/EditModal";
import DeleteEntryModal from "@/components/DeleteEntryModal";
import WaveTimeEditModal from "@/components/WaveTimeEditModal";
import SettingsModal from "@/components/SettingsModal";

type TabType = "registration" | "timing" | "results";

export default function Home() {
  // Core state
  const [activeTab, setActiveTab] = useState<TabType>("registration");
  const [registrants, setRegistrants] = useState<Map<string, Registrant>>(
    new Map()
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryCounter, setEntryCounter] = useState(0);
  const [autoBackupCounter, setAutoBackupCounter] = useState(0);

  // Wave start times - initialize with defaults
  const [waveStartTimes, setWaveStartTimes] = useState<{
    A: Date;
    B: Date;
    C: Date;
  }>(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return {
      A: new Date(`${year}-${month}-${day}T09:00:00`),
      B: new Date(`${year}-${month}-${day}T09:15:00`),
      C: new Date(`${year}-${month}-${day}T09:30:00`),
    };
  });

  // Modal state
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<Entry | null>(null);
  const [editingWave, setEditingWave] = useState<"A" | "B" | "C" | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Results sub-view
  const [resultsView, setResultsView] = useState<"overall" | "categories">(
    "overall"
  );

  // Load persisted state on mount
  useEffect(() => {
    const loadPersistedState = async () => {
      try {
        // Load race state (entries, registrants, wave times)
        const savedState = await db.raceState.toArray();
        if (savedState.length > 0) {
          const state = savedState[0];

          setWaveStartTimes({
            A: new Date(state.waveStartTimes.A),
            B: new Date(state.waveStartTimes.B),
            C: new Date(state.waveStartTimes.C),
          });
          setRegistrants(new Map(state.registrants));
          setEntries(state.entries);
          setEntryCounter(state.entryCounter);

          // If there are entries, go to timing tab
          if (state.entries.length > 0) {
            setActiveTab("timing");
            console.log(`Restored ${state.entries.length} entries`);
          } else if (state.registrants.length > 0) {
            // If just registrants, stay on registration tab
            console.log(`Restored ${state.registrants.length} registrants`);
          }
        }

        // Load saved wave times from setup config (if no race state)
        const savedConfig = await db.setupConfig.toArray();
        if (savedConfig.length > 0 && savedState.length === 0) {
          const config = savedConfig[0];
          const today = new Date();
          const year = today.getFullYear();
          const month = String(today.getMonth() + 1).padStart(2, "0");
          const day = String(today.getDate()).padStart(2, "0");

          setWaveStartTimes({
            A: new Date(`${year}-${month}-${day}T${config.waveATime}`),
            B: new Date(`${year}-${month}-${day}T${config.waveBTime}`),
            C: new Date(`${year}-${month}-${day}T${config.waveCTime}`),
          });
        }
      } catch (error) {
        console.error("Error loading persisted state:", error);
      }
    };

    loadPersistedState();
  }, []);

  // Save state to IndexedDB after changes
  useEffect(() => {
    const saveState = async () => {
      // Only save if we have registrants or entries
      if (registrants.size > 0 || entries.length > 0) {
        try {
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
        } catch (error) {
          console.error("Error saving state:", error);
        }
      }
    };

    saveState();
  }, [entries, waveStartTimes, registrants, entryCounter]);

  // Save wave times to setup config
  useEffect(() => {
    const saveWaveTimes = async () => {
      try {
        const waveATime = `${String(waveStartTimes.A.getHours()).padStart(
          2,
          "0"
        )}:${String(waveStartTimes.A.getMinutes()).padStart(2, "0")}:${String(
          waveStartTimes.A.getSeconds()
        ).padStart(2, "0")}`;
        const waveBTime = `${String(waveStartTimes.B.getHours()).padStart(
          2,
          "0"
        )}:${String(waveStartTimes.B.getMinutes()).padStart(2, "0")}:${String(
          waveStartTimes.B.getSeconds()
        ).padStart(2, "0")}`;
        const waveCTime = `${String(waveStartTimes.C.getHours()).padStart(
          2,
          "0"
        )}:${String(waveStartTimes.C.getMinutes()).padStart(2, "0")}:${String(
          waveStartTimes.C.getSeconds()
        ).padStart(2, "0")}`;

        await db.setupConfig.clear();
        await db.setupConfig.add({
          waveATime,
          waveBTime,
          waveCTime,
          lastUpdated: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Error saving wave times:", error);
      }
    };

    saveWaveTimes();
  }, [waveStartTimes]);

  // Prevent accidental navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (entries.length > 0) {
        e.preventDefault();
        e.returnValue = "You have timing data that will be saved locally!";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [entries]);

  // Handlers
  const handleUpdateRegistrants = (newRegistrants: Map<string, Registrant>) => {
    setRegistrants(newRegistrants);
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

  const handleDeleteEntry = (id: number) => {
    const entry = entries.find((e) => e.id === id);
    if (entry) {
      setDeletingEntry(entry);
    }
  };

  const handleConfirmDelete = () => {
    if (deletingEntry) {
      setEntries((prev) => prev.filter((e) => e.id !== deletingEntry.id));
      setDeletingEntry(null);
    }
  };

  const handleEditWaveTime = (wave: "A" | "B" | "C") => {
    setEditingWave(wave);
  };

  const handleSaveWaveTime = (wave: "A" | "B" | "C", newTimeStr: string) => {
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

    const affectedCount = updatedEntries.filter((e) => e.wave === wave).length;
    if (affectedCount > 0) {
      alert(
        `✅ Wave ${wave} start time updated!\nRecalculated ${affectedCount} entries.`
      );
    }
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
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string);

        if (
          entries.length > 0 &&
          !confirm(
            `Replace current data (${entries.length} entries) with backup (${
              backup.entries?.length || 0
            } entries)?`
          )
        ) {
          return;
        }

        if (backup.waveStartTimes) {
          setWaveStartTimes({
            A: new Date(backup.waveStartTimes.A),
            B: new Date(backup.waveStartTimes.B),
            C: new Date(backup.waveStartTimes.C),
          });
        }
        if (backup.registrants) {
          setRegistrants(new Map(backup.registrants));
        }
        if (backup.entries) {
          setEntries(backup.entries);
        }
        if (backup.entryCounter) {
          setEntryCounter(backup.entryCounter);
        }

        alert(
          `✅ Loaded backup: ${backup.registrants?.length || 0} registrants, ${
            backup.entries?.length || 0
          } entries`
        );

        // Switch to appropriate tab
        if (backup.entries?.length > 0) {
          setActiveTab("timing");
        }
      } catch (error) {
        alert("Error loading backup: " + (error as Error).message);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const handleAutoBackup = () => {
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
      `EBDC-auto-backup-${getDateString()}.json`,
      "application/json"
    );
  };

  const handleResetApp = async () => {
    try {
      await clearAllData();

      setEntries([]);
      setRegistrants(new Map());
      setEntryCounter(0);
      setAutoBackupCounter(0);
      setEditingEntry(null);
      setDeletingEntry(null);

      // Reset wave times to defaults
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      setWaveStartTimes({
        A: new Date(`${year}-${month}-${day}T09:00:00`),
        B: new Date(`${year}-${month}-${day}T09:15:00`),
        C: new Date(`${year}-${month}-${day}T09:30:00`),
      });

      setActiveTab("registration");
    } catch (error) {
      alert("Error resetting app: " + (error as Error).message);
    }
  };

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url(/timing_bg.webp)" }}
    >
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-2xl p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-6 border-b-4 border-purple-600 pb-4">
          <div className="text-center flex-1">
            <div className="text-4xl font-bold text-purple-600 mb-1">C510</div>
            <h1 className="text-3xl font-bold text-gray-800">
              East Bay Dirt Classic
            </h1>
            <p className="text-gray-600 italic">Race Timing System</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-2xl hover:bg-gray-100 rounded-lg transition"
            title="Settings"
          >
            ⚙️
          </button>
        </div>

        {/* Status Bar */}
        <div className="flex gap-4 mb-4 text-sm">
          <div className="bg-purple-100 px-3 py-1 rounded-full">
            <span className="font-semibold">{registrants.size}</span>{" "}
            registrants
          </div>
          <div className="bg-green-100 px-3 py-1 rounded-full">
            <span className="font-semibold">{entries.length}</span> finishers
          </div>
          {entries.length > 0 && (
            <div className="bg-yellow-100 px-3 py-1 rounded-full">
              Auto-backup in{" "}
              <span className="font-semibold">{10 - autoBackupCounter}</span>{" "}
              entries
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4 border-b-2 border-gray-200">
          <button
            onClick={() => setActiveTab("registration")}
            className={`flex-1 py-3 font-bold rounded-t-lg transition ${
              activeTab === "registration"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            👥 Registration
          </button>
          <button
            onClick={() => setActiveTab("timing")}
            className={`flex-1 py-3 font-bold rounded-t-lg transition ${
              activeTab === "timing"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            🏁 Timing
          </button>
          <button
            onClick={() => setActiveTab("results")}
            className={`flex-1 py-3 font-bold rounded-t-lg transition ${
              activeTab === "results"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📊 Results
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[500px]">
          {activeTab === "registration" && (
            <RegistrationTab
              registrants={registrants}
              onUpdateRegistrants={handleUpdateRegistrants}
              hasTimingData={entries.length > 0}
            />
          )}

          {activeTab === "timing" && (
            <TimingTab
              waveStartTimes={waveStartTimes}
              registrants={registrants}
              entries={entries}
              onRecordEntry={handleRecordEntry}
              onEditEntry={handleEditEntry}
              onDeleteEntry={handleDeleteEntry}
              onExportCSV={handleExportCSV}
              onEditWaveTime={handleEditWaveTime}
            />
          )}

          {activeTab === "results" && (
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
                    onDeleteEntry={handleDeleteEntry}
                  />
                </>
              ) : (
                <CategoryLeaderboards
                  entries={entries}
                  registrants={registrants}
                />
              )}

              {/* Export buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleExportCSV}
                  className="flex-1 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
                >
                  📊 Export Results CSV
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modals */}
        {editingEntry && (
          <EditModal
            entry={editingEntry}
            registrants={registrants}
            waveStartTimes={waveStartTimes}
            onSave={handleSaveEdit}
            onClose={() => setEditingEntry(null)}
          />
        )}

        {deletingEntry && (
          <DeleteEntryModal
            entry={deletingEntry}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeletingEntry(null)}
          />
        )}

        {editingWave && (
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

        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onResetApp={handleResetApp}
          entryCount={entries.length}
          registrantCount={registrants.size}
        />
      </div>
    </div>
  );
}
