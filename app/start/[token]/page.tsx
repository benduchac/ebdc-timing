import type { Metadata } from "next";
import { getRedis, kvKeys } from "@/lib/kv";
import type { RaceIndexEntry, WaveStarts } from "@/lib/types";
import WaveStartView from "@/components/WaveStartView";
import TrailHero from "@/components/TrailHero";

interface PageProps {
  params: Promise<{ token: string }>;
}

// Same lookup app/api/wave-start/route.ts does — a linear scan of the small
// races index by startToken, not a reverse-index key. Duplicated rather than
// imported from the route handler, matching how app/[slug]/page.tsx does its
// own Redis lookup instead of calling GET /api/backup.
async function loadRaceByToken(
  token: string
): Promise<{ raceId: string; label: string; waveStarts: WaveStarts } | null> {
  const redis = getRedis();
  if (!redis) throw new Error("Backup storage is not configured.");

  const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
  const entry = index.find((r) => r.startToken === token);
  if (!entry) return null;

  const waveStarts =
    (await redis.hgetall<WaveStarts>(kvKeys.raceWaveStarts(entry.id))) ?? {};
  return { raceId: entry.id, label: entry.label, waveStarts };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const race = await loadRaceByToken(token).catch(() => null);
  return {
    title: race ? `${race.label} - Wave Start` : "Wave Start - East Bay Dirt Classic",
  };
}

// No-index: this link is a bearer credential (see lib/auth's model note for
// /operator's rationale — same idea here, just token-gated instead of
// passphrase-gated), not a page anyone should stumble onto or share around.
export const dynamic = "force-dynamic";

export default async function WaveStartPage({ params }: PageProps) {
  const { token } = await params;

  let race: Awaited<ReturnType<typeof loadRaceByToken>> = null;
  let storageError = false;
  try {
    race = await loadRaceByToken(token);
  } catch {
    storageError = true;
  }

  if (storageError) {
    // Dev-only preview: renders the real interactive page without needing
    // Redis credentials configured locally, so the button/clock-check UI can
    // be reviewed without pointing local dev at production storage. Taps
    // still POST to /api/wave-start, which 503s the same way — so a tap
    // never confirms (green), it just shows the "sending / retrying" states.
    // Confirmed absent from a production build, same isDev gate as
    // SettingsModal's "Reset to Blank Slate" — see CLAUDE.md.
    if (process.env.NODE_ENV !== "production") {
      return (
        <>
          <div className="bg-warning text-ink text-center text-xs py-1.5 px-2 font-semibold">
            [Dev preview] Backup storage isn&apos;t configured locally —
            taps won&apos;t confirm (green). See .env.example.
          </div>
          <WaveStartView
            token={token}
            raceLabel="Dev Preview Race"
            initialWaveStarts={{}}
          />
        </>
      );
    }
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl overflow-hidden shadow-xl text-center">
          <TrailHero title="Temporarily unavailable" compact />
          <div className="bg-chalk p-6 sm:p-8">
            <p className="text-ink-soft">
              Can&apos;t reach backup storage right now. Try again in a
              minute.
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
              operator for the current wave-start link from Settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WaveStartView
      token={token}
      raceLabel={race.label}
      initialWaveStarts={race.waveStarts}
    />
  );
}
