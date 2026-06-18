// Veyrnox brand mark — a teal hexagon enclosing a gradient "V", drawn as a
// crisp scalable SVG so it renders sharply at every size (header, sidebar,
// auth front door, app icon). ONE teal accent (#4ADAC2), calm near-black —
// the design-system palette. `bg` optionally draws the dark rounded app-icon
// tile (off by default so the mark sits directly on the near-black UI, matching
// the brand lockup).

import { useId } from "react";

export default function VeyrnoxLogo({ size = 32, bg = false, className = "" }) {
  // Unique gradient ids per instance. The layout renders TWO marks (desktop
  // sidebar + mobile header) and one is always display:none for the current
  // breakpoint; with shared ids the visible mark would reference a gradient
  // inside the hidden subtree, which browsers don't paint — making the mark
  // invisible. useId() guarantees each instance references its OWN gradients.
  const uid = useId().replace(/:/g, "");
  const hex = `vx-hex-${uid}`;
  const v = `vx-v-${uid}`;
  const fill = `vx-fill-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Veyrnox"
    >
      <defs>
        {/* Mint → teal, the single brand accent. */}
        <linearGradient id={hex} x1="120" y1="80" x2="392" y2="432" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7BEBD7" />
          <stop offset="1" stopColor="#32B6A0" />
        </linearGradient>
        <linearGradient id={v} x1="188" y1="180" x2="324" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#86EEDB" />
          <stop offset="1" stopColor="#3CC3AD" />
        </linearGradient>
        {/* Subtle interior depth (teal-tinted near-black). */}
        <linearGradient id={fill} x1="256" y1="104" x2="256" y2="408" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#12211F" />
          <stop offset="1" stopColor="#0A0F12" />
        </linearGradient>
      </defs>

      {/* Optional app-icon tile (favicon / touch icon). */}
      {bg && <rect x="0" y="0" width="512" height="512" rx="112" fill="#0B0F14" />}

      {/* Flat-top hexagon: subtle fill + teal gradient stroke. */}
      <path
        d="M169 104 L343 104 L431 256 L343 408 L169 408 L81 256 Z"
        fill={`url(#${fill})`}
        stroke={`url(#${hex})`}
        strokeWidth="20"
        strokeLinejoin="round"
      />

      {/* The "V". */}
      <path
        d="M188 188 L256 330 L324 188"
        fill="none"
        stroke={`url(#${v})`}
        strokeWidth="42"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Wordmark lockup — "VEYRNOX" in the brand voice: Schibsted Grotesk, bold,
// tracked, uppercase, with a calm light→muted vertical gradient (theme-aware
// via tokens, so it inverts correctly in light mode). Pair it with the mark.
export function VeyrnoxWordmark({ className = "" }) {
  return (
    <span
      className={`font-sans font-bold uppercase tracking-[0.14em] bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent ${className}`}
    >
      VEYRNOX
    </span>
  );
}
