// Podium treatment for #1/#2/#3 — gold/silver/bronze, a deliberate one-off
// break from the rest of the palette (see the "Podium colors" comment in
// globals.css). Shared by TopTenLeaderboard, ResultsTable, and
// CategoryLeaderboardGrid so the three don't drift into slightly different
// medal styling.
export default function RankBadge({
  place,
  className = "",
}: {
  place: number;
  className?: string;
}) {
  const style =
    place === 1
      ? "bg-flag text-ink"
      : place === 2
      ? "bg-silver text-ink"
      : place === 3
      ? "bg-bronze text-chalk"
      : "bg-moss text-chalk";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-mono font-bold ${style} ${className}`}
    >
      {place}
    </span>
  );
}
