import type { Metadata } from "next";
import { getRedis, kvKeys } from "@/lib/kv";
import type { RaceIndexEntry } from "@/lib/types";
import PhotoUploadView from "@/components/PhotoUploadView";
import TrailHero from "@/components/TrailHero";

interface PageProps {
  params: Promise<{ token: string }>;
}

// Same lookup app/api/photos/route.ts does — a linear scan of the small
// races index by photoToken, not a reverse-index key. Duplicated rather than
// imported from the route handler, matching how app/start/[token]/page.tsx
// and app/[slug]/page.tsx each do their own Redis read.
async function loadRaceByPhotoToken(
  token: string
): Promise<{ raceId: string; label: string } | null> {
  const redis = getRedis();
  if (!redis) throw new Error("Backup storage is not configured.");

  const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
  const entry = index.find((r) => r.photoToken === token);
  if (!entry) return null;
  return { raceId: entry.id, label: entry.label };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const race = await loadRaceByPhotoToken(token).catch(() => null);
  return {
    title: race
      ? `${race.label} - Finish Line Photos`
      : "Finish Line Photos - East Bay Dirt Classic",
  };
}

// The link is a bearer credential, same as /start/[token] — not a page
// anyone should stumble onto or share around.
export const dynamic = "force-dynamic";

export default async function PhotoUploadPage({ params }: PageProps) {
  const { token } = await params;

  let race: Awaited<ReturnType<typeof loadRaceByPhotoToken>> = null;
  let storageError = false;
  try {
    race = await loadRaceByPhotoToken(token);
  } catch {
    storageError = true;
  }

  if (storageError) {
    // Dev-only preview, same gate and same reasoning as
    // app/start/[token]/page.tsx: the picking, EXIF-reading, downscaling and
    // queue states are all client-side and can be reviewed without pointing
    // local dev at production storage. Uploads still POST to /api/photos,
    // which 503s — so a photo never reaches "sent", it sits in retrying.
    if (process.env.NODE_ENV !== "production") {
      return (
        <>
          <div className="bg-warning text-ink text-center text-xs py-1.5 px-2 font-semibold">
            [Dev preview] Photo storage isn&apos;t configured locally —
            uploads won&apos;t finish. See .env.example.
          </div>
          <PhotoUploadView token={token} raceLabel="Dev Preview Race" />
        </>
      );
    }
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl overflow-hidden shadow-xl text-center">
          <TrailHero title="Temporarily unavailable" compact />
          <div className="bg-chalk p-6 sm:p-8">
            <p className="text-ink-soft">
              Can&apos;t reach photo storage right now. Try again in a minute.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!race) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl overflow-hidden shadow-xl text-center">
          <TrailHero title="Invalid or expired link" compact />
          <div className="bg-chalk p-6 sm:p-8">
            <p className="text-ink-soft">
              This link doesn&apos;t match a race we know about. Ask the
              operator for the current photo link from Settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <PhotoUploadView token={token} raceLabel={race.label} />;
}
