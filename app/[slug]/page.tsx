import type { Metadata } from "next";
import { getRedis, kvKeys } from "@/lib/kv";
import { computeCategoryBuckets } from "@/lib/categories";
import type { RaceIndexEntry, RaceSnapshot, Registrant } from "@/lib/types";
import PublicLeaderboardView from "@/components/PublicLeaderboardView";
import TrailHero from "@/components/TrailHero";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function loadRaceBySlug(slug: string): Promise<RaceSnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;

  const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
  const entry = index.find((r) => r.slug === slug);
  if (!entry) return null;

  return (await redis.get<RaceSnapshot>(kvKeys.raceLatest(entry.id))) ?? null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await loadRaceBySlug(slug).catch(() => null);
  return {
    title: snapshot
      ? `${snapshot.label} - Live Results`
      : "Live Results - East Bay Dirt Classic",
  };
}

// Public, unauthenticated leaderboard for one race. Fetches directly from
// Redis server-side (no round trip through our own API) so the real
// registrants map — including DOB — never has to leave the server; only the
// already-bucketed, PII-free Entry[] arrays get passed to the client
// component. See lib/categories.ts's computeCategoryBuckets.
export default async function RaceLeaderboardPage({ params }: PageProps) {
  const { slug } = await params;

  let snapshot: RaceSnapshot | null = null;
  try {
    snapshot = await loadRaceBySlug(slug);
  } catch {
    snapshot = null;
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl overflow-hidden shadow-xl text-center">
          <TrailHero title="Race not found" compact />
          <div className="bg-chalk p-6 sm:p-8">
            <p className="text-ink-soft">
              This link doesn&apos;t match a race we know about. Double-check
              the URL, or ask the operator for the current results link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Unresolved finishers (unmatched bib, no wave assigned) are an
  // operator-side cleanup item, not public-facing — exclude until resolved.
  const resolvedEntries = snapshot.entries.filter((e) => e.wave !== null);
  const registrants = new Map<string, Registrant>(snapshot.registrants);
  const buckets = computeCategoryBuckets(resolvedEntries, registrants);

  return (
    <PublicLeaderboardView
      raceLabel={snapshot.label}
      lastSaved={snapshot.lastSaved}
      entries={resolvedEntries}
      buckets={buckets}
    />
  );
}
