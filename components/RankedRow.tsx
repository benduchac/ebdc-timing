import type { Entry, PublicPhoto } from "@/lib/types";
import { formatElapsedHuman } from "@/lib/utils";
import BibChip from "@/components/BibChip";
import TimeChip from "@/components/TimeChip";
import RankBadge from "@/components/RankBadge";
import FinisherPhoto from "@/components/FinisherPhoto";

interface RankedRowProps {
  entry: Entry;
  place: number;
  photo?: PublicPhoto;
  // Shown after the wave, e.g. when the rider finished. The category boards
  // leave it out; the overall results use it on a phone, where the table's
  // Finished at column no longer fits.
  detail?: string;
}

// One ranked row — rank, bib, name, wave, elapsed time, photo — on one line.
// Used by the category boards, and by the public overall results on small
// screens in place of the table. Photo last, after the time.
export default function RankedRow({ entry, place, photo, detail }: RankedRowProps) {
  return (
    <div className="flex items-center gap-2 text-sm border-b border-ink/10 pb-2">
      <RankBadge place={place} className="w-6 h-6 shrink-0 text-xs" />
      <BibChip bib={entry.bib} className="text-xs" />
      {/* min-w-0 lets a long name wrap, not be cut: a surname is the part a
          spectator is looking for. */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{entry.name}</div>
        <div className="text-xs text-ink-soft">
          Wave {entry.wave}
          {detail ? ` · ${detail}` : ""}
        </div>
      </div>
      <TimeChip className="text-xs">
        {entry.elapsedMs !== null ? formatElapsedHuman(entry.elapsedMs) : "N/A"}
      </TimeChip>
      {photo && <FinisherPhoto photo={photo} className="w-10 h-10" />}
    </div>
  );
}
