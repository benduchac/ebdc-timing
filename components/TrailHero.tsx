import type { ReactNode } from "react";

// Shared hero band for "front door" screens (race menu, operator gate,
// public leaderboard, not-found placeholders) — the trail photo with a moss
// scrim, contained to a band rather than filling the whole viewport behind
// dense data (see PageBackground, which is reserved for that latter case).
export default function TrailHero({
  title,
  subtitle,
  compact = false,
}: {
  title: string;
  subtitle?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative bg-cover bg-center text-chalk text-center ${
        compact ? "py-6 px-4" : "py-10 px-4"
      }`}
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(33,42,28,0.35) 0%, rgba(33,42,28,0.62) 55%, var(--color-moss-dark) 100%), url(/timing_bg.webp)",
      }}
    >
      <div className="font-mono text-xs tracking-[0.25em] uppercase opacity-80">
        C510
      </div>
      <h1
        className={`font-display uppercase tracking-tight ${
          compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"
        } mt-1`}
      >
        {title}
      </h1>
      {subtitle && (
        <div className="text-sm text-sand/90 mt-1">{subtitle}</div>
      )}
    </div>
  );
}
