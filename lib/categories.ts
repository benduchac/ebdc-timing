import type { Registrant } from './db';

export type AgeCategory = 'junior' | 'adult' | 'masters';

/**
 * Calculate age from date of birth
 */
export function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Determine age category based on date of birth
 */
export function getAgeCategory(dob: string): AgeCategory {
  const age = calculateAge(dob);
  
  if (age < 18) return 'junior';
  if (age >= 55) return 'masters';
  return 'adult';
}

/**
 * Get category label for display
 */
export function getCategoryLabel(category: AgeCategory): string {
  switch (category) {
    case 'junior': return 'Junior (U18)';
    case 'adult': return 'Adult (18-54)';
    case 'masters': return 'Masters (55+)';
  }
}

/**
 * Get gender label for display
 */
export function getGenderLabel(gender: 'male' | 'female' | 'n/a'): string {
  switch (gender) {
    case 'male': return 'Male';
    case 'female': return 'Female';
    case 'n/a': return 'N/A';
  }
}