'use client';

import { useState } from 'react';
import ClockVerification from './ClockVerification';
import type { Registrant } from '@/lib/types';

interface SetupScreenProps {
  onStartRace: (config: {
    waveStartTimes: { A: string; B: string; C: string };
    registrants: Map<string, Registrant>;
  }) => void;
}

export default function SetupScreen({ onStartRace }: SetupScreenProps) {
  const [waveATime, setWaveATime] = useState('09:00:00');
  const [waveBTime, setWaveBTime] = useState('09:15:00');
  const [waveCTime, setWaveCTime] = useState('09:30:00');
  const [registrants, setRegistrants] = useState<Map<string, Registrant>>(new Map());
  const [registrantCount, setRegistrantCount] = useState(0);

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
    <div className="bg-gray-100 border-2 border-dashed border-purple-600 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-bold text-center text-purple-600 mb-6">
        ⚙️ Pre-Race Setup
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block mb-2 font-bold text-sm">Wave A Start Time</label>
          <input
            type="time"
            step="1"
            value={waveATime}
            onChange={(e) => setWaveATime(e.target.value)}
            className="w-full p-2 text-lg border-2 border-gray-300 rounded-lg"
          />
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block mb-2 font-bold text-sm">Wave B Start Time</label>
          <input
            type="time"
            step="1"
            value={waveBTime}
            onChange={(e) => setWaveBTime(e.target.value)}
            className="w-full p-2 text-lg border-2 border-gray-300 rounded-lg"
          />
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block mb-2 font-bold text-sm">Wave C Start Time</label>
          <input
            type="time"
            step="1"
            value={waveCTime}
            onChange={(e) => setWaveCTime(e.target.value)}
            className="w-full p-2 text-lg border-2 border-gray-300 rounded-lg"
          />
        </div>
      </div>

      <div className="mb-6">
        <ClockVerification />
      </div>

      <div
        onClick={() => document.getElementById('csvInput')?.click()}
        className="bg-white p-6 rounded-lg text-center border-2 border-dashed border-purple-600 cursor-pointer hover:bg-gray-50 transition mb-4"
      >
        <input
          id="csvInput"
          type="file"
          accept=".csv"
          onChange={handleCSVUpload}
          className="hidden"
        />
        <p className="text-lg font-semibold mb-2">📄 Click to Load Registrants CSV</p>
        <p className="text-sm text-gray-600">Expected format: Bib, FirstName, LastName, Wave</p>
      </div>

      {registrantCount > 0 && (
        <div className="bg-green-100 border-2 border-green-500 rounded-lg p-4 text-center font-bold text-green-800 mb-6">
          ✅ Loaded {registrantCount} registrants
        </div>
      )}

      <button
        onClick={handleStartRace}
        className="w-full py-4 text-xl font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
      >
        🏁 START RACE MODE
      </button>
    </div>
  );
}