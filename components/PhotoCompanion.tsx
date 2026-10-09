"use client";

import { useState } from "react";
import PhotoUploadView from "./PhotoUploadView";
import PhotoMatchView from "./PhotoMatchView";

interface PhotoCompanionProps {
  token: string;
  raceLabel: string;
}

// The photographer's phone page: Upload, and Match for pairing what they
// shot with finishers. Both views stay mounted and the inactive one is only
// hidden: PhotoUploadView holds the queue of photos still on their way up,
// and unmounting it on a tab change would drop them.
export default function PhotoCompanion({ token, raceLabel }: PhotoCompanionProps) {
  const [view, setView] = useState<"upload" | "match">("upload");

  const tab = (id: "upload" | "match", label: string) => (
    <button
      onClick={() => setView(id)}
      aria-pressed={view === id}
      className={`flex-1 py-2 rounded-lg font-semibold text-sm transition ${
        view === id
          ? "bg-chalk text-moss-dark"
          : "bg-chalk/15 text-chalk hover:bg-chalk/25"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-moss-dark">
      {/* Right padding keeps the buttons clear of the fixed brand sticker. */}
      <div className="sticky top-0 z-30 bg-moss-dark/95 backdrop-blur py-2 pl-4 pr-24">
        <div className="max-w-md mx-auto flex gap-2">
          {tab("upload", "Upload")}
          {tab("match", "Match")}
        </div>
      </div>
      <div className={view === "upload" ? "" : "hidden"}>
        <PhotoUploadView token={token} raceLabel={raceLabel} />
      </div>
      <div className={view === "match" ? "" : "hidden"}>
        <PhotoMatchView token={token} active={view === "match"} />
      </div>
    </div>
  );
}
