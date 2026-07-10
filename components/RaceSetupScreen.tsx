"use client";

import { useState } from "react";

interface RaceSetupScreenProps {
  onCreate: (label: string) => void;
}

// Shown once activeRace is null and the local DB has been checked (no
// in-progress race to resume). A full race menu (browse/resume an existing
// cloud race) is deferred — this only mints a new one. See
// docs/race-readiness-design.md "Race lifecycle & recovery".
export default function RaceSetupScreen({ onCreate }: RaceSetupScreenProps) {
  const [label, setLabel] = useState(
    `East Bay Dirt Classic – ${new Date().toLocaleDateString()}`
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    onCreate(trimmed);
  };

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center"
      style={{ backgroundImage: "url(/timing_bg.webp)" }}
    >
      <form
        onSubmit={handleSubmit}
        className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8"
      >
        <div className="text-4xl font-bold text-purple-600 mb-1 text-center">
          C510
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-1 text-center">
          Start a Race
        </h1>
        <p className="text-gray-600 text-sm text-center mb-6">
          Name this race so it can be recovered later if this device is lost
          or replaced.
        </p>

        <label className="block mb-1 font-semibold text-sm text-gray-700">
          Race name
        </label>
        <input
          type="text"
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 mb-4 focus:border-purple-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={!label.trim()}
          className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50"
        >
          Start Race
        </button>

        <p className="mt-4 text-xs text-gray-500 text-center">
          Do this while online — it registers the race in the cloud, which is
          what makes a lost or dead scoring laptop recoverable.
        </p>
      </form>
    </div>
  );
}
