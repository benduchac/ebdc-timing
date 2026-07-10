"use client";

import type { SyncStatus } from "@/lib/useCloudSync";
import type { ClockCheckResult } from "@/lib/types";
import { getClockSeverity } from "@/lib/utils";

interface ReadinessBannerProps {
  registrantCount: number;
  syncStatus: SyncStatus;
  cloudLastSyncedAt: string | null;
  clockCheck: ClockCheckResult | null;
}

// Pre-scoring readiness state. See docs/race-readiness-design.md "'Ready for
// the field' readiness": the hard rule is a race isn't recovery-proof until
// its first successful sync — this warns plainly rather than blocking, in
// keeping with the badge's "visibility, not blocking" approach. Scoped to the
// Registration tab only by the caller (app/operator/page.tsx) — it's a setup
// checklist, not a persistent status bar; SyncBadge covers ongoing status
// during live scoring.
export default function ReadinessBanner({
  registrantCount,
  syncStatus,
  cloudLastSyncedAt,
  clockCheck,
}: ReadinessBannerProps) {
  // "Fully synced" means the race has synced successfully at least once and
  // isn't currently in a confirmed-failed state — NOT "the current render's
  // status happens to be 'synced'". syncStatus flips to "dirty"/"syncing" on
  // every state change (recording a bib, editing an entry, ...), which is
  // normal, momentary, and not alarming — same "dirty flag, not elapsed
  // time" principle as SyncBadge. Only an actual sync failure ("error")
  // should pull this back to "not ready".
  const fullySynced = cloudLastSyncedAt !== null && syncStatus !== "error";
  const registrantsLoaded = registrantCount > 0;
  const clockSeverity = getClockSeverity(clockCheck);
  const clockFine = clockSeverity === "fine";

  if (fullySynced && registrantsLoaded && clockFine) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 text-sm text-green-800">
        ✓ Registrants successfully synced at{" "}
        {new Date(cloudLastSyncedAt).toLocaleTimeString()}
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg px-4 py-3 mb-4 text-sm text-amber-900">
      <div className="font-bold mb-1">⚠ Not ready for the field yet</div>
      <ul className="space-y-0.5">
        <li>✓ Race created</li>
        <li>
          {registrantsLoaded ? "✓" : "○"} Registrants loaded
          {registrantsLoaded ? ` (${registrantCount})` : " — none yet"}
        </li>
        <li>
          {fullySynced ? "✓" : "○"} Fully synced
          {!fullySynced &&
            " — this race is not recovery-proof until its first successful sync"}
        </li>
        {clockSeverity === "fine" && <li>✓ Clock verified</li>}
        {(clockSeverity === "caution" || clockSeverity === "alert") && (
          <li className="text-red-700 font-bold">
            ⚠ Clock is off by {clockCheck?.diffSeconds}s — every recorded
            finish time will be wrong by about this much. Fix your device&apos;s
            clock before scoring.
          </li>
        )}
        {clockSeverity === "unknown" && (
          <li>○ Clock not verified — check in Settings while online</li>
        )}
      </ul>
      <p className="mt-2 text-xs">
        Do all setup while on good internet, confirm synced, then move to
        scoring.
      </p>
    </div>
  );
}
