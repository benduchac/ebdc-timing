'use client';

import { useState, useEffect } from 'react';
import type { Entry } from '@/lib/types';
import { formatElapsedTime } from '@/lib/utils';

interface WaveStatusBoxesProps {
  waveStartTimes: { A: Date; B: Date; C: Date };
  entries: Entry[];
  registrants: Map<string, { wave: 'A' | 'B' | 'C' }>;
  onEditWaveTime: (wave: 'A' | 'B' | 'C') => void;  // ← ADD THIS LINE
}

export default function WaveStatusBoxes({ waveStartTimes, entries, registrants, onEditWaveTime }: WaveStatusBoxesProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Count total registered riders per wave
  const totalByWave = { A: 0, B: 0, C: 0 };
  registrants.forEach((rider) => {
    totalByWave[rider.wave]++;
  });

  // Count finished riders per wave
  const finishedByWave = {
    A: entries.filter(e => e.wave === 'A').length,
    B: entries.filter(e => e.wave === 'B').length,
    C: entries.filter(e => e.wave === 'C').length
  };

  const waves: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {waves.map((wave) => {
        const elapsed = currentTime.getTime() - waveStartTimes[wave].getTime();
        const elapsedStr = formatElapsedTime(elapsed);
        const finished = finishedByWave[wave];
        const total = totalByWave[wave];
        const startTimeStr = waveStartTimes[wave].toLocaleTimeString('en-US', { 
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true 
        });

return (
  <button
    key={wave}
    onClick={() => onEditWaveTime(wave)}
    className="bg-gradient-to-br from-purple-100 to-purple-200 border-2 border-purple-400 rounded-lg p-3 text-center hover:from-purple-200 hover:to-purple-300 hover:border-purple-500 transition-all cursor-pointer group"
  >
    <div className="flex items-center justify-between mb-1">
      <div className="text-sm font-bold text-purple-800">WAVE {wave}</div>
      <div className="text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity">
        ✏️
      </div>
    </div>
    <div className="text-2xl font-bold text-purple-900 mb-1 font-mono">{elapsedStr}</div>
    <div className="text-xs text-purple-700 mb-1 font-semibold">
      {finished}/{total} finished
    </div>
    <div className="text-xs text-purple-600 font-mono">
      Started: {startTimeStr}
    </div>
    <div className="text-xs text-purple-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      Click to edit start time
    </div>
  </button>
);
      })}
    </div>
  );
}