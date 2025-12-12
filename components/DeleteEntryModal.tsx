"use client";

import { useState } from "react";
import type { Entry } from "@/lib/types";

interface DeleteEntryModalProps {
  entry: Entry;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteEntryModal({
  entry,
  onConfirm,
  onCancel,
}: DeleteEntryModalProps) {
  const [typedBib, setTypedBib] = useState("");

  const handleConfirm = () => {
    if (typedBib !== entry.bib) {
      alert(`Please type "${entry.bib}" exactly to confirm deletion`);
      return;
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-2 text-red-600">
          🗑️ Delete Timing Entry
        </h2>

        <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg">
          <p className="text-red-800 mb-2">
            Are you sure you want to delete this timing entry?
          </p>
          <div className="bg-white rounded p-2 text-sm">
            <div>
              <strong>Bib:</strong> {entry.bib}
            </div>
            <div>
              <strong>Name:</strong> {entry.firstName} {entry.lastName}
            </div>
            <div>
              <strong>Finish Time:</strong> {entry.finishTime}
            </div>
            <div>
              <strong>Elapsed:</strong> {entry.elapsedTime}
            </div>
          </div>
          <p className="text-red-600 text-sm mt-2 font-semibold">
            ⚠️ This cannot be undone! The finish time will be permanently lost.
          </p>
        </div>

        <div className="mb-4">
          <label className="block mb-2 font-bold text-sm">
            Type "{entry.bib}" to confirm:
          </label>
          <input
            type="text"
            value={typedBib}
            onChange={(e) => setTypedBib(e.target.value)}
            placeholder={entry.bib}
            className="w-full p-2 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={typedBib !== entry.bib}
            className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete Entry
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-gray-400 text-white rounded-lg font-bold hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
