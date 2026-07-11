"use client";

import { useState } from "react";
import type { Entry } from "@/lib/types";
import type { CategoryBuckets } from "@/lib/categories";
import { formatElapsedTime } from "@/lib/utils";
import BibChip from "@/components/BibChip";
import TimeChip from "@/components/TimeChip";
import RankBadge from "@/components/RankBadge";

interface CategoryLeaderboardGridProps {
  buckets: CategoryBuckets;
}

interface LeaderboardCardProps {
  title: string;
  entries: Entry[];
}

// Deliberately takes only Entry[] — no registrants, no DOB, nothing beyond
// what's already on a finish record (name, bib, wave, times). This is what
// makes it safe to reuse for the public leaderboard: the caller (a Server
// Component with real registrant data) does the age/gender bucketing
// server-side via lib/categories.ts's computeCategoryBuckets and only ever
// passes the resulting Entry[] buckets down — birthdate never reaches the
// client bundle.
function LeaderboardCard({ title, entries }: LeaderboardCardProps) {
  const [showAll, setShowAll] = useState(false);

  if (entries.length === 0) {
    return (
      <div className="bg-chalk border border-ink/10 rounded-lg p-4">
        <h3 className="font-display uppercase tracking-tight text-lg mb-3 text-moss-dark">
          {title}
        </h3>
        <div className="text-center text-ink-soft text-sm py-8">
          No finishers yet
        </div>
      </div>
    );
  }

  const displayedEntries = showAll ? entries : entries.slice(0, 10);
  const hasMore = entries.length > 10;

  return (
    <div className="bg-chalk border border-ink/10 rounded-lg p-4">
      <h3 className="font-display uppercase tracking-tight text-lg mb-3 text-moss-dark">
        {title}
      </h3>
      <div className="space-y-2">
        {displayedEntries.map((entry, index) => {
          const place = index + 1;

          return (
            <div
              key={entry.id}
              className="flex items-center gap-2 text-sm border-b border-ink/10 pb-2"
            >
              <RankBadge place={place} className="w-6 h-6 shrink-0 text-xs" />
              <BibChip bib={entry.bib} className="text-xs" />
              <div className="flex-1 truncate">
                <div className="font-semibold">
                  {entry.firstName} {entry.lastName}
                </div>
                <div className="text-xs text-ink-soft">Wave {entry.wave}</div>
              </div>
              <TimeChip className="text-xs">
                {entry.elapsedMs !== null
                  ? formatElapsedTime(entry.elapsedMs)
                  : "N/A"}
              </TimeChip>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2 bg-sand text-moss-dark rounded-lg font-semibold hover:bg-ink/10 transition"
        >
          {showAll ? "Show top 10" : `Show all ${entries.length} finishers`}
        </button>
      )}

      <div className="mt-3 pt-3 border-t border-ink/10 text-xs text-ink-soft text-center">
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
      <h2 className="font-display uppercase tracking-tight text-2xl text-center mb-6 text-moss-dark">
        Category leaderboards
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LeaderboardCard title="Overall male" entries={buckets.overallMale} />
        <LeaderboardCard
          title="Overall female"
          entries={buckets.overallFemale}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LeaderboardCard
          title="Junior male (18U)"
          entries={buckets.juniorMale}
        />
        <LeaderboardCard
          title="Junior female (18U)"
          entries={buckets.juniorFemale}
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <LeaderboardCard title="Masters (50+)" entries={buckets.masters} />
      </div>
    </div>
  );
}
