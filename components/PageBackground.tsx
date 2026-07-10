// A dedicated position:fixed layer for the site's background image, used
// instead of `background-attachment: fixed` on the content container. On
// mobile, background-attachment:fixed re-runs its `cover` sizing live as the
// browser's address bar collapses/expands during scroll (the visual
// viewport height changes moment-to-moment), which produces a visible
// resize/jump in the image. A real fixed-position element anchored with
// inset-0 is sized against the stable layout viewport instead and doesn't
// have that problem.
export default function PageBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/timing_bg.webp)" }}
      aria-hidden="true"
    />
  );
}
