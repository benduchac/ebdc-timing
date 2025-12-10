import type { Entry, Registrant } from "./db";

export type AgeCategory = "junior" | "adult" | "masters";
export type Gender = "male" | "female" | "n/a";

/**
 * Calculate age from date of birth
 */
export function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

/**
 * Determine age category based on date of birth
 */
export function getAgeCategory(dob: string): AgeCategory {
  const age = calculateAge(dob);

  if (age < 19) return "junior";
  if (age >= 50) return "masters";
  return "adult";
}

/**
 * Get category label for display
 */
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

/**
 * Get gender label for display
 */
export function getGenderLabel(gender: "male" | "female" | "n/a"): string {
  switch (gender) {
    case "male":
      return "Male";
    case "female":
      return "Female";
    case "n/a":
      return "N/A";
  }
}

/**
 * Filter entries by gender and age category
 */
export function filterByCategory(
  entries: Entry[],
  registrants: Map<string, Registrant>,
  gender?: Gender,
  ageCategory?: AgeCategory
): Entry[] {
  return entries.filter((entry) => {
    const rider = registrants.get(entry.bib);
    if (!rider) return false;

    // Filter by gender if specified
    if (gender && rider.gender !== gender) return false;

    // Filter by age category if specified
    if (ageCategory) {
      const category = getAgeCategory(rider.dob);
      if (category !== ageCategory) return false;
    }

    return true;
  });
}

/**
 * Get top N entries from a filtered list
 */
export function getTopEntries(entries: Entry[], count: number = 10): Entry[] {
  return entries
    .filter((e) => e.wave !== null && e.elapsedMs !== null)
    .sort((a, b) => {
      if (a.elapsedMs === null || b.elapsedMs === null) return 0;
      return a.elapsedMs - b.elapsedMs;
    })
    .slice(0, count);
}
