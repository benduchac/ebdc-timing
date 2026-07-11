"use client";

import { useEffect, useState } from "react";
import type { Race, RaceIndexEntry, RaceSnapshot } from "@/lib/types";
import { getStoredPassphrase } from "./OperatorGate";
import TrailHero from "./TrailHero";

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
    <div className="min-h-screen p-4 flex items-center justify-center">
      <div className="max-w-lg w-full rounded-2xl overflow-hidden shadow-xl border border-ink/10">
        <TrailHero
          title="EBDC Timing"
          subtitle="Resume an in-progress race, or start a new one."
        />
        <div className="bg-chalk p-6 sm:p-8">
          {!online && (
            <div className="bg-warning-soft border border-warning/40 rounded-lg p-3 text-sm text-ink-soft mb-4">
              Offline — can&apos;t browse existing races right now. The menu
              lights up once you&apos;re back online. You can still start a
              new race.
            </div>
          )}

          {online && (
            <div className="mb-6">
              <h2 className="font-mono text-xs uppercase tracking-wider text-ink-soft mb-2">
                Resume a race
              </h2>
              {races === null && !listError && (
                <p className="text-sm text-ink-soft">Loading…</p>
              )}
              {listError && (
                <p className="text-sm text-danger">{listError}</p>
              )}
              {races && races.length === 0 && !listError && (
                <p className="text-sm text-ink-soft">No races found yet.</p>
              )}
              {races && races.length > 0 && (
                <ul className="space-y-2 max-h-56 overflow-y-auto">
                  {races.map((r) => (
                    <li
                      key={r.id}
                      className="border border-ink/10 border-l-4 border-l-moss rounded-lg p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-ink truncate">
                          {r.label}
                        </div>
                        <div className="text-xs text-ink-soft">
                          {r.entryCount} finishers · synced{" "}
                          {new Date(r.lastSaved).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpen(r)}
                        disabled={openingId === r.id}
                        className="shrink-0 px-3 py-1.5 bg-moss text-chalk rounded-lg text-sm font-semibold hover:bg-moss-dark disabled:opacity-50"
                      >
                        {openingId === r.id ? "Opening…" : "Open"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-ink/10 pt-4">
            <h2 className="font-mono text-xs uppercase tracking-wider text-ink-soft mb-2">
              Or start a new race
            </h2>
            <form onSubmit={handleSubmitCreate}>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full border-2 border-ink/15 bg-sand rounded-lg px-3 py-2 mb-3 focus:border-clay focus:outline-none"
              />
              <button
                type="submit"
                disabled={!label.trim()}
                className="w-full py-3 bg-clay text-chalk rounded-lg font-bold hover:bg-clay-dark disabled:opacity-50"
              >
                Start Race
              </button>
            </form>
            <p className="mt-3 text-xs text-ink-soft text-center">
              Do this while online — it registers the race in the cloud,
              which is what makes a lost or dead scoring laptop recoverable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
