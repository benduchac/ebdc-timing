"use client";

import { useState } from "react";
import type { Entry } from "@/lib/types";
import type { CategoryBuckets } from "@/lib/categories";
import { formatElapsedTime } from "@/lib/utils";

interface CategoryLeaderboardGridProps {
  buckets: CategoryBuckets;
}

interface LeaderboardCardProps {
  title: string;
  emoji: string;
  entries: Entry[];
}

// Deliberately takes only Entry[] — no registrants, no DOB, nothing beyond
// what's already on a finish record (name, bib, wave, times). This is what
// makes it safe to reuse for the public leaderboard: the caller (a Server
// Component with real registrant data) does the age/gender bucketing
// server-side via lib/categories.ts's computeCategoryBuckets and only ever
// passes the resulting Entry[] buckets down — birthdate never reaches the
// client bundle.
function LeaderboardCard({ title, emoji, entries }: LeaderboardCardProps) {
  const [showAll, setShowAll] = useState(false);

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-bold mb-3 text-purple-600">
          {emoji} {title}
        </h3>
        <div className="text-center text-gray-400 text-sm py-8">
          No finishers yet
        </div>
      </div>
    );
  }

  const displayedEntries = showAll ? entries : entries.slice(0, 10);
  const hasMore = entries.length > 10;

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-bold mb-3 text-purple-600">
        {emoji} {title}
      </h3>
      <div className="space-y-2">
        {displayedEntries.map((entry, index) => {
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
                <div className="font-semibold">
                  {entry.firstName} {entry.lastName}
                </div>
                <div className="text-xs text-gray-500">Wave {entry.wave}</div>
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

      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2 bg-purple-100 text-purple-700 rounded-lg font-semibold hover:bg-purple-200 transition"
        >
          {showAll ? "▲ Show Top 10" : `▼ Show All ${entries.length} Finishers`}
        </button>
      )}

      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 text-center">
        {entries.length} finisher{entries.length !== 1 ? "s" : ""} total
        {hasMore && !showAll && " (showing top 10)"}
      </div>
    </div>
  );
}

export default function CategoryLeaderboardGrid({
  buckets,
}: CategoryLeaderboardGridProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-center mb-6">
        📊 Category Leaderboards
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LeaderboardCard
          title="Overall Male"
          emoji="🚴‍♂️"
          entries={buckets.overallMale}
        />
        <LeaderboardCard
          title="Overall Female"
          emoji="🚴‍♀️"
          entries={buckets.overallFemale}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LeaderboardCard
          title="Junior Male (18U)"
          emoji="🏅"
          entries={buckets.juniorMale}
        />
        <LeaderboardCard
          title="Junior Female (18U)"
          emoji="🏅"
          entries={buckets.juniorFemale}
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <LeaderboardCard
          title="Masters (50+)"
          emoji="🏆"
          entries={buckets.masters}
        />
      </div>
    </div>
  );
}
