import type { Metadata } from "next";
import { getRedis, kvKeys } from "@/lib/kv";
import { computeCategoryBuckets } from "@/lib/categories";
import type { RaceIndexEntry, RaceSnapshot, Registrant } from "@/lib/types";
import PublicLeaderboardView from "@/components/PublicLeaderboardView";
import TrailHero from "@/components/TrailHero";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Concurrent public viewers share one render instead of each one's 20s
// refresh timer (see PublicLeaderboardView) hitting Redis directly — with
// N open tabs that's roughly N*3 commands a minute otherwise.
export const revalidate = 10;

// Throws on an actual storage problem (Redis unreachable/unconfigured) so
// the page can tell that apart from a genuine bad slug — both used to
// collapse into the same "race not found," which reads as a bad URL when
// it might be a quota or outage the operator needs to know about instead.
async function loadRaceBySlug(slug: string): Promise<RaceSnapshot | null> {
  const redis = getRedis();
  if (!redis) throw new Error("Backup storage is not configured.");

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
// registrants map — including age — never has to leave the server; only the
// already-bucketed, PII-free Entry[] arrays get passed to the client
// component. See lib/categories.ts's computeCategoryBuckets.
export default async function RaceLeaderboardPage({ params }: PageProps) {
  const { slug } = await params;

  let snapshot: RaceSnapshot | null = null;
  let storageError = false;
  try {
    snapshot = await loadRaceBySlug(slug);
  } catch {
    storageError = true;
  }

  if (storageError) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl overflow-hidden shadow-xl text-center">
          <TrailHero title="Results temporarily unavailable" compact />
          <div className="bg-chalk p-6 sm:p-8">
            <p className="text-ink-soft">
              We&apos;re having trouble reaching results storage right now.
              This isn&apos;t a bad link — try again in a minute.
            </p>
          </div>
        </div>
      </div>
    );
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
