'use client';

import ClockVerification from './ClockVerification';
import type { Registrant } from '@/lib/types';
import { useState, useEffect } from 'react';
import { db } from '@/lib/db';

interface SetupScreenProps {
  onStartRace: (config: {
    waveStartTimes: { A: string; B: string; C: string };
    registrants: Map<string, Registrant>;
  }) => void;
  onResetApp: () => void;
  initialRegistrants?: Map<string, Registrant>;
  hasRaceData?: boolean;  // ✅ Add this to know if there's race data
  }


  
export default function SetupScreen({ onStartRace, onResetApp, initialRegistrants, hasRaceData }: SetupScreenProps) {
const [waveATime, setWaveATime] = useState<string>('');
const [waveBTime, setWaveBTime] = useState<string>('');
const [waveCTime, setWaveCTime] = useState<string>('');
const [timesLoaded, setTimesLoaded] = useState(false);
  const [registrants, setRegistrants] = useState<Map<string, Registrant>>(
    initialRegistrants || new Map()
  );
  const [registrantCount, setRegistrantCount] = useState(initialRegistrants?.size || 0);

// Load saved wave times on mount
useEffect(() => {
  const loadSavedTimes = async () => {
    try {
      const saved = await db.setupConfig.toArray();
      if (saved.length > 0) {
        const config = saved[0];
        setWaveATime(config.waveATime);
        setWaveBTime(config.waveBTime);
        setWaveCTime(config.waveCTime);
      } else {
        // No saved config, use defaults
        setWaveATime('09:00:00');
        setWaveBTime('09:15:00');
        setWaveCTime('09:30:00');
      }
    } catch (error) {
      console.error('Error loading wave times:', error);
      // Fallback to defaults
      setWaveATime('09:00:00');
      setWaveBTime('09:15:00');
      setWaveCTime('09:30:00');
    }
    setTimesLoaded(true);
  };
  loadSavedTimes();
}, []);

// Save wave times to DB when changed (but only after initial load)
useEffect(() => {
  if (!timesLoaded || !waveATime || !waveBTime || !waveCTime) return;
  
  const saveTimes = async () => {
    try {
      await db.setupConfig.clear();
      await db.setupConfig.add({
        waveATime,
        waveBTime,
        waveCTime,
        lastUpdated: new Date().toISOString()
      });
      console.log('Saved wave times:', waveATime, waveBTime, waveCTime);
    } catch (error) {
      console.error('Error saving wave times:', error);
    }
  };
  saveTimes();
}, [waveATime, waveBTime, waveCTime, timesLoaded]);

  useEffect(() => {
    setRegistrants(initialRegistrants || new Map());
    setRegistrantCount(initialRegistrants?.size || 0);
  }, [initialRegistrants]);

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // ✅ CRITICAL: Warn if there's active race data
    if (hasRaceData) {
      if (!confirm(`🚨 WARNING: YOU HAVE ACTIVE RACE DATA!\n\nUploading a new CSV mid-race will replace all ${registrants.size} registrants.\n\nThis could cause confusion if bibs no longer match names.\n\nAre you SURE you want to do this?`)) {
        event.target.value = '';
        return;
      }
    }
    
    // ✅ Warn if overwriting existing registrants (even without race data)
    if (registrants.size > 0 && !hasRaceData) {
      if (!confirm(`⚠️ You currently have ${registrants.size} registrants loaded.\n\nUploading a new CSV will REPLACE all current registrants.\n\nContinue?`)) {
        event.target.value = '';
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n');
        const newRegistrants = new Map<string, Registrant>();
        
        let loadedCount = 0;
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const fields = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          const cleanFields = fields.map(f => f.replace(/^"|"$/g, '').trim());
          
          if (cleanFields.length >= 4) {
            const bib = cleanFields[0].trim();
            const firstName = cleanFields[1].trim();
            const lastName = cleanFields[2].trim();
            const wave = cleanFields[3].trim().toUpperCase() as 'A' | 'B' | 'C';
            
            if (bib && firstName && lastName && ['A', 'B', 'C'].includes(wave)) {
              newRegistrants.set(bib, { bib, firstName, lastName, wave });
              loadedCount++;
            }
          }
        }
        
        setRegistrants(newRegistrants);
        setRegistrantCount(loadedCount);
        alert(`Successfully loaded ${loadedCount} registrants!`);
      } catch (error) {
        alert('Error loading CSV: ' + (error as Error).message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // ... rest of component (handleStartRace, JSX, etc.)

  const handleStartRace = () => {
    if (!waveATime || !waveBTime || !waveCTime) {
      alert('Please set valid start times for all waves!');
      return;
    }

    if (registrants.size === 0) {
      if (!confirm('No registrants loaded. Continue anyway?')) {
        return;
      }
    }

    onStartRace({
      waveStartTimes: { A: waveATime, B: waveBTime, C: waveCTime },
      registrants
    });
  };

  return (
    <div className="bg-gray-100 border-2 border-purple-600 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-bold text-center text-purple-600 mb-6">
        ⚙️ Pre-Race Setup
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block mb-2 font-bold text-black text-sm">Wave A Start Time</label>
            <input
              type="time"
              step="1"
              value={waveATime}
              onChange={(e) => setWaveATime(e.target.value)}
              className="w-full p-2 text-lg border-2 border-gray-300 rounded-lg text-black"            />
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block mb-2 text-black font-bold text-sm">Wave B Start Time</label>
          <input
            type="time"
            step="1"
            value={waveBTime}
            onChange={(e) => setWaveBTime(e.target.value)}
            className="w-full p-2 text-lg border-2 border-gray-300 rounded-lg text-black"
          />
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block mb-2 font-bold text-black text-sm">Wave C Start Time</label>
          <input
            type="time"
            step="1"
            value={waveCTime}
            onChange={(e) => setWaveCTime(e.target.value)}
            className="w-full p-2 text-lg border-2 border-gray-300 rounded-lg text-black"
          />
        </div>
      </div>

      <div className="mb-6">
        <ClockVerification />
      </div>

<div
  onClick={() => document.getElementById('csvInput')?.click()}
  className="bg-white p-6 rounded-lg text-center border-2 border-purple-600 cursor-pointer hover:bg-gray-50 transition mb-4"
>
  <input
    id="csvInput"
    type="file"
    accept=".csv"
    onChange={handleCSVUpload}
    className="hidden"
  />
  <p className="text-lg font-semibold mb-2 text-black">📄 Click to Load Registrants CSV</p>
  <p className="text-sm text-gray-600">Expected format: Bib, FirstName, LastName, Wave</p>
  {registrantCount > 0 && (
    <p className="text-sm font-bold text-green-700 mt-2">
      Currently loaded: {registrantCount} registrants
    </p>
  )}
</div>

{/* Move this OUTSIDE the upload area so it's always visible */}
<div className={`rounded-lg p-4 text-center font-bold mb-6 ${
  registrantCount > 0 
    ? 'bg-green-100 border-2 border-green-500 text-green-800' 
    : 'bg-gray-100 border-2 border-gray-300 text-gray-600'
}`}>
  {registrantCount > 0 
    ? `✅ ${registrantCount} registrants loaded and ready`
    : '⚠️ No registrants loaded - upload CSV or continue without'}
</div>

      <button
        onClick={handleStartRace}
        className="w-full py-4 text-xl font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
      >
        🏁 START RACE MODE
      </button>



{/* Add this new reset button */}
<button
  onClick={onResetApp}
  className="w-full mt-4 py-2 text-sm font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition border-2 border-red-300"
>
  🗑️ Reset App & Clear All Data{hasRaceData ? ' (⚠️ RACE IN PROGRESS)' : ''}
</button>
    </div>
  );
}