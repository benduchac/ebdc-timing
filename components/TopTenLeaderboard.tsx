"use client";

import type { Entry } from "@/lib/types";
import { formatElapsedTime } from "@/lib/utils";
import BibChip from "@/components/BibChip";
import TimeChip from "@/components/TimeChip";
import RankBadge from "@/components/RankBadge";

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
      <div className="bg-chalk border border-ink/10 rounded-lg p-4">
        <h3 className="font-display uppercase tracking-tight text-lg mb-3 text-moss-dark">
          Top 10 overall
        </h3>
        <div className="text-center text-ink-soft text-sm py-8">
          No finishers yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-chalk border border-ink/10 rounded-lg p-4">
      <h3 className="font-display uppercase tracking-tight text-lg mb-3 text-moss-dark">
        Top 10 overall
      </h3>
      <div className="space-y-2">
        {topTen.map((entry, index) => {
          const place = index + 1;

          return (
            <div
              key={entry.id}
              className="flex items-center gap-2 text-sm border-b border-ink/10 pb-2"
            >
              <RankBadge place={place} className="w-6 h-6 shrink-0 text-xs" />
              <BibChip bib={entry.bib} className="text-xs" />
              <div className="flex-1 truncate">
                {entry.firstName} {entry.lastName}
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
    </div>
  );
}
