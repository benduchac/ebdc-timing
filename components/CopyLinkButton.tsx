"use client";

import { useState } from "react";

interface CopyLinkButtonProps {
  path: string; // e.g. "/ebdc-7-9" — resolved to an absolute URL at click time
}

// "Copied!" flashes then fades over 3s (see the fadeOut keyframes in
// globals.css) instead of a blocking alert(). key={copiedAt} remounts the
// span on every click so the animation restarts cleanly even if clicked
// again before the previous fade finished.
export default function CopyLinkButton({ path }: CopyLinkButtonProps) {
  const [copiedAt, setCopiedAt] = useState<number | null>(null);

  const handleClick = async () => {
    // Resolved here (not from a prop) so it's never evaluated during SSR.
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the link
      // itself is still visible/clickable right next to this button, so
      // fail silently rather than alert().
    }
    setCopiedAt(Date.now());
  };

  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <button
        onClick={handleClick}
        className="hover:text-purple-600"
        title="Copy leaderboard link"
      >
        📋
      </button>
      {copiedAt !== null && (
        <span
          key={copiedAt}
          className="text-green-600 animate-[fadeOut_3s_ease-out_forwards]"
          onAnimationEnd={() => setCopiedAt(null)}
        >
          Copied!
        </span>
      )}
    </span>
  );
}
