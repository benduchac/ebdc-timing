import { redirect } from "next/navigation";

// Public results moved to "/" (see docs/race-readiness-design.md "Surfaces &
// routing"). Kept as a redirect so any bookmarked/shared /results links still
// land somewhere useful.
export default function ResultsRedirect() {
  redirect("/");
}
