"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Entry } from "@/lib/types";
import type { CategoryBuckets } from "@/lib/categories";
import ResultsTable from "./ResultsTable";
import CategoryLeaderboardGrid from "./CategoryLeaderboardGrid";
import TrailHero from "./TrailHero";

interface PublicLeaderboardViewProps {
  raceLabel: string;
  lastSaved: string;
  entries: Entry[]; // already filtered to resolved (wave !== null) finishers
  buckets: CategoryBuckets;
}

const REFRESH_INTERVAL_MS = 20_000;

export default function PublicLeaderboardView({
  raceLabel,
  lastSaved,
  entries,
  buckets,
}: PublicLeaderboardViewProps) {
  const [view, setView] = useState<"overall" | "categories">("overall");
  const router = useRouter();

  // router.refresh() re-runs the Server Component (fresh data from Redis)
  // without a full page reload, so the Overall/Categories tab selection and
  // scroll position survive each refresh.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="min-h-screen p-2 sm:p-4">
      <div className="max-w-6xl mx-auto rounded-2xl overflow-hidden shadow-xl">
        <TrailHero
          title={raceLabel}
          subtitle={
            <>
              Live results — updated{" "}
              {new Date(lastSaved).toLocaleTimeString()}, refreshes
              automatically
            </>
          }
        />

        <div className="bg-chalk p-3 sm:p-6">
          <div className="flex gap-2 mb-4 border-b-2 border-ink/10">
            <button
              onClick={() => setView("overall")}
              className={`flex-1 py-2 sm:py-3 text-sm sm:text-base font-bold rounded-t-lg transition ${
                view === "overall"
                  ? "bg-moss text-chalk"
                  : "bg-sand text-ink-soft hover:bg-ink/5"
              }`}
            >
              Overall results
            </button>
            <button
              onClick={() => setView("categories")}
              className={`flex-1 py-2 sm:py-3 text-sm sm:text-base font-bold rounded-t-lg transition ${
                view === "categories"
                  ? "bg-moss text-chalk"
                  : "bg-sand text-ink-soft hover:bg-ink/5"
              }`}
            >
              Categories
            </button>
          </div>

          {view === "overall" ? (
            <>
              <h2 className="font-display uppercase tracking-tight text-lg sm:text-2xl mb-3 text-moss-dark">
                {entries.length} finisher{entries.length !== 1 ? "s" : ""}
              </h2>
              <ResultsTable entries={entries} />
            </>
          ) : (
            <CategoryLeaderboardGrid buckets={buckets} />
          )}

          <p className="mt-6 text-sm text-ink-soft text-center">
            Proudly supporting the Alameda County Community Food Bank
          </p>
        </div>
      </div>
    </div>
  );
}
