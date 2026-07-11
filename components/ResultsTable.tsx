"use client";

import type { Entry } from "@/lib/types";
import { formatElapsedTime } from "@/lib/utils";
import BibChip from "@/components/BibChip";
import TimeChip from "@/components/TimeChip";
import RankBadge from "@/components/RankBadge";
import { EditIcon, TrashIcon, WarningIcon } from "@/components/icons";

interface ResultsTableProps {
  entries: Entry[];
  onEditEntry?: (id: number) => void;
  onDeleteEntry?: (id: number) => void;
}

export default function ResultsTable({
  entries,
  onEditEntry,
  onDeleteEntry,
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

  return (
    <div className="bg-chalk border border-ink/10 rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-moss text-chalk sticky top-0 z-10">
            <tr>
              <th className="p-2 text-left font-semibold">Overall</th>
              <th className="p-2 text-left font-semibold">Bib</th>
              <th className="p-2 text-left font-semibold">Name</th>
              <th className="p-2 text-left font-semibold">Wave</th>
              <th className="p-2 text-left font-semibold">Finish time</th>
              <th className="p-2 text-left font-semibold">Elapsed</th>
              {editable && <th className="p-2 text-left font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sortedValid.map((entry, index) => {
              const overallPlace = index + 1;
              const isDuplicate = isDuplicateBib(entry.bib, entries);

              return (
                <tr
                  key={entry.id}
                  className={`border-b border-ink/10 hover:bg-sand/60 ${
                    isDuplicate
                      ? "bg-warning-soft border-l-4 border-l-warning"
                      : ""
                  }`}
                >
                  <td className="p-2">
                    <RankBadge place={overallPlace} className="w-6 h-6 text-xs" />
                  </td>
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1">
                      {isDuplicate && (
                        <WarningIcon className="w-3.5 h-3.5 text-warning" />
                      )}
                      <BibChip bib={entry.bib} className="text-xs" />
                    </span>
                  </td>
                  <td className="p-2">
                    {entry.firstName} {entry.lastName}
                  </td>
                  <td className="p-2">Wave {entry.wave}</td>
                  <td className="p-2">
                    <TimeChip className="text-xs">
                      {new Date(entry.finishTimeMs).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })}
                    </TimeChip>
                  </td>
                  <td className="p-2">
                    <TimeChip className="text-xs">
                      {entry.elapsedMs !== null
                        ? formatElapsedTime(entry.elapsedMs)
                        : "N/A"}
                    </TimeChip>
                  </td>
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
                <tr key={entry.id} className="border-b border-ink/10 bg-warning-soft">
                  <td className="p-2 text-ink-soft">-</td>
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1">
                      {isDuplicate && (
                        <WarningIcon className="w-3.5 h-3.5 text-warning" />
                      )}
                      <BibChip bib={entry.bib} className="text-xs" />
                    </span>
                  </td>
                  <td className="p-2">
                    {entry.firstName} {entry.lastName}
                  </td>
                  <td className="p-2">
                    <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-flag text-ink">
                      No wave assigned
                    </span>
                  </td>
                  <td className="p-2">
                    <TimeChip className="text-xs">
                      {new Date(entry.finishTimeMs).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })}
                    </TimeChip>
                  </td>
                  <td className="p-2 text-ink-soft">-</td>
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
}
