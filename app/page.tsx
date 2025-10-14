'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, clearAllData } from '@/lib/db';
import type { Registrant, Entry } from '@/lib/types';
import { downloadFile, getDateString, formatElapsedTime } from '@/lib/utils';
import SetupScreen from '@/components/SetupScreen';
import RaceMode from '@/components/RaceMode';
import ResultsTable from '@/components/ResultsTable';
import EditModal from '@/components/EditModal';

export default function Home() {
  const [raceMode, setRaceMode] = useState(false);
  const [waveStartTimes, setWaveStartTimes] = useState<{ A: Date; B: Date; C: Date } | null>(null);
  const [registrants, setRegistrants] = useState<Map<string, Registrant>>(new Map());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryCounter, setEntryCounter] = useState(0);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [showFullResults, setShowFullResults] = useState(false);
  const [autoBackupCounter, setAutoBackupCounter] = useState(0);

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
            C: new Date(state.waveStartTimes.C)
          });
          setRegistrants(new Map(state.registrants));
          setEntries(state.entries);
          setEntryCounter(state.entryCounter);
          setRaceMode(true);
          
          alert(`✅ Restored ${state.entries.length} entries from previous session`);
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
            C: waveStartTimes.C.toISOString()
          },
          registrants: Array.from(registrants.entries()),
          entries,
          entryCounter,
          lastSaved: new Date().toISOString()
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
        e.returnValue = 'You have unsaved race data!';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [entries, raceMode]);

const handleResetApp = async () => {
  if (!confirm('⚠️ RESET ENTIRE APP?\n\nThis will permanently delete:\n- All timing entries\n- All registrants\n- Wave start times\n- Everything in IndexedDB\n\nThis cannot be undone!')) {
    return;
  }
  
  if (!confirm('Are you REALLY sure? Type YES in the next prompt to confirm.')) {
    return;
  }
  
  const confirmation = prompt('Type YES to reset:');
  if (confirmation !== 'YES') {
    alert('Reset cancelled.');
    return;
  }
  
  try {
    // Clear IndexedDB
    await clearAllData();
    
    // Reset all state
    setEntries([]);
    setRegistrants(new Map());
    setWaveStartTimes({ A: null, B: null, C: null });
    setEntryCounter(0);
    setAutoBackupCounter(0);
    setRaceMode(false);
    setEditingEntry(null);
    
    alert('✅ App reset successfully! All data cleared.');
  } catch (error) {
    alert('Error resetting app: ' + (error as Error).message);
  }
};

