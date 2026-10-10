// Dev-only preview of the public leaderboard, rendered from seeded races in
// fixtures/seed/ with photos from a public placeholder-image host. It exists
// because the real /[slug] page needs Redis, and without it there is nothing
// to look at or to test the photo thumbnails and lightbox against. 404 in any
// production build.
//
//   /dev/public-preview                 finished race, photos on the 20 fastest
//   /dev/public-preview?seed=mid        the race at 11:20, partway through
//   /dev/public-preview?photos=none     no photos, to see the table without them
//   /dev/public-preview?tv=1            the TV view (/[slug]/tv); takes
//                                       &speed= and &pause= as that page does
import { notFound } from "next/navigation";
import { computeCategoryBuckets } from "@/lib/categories";
import PublicLeaderboardView from "@/components/PublicLeaderboardView";
import TvLeaderboardView from "@/components/TvLeaderboardView";
import { absoluteUrl, qrSvg } from "@/lib/qr";
import type { Entry, PhotosByEntry, Registrant } from "@/lib/types";
import finalSeed from "../../../fixtures/seed/ebdc-seed-final.json";
import midSeed from "../../../fixtures/seed/ebdc-seed-midrace.json";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    seed?: string;
    photos?: string;
    tv?: string;
    speed?: string;
    pause?: string;
  }>;
}

// picsum.photos serves a repeatable image for a given seed, so a rider keeps
// the same photo from one load to the next. The thumbnail is a square crop and
// the full frame is 3:2, as a real phone photo would be.
const PHOTOS_ON_TOP = 20;
const thumb = (bib: string) => `https://picsum.photos/seed/ebdc-${bib}/160/160`;
const full = (bib: string) => `https://picsum.photos/seed/ebdc-${bib}/1200/800`;

export default async function DevPublicPreview({ searchParams }: PageProps) {
  if (process.env.NODE_ENV === "production") notFound();

  const { seed: seedName, photos: photosMode, tv, speed, pause } =
    await searchParams;
  const seed = seedName === "mid" ? midSeed : finalSeed;

  const entries = (seed.entries as unknown as Entry[]).filter(
    (e) => e.wave !== null
  );
  const registrants = new Map<string, Registrant>(
    seed.registrants as unknown as [string, Registrant][]
  );
  const buckets = computeCategoryBuckets(entries, registrants);

  const photos: PhotosByEntry = {};
  if (photosMode !== "none") {
    [...entries]
      .sort((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0))
      .slice(0, PHOTOS_ON_TOP)
      .forEach((e) => {
        photos[e.id] = { thumbUrl: thumb(e.bib), url: full(e.bib) };
      });
  }

  if (tv) {
    const leaderboardUrl = await absoluteUrl("/dev/public-preview");
    return (
      <TvLeaderboardView
        raceLabel={seed.raceLabel}
        lastSaved={seed.exportDate}
        entries={entries}
        buckets={buckets}
        photos={photos}
        speedPxPerSec={Number(speed) || 40}
        pauseMs={(Number(pause) || 8) * 1000}
        leaderboardUrl={leaderboardUrl}
        qrSvg={await qrSvg(leaderboardUrl)}
      />
    );
  }

  return (
    <PublicLeaderboardView
      raceLabel={seed.raceLabel}
      lastSaved={seed.exportDate}
      entries={entries}
      buckets={buckets}
      photos={photos}
    />
  );
}
