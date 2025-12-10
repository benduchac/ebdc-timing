"use client";

import type { Entry, Registrant } from "@/lib/types";
import { formatElapsedTime } from "@/lib/utils";
import {
  filterByCategory,
  getTopEntries,
  calculateAge,
} from "@/lib/categories";

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

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-bold mb-3 text-purple-600">
        {emoji} {title}
      </h3>
      <div className="space-y-2">
        {entries.map((entry, index) => {
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
      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 text-center">
        {entries.length} finisher{entries.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export default function CategoryLeaderboards({
  entries,
  registrants,
}: CategoryLeaderboardsProps) {
  // Filter entries for each category
  const overallMale = getTopEntries(
    filterByCategory(entries, registrants, "male"),
    10
  );
  const overallFemale = getTopEntries(
    filterByCategory(entries, registrants, "female"),
    10
  );

  const juniorMale = getTopEntries(
    filterByCategory(entries, registrants, "male", "junior"),
    10
  );
  const juniorFemale = getTopEntries(
    filterByCategory(entries, registrants, "female", "junior"),
    10
  );

  const masters = getTopEntries(
    filterByCategory(entries, registrants, undefined, "masters"),
    10
  );

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
          title="Junior Male (U18)"
          emoji="🏅"
          entries={juniorMale}
          registrants={registrants}
        />
        <LeaderboardCard
          title="Junior Female (U18)"
          emoji="🏅"
          entries={juniorFemale}
          registrants={registrants}
        />
      </div>

      {/* Row 3: Masters (Combined) */}
      <div className="grid grid-cols-1 gap-4">
        <LeaderboardCard
          title="Masters (55+)"
          emoji="🏆"
          entries={masters}
          registrants={registrants}
        />
      </div>
    </div>
  );
}
