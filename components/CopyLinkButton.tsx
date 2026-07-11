"use client";

import { useState } from "react";

function CopyIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="7" y="7" width="9" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

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
        className="hover:text-flag inline-flex align-middle"
        title="Copy leaderboard link"
      >
        <CopyIcon />
      </button>
      {copiedAt !== null && (
        <span
          key={copiedAt}
          className="text-success animate-[fadeOut_3s_ease-out_forwards]"
          onAnimationEnd={() => setCopiedAt(null)}
        >
          Copied!
        </span>
      )}
    </span>
  );
}
