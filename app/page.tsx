import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Results - East Bay Dirt Classic",
  description: "Live results for the East Bay Dirt Classic (C510).",
};

// Public landing page. The live leaderboard is not designed yet (Phase 2,
// deferred — see docs/race-readiness-design.md) — this route reserves the
// bare domain for racers and gives a clear "coming soon" landing. It
// intentionally has no data/backend dependency.
export default function PublicResultsPage() {
  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center"
      style={{ backgroundImage: "url(/timing_bg.webp)" }}
    >
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
            Live standings will be posted here on race day. Check back once the
            race is underway.
          </p>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          Every dollar saved goes to the food bank 🚴💚
        </p>
      </div>
    </div>
  );
}
