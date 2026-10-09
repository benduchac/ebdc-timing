import type { Entry, Registrant } from "./db";

/**
 * Parses a registrant's raw `age` field into a non-negative integer, or null
 * if it's missing/invalid. The registration form collects a plain age
 * (not date of birth), so this is a validity check, not a computation.
 */
export function parseAge(age: string): number | null {
  if (!/^\d+$/.test(age)) return null;
  return Number(age);
}

// U18 includes 18 (the board is named for the 18U field, as on the form).
export const JUNIOR_MAX_AGE = 18;
export const MASTERS_MIN_AGE = 50;

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
  // Places shown by default: the places awarded at the event.
  displayLimit: number;
  // Places shown after "Show top N" — a cap, not the full field.
  expandLimit: number;
  entries: Entry[];
}

interface BoardDefinition {
  id: string;
  name: string;
  displayLimit: number;
  expandLimit: number;
  eligible: (rider: Registrant) => boolean;
}

const ageOf = (rider: Registrant) => parseAge(rider.age);
const isJunior = (rider: Registrant) => {
  const age = ageOf(rider);
  return age !== null && age <= JUNIOR_MAX_AGE;
};
const isMasters = (rider: Registrant) => {
  const age = ageOf(rider);
  return age !== null && age >= MASTERS_MIN_AGE;
};

// The 2026 awards. Boards are independent: a rider appears on every board
// they qualify for. Nonbinary and undisclosed riders qualify only for U18
// (not split by gender); the other four need male or female.
const BOARDS: BoardDefinition[] = [
  {
    id: "u18",
    name: "U18",
    displayLimit: 1,
    expandLimit: 10,
    eligible: isJunior,
  },
  {
    id: "men",
    name: "Men",
    displayLimit: 3,
    expandLimit: 25,
    eligible: (r) => r.gender === "male",
  },
  {
    id: "women",
    name: "Women",
    displayLimit: 3,
    expandLimit: 25,
    eligible: (r) => r.gender === "female",
  },
  {
    id: "mastersMen",
    name: "50+ Men",
    displayLimit: 1,
    expandLimit: 10,
    eligible: (r) => r.gender === "male" && isMasters(r),
  },
  {
    id: "mastersWomen",
    name: "50+ Women",
    displayLimit: 1,
    expandLimit: 10,
    eligible: (r) => r.gender === "female" && isMasters(r),
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
    expandLimit: board.expandLimit,
    entries: sortByElapsed(
      finished.filter((e) => {
        const rider = registrants.get(e.bib);
        return !!rider && board.eligible(rider);
      })
    ),
  }));
}
