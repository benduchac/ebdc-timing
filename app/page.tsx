import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "East Bay Dirt Classic",
  description:
    "The East Bay Dirt Classic (C510) — a charity bike race benefitting the Alameda County Community Food Bank.",
};

// Static brand landing page. Deliberately does not redirect to any race's
// /[slug] leaderboard — that link is shared directly per race (see
// CopyLinkButton in the operator app), so a bare visit to the domain isn't
// implicitly "the latest race." /operator is reached by typing the URL;
// it is never linked from here. See docs/race-readiness-design.md
// "Surfaces & routing".
export default function HomePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center text-center text-chalk px-4 bg-cover bg-center"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(33,42,28,0.4) 0%, rgba(33,42,28,0.68) 60%, var(--color-moss-dark) 100%), url(/timing_bg.webp)",
      }}
    >
      <div className="font-mono text-sm sm:text-base tracking-[0.35em] uppercase opacity-80">
        C510
      </div>
      <h1 className="font-display uppercase tracking-tight text-6xl sm:text-8xl leading-[0.95] mt-3">
        East Bay
        <br />
        Dirt Classic
      </h1>
      <p className="mt-6 text-base sm:text-lg text-sand/90 max-w-md">
        Proudly supporting the Alameda County Community Food Bank
      </p>
    </div>
  );
}