const handleStartRace = (config: {
  waveStartTimes: { A: string; B: string; C: string };
  registrants: Map<string, Registrant>;
}) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  // Build local datetime strings WITHOUT converting to UTC
  setWaveStartTimes({
    A: new Date(`${year}-${month}-${day}T${config.waveStartTimes.A}`),
    B: new Date(`${year}-${month}-${day}T${config.waveStartTimes.B}`),
    C: new Date(`${year}-${month}-${day}T${config.waveStartTimes.C}`)
  });
  setRegistrants(config.registrants);
  setRaceMode(true);
};

  const handleRecordEntry = (entry: Omit<Entry, 'id'>) => {
    const newEntry = {
      ...entry,
      id: entryCounter + 1
    };
    
    setEntries(prev => [...prev, newEntry]);
    setEntryCounter(prev => prev + 1);
    setAutoBackupCounter(prev => {
      const newCount = prev + 1;
      if (newCount >= 10) {
        handleAutoBackup();
        return 0;
      }
      return newCount;
    });
  };

  const handleEditEntry = (id: number) => {
    const entry = entries.find(e => e.id === id);
    if (entry) {
      setEditingEntry(entry);
    }
  };

  const handleSaveEdit = (updatedEntry: Entry) => {
    setEntries(prev => prev.map(e => e.id === updatedEntry.id ? updatedEntry : e));
    setEditingEntry(null);
  };

  const handleExportCSV = () => {
    if (entries.length === 0) {
      alert('No data to export!');
      return;
    }

    const validEntries = entries.filter(e => e.wave !== null);
    const sorted = [...validEntries].sort((a, b) => {
      if (a.elapsedMs === null || b.elapsedMs === null) return 0;
      return a.elapsedMs - b.elapsedMs;
    });

    const wavePlacements: Record<string, Entry[]> = { A: [], B: [], C: [] };
    validEntries.forEach(entry => {
      if (entry.wave) {
        wavePlacements[entry.wave].push(entry);
      }
    });
    
    Object.keys(wavePlacements).forEach(wave => {
      wavePlacements[wave].sort((a, b) => {
        if (a.elapsedMs === null || b.elapsedMs === null) return 0;
        return a.elapsedMs - b.elapsedMs;
      });
    });

    let csv = 'Overall Place,Wave Place,Bib Number,First Name,Last Name,Wave,Finish Time,Elapsed Time,Full Timestamp\n';
    sorted.forEach((entry, index) => {
      const overallPlace = index + 1;
      const wavePlace = entry.wave ? wavePlacements[entry.wave].findIndex(e => e.id === entry.id) + 1 : '';
      csv += `${overallPlace},${wavePlace},${entry.bib},${entry.firstName},${entry.lastName},${entry.wave},${entry.finishTime},${entry.elapsedTime},${entry.timestamp}\n`;
    });

    downloadFile(csv, `EBDC-results-${getDateString()}.csv`, 'text/csv');
    alert(`Exported ${sorted.length} finishers to CSV!`);
  };

  const handleExportBackup = () => {
    if (!waveStartTimes) return;

    const backup = {
      exportDate: new Date().toISOString(),
      event: 'East Bay Dirt Classic - C510',
      waveStartTimes: {
        A: waveStartTimes.A.toISOString(),
        B: waveStartTimes.B.toISOString(),
        C: waveStartTimes.C.toISOString()
      },
      registrants: Array.from(registrants.entries()),
      entryCounter,
      entries
    };

    const json = JSON.stringify(backup, null, 2);
    downloadFile(json, `EBDC-backup-${getDateString()}.json`, 'application/json');
    alert(`Backed up ${entries.length} finishers!`);
  };

  const handleAutoBackup = () => {
    if (!waveStartTimes) return;

    const backup = {
      exportDate: new Date().toISOString(),
      event: 'East Bay Dirt Classic - C510',
      waveStartTimes: {
        A: waveStartTimes.A.toISOString(),
        B: waveStartTimes.B.toISOString(),
        C: waveStartTimes.C.toISOString()
      },
      registrants: Array.from(registrants.entries()),
      entryCounter,
      entries
    };

    const json = JSON.stringify(backup, null, 2);
    downloadFile(json, `EBDC-auto-backup-${getDateString()}.json`, 'application/json');
  };

  const handleReturnToSetup = () => {
    if (entries.length > 0) {
      if (!confirm('Return to setup? Race data will remain in browser.')) {
        return;
      }
    }
    setRaceMode(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-purple-800 p-4">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-2xl p-6">
        {/* Header */}
        <div className="text-center mb-6 border-b-4 border-purple-600 pb-4">
          <div className="text-4xl font-bold text-purple-600 mb-1">C510</div>
          <h1 className="text-3xl font-bold text-gray-800">East Bay Dirt Classic</h1>
          <p className="text-gray-600 italic">Race Timing System</p>
        </div>
        
{/* Setup or Race Mode */}
{!raceMode ? (
  <SetupScreen onStartRace={handleStartRace} onResetApp={handleResetApp} />
) : waveStartTimes ? (
  <>
    <RaceMode
      waveStartTimes={waveStartTimes}
      registrants={registrants}
      entries={entries}
      onRecordEntry={handleRecordEntry}
      onEditEntry={handleEditEntry}
      onExportCSV={handleExportCSV}
      onExportBackup={handleExportBackup}
      onReturnToSetup={handleReturnToSetup}
    />

            {/* Full Results Button */}
            <div className="mt-6">
              <button
                onClick={() => setShowFullResults(!showFullResults)}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition"
              >
                {showFullResults ? '▲ Hide Full Results' : '▼ Show Full Results'}
              </button>
            </div>

            {/* Full Results Table */}
            {showFullResults && (
              <div className="mt-4">
                <h2 className="text-2xl font-bold mb-3">Complete Results - {entries.length} Finishers</h2>
                <ResultsTable entries={entries} onEditEntry={handleEditEntry} />
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
      </div>
    </div>
  );
}