import type { ReactNode } from "react";

// The photo-finish-clock signature element (see .time-chip in
// app/globals.css): every elapsed/finish time gets the same dark mono chip,
// paired everywhere with BibChip.
export default function TimeChip({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`time-chip ${className}`}>{children}</span>;
}
