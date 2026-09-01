"use client";

import { useEffect, useState } from "react";
import CopyLinkButton from "@/components/CopyLinkButton";

interface LinkWithCopyProps {
  path: string; // e.g. "/start/abc123"
  copyTitle: string;
}

// Shows the actual full URL, not just the internal path, next to a copy
// button — the path alone isn't useful to read aloud, screenshot, or retype,
// which defeats the point of showing it at all. Resolved client-side after
// mount (never during SSR), same reasoning as CopyLinkButton's own
// click-time resolution.
export default function LinkWithCopy({ path, copyTitle }: LinkWithCopyProps) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <div className="flex items-center gap-2 bg-sand rounded-lg p-2 text-sm font-mono truncate">
      <span className="truncate">
        {origin}
        {path}
      </span>
      <CopyLinkButton path={path} title={copyTitle} />
    </div>
  );
}
