"use client";

import { useEffect, useState } from "react";
import type { Race, RaceIndexEntry, RaceSnapshot } from "@/lib/types";
import { getStoredPassphrase } from "./OperatorGate";

interface RaceMenuScreenProps {
  onCreate: (label: string) => void;
  onOpen: (race: Race, snapshot: RaceSnapshot) => void;
}

// Recovery-aware startup screen: shown when there's no local activeRace. If
// online, offers to resume any race from the cloud registry; always offers
// Start New. See docs/race-readiness-design.md "Race lifecycle & recovery".
export default function RaceMenuScreen({ onCreate, onOpen }: RaceMenuScreenProps) {
  const [online, setOnline] = useState(true);
  const [races, setRaces] = useState<RaceIndexEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [label, setLabel] = useState(
    `East Bay Dirt Classic – ${new Date().toLocaleDateString()}`
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      setRaces(null);
      return;
    }
    const passphrase = getStoredPassphrase();
    if (!passphrase) return;

    let cancelled = false;
    setListError(null);
    fetch("/api/races", { headers: { Authorization: `Bearer ${passphrase}` } })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setListError(data.error ?? "Couldn't load the race menu.");
          setRaces([]);
          return;
        }
        setRaces(data.races);
      })
      .catch(() => {
        if (!cancelled) {
          setListError("Couldn't reach the server.");
          setRaces([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [online]);

  const handleOpen = async (entry: RaceIndexEntry) => {
    const passphrase = getStoredPassphrase();
    if (!passphrase) return;
    setOpeningId(entry.id);
    try {
      const res = await fetch(
        `/api/backup?id=${encodeURIComponent(entry.id)}`,
        { headers: { Authorization: `Bearer ${passphrase}` } }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error ?? "Couldn't open that race.");
        return;
      }
      const snapshot: RaceSnapshot = data.snapshot;
      onOpen(
        {
          id: snapshot.raceId,
          label: snapshot.label,
          createdAt: snapshot.createdAt,
          slug: snapshot.slug,
        },
        snapshot
      );
    } catch {
      alert("Couldn't reach the server.");
    } finally {
      setOpeningId(null);
    }
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
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
      <div className="max-w-lg w-full bg-white rounded-xl shadow-2xl p-8">
        <div className="text-4xl font-bold text-purple-600 mb-1 text-center">
          C510
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-1 text-center">
          Race Menu
        </h1>
        <p className="text-gray-600 text-sm text-center mb-6">
          Resume an in-progress race, or start a new one.
        </p>

        {!online && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800 mb-4">
            Offline — can&apos;t browse existing races right now. The menu
            lights up once you&apos;re back online. You can still start a new
            race.
          </div>
        )}

        {online && (
          <div className="mb-6">
            <h2 className="font-semibold text-sm text-gray-700 mb-2">
              Resume a race
            </h2>
            {races === null && !listError && (
              <p className="text-sm text-gray-500">Loading…</p>
            )}
            {listError && <p className="text-sm text-red-600">{listError}</p>}
            {races && races.length === 0 && !listError && (
              <p className="text-sm text-gray-500">No races found yet.</p>
            )}
            {races && races.length > 0 && (
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {races.map((r) => (
                  <li
                    key={r.id}
                    className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 truncate">
                        {r.label}
                      </div>
                      <div className="text-xs text-gray-500">
                        {r.entryCount} finishers · synced{" "}
                        {new Date(r.lastSaved).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpen(r)}
                      disabled={openingId === r.id}
                      className="shrink-0 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
                    >
                      {openingId === r.id ? "Opening…" : "Open"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="border-t border-gray-200 pt-4">
          <h2 className="font-semibold text-sm text-gray-700 mb-2">
            Or start a new race
          </h2>
          <form onSubmit={handleSubmitCreate}>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 mb-3 focus:border-purple-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!label.trim()}
              className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50"
            >
              Start Race
            </button>
          </form>
          <p className="mt-3 text-xs text-gray-500 text-center">
            Do this while online — it registers the race in the cloud, which
            is what makes a lost or dead scoring laptop recoverable.
          </p>
        </div>
      </div>
    </div>
  );
}
