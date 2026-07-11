"use client";

import { useEffect, useState } from "react";
import type { SyncStatus } from "@/lib/useCloudSync";
import { formatRelativeTime } from "@/lib/utils";

interface SyncBadgeProps {
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
}

const FRESH_WINDOW_MS = 30_000;

// See docs/race-readiness-design.md "Sync indicator". Alarm is driven by
// status (dirty flag), never by elapsed time alone — a quiet stretch between
// finishers must never look like an error.
export default function SyncBadge({ status, lastSyncedAt, error }: SyncBadgeProps) {
  // Re-render periodically so "Backed up Xs/Xm ago" and the 30s green->neutral
  // fade stay current without needing a state change to trigger them.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  if (status === "error") {
    return (
      <div
        className="bg-danger-soft text-danger px-3 py-1 rounded-full text-sm font-semibold"
        title={error ?? undefined}
      >
        Not backed up
      </div>
    );
  }

  if (status === "never") {
    return (
      <div className="bg-danger-soft text-danger px-3 py-1 rounded-full text-sm font-semibold">
        Not backed up yet
      </div>
    );
  }

  if (status === "syncing" || status === "dirty") {
    return (
      <div className="bg-chalk/20 text-chalk/80 px-3 py-1 rounded-full text-sm">
        Syncing…
      </div>
    );
  }

  // status === "synced"
  const isFresh =
    lastSyncedAt !== null && now - new Date(lastSyncedAt).getTime() < FRESH_WINDOW_MS;

  return (
    <div
      className={`px-3 py-1 rounded-full text-sm transition-colors duration-1000 flex items-center gap-1.5 ${
        isFresh
          ? "bg-success text-chalk font-semibold"
          : "bg-chalk/20 text-chalk/80"
      }`}
    >
      {isFresh && (
        <span className="w-1.5 h-1.5 rounded-full bg-chalk/80 inline-block" />
      )}
      {isFresh
        ? "Backed up"
        : lastSyncedAt
        ? `Backed up ${formatRelativeTime(new Date(lastSyncedAt).getTime(), now)}`
        : "Backed up"}
    </div>
  );
}
