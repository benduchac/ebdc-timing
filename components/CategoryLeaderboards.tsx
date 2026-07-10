"use client";

import type { Entry, Registrant } from "@/lib/types";
import { computeCategoryBuckets } from "@/lib/categories";
import CategoryLeaderboardGrid from "./CategoryLeaderboardGrid";

interface CategoryLeaderboardsProps {
  entries: Entry[];
  registrants: Map<string, Registrant>;
}

// Operator-facing wrapper: has the real registrants map locally (it came
// from the operator's own CSV upload), so bucketing by age/gender here is
// fine. The actual rendering lives in CategoryLeaderboardGrid, which is also
// reused by the public leaderboard page — that one gets pre-bucketed data
// computed server-side instead, so DOB never has to leave the server there.
export default function CategoryLeaderboards({
  entries,
  registrants,
}: CategoryLeaderboardsProps) {
  const buckets = computeCategoryBuckets(entries, registrants);
  return <CategoryLeaderboardGrid buckets={buckets} />;
}
