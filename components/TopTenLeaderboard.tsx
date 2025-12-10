"use client";

import type { Entry } from "@/lib/types";
import { formatElapsedTime } from "@/lib/utils";

interface TopTenLeaderboardProps {
  entries: Entry[];
}

export default function TopTenLeaderboard({ entries }: TopTenLeaderboardProps) {
  // Get valid entries and sort by elapsed time
  const validEntries = entries.filter(
    (e) => e.wave !== null && e.elapsedMs !== null
  );
  const sortedEntries = [...validEntries].sort((a, b) => {
    if (a.elapsedMs === null || b.elapsedMs === null) return 0;
    return a.elapsedMs - b.elapsedMs;
  });

  const topTen = sortedEntries.slice(0, 10);

  if (topTen.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-bold mb-3 text-purple-600">
          🏆 Top 10 Overall
        </h3>
        <div className="text-center text-gray-500 text-sm py-8">
          No finishers yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-bold mb-3 text-purple-600">
        🏆 Top 10 Overall
      </h3>
      <div className="space-y-2">
        {topTen.map((entry, index) => {
          const place = index + 1;
          const medalEmoji =
            place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "";

          return (
            <div
              key={entry.id}
              className="flex items-center gap-2 text-sm border-b border-gray-100 pb-2"
            >
              <div className="w-8 font-bold text-purple-600 flex items-center">
                {medalEmoji || place}
              </div>
              <div className="font-mono text-gray-600">#{entry.bib}</div>
              <div className="flex-1 truncate">
                {entry.firstName} {entry.lastName}
              </div>
              <div className="font-bold text-purple-900">
                {entry.elapsedMs !== null
                  ? formatElapsedTime(entry.elapsedMs)
                  : "N/A"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
