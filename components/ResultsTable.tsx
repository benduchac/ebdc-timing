"use client";

import type { Entry, PhotosByEntry } from "@/lib/types";
import { formatElapsedHuman, computeStandardRanks } from "@/lib/utils";
import BibChip from "@/components/BibChip";
import FinisherPhoto from "@/components/FinisherPhoto";
import RankedRow from "@/components/RankedRow";
import TimeChip from "@/components/TimeChip";
import RankBadge from "@/components/RankBadge";
import { EditIcon, TrashIcon, WarningIcon } from "@/components/icons";

interface ResultsTableProps {
  entries: Entry[];
  onEditEntry?: (id: number) => void;
  onDeleteEntry?: (id: number) => void;
  // Approved photos by entry id. Only the public leaderboard passes this.
  photos?: PhotosByEntry;
}

export default function ResultsTable({
  entries,
  onEditEntry,
  onDeleteEntry,
  photos,
}: ResultsTableProps) {
  // Read-only when no handlers are supplied — the public leaderboard reuses
  // this component with neither, so the Actions column doesn't render at
  // all rather than showing dead buttons.
  const editable = !!onEditEntry || !!onDeleteEntry;

  // Separate valid entries from unknown
  const validEntries = entries.filter((e) => e.wave !== null);
  const unknownEntries = entries.filter((e) => e.wave === null);

  // Sort valid entries by elapsed time
  const sortedValid = [...validEntries].sort((a, b) => {
    if (a.elapsedMs === null || b.elapsedMs === null) return 0;
    return a.elapsedMs - b.elapsedMs;
  });
  const overallRanks = computeStandardRanks(sortedValid);

  // The photo goes last on the row, after the race time. The column exists
  // only once someone on the page has a photo, so a race with none shows no
  // empty column. Only the public leaderboard passes photos.
  const showPhotoColumn = validEntries.some((e) => photos?.[e.id]);

  // Helper to check if a bib is duplicated
  const isDuplicateBib = (bib: string, allEntries: Entry[]): boolean => {
    return allEntries.filter((e) => e.bib === bib).length > 1;
  };

  if (entries.length === 0) {
    return (
      <div className="bg-chalk border border-ink/10 rounded-lg p-8 text-center text-ink-soft">
        {editable
          ? "No finishers yet. Record your first finish!"
          : "No finishers yet. Check back once the race is underway."}
      </div>
    );
  }

  const table = (
    <div className="bg-chalk border border-ink/10 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-moss text-chalk">
            <tr>
              <th className="p-2 text-left font-semibold">Overall</th>
              <th className="p-2 text-left font-semibold">Bib</th>
              <th className="p-2 text-left font-semibold">Name</th>
              <th className="p-2 text-left font-semibold">Wave</th>
              <th className="p-2 text-left font-semibold">Finished at</th>
              <th className="p-2 text-left font-semibold">Race Time</th>
              {showPhotoColumn && (
                <th className="p-2 text-left font-semibold">Photo</th>
              )}
              {editable && <th className="p-2 text-left font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sortedValid.map((entry, index) => {
              const overallPlace = overallRanks[index];
              const isDuplicate = isDuplicateBib(entry.bib, entries);

              return (
                <tr
                  key={entry.id}
                  className={`border-b border-ink/10 hover:bg-sand/60 ${
                    editable && isDuplicate
                      ? "bg-danger-soft border-l-4 border-l-danger"
                      : ""
                  }`}
                >
                  <td className="p-2">
                    <RankBadge place={overallPlace} className="w-6 h-6 text-xs" />
                  </td>
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1">
                      {editable && isDuplicate && (
                        <WarningIcon className="w-3.5 h-3.5 text-danger" />
                      )}
                      <BibChip bib={entry.bib} className="text-xs" />
                    </span>
                  </td>
                  <td className="p-2">{entry.name}</td>
                  <td className="p-2">Wave {entry.wave}</td>
                  <td className="p-2">
                    <span className="font-mono tabular-nums text-ink-soft text-xs">
                      {new Date(entry.finishTimeMs).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </td>
                  <td className="p-2">
                    <TimeChip className="text-xs">
                      {entry.elapsedMs !== null
                        ? formatElapsedHuman(entry.elapsedMs)
                        : "N/A"}
                    </TimeChip>
                  </td>
                  {showPhotoColumn && (
                    <td className="p-2">
                      {photos?.[entry.id] && (
                        <FinisherPhoto
                          photo={photos[entry.id]}
                          className="w-12 h-12"
                        />
                      )}
                    </td>
                  )}
                  {editable && (
                    <td className="p-2">
                      {onEditEntry && (
                        <button
                          onClick={() => onEditEntry(entry.id)}
                          className="text-moss hover:text-moss-dark mr-2 inline-block align-middle"
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                      )}
                      {onDeleteEntry && (
                        <button
                          onClick={() => onDeleteEntry(entry.id)}
                          className="text-danger hover:opacity-70 inline-block align-middle"
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {unknownEntries.map((entry) => {
              const isDuplicate = isDuplicateBib(entry.bib, entries);

              return (
                <tr
                  key={entry.id}
                  className={`border-b border-ink/10 ${
                    editable ? "bg-danger-soft" : ""
                  }`}
                >
                  <td className="p-2 text-ink-soft">-</td>
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1">
                      {editable && isDuplicate && (
                        <WarningIcon className="w-3.5 h-3.5 text-danger" />
                      )}
                      <BibChip bib={entry.bib} className="text-xs" />
                    </span>
                  </td>
                  <td className="p-2">{entry.name}</td>
                  <td className="p-2">
                    <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-flag text-ink">
                      No wave assigned
                    </span>
                  </td>
                  <td className="p-2">
                    <span className="font-mono tabular-nums text-ink-soft text-xs">
                      {new Date(entry.finishTimeMs).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </td>
                  <td className="p-2 text-ink-soft">-</td>
                  {showPhotoColumn && <td className="p-2" />}
                  {editable && (
                    <td className="p-2">
                      {onEditEntry && (
                        <button
                          onClick={() => onEditEntry(entry.id)}
                          className="text-moss hover:text-moss-dark mr-2 inline-block align-middle"
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                      )}
                      {onDeleteEntry && (
                        <button
                          onClick={() => onDeleteEntry(entry.id)}
                          className="text-danger hover:opacity-70 inline-block align-middle"
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // The operator's table is for a laptop. The public one is read on phones,
  // where seven columns run off the screen and the photo, the last one, is the
  // first thing cut. Below the small breakpoint it becomes the same card rows
  // the category boards use. Both are in the page and CSS picks one, so there
  // is nothing to flash or mismatch on load.
  if (editable) return table;

  return (
    <>
      <div className="hidden sm:block">{table}</div>
      <div className="sm:hidden bg-chalk border border-ink/10 rounded-lg p-3 space-y-2">
        {sortedValid.map((entry, index) => (
          <RankedRow
            key={entry.id}
            entry={entry}
            place={overallRanks[index]}
            photo={photos?.[entry.id]}
            // The time as the operator's laptop showed it, without seconds
            // (the race time has them, and the line has little room).
            // Formatting finishTimeMs here would use the server's timezone on
            // the first render and the viewer's after it.
            detail={entry.finishTime.replace(/(\d{1,2}:\d{2}):\d{2}/, "$1")}
          />
        ))}
      </div>
    </>
  );
}
