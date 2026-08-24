"use client";

import { useState } from "react";
import type { ImportResult } from "@/lib/csvImport";
import { summarizeIssues } from "@/lib/csvImport";
import { WarningIcon, CheckIcon } from "@/components/icons";

interface ImportSummaryPanelProps {
  result: ImportResult;
  onDismiss: () => void;
}

// A dialog the operator dismisses once is gone the moment something needs
// re-checking later; this stays on screen (collapsible, not modal) until
// dismissed, and a roster the operator has decided is good enough can be
// collapsed without losing the counts. See docs/fun-awards-timing.md
// section 6a.
export default function ImportSummaryPanel({
  result,
  onDismiss,
}: ImportSummaryPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (result.headerError) {
    return (
      <div className="bg-danger-soft border-2 border-danger/40 rounded-lg p-4 flex items-start gap-2">
        <WarningIcon className="w-5 h-5 text-danger shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-bold text-ink">Import refused</div>
          <p className="text-sm text-ink-soft mt-1">{result.headerError}</p>
        </div>
        <button
          onClick={onDismiss}
          className="text-ink-soft hover:text-ink text-sm font-semibold"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const importedCount = result.totalRows - result.refusedRows.length;
  const issues = summarizeIssues(result.issuesByBib);
  const clean = issues.length === 0 && result.refusedRows.length === 0;

  return (
    <div
      className={`rounded-lg border-2 p-4 ${
        clean ? "bg-success-soft border-success/40" : "bg-warning-soft border-warning/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {clean ? (
            <CheckIcon className="w-5 h-5 text-success shrink-0 mt-0.5" />
          ) : (
            <WarningIcon className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          )}
          <div className="font-bold text-ink">
            {importedCount} of {result.totalRows} riders imported.
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          {!clean && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="text-ink-soft hover:text-ink text-sm font-semibold"
            >
              {collapsed ? "Show details" : "Collapse"}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="text-ink-soft hover:text-ink text-sm font-semibold"
          >
            Dismiss
          </button>
        </div>
      </div>

      {!clean && !collapsed && (
        <ul className="mt-2 ml-7 space-y-1 text-sm text-ink-soft list-disc">
          {issues.map((issue) => (
            <li key={issue.field}>{issue.label}</li>
          ))}
          {result.refusedRows.length > 0 && (
            <li>
              {result.refusedRows.length} row
              {result.refusedRows.length === 1 ? "" : "s"} couldn&apos;t be
              imported (row{result.refusedRows.length === 1 ? "" : "s"}{" "}
              {result.refusedRows.join(", ")} — no bib)
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
