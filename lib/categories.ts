import type { Entry, Registrant } from "./db";

export type AgeCategory = "junior" | "adult" | "masters";

/**
 * Parses a registrant's raw `age` field into a non-negative integer, or null
 * if it's missing/invalid. The registration form collects a plain age
 * (not date of birth), so this is a validity check, not a computation.
 */
export function parseAge(age: string): number | null {
  if (!/^\d+$/.test(age)) return null;
  return Number(age);
}

export function getAgeCategory(age: number): AgeCategory {
  if (age <= 18) return "junior";
  if (age >= 50) return "masters";
  return "adult";
}

export function getCategoryLabel(category: AgeCategory): string {
  switch (category) {
    case "junior":
      return "Junior (18U)";
    case "adult":
      return "Adult (19-49)";
    case "masters":
      return "Masters (50+)";
  }
}

export function getGenderLabel(gender: string): string {
  switch (gender) {
    case "male":
      return "Male";
    case "female":
      return "Female";
    case "nonbinary":
      return "Nonbinary";
    case "undisclosed":
      return "Undisclosed";
    default:
      return gender || "—";
  }
}

function sortByElapsed(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.elapsedMs === null || b.elapsedMs === null) return 0;
    if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
    // Stable tie order across renders — doesn't affect the displayed place
    // number (see computeStandardRanks in lib/utils.ts), just which of two
    // equal times lists first.
    return a.bib.localeCompare(b.bib, undefined, { numeric: true });
  });
}

export interface CategoryBoard {
  id: string;
  name: string;
  // How many places a board shows before "Show all" — a smaller field
  // (Masters, Junior) doesn't need as many rows as Overall to feel complete.
  displayLimit: number;
  entries: Entry[];
}

interface BoardDefinition {
  id: string;
  name: string;
  displayLimit: number;
  eligible: (rider: Registrant) => boolean;
}

const isMasters = (rider: Registrant) => {
  const age = parseAge(rider.age);
  return age !== null && getAgeCategory(age) === "masters";
};
const isJunior = (rider: Registrant) => {
  const age = parseAge(rider.age);
  return age !== null && getAgeCategory(age) === "junior";
};

// Exact age/gender cutoffs and board list for 2026 are still open — see
// docs/registrant-import.md section 5. These five boards are the pre-2026
// baseline, kept as-is until that's decided.
const BOARDS: BoardDefinition[] = [
  {
    id: "overallMale",
    name: "Overall male",
    displayLimit: 10,
    eligible: (r) => r.gender === "male",
  },
  {
    id: "overallFemale",
    name: "Overall female",
    displayLimit: 10,
    eligible: (r) => r.gender === "female",
  },
  {
    id: "juniorMale",
    name: "Junior male (18U)",
    displayLimit: 3,
    eligible: (r) => r.gender === "male" && isJunior(r),
  },
  {
    id: "juniorFemale",
    name: "Junior female (18U)",
    displayLimit: 3,
    eligible: (r) => r.gender === "female" && isJunior(r),
  },
  {
    id: "masters",
    name: "Masters (50+)",
    displayLimit: 3,
    eligible: isMasters,
  },
];

/**
 * Buckets finishers into every category board, keyed by rider data looked up
 * from `registrants`. Deliberately returns plain Entry[] per board, not
 * registrant/age data — Entry already carries everything a leaderboard needs
 * to render (name, bib, wave, times) — so the caller can hand these to a
 * public/client-facing component without age ever reaching it. Bucketing
 * itself still needs real age/gender, so this must only be called somewhere
 * with access to the real `registrants` map — a server-side context for the
 * public leaderboard, not passed as a client component prop.
 */
export function computeCategoryBuckets(
  entries: Entry[],
  registrants: Map<string, Registrant>
): CategoryBoard[] {
  const finished = entries.filter(
    (e) => e.wave !== null && e.elapsedMs !== null
  );

  return BOARDS.map((board) => ({
    id: board.id,
    name: board.name,
    displayLimit: board.displayLimit,
    entries: sortByElapsed(
      finished.filter((e) => {
        const rider = registrants.get(e.bib);
        return !!rider && board.eligible(rider);
      })
    ),
  }));
}
