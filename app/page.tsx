import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRedis, kvKeys } from "@/lib/kv";
import type { RaceIndexEntry } from "@/lib/types";
import PageBackground from "@/components/PageBackground";

export const metadata: Metadata = {
  title: "Live Results - East Bay Dirt Classic",
  description: "Live results for the East Bay Dirt Classic (C510).",
};

// Public landing page. If a race exists, redirects to its permanent
// /[slug] leaderboard URL (see docs/race-readiness-design.md "Surfaces &
// routing") — the address bar ends up on the shareable link, not the
// "whatever's currently active" one. With no races yet, falls back to a
// "coming soon" placeholder.
export default async function PublicResultsPage() {
  let latestSlug: string | null = null;
  try {
    const redis = getRedis();
    if (redis) {
      const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
      // Races synced before slugs existed won't have one until they sync
      // again — exclude them here rather than redirect to "/undefined".
      const slugged = index.filter((r) => r.slug);
      if (slugged.length > 0) {
        latestSlug = [...slugged].sort((a, b) =>
          b.lastSaved.localeCompare(a.lastSaved)
        )[0].slug;
      }
    }
  } catch {
    // Redis unreachable — fall through to the placeholder below.
  }

  if (latestSlug) {
    redirect(`/${latestSlug}`);
  }

  return (
    <>
      <PageBackground />
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-lg w-full bg-white rounded-xl shadow-2xl p-8 text-center">
          <div className="text-4xl font-bold text-purple-600 mb-1">C510</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-1">
            East Bay Dirt Classic
          </h1>
          <p className="text-gray-600 italic mb-6">Live Results</p>

          <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6">
            <div className="text-5xl mb-3">🏁</div>
            <h2 className="text-xl font-bold text-purple-800 mb-2">
              Results coming soon
            </h2>
            <p className="text-gray-600">
              Live standings will be posted here on race day. Check back once
              the race is underway.
            </p>
          </div>

          <p className="mt-6 text-sm text-gray-500">
            Proudly supporting the Alameda County Community Food Bank 🚴💚
          </p>
        </div>
      </div>
    </>
  );
}
