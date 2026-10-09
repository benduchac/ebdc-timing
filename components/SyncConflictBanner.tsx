"use client";

interface SyncConflictBannerProps {
  loading: boolean;
  error: string | null;
  onLoadLatest: () => void;
}

// Shown when the server refused a sync because another computer holds newer
// results for this race (see lib/syncGuard.ts). Recording still works here,
// but nothing it records reaches the cloud until the latest copy is loaded.
export default function SyncConflictBanner({
  loading,
  error,
  onLoadLatest,
}: SyncConflictBannerProps) {
  return (
    <div
      role="alert"
      className="bg-danger text-chalk px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3"
    >
      <div className="text-sm">
        <div className="font-bold">This computer is out of date.</div>
        <div>
          Another computer has newer results for this race. Syncing is stopped
          here, so nothing is overwritten. Anything recorded on this computer
          since then stays on it and is not in the cloud.
        </div>
        {error && <div className="mt-1 text-chalk/80">{error}</div>}
      </div>
      <button
        onClick={onLoadLatest}
        disabled={loading}
        className="px-4 py-2 bg-chalk text-danger rounded-lg font-semibold hover:bg-sand disabled:opacity-60"
      >
        {loading ? "Loading…" : "Load latest from cloud"}
      </button>
    </div>
  );
}
