"use client";

import { useState } from "react";
import type { Entry, Registrant } from "@/lib/types";
import { formatElapsedTime } from "@/lib/utils";
import { filterByCategory, calculateAge } from "@/lib/categories";

interface CategoryLeaderboardsProps {
  entries: Entry[];
  registrants: Map<string, Registrant>;
}

interface LeaderboardCardProps {
  title: string;
  emoji: string;
  entries: Entry[];
  registrants: Map<string, Registrant>;
}

function LeaderboardCard({
  title,
  emoji,
  entries,
  registrants,
}: LeaderboardCardProps) {
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
          const rider = registrants.get(entry.bib);
          const age = rider ? calculateAge(rider.dob) : "?";

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
                <div className="text-xs text-gray-500">
                  Age {age} • Wave {entry.wave}
                </div>
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

export default function CategoryLeaderboards({
  entries,
  registrants,
}: CategoryLeaderboardsProps) {
  // Filter entries for each category - get ALL entries, not just top 10
  const overallMale = filterByCategory(entries, registrants, "male")
    .filter((e) => e.wave !== null && e.elapsedMs !== null)
    .sort((a, b) => {
      if (a.elapsedMs === null || b.elapsedMs === null) return 0;
      return a.elapsedMs - b.elapsedMs;
    });

  const overallFemale = filterByCategory(entries, registrants, "female")
    .filter((e) => e.wave !== null && e.elapsedMs !== null)
    .sort((a, b) => {
      if (a.elapsedMs === null || b.elapsedMs === null) return 0;
      return a.elapsedMs - b.elapsedMs;
    });

  const juniorMale = filterByCategory(entries, registrants, "male", "junior")
    .filter((e) => e.wave !== null && e.elapsedMs !== null)
    .sort((a, b) => {
      if (a.elapsedMs === null || b.elapsedMs === null) return 0;
      return a.elapsedMs - b.elapsedMs;
    });

  const juniorFemale = filterByCategory(
    entries,
    registrants,
    "female",
    "junior"
  )
    .filter((e) => e.wave !== null && e.elapsedMs !== null)
    .sort((a, b) => {
      if (a.elapsedMs === null || b.elapsedMs === null) return 0;
      return a.elapsedMs - b.elapsedMs;
    });

  const masters = filterByCategory(entries, registrants, undefined, "masters")
    .filter((e) => e.wave !== null && e.elapsedMs !== null)
    .sort((a, b) => {
      if (a.elapsedMs === null || b.elapsedMs === null) return 0;
      return a.elapsedMs - b.elapsedMs;
    });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-center mb-6">
        📊 Category Leaderboards
      </h2>

      {/* Row 1: Overall Male & Female */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LeaderboardCard
          title="Overall Male"
          emoji="🚴‍♂️"
          entries={overallMale}
          registrants={registrants}
        />
        <LeaderboardCard
          title="Overall Female"
          emoji="🚴‍♀️"
          entries={overallFemale}
          registrants={registrants}
        />
      </div>

      {/* Row 2: Junior Male & Female */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LeaderboardCard
          title="Junior Male (18U)"
          emoji="🏅"
          entries={juniorMale}
          registrants={registrants}
        />
        <LeaderboardCard
          title="Junior Female (18U)"
          emoji="🏅"
          entries={juniorFemale}
          registrants={registrants}
        />
      </div>

      {/* Row 3: Masters (Combined) */}
      <div className="grid grid-cols-1 gap-4">
        <LeaderboardCard
          title="Masters (50+)"
          emoji="🏆"
          entries={masters}
          registrants={registrants}
        />
      </div>
    </div>
  );
}
