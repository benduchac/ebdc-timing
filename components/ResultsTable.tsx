'use client';

import type { Entry } from '@/lib/types';
import { formatElapsedTime } from '@/lib/utils';

interface ResultsTableProps {
  entries: Entry[];
  onEditEntry: (id: number) => void;
}

export default function ResultsTable({ entries, onEditEntry }: ResultsTableProps) {
  // Separate valid entries from unknown
  const validEntries = entries.filter(e => e.wave !== null);
  const unknownEntries = entries.filter(e => e.wave === null);
  
  // Sort valid entries by elapsed time
  const sortedValid = [...validEntries].sort((a, b) => {
    if (a.elapsedMs === null || b.elapsedMs === null) return 0;
    return a.elapsedMs - b.elapsedMs;
  });

  // Calculate wave placements
  const wavePlacements: Record<'A' | 'B' | 'C', Entry[]> = { A: [], B: [], C: [] };
  validEntries.forEach(entry => {
    if (entry.wave) {
      wavePlacements[entry.wave].push(entry);
    }
  });
  
  // Sort each wave by elapsed time
  Object.keys(wavePlacements).forEach(wave => {
    wavePlacements[wave as 'A' | 'B' | 'C'].sort((a, b) => {
      if (a.elapsedMs === null || b.elapsedMs === null) return 0;
      return a.elapsedMs - b.elapsedMs;
    });
  });

  const getWavePlace = (entry: Entry): number => {
    if (!entry.wave) return 0;
    return wavePlacements[entry.wave].findIndex(e => e.id === entry.id) + 1;
  };

    // Helper to check if a bib is duplicated
const isDuplicateBib = (bib: string, allEntries: Entry[]): boolean => {
  return allEntries.filter(e => e.bib === bib).length > 1;
};

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        No finishers yet. Record your first finish!
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-purple-600 text-white sticky top-0">
            <tr>
              <th className="p-2 text-left">Overall</th>
              <th className="p-2 text-left">Bib</th>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Wave</th>
              <th className="p-2 text-left">Finish Time</th>
              <th className="p-2 text-left">Elapsed</th>
              <th className="p-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {sortedValid.map((entry, index) => {
  const overallPlace = index + 1;
  const wavePlace = getWavePlace(entry);
  const isDuplicate = isDuplicateBib(entry.bib, entries);
  
  return (
    <tr 
      key={entry.id} 
      className={`border-b border-gray-200 hover:bg-gray-50 ${
        isDuplicate ? 'bg-orange-50 border-l-4 border-l-orange-500' : ''
      }`}
    >
      <td className="p-2">
        <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-yellow-400 text-gray-900">
          {overallPlace}
        </span>
      </td>
      <td className="p-2 font-bold">
        {isDuplicate && <span className="text-orange-600 mr-1">⚠️</span>}
        {entry.bib}
      </td>
      <td className="p-2">{entry.firstName} {entry.lastName}</td>
      <td className="p-2">Wave {entry.wave}</td>
      <td className="p-2">
        {new Date(entry.finishTimeMs).toLocaleTimeString('en-US', { 
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true 
        })}
      </td>
      <td className="p-2 font-bold">
        {entry.elapsedMs !== null ? formatElapsedTime(entry.elapsedMs) : 'N/A'}
      </td>
      <td className="p-2">
        <button
          onClick={() => onEditEntry(entry.id)}
          className="text-purple-600 hover:text-purple-800 text-lg"
          title="Edit"
        >
          ✏️
        </button>
      </td>
    </tr>
  );
})}
            
            {unknownEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-gray-200 bg-yellow-50">
                <td className="p-2 text-gray-400">-</td>
                <td className="p-2 text-gray-400">-</td>
                <td className="p-2 font-bold">{entry.bib}</td>
                <td className="p-2">{entry.firstName} {entry.lastName}</td>
                <td className="p-2">
                  <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-yellow-400 text-gray-900">
                    ASSIGN WAVE
                  </span>
                </td>
                <td className="p-2">
                  {new Date(entry.finishTimeMs).toLocaleTimeString('en-US', { 
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true 
                  })}
                </td>
                <td className="p-2 font-bold">
                  {entry.elapsedMs !== null ? formatElapsedTime(entry.elapsedMs) : 'N/A'}
                </td>
                <td className="p-2">
                  <button
                    onClick={() => onEditEntry(entry.id)}
                    className="text-purple-600 hover:text-purple-800 text-lg"
                    title="Edit"
                  >
                    ✏️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}