'use client';

import { useState, useEffect, useRef } from 'react';
import type { Registrant, Entry } from '@/lib/types';
import { formatElapsedTime } from '@/lib/utils';

interface RaceModeProps {
  waveStartTimes: { A: Date; B: Date; C: Date };
  registrants: Map<string, Registrant>;
  entries: Entry[];
  onRecordEntry: (entry: Omit<Entry, 'id'>) => void;
  onEditEntry: (id: number) => void;
  onExportCSV: () => void;
  onExportBackup: () => void;
  onReturnToSetup: () => void;
}

export default function RaceMode({
  waveStartTimes,
  registrants,
  entries,
  onRecordEntry,
  onEditEntry,
  onExportCSV,
  onExportBackup,
  onReturnToSetup
}: RaceModeProps) {
  const [bibNumber, setBibNumber] = useState('');
  const [riderInfo, setRiderInfo] = useState<Registrant | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('en-US', { hour12: false }));
  const bibInputRef = useRef<HTMLInputElement>(null);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-focus bib input
  useEffect(() => {
    bibInputRef.current?.focus();
  }, [entries.length]);

  // Lookup rider as user types
  useEffect(() => {
    if (!bibNumber) {
      setRiderInfo(null);
      setErrorMessage('');
      return;
    }

    const rider = registrants.get(bibNumber.trim());
    if (rider) {
      setRiderInfo(rider);
      setErrorMessage('');
    } else {
      setRiderInfo(null);
      setErrorMessage(`⚠️ Bib #${bibNumber} not found. Entry will be recorded - use Edit to assign wave.`);
    }
  }, [bibNumber, registrants]);

  const handleRecordFinish = () => {
    if (!bibNumber.trim()) {
      alert('Please enter a bib number!');
      bibInputRef.current?.focus();
      return;
    }

    const now = new Date();
    const rider = registrants.get(bibNumber.trim());
    
    const wave = rider ? rider.wave : null;
    const firstName = rider ? rider.firstName : 'Unknown';
    const lastName = rider ? rider.lastName : 'Rider';
    
    const entry: Omit<Entry, 'id'> = {
      bib: bibNumber.trim(),
      wave,
      firstName,
      lastName,
      finishTime: now.toLocaleTimeString('en-US', { hour12: false }),
      finishTimeMs: now.getTime(),
      elapsedTime: wave ? formatElapsedTime(now.getTime() - waveStartTimes[wave].getTime()) : 'N/A',
      elapsedMs: wave ? (now.getTime() - waveStartTimes[wave].getTime()) : null,
      timestamp: now.toISOString()
    };

    onRecordEntry(entry);
    setBibNumber('');
    setRiderInfo(null);
    setErrorMessage('');
  };

  const handleUnknownFinisher = () => {
    const now = new Date();
    const unknownCount = entries.filter(e => e.bib.startsWith('UNK-')).length;
    
    const entry: Omit<Entry, 'id'> = {
      bib: `UNK-${unknownCount + 1}`,
      wave: null,
      firstName: 'Unknown',
      lastName: 'Rider',
      finishTime: now.toLocaleTimeString('en-US', { hour12: false }),
      finishTimeMs: now.getTime(),
      elapsedTime: 'N/A',
      elapsedMs: null,
      timestamp: now.toISOString()
    };

    onRecordEntry(entry);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRecordFinish();
    } else if (e.key === 'u' || e.key === 'U') {
      if (bibNumber === '') {
        handleUnknownFinisher();
      }
    }
  };

  const waveACounts = entries.filter(e => e.wave === 'A').length;
  const waveBCounts = entries.filter(e => e.wave === 'B').length;
  const waveCCounts = entries.filter(e => e.wave === 'C').length;

  // Get last 10 entries
  const recentEntries = [...entries].reverse().slice(0, 10);

  return (
    <div>
      {/* Status Bar */}
      <div className="bg-gray-100 rounded-lg p-3 mb-4 grid grid-cols-5 gap-3 text-center">
        <div>
          <div className="text-xs text-gray-600">Total</div>
          <div className="text-xl font-bold text-purple-600">{entries.length}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Wave A</div>
          <div className="text-xl font-bold text-purple-600">{waveACounts}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Wave B</div>
          <div className="text-xl font-bold text-purple-600">{waveBCounts}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Wave C</div>
          <div className="text-xl font-bold text-purple-600">{waveCCounts}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Time</div>
          <div className="text-xl font-bold text-purple-600">{currentTime}</div>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-3 mb-4 text-center font-bold text-yellow-800">
        ⚠️ KEEP THIS TAB OPEN! Data auto-saves to IndexedDB
      </div>

      {/* Input Section */}
      <div className="bg-gray-100 rounded-lg p-4 mb-4">
        <label className="block mb-2 font-bold text-sm">Bib Number</label>
        <input
          ref={bibInputRef}
          type="text"
          inputMode="numeric"
          value={bibNumber}
          onChange={(e) => setBibNumber(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter bib number"
          className="w-full p-3 text-lg border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
        />

        {/* Rider Info */}
        {riderInfo && (
          <div className="mt-3 bg-blue-100 border-2 border-blue-400 rounded-lg p-3">
            <div className="text-xl font-bold text-blue-800">
              {riderInfo.firstName} {riderInfo.lastName}
            </div>
            <div className="text-gray-700">
              Wave {riderInfo.wave} • Bib #{riderInfo.bib}
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="mt-3 bg-red-100 border-2 border-red-400 rounded-lg p-3 text-red-800 font-bold text-sm">
            {errorMessage}
          </div>
        )}

        {/* Record Button */}
        <button
          onClick={handleRecordFinish}
          className="w-full mt-3 py-4 text-xl font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
        >
          ✅ RECORD FINISH TIME (Enter)
        </button>

        {/* Unknown Button */}
        <button
          onClick={handleUnknownFinisher}
          className="w-full mt-2 py-3 text-lg font-bold bg-yellow-500 text-gray-900 rounded-lg hover:bg-yellow-600 transition"
        >
          ❓ UNKNOWN FINISHER (U)
        </button>
      </div>

      {/* Recent Finishers */}
      <div className="mb-4">
        <h3 className="text-lg font-bold mb-2">Recent Finishers (Last 10)</h3>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-purple-600 text-white">
              <tr>
                <th className="p-2 text-left">Bib</th>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Wave</th>
                <th className="p-2 text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-500">
                    No finishers yet. Record your first finish!
                  </td>
                </tr>
              ) : (
                recentEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="p-2 font-bold">{entry.bib}</td>
                    <td className="p-2">{entry.firstName} {entry.lastName}</td>
                    <td className="p-2">{entry.wave ? `Wave ${entry.wave}` : <span className="text-yellow-600 font-bold">Unknown</span>}</td>
                    <td className="p-2">{entry.finishTime}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Options Section */}
      <div className="border-t-2 border-gray-300 pt-4">
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="w-full py-3 bg-gray-200 rounded-lg font-bold text-gray-800 hover:bg-gray-300 transition"
        >
          ⚙️ Options & Export
        </button>

        {showOptions && (
          <div className="mt-3 bg-gray-100 rounded-lg p-4 space-y-2">
            <button
              onClick={onExportCSV}
              className="w-full py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
            >
              📊 Export Results CSV
            </button>
            <button
              onClick={onExportBackup}
              className="w-full py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700"
            >
              💾 Download Backup JSON
            </button>
            <button
              onClick={onReturnToSetup}
              className="w-full py-2 bg-yellow-500 text-gray-900 rounded-lg font-bold hover:bg-yellow-600"
            >
              ⚙️ Return to Setup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}