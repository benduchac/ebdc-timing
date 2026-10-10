import type { Metadata } from "next";
import { computeCategoryBuckets } from "@/lib/categories";
import { loadApprovedPhotos, loadRaceBySlug } from "@/lib/publicRace";
import type { RaceSnapshot, Registrant } from "@/lib/types";
import PublicLeaderboardView from "@/components/PublicLeaderboardView";
import TrailHero from "@/components/TrailHero";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Meant to make concurrent viewers share one render instead of each one's 20s
// refresh timer (see PublicLeaderboardView) hitting Redis directly. It does
// not: the Upstash client's requests are uncacheable, so the page renders on
// every request (observed 9 October 2026: x-vercel-cache MISS, cache-control
// no-store). Each open tab therefore costs about 900 Redis commands an hour.
// Accepted for 2026 on pay-as-you-go; see docs/known-issues.md.
export const revalidate = 10;

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
  const photos = await loadApprovedPhotos(
    snapshot.raceId,
    new Set(resolvedEntries.map((e) => e.id))
  );

  return (
    <PublicLeaderboardView
      raceLabel={snapshot.label}
      lastSaved={snapshot.lastSaved}
      entries={resolvedEntries}
      buckets={buckets}
      photos={photos}
    />
  );
}
