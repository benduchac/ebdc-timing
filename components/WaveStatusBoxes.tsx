'use client';

import { useState, useEffect } from 'react';
import type { Entry } from '@/lib/types';
import { formatElapsedTime } from '@/lib/utils';

interface WaveStatusBoxesProps {
  waveStartTimes: { A: Date; B: Date; C: Date };
  entries: Entry[];
  registrants: Map<string, { wave: 'A' | 'B' | 'C' }>;
}

export default function WaveStatusBoxes({ waveStartTimes, entries, registrants }: WaveStatusBoxesProps) {
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

        return (
          <div
            key={wave}
            className="bg-gradient-to-br from-purple-100 to-purple-200 border-2 border-purple-400 rounded-lg p-3 text-center"
          >
            <div className="text-sm font-bold text-purple-800 mb-1">WAVE {wave}</div>
            <div className="text-2xl font-bold text-purple-900 mb-1">{elapsedStr}</div>
            <div className="text-sm font-semibold text-purple-700">
              {finished}/{total} back
            </div>
          </div>
        );
      })}
    </div>
  );
}