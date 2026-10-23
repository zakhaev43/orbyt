import { useId } from "react";

/** Orbyt mark: a planet with an orbiting satellite. Keep in sync with app/icon.svg. */
export function Logo({ size = 32 }: { size?: number }) {
  const id = useId();
  const gradient = `orbyt-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Orbyt" className="shrink-0">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2f6bff" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <ellipse
        cx="16"
        cy="16"
        rx="11"
        ry="4.6"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="1.8"
        transform="rotate(-30 16 16)"
      />
      <circle cx="16" cy="16" r="5.2" fill="#fff" />
      <circle cx="25.53" cy="10.5" r="2.1" fill="#fff" />
    </svg>
  );
}
