"use client";

interface SyncConflictBannerProps {
  leaving: boolean;
  onLeave: () => void;
}

// Shown when the server refused a sync because another computer is scoring
// this race (see lib/syncGuard.ts). Recording still works here, but nothing
// it records reaches the cloud. The way out is to leave: taking the race back
// is Start scoring on the race menu, so it is always a deliberate press and
// never a side effect of clearing this banner.
export default function SyncConflictBanner({
  leaving,
  onLeave,
}: SyncConflictBannerProps) {
  return (
    <div
      role="alert"
      className="bg-danger text-chalk px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3"
    >
      <div className="text-sm">
        <div className="font-bold">This computer is out of date.</div>
        <div>
          Another computer is scoring this race. Syncing is stopped here, so
          nothing is overwritten. Anything recorded on this computer since then
          is only on this computer.
        </div>
      </div>
      <button
        onClick={onLeave}
        disabled={leaving}
        className="px-4 py-2 bg-chalk text-danger rounded-lg font-semibold hover:bg-sand disabled:opacity-60"
      >
        {leaving ? "Saving…" : "Save a copy and leave"}
      </button>
    </div>
  );
}
