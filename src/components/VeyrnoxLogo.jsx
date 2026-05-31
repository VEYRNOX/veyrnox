// Veyrnox brand mark — a secure-silicon chip with a red security shield,
// recreated as a crisp, scalable SVG so it renders sharply at every size
// (header, auth, etc.). `bg` draws the dark rounded-square app-icon tile.

const PIN_CENTERS = [150, 192, 234, 276, 318, 360];
const BG = "#28333F";

export default function VeyrnoxLogo({ size = 32, bg = true, className = "" }) {
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
        <linearGradient id="vx-chip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C9D4DF" />
          <stop offset="1" stopColor="#9EABB9" />
        </linearGradient>
        <linearGradient id="vx-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0554D" />
          <stop offset="1" stopColor="#D42C2C" />
        </linearGradient>
      </defs>

      {bg && <rect x="0" y="0" width="512" height="512" rx="112" fill={BG} />}

      {/* pins on all four sides */}
      {PIN_CENTERS.map((c) => (
        <g key={c} fill="#A9B6C3">
          <rect x={c - 9} y={96}  width={18} height={48} rx={6} />
          <rect x={c - 9} y={368} width={18} height={48} rx={6} />
          <rect x={96}  y={c - 9} width={48} height={18} rx={6} />
          <rect x={368} y={c - 9} width={48} height={18} rx={6} />
        </g>
      ))}

      {/* chip body */}
      <rect x="132" y="132" width="248" height="248" rx="34" fill="url(#vx-chip)" />

      {/* red security shield */}
      <path
        d="M194 190 Q194 184 200 184 L312 184 Q318 184 318 190 L318 258 Q318 306 256 336 Q194 306 194 258 Z"
        fill="url(#vx-shield)"
      />
    </svg>
  );
}
