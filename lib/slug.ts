// Race labels become public-URL slugs (e.g. "EBDC 7/9" -> "ebdc-7-9").
// Assigned once server-side on first sync (see app/api/backup/route.ts) and
// never recomputed after — the label can't collide with the label of an
// already-slugged race without silently taking over its URL.

export function slugify(label: string): string {
  const s = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "race";
}

// Real top-level routes/files a race slug must never shadow.
const RESERVED_SLUGS = new Set([
  "operator",
  "api",
  "results",
  "manifest.webmanifest",
  "favicon.ico",
  "icon.svg",
  "sw.js",
  "robots.txt",
  "sitemap.xml",
]);

// Dedup is slug-only, deliberately — see docs/race-readiness-design.md.
// Duplicate race *labels* are allowed; the second one just gets "-2".
export function assignSlug(label: string, existingSlugs: Set<string>): string {
  let base = slugify(label);
  if (RESERVED_SLUGS.has(base)) base = `${base}-race`;

  let slug = base;
  let n = 2;
  while (existingSlugs.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}
