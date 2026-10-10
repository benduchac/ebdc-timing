import type { Metadata } from "next";
import { computeCategoryBuckets } from "@/lib/categories";
import { loadApprovedPhotos, loadRaceBySlug } from "@/lib/publicRace";
import type { RaceSnapshot, Registrant } from "@/lib/types";
import TvLeaderboardView from "@/components/TvLeaderboardView";
import TrailHero from "@/components/TrailHero";

// The public leaderboard, laid out for a TV at the venue: everything on one
// page, scrolling itself. Same data and the same privacy line as /[slug]:
// buckets are computed here and only Entry[] reaches the client.
//
//   /<slug>/tv                     40px a second, 8s hold at each end
//   /<slug>/tv?speed=60&pause=5    faster, shorter holds

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ speed?: string; pause?: string }>;
}

const DEFAULT_SPEED = 40;
const DEFAULT_PAUSE_S = 8;

// A number from the URL inside sensible bounds, or the default.
function param(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  return raw && Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await loadRaceBySlug(slug).catch(() => null);
  return {
    title: snapshot
      ? `${snapshot.label} - Live Results`
      : "Live Results - East Bay Dirt Classic",
  };
}

// Shown in place of the board when there's nothing to show. It reloads itself
// once a minute, so a TV left on this page recovers without anyone walking
// over to it.
function TvMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="min-h-screen p-4 flex items-center justify-center">
      <meta httpEquiv="refresh" content="60" />
      <div className="max-w-lg w-full rounded-2xl overflow-hidden shadow-xl text-center">
        <TrailHero title={title} compact />
        <div className="bg-chalk p-6 sm:p-8">
          <p className="text-ink-soft">{text}</p>
        </div>
      </div>
    </div>
  );
}

export default async function TvLeaderboardPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { speed, pause } = await searchParams;

  let snapshot: RaceSnapshot | null = null;
  try {
    snapshot = await loadRaceBySlug(slug);
  } catch {
    return (
      <TvMessage
        title="Results temporarily unavailable"
        text="Can't reach results storage right now. This page tries again every minute."
      />
    );
  }
  if (!snapshot) {
    return (
      <TvMessage
        title="Race not found"
        text="This link doesn't match a race. Check the URL."
      />
    );
  }

  const resolvedEntries = snapshot.entries.filter((e) => e.wave !== null);
  const registrants = new Map<string, Registrant>(snapshot.registrants);
  const buckets = computeCategoryBuckets(resolvedEntries, registrants);
  const photos = await loadApprovedPhotos(
    snapshot.raceId,
    new Set(resolvedEntries.map((e) => e.id))
  );

  return (
    <TvLeaderboardView
      raceLabel={snapshot.label}
      lastSaved={snapshot.lastSaved}
      entries={resolvedEntries}
      buckets={buckets}
      photos={photos}
      speedPxPerSec={param(speed, DEFAULT_SPEED, 5, 2000)}
      pauseMs={param(pause, DEFAULT_PAUSE_S, 0, 120) * 1000}
    />
  );
}
