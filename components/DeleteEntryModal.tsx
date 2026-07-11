"use client";

import { useState } from "react";
import type { Entry } from "@/lib/types";
import { normalizeBib } from "@/lib/utils";

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
    if (normalizeBib(typedBib) !== entry.bib) {
      alert(`Please type "${entry.bib}" exactly to confirm deletion`);
      return;
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
      <div className="bg-chalk rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="font-display uppercase tracking-tight text-xl mb-2 text-danger">
          Delete timing entry
        </h2>

        <div className="mb-4 p-3 bg-danger-soft border-2 border-danger/40 rounded-lg">
          <p className="text-ink mb-2">
            Are you sure you want to delete this timing entry?
          </p>
          <div className="bg-chalk rounded p-2 text-sm">
            <div>
              <strong>Bib:</strong> {entry.bib}
            </div>
            <div>
              <strong>Name:</strong> {entry.firstName} {entry.lastName}
            </div>
            <div>
              <strong>Finish time:</strong> {entry.finishTime}
            </div>
            <div>
              <strong>Elapsed:</strong> {entry.elapsedTime}
            </div>
          </div>
          <p className="text-danger text-sm mt-2 font-semibold">
            This cannot be undone! The finish time will be permanently lost.
          </p>
        </div>

        <div className="mb-4">
          <label className="block mb-2 font-semibold text-sm text-ink-soft">
            Type &quot;{entry.bib}&quot; to confirm:
          </label>
          <input
            type="text"
            value={typedBib}
            onChange={(e) => setTypedBib(e.target.value)}
            placeholder={entry.bib}
            className="w-full p-2 border-2 border-ink/15 bg-sand rounded-lg focus:border-danger focus:outline-none"
            autoFocus
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={typedBib !== entry.bib}
            className="flex-1 py-2 bg-danger text-chalk rounded-lg font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete entry
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-ink/15 text-ink rounded-lg font-bold hover:bg-ink/25"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
