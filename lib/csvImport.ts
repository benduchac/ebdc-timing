import type { Registrant } from "./db";
import { normalizeBib } from "./utils";

export type IssueTier =
  | "refused"
  | "blocks-scoring"
  | "blocks-results"
  | "blocks-awards";

export interface Issue {
  field: string;
  tier: IssueTier;
  message: string;
}

export interface ImportResult {
  registrants: Map<string, Registrant>;
  // 1-indexed file row numbers (header is row 1) — the only outcome that
  // can't be found on the roster afterward, since a refused row was never
  // added to it.
  refusedRows: number[];
  totalRows: number;
  issuesByBib: Map<string, Issue[]>;
  // Set instead of parsing anything when the header doesn't look like a
  // 2026 export — the likeliest race-morning mistake is uploading last
  // year's file, and that should fail loudly, not import zero rows quietly.
  headerError: string | null;
}

const REQUIRED_HEADERS = ["bib", "first_name", "last_name", "wave"];
const WAVES = new Set(["A", "B", "C"]);
const GENDERS = new Set(["male", "female", "nonbinary", "undisclosed"]);
const YES_NO = new Set(["yes", "no"]);
const YES_NO_UNSURE = new Set(["yes", "no", "unsure"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hand-written RFC-4180 tokenizer: quoted fields, "" as an escaped quote
 * inside a quoted field, commas/newlines inside quotes, CRLF or LF line
 * endings, and a leading UTF-8 BOM. No CSV library — lib/utils.ts already
 * hand-rolls the export side of this (csvField), and the format is bounded
 * enough to keep it that way rather than take a dependency.
 */
export function parseCSVRows(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      endField();
    } else if (c === "\r") {
      // swallowed here; the following \n (if any) ends the row
    } else if (c === "\n") {
      endRow();
    } else {
      field += c;
    }
  }
  // A file not ending in a newline still has a final row to flush.
  if (field !== "" || row.length > 0) endRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const asWave = (value: string): "A" | "B" | "C" | null => {
  const upper = value.toUpperCase();
  return upper === "A" || upper === "B" || upper === "C" ? upper : null;
};

/**
 * Every problem a single registrant carries, derived from the record itself
 * — not stored anywhere, so it can't go stale after an edit. Shared by the
 * import summary, the roster flags, and the setup-checklist tick, so all
 * three agree by construction. See docs/fun-awards-timing.md section 6a.
 */
export function getRegistrantIssues(r: Registrant): Issue[] {
  if (!r.bib) {
    return [{ field: "bib", tier: "refused", message: "No bib." }];
  }

  // A spare is expected to be blank everywhere except bib and status —
  // blank fields there aren't a problem to flag.
  if (r.status === "spare") return [];

  const issues: Issue[] = [];
  if (!r.wave || !WAVES.has(r.wave)) {
    issues.push({
      field: "wave",
      tier: "blocks-scoring",
      message: "Wave missing or not A/B/C — this rider can't be scored.",
    });
  }
  if (!r.firstName || !r.lastName) {
    issues.push({
      field: "name",
      tier: "blocks-results",
      message: "First or last name missing.",
    });
  }
  if (!r.dob || !ISO_DATE.test(r.dob)) {
    issues.push({
      field: "dob",
      tier: "blocks-awards",
      message: "Birthday missing or not YYYY-MM-DD.",
    });
  }
  if (!GENDERS.has(r.gender)) {
    issues.push({
      field: "gender",
      tier: "blocks-awards",
      message: r.gender
        ? `Gender "${r.gender}" isn't one of the four tokens.`
        : "Gender missing.",
    });
  }
  for (const [field, value, allowed] of [
    ["first_gravel_race", r.firstGravelRace, YES_NO],
    ["is_parent", r.isParent, YES_NO],
    ["rigid_bike", r.rigidBike, YES_NO_UNSURE],
    ["steel_bike", r.steelBike, YES_NO_UNSURE],
  ] as const) {
    if (value !== undefined && value !== "" && !allowed.has(value)) {
      issues.push({
        field,
        tier: "blocks-awards",
        message: `"${value}" isn't a recognized answer — treated as not eligible.`,
      });
    }
  }
  return issues;
}

const FIELD_LABELS: Record<string, (n: number) => string> = {
  wave: (n) =>
    `${n} rider${n === 1 ? "" : "s"} with an invalid wave — can't be scored until fixed`,
  name: (n) =>
    `${n} rider${n === 1 ? "" : "s"} missing a name — can't appear on results`,
  dob: (n) =>
    `${n} birthday${n === 1 ? "" : "s"} missing or invalid — no age categories for them`,
  gender: (n) =>
    `${n} rider${n === 1 ? "" : "s"} with a missing or unrecognized gender — no gendered podium`,
  bib: (n) => `${n} duplicate bib${n === 1 ? "" : "s"} — an earlier row was overwritten`,
  first_gravel_race: (n) =>
    `${n} first-timer answer${n === 1 ? "" : "s"} not recognized — treated as not eligible`,
  is_parent: (n) =>
    `${n} parent answer${n === 1 ? "" : "s"} not recognized — treated as not eligible`,
  rigid_bike: (n) =>
    `${n} rigid-bike answer${n === 1 ? "" : "s"} not recognized — treated as not eligible`,
  steel_bike: (n) =>
    `${n} steel-bike answer${n === 1 ? "" : "s"} not recognized — treated as not eligible`,
};

/**
 * Named counts, one line per problem type — "3 birthdays missing", not a
 * per-row dump. Grouped by field, most common first. See
 * docs/fun-awards-timing.md section 6a's example summary.
 */
export function summarizeIssues(
  issuesByBib: Map<string, Issue[]>
): { field: string; count: number; label: string }[] {
  const counts = new Map<string, number>();
  for (const issues of issuesByBib.values()) {
    for (const issue of issues) {
      counts.set(issue.field, (counts.get(issue.field) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([field, count]) => ({
      field,
      count,
      label: (FIELD_LABELS[field] ?? ((n: number) => `${n} ${field} issue${n === 1 ? "" : "s"}`))(
        count
      ),
    }))
    .sort((a, b) => b.count - a.count);
}

export function importRegistrants(csvText: string): ImportResult {
  const rows = parseCSVRows(csvText);
  const empty: ImportResult = {
    registrants: new Map(),
    refusedRows: [],
    totalRows: 0,
    issuesByBib: new Map(),
    headerError: null,
  };
  if (rows.length === 0) {
    return { ...empty, headerError: "The file is empty." };
  }

  const header = rows[0].map((h) => h.trim());
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return {
      ...empty,
      totalRows: rows.length - 1,
      headerError:
        `This doesn't look like a 2026 registration export — missing ` +
        `column${missing.length > 1 ? "s" : ""} ${missing.join(", ")}.`,
    };
  }

  const at = (name: string) => header.indexOf(name);
  const idx = {
    bib: at("bib"),
    status: at("status"),
    firstName: at("first_name"),
    lastName: at("last_name"),
    wave: at("wave"),
    dob: at("dob"),
    gender: at("gender"),
    firstGravelRace: at("first_gravel_race"),
    isParent: at("is_parent"),
    rigidBike: at("rigid_bike"),
    steelBike: at("steel_bike"),
  };
  const cell = (row: string[], i: number): string =>
    i >= 0 ? (row[i] ?? "").trim() : "";

  const registrants = new Map<string, Registrant>();
  const issuesByBib = new Map<string, Issue[]>();
  const refusedRows: number[] = [];
  const seenBibs = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const fileRow = r + 1; // header is file row 1

    const rawBib = cell(row, idx.bib);
    const bib = rawBib ? normalizeBib(rawBib) : "";
    if (!bib) {
      refusedRows.push(fileRow);
      continue;
    }

    const isSpare = cell(row, idx.status) === "spare";
    const registrant: Registrant = isSpare
      ? { bib, status: "spare", firstName: "", lastName: "", wave: null, dob: "", gender: "" }
      : {
          bib,
          firstName: cell(row, idx.firstName),
          lastName: cell(row, idx.lastName),
          wave: asWave(cell(row, idx.wave)),
          dob: cell(row, idx.dob),
          // Gender is never case-normalized — accepting "Female" silently
          // is how a real Non-Binary or Prefer-Not-To-Say answer ends up
          // mapped to something nobody chose. See fun-awards-timing.md
          // section 5's note on row 25 of this exact fixture.
          gender: cell(row, idx.gender),
          firstGravelRace: cell(row, idx.firstGravelRace) || undefined,
          isParent: cell(row, idx.isParent) || undefined,
          rigidBike: cell(row, idx.rigidBike) || undefined,
          steelBike: cell(row, idx.steelBike) || undefined,
        };

    const issues = getRegistrantIssues(registrant);
    if (seenBibs.has(bib)) {
      issues.push({
        field: "bib",
        tier: "blocks-scoring",
        message: "Bib already used by an earlier row — that row was overwritten.",
      });
    }
    seenBibs.add(bib);
    if (issues.length > 0) issuesByBib.set(bib, issues);
    registrants.set(bib, registrant);
  }

  return {
    registrants,
    refusedRows,
    totalRows: rows.length - 1,
    issuesByBib,
    headerError: null,
  };
}
