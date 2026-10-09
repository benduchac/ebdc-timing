import type { PublicPhoto } from "@/lib/types";

interface FinisherPhotoProps {
  photo: PublicPhoto;
  className?: string;
}

// An approved finish-line photo on the public leaderboard: the thumbnail,
// loaded lazily, and the full frame only when a viewer taps it. Never put
// `photo.url` in an <img> here. Vercel Blob stops serving for 30 days if the
// month's transfer runs out, and a 200-rider board at full size would spend
// it in an afternoon. See docs/photo-companion-design.md "Publishing".
export default function FinisherPhoto({ photo, className = "" }: FinisherPhotoProps) {
  return (
    <a
      href={photo.url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open the full photo"
      className="shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.thumbUrl}
        alt=""
        loading="lazy"
        className={`object-cover rounded ${className}`}
      />
    </a>
  );
}
