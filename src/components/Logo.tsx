/**
 * The Evenly mark: two overlapping circles, two people sharing one pot.
 * The overlap is the soft accent, the shared part. Paired with a clean
 * wordmark. Pure SVG, no assets, inherits brand colours from CSS variables
 * when used inline, with explicit colours for standalone use.
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Evenly logo">
      <circle cx="19" cy="24" r="12" fill="#0e7a5f" />
      <circle cx="29" cy="24" r="12" fill="#f0a868" fillOpacity="0.85" />
      <path d="M24 13.7a12 12 0 0 1 0 20.6 12 12 0 0 1 0-20.6z" fill="#0b5c47" fillOpacity="0.55" />
    </svg>
  );
}

export function Logo({ size = 34, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      {wordmark && <span className="logo-word">Evenly</span>}
    </span>
  );
}
