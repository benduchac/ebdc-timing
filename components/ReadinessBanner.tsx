"use client";

import type { SyncStatus } from "@/lib/useCloudSync";

interface ReadinessBannerProps {
  registrantCount: number;
  syncStatus: SyncStatus;
  cloudLastSyncedAt: string | null;
}

// Pre-scoring readiness state. See docs/race-readiness-design.md "'Ready for
// the field' readiness": the hard rule is a race isn't recovery-proof until
// its first successful sync — this warns plainly rather than blocking, in
// keeping with the badge's "visibility, not blocking" approach.
export default function ReadinessBanner({
  registrantCount,
  syncStatus,
  cloudLastSyncedAt,
}: ReadinessBannerProps) {
  const fullySynced = syncStatus === "synced" && cloudLastSyncedAt !== null;
  const registrantsLoaded = registrantCount > 0;

  if (fullySynced && registrantsLoaded) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 text-sm text-green-800">
        ✓ Ready for the field — fully synced at{" "}
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
      </ul>
      <p className="mt-2 text-xs">
        Do all setup while on good internet, confirm synced, then move to
        scoring.
      </p>
    </div>
  );
}
