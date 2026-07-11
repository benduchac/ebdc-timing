// Small line-icon set replacing emoji glyphs (✏️ 🗑️ ⚙️ ✓) — consistent
// weight/color across platforms, unlike emoji rendering which varies by OS.
// Deliberately minimal: stroke-based, inherits currentColor, one size prop.

interface IconProps {
  className?: string;
}

export function EditIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M13.4 3.4a1.4 1.4 0 0 1 2 0l1.2 1.2a1.4 1.4 0 0 1 0 2L7 16.2l-3.6.8.8-3.6L13.4 3.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0 .6 10a1 1 0 0 0 1 .95h4.8a1 1 0 0 0 1-.95L14.5 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const GEAR_TEETH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function GearIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {GEAR_TEETH_ANGLES.map((angle) => (
        <rect
          key={angle}
          x="9.1"
          y="3.2"
          width="1.8"
          height="2.6"
          rx="0.4"
          fill="currentColor"
          transform={`rotate(${angle} 10 10)`}
        />
      ))}
      <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function CheckIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 10.5 8 14l8-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WarningIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M10 3 2 17h16L10 3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M10 8.2v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="14.3" r="0.9" fill="currentColor" />
    </svg>
  );
}
