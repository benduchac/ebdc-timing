"use client";

import { useState } from "react";
import type { Entry } from "@/lib/types";
import type { CategoryBoard } from "@/lib/categories";
import { formatElapsedHuman, computeStandardRanks } from "@/lib/utils";
import BibChip from "@/components/BibChip";
import TimeChip from "@/components/TimeChip";
import RankBadge from "@/components/RankBadge";

interface CategoryLeaderboardGridProps {
  buckets: CategoryBoard[];
}

interface LeaderboardCardProps {
  title: string;
  entries: Entry[];
  displayLimit: number;
}

// One ranked row — bib, name, wave, elapsed — shared by the category ranked
// list and an award card's expanded full-results view, so the two don't
// drift into slightly different row markup.
function RankedRow({ entry, place }: { entry: Entry; place: number }) {
  return (
    <div className="flex items-center gap-2 text-sm border-b border-ink/10 pb-2">
      <RankBadge place={place} className="w-6 h-6 shrink-0 text-xs" />
      <BibChip bib={entry.bib} className="text-xs" />
      <div className="flex-1 truncate">
        <div className="font-semibold">
          {entry.firstName} {entry.lastName}
        </div>
        <div className="text-xs text-ink-soft">Wave {entry.wave}</div>
      </div>
      <TimeChip className="text-xs">
        {entry.elapsedMs !== null ? formatElapsedHuman(entry.elapsedMs) : "N/A"}
      </TimeChip>
    </div>
  );
}

// Deliberately takes only Entry[] — no registrants, no DOB, nothing beyond
// what's already on a finish record (name, bib, wave, times). This is what
// makes it safe to reuse for the public leaderboard: the caller (a Server
// Component with real registrant data) does the age/gender bucketing
// server-side via lib/categories.ts's computeCategoryBuckets and only ever
// passes the resulting Entry[] buckets down — birthdate never reaches the
// client bundle.
function LeaderboardCard({ title, entries, displayLimit }: LeaderboardCardProps) {
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

  // Ranks computed over the full list before truncating to the display
  // limit, so showing fewer rows never shifts a tie group's numbers.
  const ranks = computeStandardRanks(entries);
  const displayedEntries = showAll ? entries : entries.slice(0, displayLimit);
  const hasMore = entries.length > displayLimit;

  return (
    <div className="bg-chalk border border-ink/10 rounded-lg p-4">
      <h3 className="font-display uppercase tracking-tight text-lg mb-3 text-moss-dark">
        {title}
      </h3>
      <div className="space-y-2">
        {displayedEntries.map((entry, index) => (
          <RankedRow key={entry.id} entry={entry} place={ranks[index]} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2 bg-sand text-moss-dark rounded-lg font-semibold hover:bg-ink/10 transition"
        >
          {showAll ? `Show top ${displayLimit}` : `Show all ${entries.length} finishers`}
        </button>
      )}

      <div className="mt-3 pt-3 border-t border-ink/10 text-xs text-ink-soft text-center">
        {entries.length} finisher{entries.length !== 1 ? "s" : ""} total
        {hasMore && !showAll && ` (showing top ${displayLimit})`}
      </div>
    </div>
  );
}

interface AwardCardProps {
  title: string;
  entries: Entry[];
}

// A fun award has one winner, not a ranked field — this is a spotlight, not
// a leaderboard. Entries are pre-sorted by elapsed time, so the winner(s)
// are just the front of the list; more than one name shows only on a genuine
// tie (same elapsedMs), matching the standard-ranking rule used everywhere
// else in the app (tied riders share the place, here place 1). "Show full
// results" expands the same card into the full ranked field, so a rider who
// didn't win can still see where they landed — collapses back to the
// spotlight rather than living as a separate view.
function AwardCard({ title, entries }: AwardCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) {
    return (
      <div className="bg-chalk border border-ink/10 rounded-lg p-4 text-center">
        <h3 className="font-display uppercase tracking-tight text-sm mb-2 text-moss-dark">
          {title}
        </h3>
        <div className="text-ink-soft text-sm py-4">No finishers yet</div>
      </div>
    );
  }

  const winners = entries.filter((e) => e.elapsedMs === entries[0].elapsedMs);
  const hasMore = entries.length > winners.length;

  if (expanded) {
    const ranks = computeStandardRanks(entries);
    return (
      <div className="bg-chalk border border-ink/10 rounded-lg p-4">
        <h3 className="font-display uppercase tracking-tight text-sm mb-3 text-moss-dark text-center">
          {title}
        </h3>
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <RankedRow key={entry.id} entry={entry} place={ranks[index]} />
          ))}
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="w-full mt-3 py-2 bg-sand text-moss-dark rounded-lg font-semibold hover:bg-ink/10 transition text-sm"
        >
          Show winner only
        </button>
      </div>
    );
  }

  return (
    <div className="bg-chalk border border-ink/10 rounded-lg p-4 text-center">
      <h3 className="font-display uppercase tracking-tight text-sm mb-3 text-moss-dark">
        {title}
      </h3>
      <div className="flex justify-center mb-2">
        <RankBadge place={1} className="w-8 h-8 text-sm" />
      </div>
      {winners.map((entry) => (
        <div key={entry.id} className="font-display text-lg text-ink leading-tight">
          {entry.firstName} {entry.lastName}
        </div>
      ))}
      <div className="mt-2">
        <TimeChip className="text-xs">
          {winners[0].elapsedMs !== null
            ? formatElapsedHuman(winners[0].elapsedMs)
            : "N/A"}
        </TimeChip>
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full mt-3 py-1.5 text-xs text-moss-dark underline hover:no-underline"
        >
          Show full results ({entries.length})
        </button>
      )}
    </div>
  );
}

export default function CategoryLeaderboardGrid({
  buckets,
}: CategoryLeaderboardGridProps) {
  const awardBoards = buckets.filter((b) => b.kind === "award");
  const categoryBoards = buckets.filter((b) => b.kind === "category");

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="font-display uppercase tracking-tight text-xl text-center text-moss-dark">
          Fun awards
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {awardBoards.map((board) => (
            <AwardCard key={board.id} title={board.name} entries={board.entries} />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-display uppercase tracking-tight text-xl text-center text-moss-dark">
          Category leaderboards
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categoryBoards.map((board) => (
            <LeaderboardCard
              key={board.id}
              title={board.name}
              entries={board.entries}
              displayLimit={board.displayLimit ?? 10}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
