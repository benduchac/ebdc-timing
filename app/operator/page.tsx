"use client";

import { useState, useEffect } from "react";
import { db, clearAllData } from "@/lib/db";
import type { Registrant, Entry, Race, RaceSnapshot } from "@/lib/types";
import {
  downloadFile,
  getDateString,
  formatElapsedTime,
  csvField,
} from "@/lib/utils";
import { useCloudSync } from "@/lib/useCloudSync";
import RegistrationTab from "@/components/RegistrationTab";
import TimingTab from "@/components/TimingTab";
import ResultsTable from "@/components/ResultsTable";
import CategoryLeaderboards from "@/components/CategoryLeaderboards";
import EditModal from "@/components/EditModal";
import DeleteEntryModal from "@/components/DeleteEntryModal";
import WaveTimeEditModal from "@/components/WaveTimeEditModal";
import SettingsModal from "@/components/SettingsModal";
import SyncBadge from "@/components/SyncBadge";
import ReadinessBanner from "@/components/ReadinessBanner";
import RaceMenuScreen from "@/components/RaceMenuScreen";
import OperatorGate, {
  clearStoredPassphrase,
  getStoredPassphrase,
} from "@/components/OperatorGate";

type TabType = "registration" | "timing" | "results";

export default function OperatorPage() {
  // Core state
  const [activeTab, setActiveTab] = useState<TabType>("registration");
  const [registrants, setRegistrants] = useState<Map<string, Registrant>>(
    new Map()
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryCounter, setEntryCounter] = useState(0);

  // Race identity (Phase 3) — null until a race is created or restored from
  // local/imported state. Drives the cloud sync gate below.
  const [activeRace, setActiveRace] = useState<Race | null>(null);
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState<string | null>(
    null
  );
  // True once the initial IndexedDB load has resolved — gates whether we
  // show RaceSetupScreen (avoids flashing it before we know if a race
  // already exists locally).
  const [loaded, setLoaded] = useState(false);

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
          setCloudLastSyncedAt(state.cloudLastSyncedAt ?? null);

          if (state.raceId) {
            setActiveRace({
              id: state.raceId,
              label: state.raceLabel || "Untitled Race",
              createdAt: state.raceCreatedAt || state.lastSaved,
            });
          } else if (state.entries.length > 0 || state.registrants.length > 0) {
            // Local data from before race identity existed (Phase 3) — mint
            // one now so syncing can begin, rather than treating in-progress
            // work as having no race.
            setActiveRace({
              id: crypto.randomUUID(),
              label: `East Bay Dirt Classic – ${new Date().toLocaleDateString()}`,
              createdAt: new Date().toISOString(),
            });
          }

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
      } finally {
        setLoaded(true);
      }
    };

    loadPersistedState();
  }, []);

  // Save state to IndexedDB after changes
  useEffect(() => {
    const saveState = async () => {
      // Save once a race exists, even before any registrants/entries — a
      // refresh right after "Start Race" shouldn't lose the new race id.
      if (activeRace || registrants.size > 0 || entries.length > 0) {
        try {
          // Atomic replace so a rapid follow-up save can't interleave between
          // the clear and the add and momentarily empty the store.
          await db.transaction("rw", db.raceState, async () => {
            await db.raceState.clear();
            await db.raceState.add({
              raceId: activeRace?.id,
              raceLabel: activeRace?.label,
              raceCreatedAt: activeRace?.createdAt,
              cloudLastSyncedAt: cloudLastSyncedAt ?? undefined,
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
          });
        } catch (error) {
          console.error("Error saving state:", error);
        }
      }
    };

    saveState();
  }, [entries, waveStartTimes, registrants, entryCounter, activeRace, cloudLastSyncedAt]);

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

        await db.transaction("rw", db.setupConfig, async () => {
          await db.setupConfig.clear();
          await db.setupConfig.add({
            waveATime,
            waveBTime,
            waveCTime,
            lastUpdated: new Date().toISOString(),
          });
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

  // Cloud sync (Phase 3) — best-effort POST to /api/backup on every relevant
  // state change, replacing the old every-10-entries auto-download. See
  // docs/race-readiness-design.md "Backup sync behavior".
  const {
    status: syncStatus,
    lastSyncedAt: cloudSyncedAt,
    error: syncError,
  } = useCloudSync(
    { race: activeRace, waveStartTimes, registrants, entries, entryCounter },
    getStoredPassphrase,
    cloudLastSyncedAt
  );

  useEffect(() => {
    if (cloudSyncedAt) setCloudLastSyncedAt(cloudSyncedAt);
  }, [cloudSyncedAt]);

  // Handlers
  const handleCreateRace = (label: string) => {
    setActiveRace({
      id: crypto.randomUUID(),
      label,
      createdAt: new Date().toISOString(),
    });
  };

  const handleOpenRace = (race: Race, snapshot: RaceSnapshot) => {
    setActiveRace(race);
    setWaveStartTimes({
      A: new Date(snapshot.waveStartTimes.A),
      B: new Date(snapshot.waveStartTimes.B),
      C: new Date(snapshot.waveStartTimes.C),
    });
    setRegistrants(new Map(snapshot.registrants));
    setEntries(snapshot.entries);
    setEntryCounter(snapshot.entryCounter);
    setCloudLastSyncedAt(snapshot.lastSaved);
    if (snapshot.entries.length > 0) {
      setActiveTab("timing");
    }
  };

  const handleUpdateRegistrants = (newRegistrants: Map<string, Registrant>) => {
    setRegistrants(newRegistrants);
  };

  const handleRecordEntry = (entry: Omit<Entry, "id">) => {
    // Derive the id from the current entries so it stays unique even if
    // multiple records land in one render batch (avoids id collisions that
    // would make edit/delete target the wrong row). Auto-backup is handled by
    // the effect below, which sees committed state.
    setEntries((prev) => {
      const nextId = prev.reduce((max, e) => Math.max(max, e.id), 0) + 1;
      return [...prev, { ...entry, id: nextId }];
    });
    setEntryCounter((prev) => prev + 1);
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
      csv +=
        [
          overallPlace,
          wavePlace,
          entry.bib,
          entry.firstName,
          entry.lastName,
          entry.wave,
          entry.finishTime,
          entry.elapsedTime,
          entry.timestamp,
        ]
          .map(csvField)
          .join(",") + "\n";
    });

    downloadFile(csv, `EBDC-results-${getDateString()}.csv`, "text/csv");
    alert(`Exported ${sorted.length} finishers to CSV!`);
  };

  const handleExportBackup = () => {
    const backup = {
      exportDate: new Date().toISOString(),
      event: "East Bay Dirt Classic - C510",
      raceId: activeRace?.id,
      raceLabel: activeRace?.label,
      raceCreatedAt: activeRace?.createdAt,
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
        if (backup.raceId) {
          setActiveRace({
            id: backup.raceId,
            label: backup.raceLabel || "Imported Race",
            createdAt: backup.raceCreatedAt || new Date().toISOString(),
          });
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

  const handleResetApp = async () => {
    // Guard against silently discarding unsynced work — see
    // docs/race-readiness-design.md "Guard destructive actions".
    const hasData = registrants.size > 0 || entries.length > 0;
    const isSynced = syncStatus === "synced" && cloudLastSyncedAt !== null;
    if (hasData && !isSynced) {
      const proceed = confirm(
        "⚠️ This race has NOT been confirmed backed up to the cloud.\n\n" +
          "Resetting now discards any unsynced changes locally — they will " +
          "not be recoverable from the cloud.\n\nContinue anyway?"
      );
      if (!proceed) return;
    }

    try {
      await clearAllData();

      setEntries([]);
      setRegistrants(new Map());
      setEntryCounter(0);
      setEditingEntry(null);
      setDeletingEntry(null);
      // A reset ends this race locally — its cloud backup is untouched (a
      // fresh race id next time can't clobber it). The next load shows the
      // race menu again.
      setActiveRace(null);
      setCloudLastSyncedAt(null);

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

  const handleLock = () => {
    clearStoredPassphrase();
    window.location.reload();
  };

  if (!loaded) {
    return (
      <OperatorGate>
        <div />
      </OperatorGate>
    );
  }

  if (!activeRace) {
    return (
      <OperatorGate>
        <RaceMenuScreen onCreate={handleCreateRace} onOpen={handleOpenRace} />
      </OperatorGate>
    );
  }

  return (
    <OperatorGate>
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
              {activeRace && (
                <p className="text-xs text-gray-400 mt-1">
                  {activeRace.label} · #{activeRace.id.slice(0, 8)}
                </p>
              )}
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
            <SyncBadge
              status={syncStatus}
              lastSyncedAt={cloudLastSyncedAt}
              error={syncError}
            />
          </div>

          <ReadinessBanner
            registrantCount={registrants.size}
            syncStatus={syncStatus}
            cloudLastSyncedAt={cloudLastSyncedAt}
          />

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
            onLock={handleLock}
            entryCount={entries.length}
            registrantCount={registrants.size}
          />
        </div>
      </div>
    </OperatorGate>
  );
}
