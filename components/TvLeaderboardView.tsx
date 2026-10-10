"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Entry, PhotosByEntry } from "@/lib/types";
import type { CategoryBoard } from "@/lib/categories";
import ResultsTable from "./ResultsTable";
import CategoryLeaderboardGrid from "./CategoryLeaderboardGrid";
import TrailHero from "./TrailHero";

// The leaderboard for a TV at the venue: overall results, then every category
// board already expanded, on one page that scrolls itself. It holds at the
// top, scrolls slowly to the bottom, holds, refreshes the data and starts
// again from the top. Nobody touches it.
//
// The refresh is router.refresh(), not a page reload: if the venue's network
// drops, a reload would leave the TV on a browser error page, while a failed
// refresh keeps showing the last results and tries again next time round.

interface TvLeaderboardViewProps {
  raceLabel: string;
  lastSaved: string;
  entries: Entry[]; // already filtered to resolved (wave !== null) finishers
  buckets: CategoryBoard[];
  photos: PhotosByEntry;
  // Scroll speed in pixels a second, and the hold at each end.
  speedPxPerSec: number;
  pauseMs: number;
  // The interactive leaderboard (/[slug]), and a QR code for it drawn on the
  // server, so people watching can open it on their phones.
  leaderboardUrl: string;
  qrSvg: string;
}

export default function TvLeaderboardView({
  raceLabel,
  lastSaved,
  entries,
  buckets,
  photos,
  speedPxPerSec,
  pauseMs,
  leaderboardUrl,
  qrSvg,
}: TvLeaderboardViewProps) {
  const router = useRouter();

  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Kept as a float: scrollTo rounds, and at a slow speed a frame's step is
    // under a pixel, so reading scrollY back would never move.
    let y = 0;
    let last = 0;

    const atBottom = () =>
      y >= document.documentElement.scrollHeight - window.innerHeight - 1;

    const step = (now: number) => {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      y += speedPxPerSec * dt;
      window.scrollTo(0, y);
      if (atBottom()) {
        timer = setTimeout(restart, pauseMs);
      } else {
        frame = requestAnimationFrame(step);
      }
    };

    const start = () => {
      last = 0;
      frame = requestAnimationFrame(step);
    };

    function restart() {
      router.refresh();
      y = 0;
      window.scrollTo(0, 0);
      timer = setTimeout(start, pauseMs);
    }

    window.scrollTo(0, 0);
    timer = setTimeout(start, pauseMs);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [router, speedPxPerSec, pauseMs]);

  // Keep the screen awake where the browser allows it. Not every TV browser
  // has this, and the page works without it.
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    const request = () => {
      navigator.wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    };
    request();
    // The lock drops whenever the page is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  return (
    <div className="min-h-screen p-4 cursor-none">
      <div className="max-w-6xl mx-auto rounded-2xl overflow-hidden shadow-xl">
        <TrailHero
          title={raceLabel}
          subtitle={
            <>Live results — updated {new Date(lastSaved).toLocaleTimeString()}</>
          }
        />

        <div className="bg-chalk p-6">
          <h2 className="font-display uppercase tracking-tight text-2xl mb-3 text-moss-dark">
            Overall results · {entries.length} finisher
            {entries.length !== 1 ? "s" : ""}
          </h2>
          <ResultsTable entries={entries} photos={photos} />

          <div className="mt-10">
            <CategoryLeaderboardGrid
              buckets={buckets}
              photos={photos}
              expanded
            />
          </div>

          <p className="mt-6 text-sm text-ink-soft text-center">
            Proudly supporting the Alameda County Community Food Bank
          </p>
        </div>
      </div>

      {/* Fixed, so it stays put while the board scrolls under it. */}
      <div
        aria-label="Scan for live results"
        className="fixed bottom-4 right-4 z-40 bg-white rounded-xl shadow-xl p-3 text-center"
      >
        <div
          className="w-44 h-44 [&>svg]:w-full [&>svg]:h-full"
          // Our own SVG, made by the qrcode package from our own URL.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="mt-2 text-sm font-bold text-ink">
          Live results on your phone
        </div>
        <div className="text-xs text-ink-soft max-w-44 break-all">
          {leaderboardUrl.replace(/^https?:\/\//, "")}
        </div>
      </div>
    </div>
  );
}
