"use client";

import { useState } from "react";
import type { Entry } from "@/lib/types";
import type { CategoryBuckets } from "@/lib/categories";
import ResultsTable from "./ResultsTable";
import CategoryLeaderboardGrid from "./CategoryLeaderboardGrid";

interface PublicLeaderboardViewProps {
  raceLabel: string;
  lastSaved: string;
  entries: Entry[]; // already filtered to resolved (wave !== null) finishers
  buckets: CategoryBuckets;
}

export default function PublicLeaderboardView({
  raceLabel,
  lastSaved,
  entries,
  buckets,
}: PublicLeaderboardViewProps) {
  const [view, setView] = useState<"overall" | "categories">("overall");

  return (
    <div
      className="min-h-screen p-2 sm:p-4 bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url(/timing_bg.webp)" }}
    >
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-2xl p-3 sm:p-6">
        <div className="text-center mb-4 sm:mb-6 border-b-4 border-purple-600 pb-3 sm:pb-4">
          <div className="text-3xl sm:text-4xl font-bold text-purple-600 mb-1">
            C510
          </div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-800">
            {raceLabel}
          </h1>
          <p className="text-gray-600 italic text-sm sm:text-base">
            Live Results
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Updated {new Date(lastSaved).toLocaleTimeString()} — refresh for
            the latest
          </p>
        </div>

        <div className="flex gap-2 mb-4 border-b-2 border-gray-200">
          <button
            onClick={() => setView("overall")}
            className={`flex-1 py-2 sm:py-3 text-sm sm:text-base font-bold rounded-t-lg transition ${
              view === "overall"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📋 Overall Results
          </button>
          <button
            onClick={() => setView("categories")}
            className={`flex-1 py-2 sm:py-3 text-sm sm:text-base font-bold rounded-t-lg transition ${
              view === "categories"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            🏆 Categories
          </button>
        </div>

        {view === "overall" ? (
          <>
            <h2 className="text-lg sm:text-2xl font-bold mb-3">
              {entries.length} Finisher{entries.length !== 1 ? "s" : ""}
            </h2>
            <ResultsTable entries={entries} />
          </>
        ) : (
          <CategoryLeaderboardGrid buckets={buckets} />
        )}

        <p className="mt-6 text-sm text-gray-500 text-center">
          Proudly supporting the Alameda County Community Food Bank 🚴💚
        </p>
      </div>
    </div>
  );
}
