'use client';

import { useState, useEffect } from 'react';
import type { Entry, Registrant } from '@/lib/types';

interface EditModalProps {
  entry: Entry | null;
  registrants: Map<string, Registrant>;
  waveStartTimes: { A: Date; B: Date; C: Date };
  onSave: (updatedEntry: Entry) => void;
  onClose: () => void;
}

export default function EditModal({ entry, registrants, waveStartTimes, onSave, onClose }: EditModalProps) {
  const [editBib, setEditBib] = useState('');
  const [editWave, setEditWave] = useState<'A' | 'B' | 'C'>('A');
  const [editFinishTime, setEditFinishTime] = useState('');

  useEffect(() => {
    if (entry) {
      setEditBib(entry.bib);
      setEditWave(entry.wave || 'A');
      
      // Convert finish time to HH:MM:SS format
      const finishDate = new Date(entry.finishTimeMs);
      const hours = String(finishDate.getHours()).padStart(2, '0');
      const minutes = String(finishDate.getMinutes()).padStart(2, '0');
      const seconds = String(finishDate.getSeconds()).padStart(2, '0');
      setEditFinishTime(`${hours}:${minutes}:${seconds}`);
    }
  }, [entry]);

  if (!entry) return null;

  const handleSave = () => {
    const rider = registrants.get(editBib.trim());
    const today = new Date().toISOString().split('T')[0];
    const newFinishDate = new Date(`${today}T${editFinishTime}`);
    
    const updatedEntry: Entry = {
      ...entry,
      bib: editBib.trim(),
      wave: editWave,
      firstName: rider ? rider.firstName : entry.firstName,
      lastName: rider ? rider.lastName : entry.lastName,
      finishTimeMs: newFinishDate.getTime(),
      finishTime: newFinishDate.toLocaleTimeString('en-US', { hour12: false }),
      elapsedMs: newFinishDate.getTime() - waveStartTimes[editWave].getTime(),
      elapsedTime: formatElapsedTime(newFinishDate.getTime() - waveStartTimes[editWave].getTime())
    };

    onSave(updatedEntry);
  };

  const formatElapsedTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">Edit Entry</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block mb-2 font-bold text-sm">Bib Number</label>
            <input
              type="text"
              inputMode="numeric"
              value={editBib}
              onChange={(e) => setEditBib(e.target.value)}
              className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
            />
            <p className="text-xs text-gray-600 mt-1 italic">💡 Changing bib updates rider info</p>
          </div>

          <div>
            <label className="block mb-2 font-bold text-sm">Wave</label>
            <div className="flex gap-2">
              {(['A', 'B', 'C'] as const).map((wave) => (
                <button
                  key={wave}
                  onClick={() => setEditWave(wave)}
                  className={`flex-1 py-2 rounded-lg font-bold transition ${
                    editWave === wave
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {wave}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1 italic">💡 Changing wave recalculates elapsed time</p>
          </div>

          <div>
            <label className="block mb-2 font-bold text-sm">Finish Time (HH:MM:SS)</label>
            <input
              type="time"
              step="1"
              value={editFinishTime}
              onChange={(e) => setEditFinishTime(e.target.value)}
              className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
            />
            <p className="text-xs text-gray-600 mt-1 italic">⚠️ Only change if you have photo timestamp proof</p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700"
          >
            Save Changes
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-400 text-white rounded-lg font-bold hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}