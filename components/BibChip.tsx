// The bib-plate signature element (see .bib-chip in app/globals.css):
// every bib number in the app gets the same stamped-tag treatment instead
// of a plain "#47" — used in the timing input readout, results tables, and
// both leaderboards.
export default function BibChip({
  bib,
  className = "",
}: {
  bib: string;
  className?: string;
}) {
  return (
    <span className={`bib-chip ${className}`}>
      <span className="bib-chip-hash">#</span>
      {bib}
    </span>
  );
}
