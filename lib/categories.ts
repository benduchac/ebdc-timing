import type { Entry, Registrant } from "./db";

export type AgeCategory = "junior" | "adult" | "masters";

/**
 * Age on `asOf` (both YYYY-MM-DD), computed as plain integer date math — no
 * `Date` object, no timezone, on either side. `new Date(dob)` parses as UTC
 * midnight while the rest of the app runs in local time, which flips the
 * answer by a day right at a Pacific-time boundary; comparing y/m/d integers
 * directly removes the timezone question rather than working around it.
 */
export function calculateAge(dob: string, asOf: string): number {
  const [dy, dm, dd] = dob.split("-").map(Number);
  const [ay, am, ad] = asOf.split("-").map(Number);

  let age = ay - dy;
  if (am < dm || (am === dm && ad < dd)) age--;
  return age;
}

export function getAgeCategory(dob: string, asOf: string): AgeCategory {
  const age = calculateAge(dob, asOf);
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
  // "category" is an age/gender division, ranked in full. "award" is a fun
  // award (fastest parent, top rigid bike, ...) — a single-winner spotlight,
  // not a ranked list. See CategoryLeaderboardGrid.tsx.
  kind: "category" | "award";
  // How many places a category board shows before "Show all" — a smaller
  // field (Masters, Junior) doesn't need as many rows as Overall to feel
  // complete. Unused for "award" boards.
  displayLimit?: number;
  entries: Entry[];
}

interface BoardDefinition {
  id: string;
  name: string;
  kind: "category" | "award";
  displayLimit?: number;
  eligible: (rider: Registrant, asOf: string) => boolean;
}

const isMasters = (rider: Registrant, asOf: string) =>
  !!rider.dob && getAgeCategory(rider.dob, asOf) === "masters";
const isJunior = (rider: Registrant, asOf: string) =>
  !!rider.dob && getAgeCategory(rider.dob, asOf) === "junior";

// Ordered per docs/fun-awards-timing.md section 4. Masters is one combined
// (all-genders) board only — a gendered split shipped once and was dropped
// as one board too many; nonbinary/undisclosed riders have ranked on the
// combined board since before this build.
const BOARDS: BoardDefinition[] = [
  {
    id: "overallMale",
    name: "Overall male",
    kind: "category",
    displayLimit: 10,
    eligible: (r) => r.gender === "male",
  },
  {
    id: "overallFemale",
    name: "Overall female",
    kind: "category",
    displayLimit: 10,
    eligible: (r) => r.gender === "female",
  },
  {
    id: "juniorMale",
    name: "Junior male (18U)",
    kind: "category",
    displayLimit: 3,
    eligible: (r, asOf) => r.gender === "male" && isJunior(r, asOf),
  },
  {
    id: "juniorFemale",
    name: "Junior female (18U)",
    kind: "category",
    displayLimit: 3,
    eligible: (r, asOf) => r.gender === "female" && isJunior(r, asOf),
  },
  {
    id: "masters",
    name: "Masters (50+)",
    kind: "category",
    displayLimit: 3,
    eligible: isMasters,
  },
  {
    id: "fastestParent",
    name: "Fastest parent",
    kind: "award",
    eligible: (r) => r.isParent === "yes",
  },
  {
    id: "fastestFirstTimer",
    name: "Fastest first-timer",
    kind: "award",
    eligible: (r) => r.firstGravelRace === "yes",
  },
  {
    id: "topRigidBike",
    name: "Top rigid bike",
    kind: "award",
    eligible: (r) => r.rigidBike === "yes",
  },
  {
    id: "topSteelBike",
    name: "Top steel bike",
    kind: "award",
    eligible: (r) => r.steelBike === "yes",
  },
];

/**
 * Buckets finishers into every award/category board, keyed by rider data
 * looked up from `registrants`. Deliberately returns plain Entry[] per
 * board, not registrant/DOB data — Entry already carries everything a
 * leaderboard needs to render (name, bib, wave, times) — so the caller can
 * hand these to a public/client-facing component without birthdate ever
 * reaching it. Bucketing itself still needs real DOB/gender, so this must
 * only be called somewhere with access to the real `registrants` map — a
 * server-side context for the public leaderboard, not passed as a client
 * component prop. `asOf` anchors age (YYYY-MM-DD) — pass the race date, not
 * "today", so republishing results later never reshuffles Masters/Junior.
 */
export function computeCategoryBuckets(
  entries: Entry[],
  registrants: Map<string, Registrant>,
  asOf: string
): CategoryBoard[] {
  const finished = entries.filter(
    (e) => e.wave !== null && e.elapsedMs !== null
  );

  return BOARDS.map((board) => ({
    id: board.id,
    name: board.name,
    kind: board.kind,
    displayLimit: board.displayLimit,
    entries: sortByElapsed(
      finished.filter((e) => {
        const rider = registrants.get(e.bib);
        return !!rider && board.eligible(rider, asOf);
      })
    ),
  }));
}
