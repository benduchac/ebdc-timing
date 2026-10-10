"use client";

import { useState } from "react";
import type { Entry, PhotosByEntry } from "@/lib/types";
import RankedRow from "@/components/RankedRow";
import type { CategoryBoard } from "@/lib/categories";
import { computeStandardRanks } from "@/lib/utils";

interface CategoryLeaderboardGridProps {
  buckets: CategoryBoard[];
  // Approved photos by entry id. Only the public leaderboard passes this.
  photos?: PhotosByEntry;
  // Every board open to its expanded length, with no toggle. For the TV view,
  // which nobody can click.
  expanded?: boolean;
}

interface LeaderboardCardProps {
  title: string;
  entries: Entry[];
  displayLimit: number;
  expandLimit: number;
  photos?: PhotosByEntry;
  expanded?: boolean;
}

// Deliberately takes only Entry[] — no registrants, no age, nothing beyond
// what's already on a finish record (name, bib, wave, times). This is what
// makes it safe to reuse for the public leaderboard: the caller (a Server
// Component with real registrant data) does the age/gender bucketing
// server-side via lib/categories.ts's computeCategoryBuckets and only ever
// passes the resulting Entry[] buckets down — age never reaches the
// client bundle.
function LeaderboardCard({
  title,
  entries,
  displayLimit,
  expandLimit,
  photos,
  expanded = false,
}: LeaderboardCardProps) {
  const [showAll, setShowAll] = useState(expanded);

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

  // Ranks computed over the full list before truncating to the display
  // limit, so showing fewer rows never shifts a tie group's numbers.
  const ranks = computeStandardRanks(entries);
  const displayedEntries = entries.slice(0, showAll ? expandLimit : displayLimit);
  const hasMore = entries.length > displayLimit;
  const collapseLabel =
    displayLimit === 1 ? "Show winner only" : `Show top ${displayLimit}`;
  const expandLabel =
    entries.length <= expandLimit
      ? `Show all ${entries.length} finishers`
      : `Show top ${expandLimit}`;

  return (
    <div className="bg-chalk border border-ink/10 rounded-lg p-4">
      <h3 className="font-display uppercase tracking-tight text-lg mb-3 text-moss-dark">
        {title}
      </h3>
      <div className="space-y-2">
        {displayedEntries.map((entry, index) => (
          <RankedRow
            key={entry.id}
            entry={entry}
            place={ranks[index]}
            photo={photos?.[entry.id]}
          />
        ))}
      </div>

      {hasMore && !expanded && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2 bg-sand text-moss-dark rounded-lg font-semibold hover:bg-ink/10 transition"
        >
          {showAll ? collapseLabel : expandLabel}
        </button>
      )}

      <div className="mt-3 pt-3 border-t border-ink/10 text-xs text-ink-soft text-center">
        {entries.length} finisher{entries.length !== 1 ? "s" : ""} total
        {displayedEntries.length < entries.length &&
          ` (showing top ${displayedEntries.length})`}
      </div>
    </div>
  );
}

export default function CategoryLeaderboardGrid({
  buckets,
  photos,
  expanded,
}: CategoryLeaderboardGridProps) {
  return (
    <div className="space-y-4">
      <h2 className="font-display uppercase tracking-tight text-xl text-center text-moss-dark">
        Category leaderboards
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {buckets.map((board) => (
          <LeaderboardCard
            key={board.id}
            title={board.name}
            entries={board.entries}
            displayLimit={board.displayLimit}
            expandLimit={board.expandLimit}
            photos={photos}
            expanded={expanded}
          />
        ))}
      </div>
    </div>
  );
}
