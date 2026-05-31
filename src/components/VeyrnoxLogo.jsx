// Veyrnox brand mark — a secure-silicon chip with a keyhole, recreated as a
// crisp, scalable SVG so it renders sharply at every size (header, auth, etc.).
// `bg` draws the dark rounded-square app-icon tile; `holeColor` is the colour
// painted into the keyhole (defaults to the tile colour so it reads as a
// cut-out). We paint the keyhole on top rather than using an SVG <mask> because
// masks can hang some rasterizers / webviews.

const PIN_CENTERS = [150, 192, 234, 276, 318, 360];
const BG = "#28333F";

export default function VeyrnoxLogo({ size = 32, bg = true, holeColor = BG, className = "" }) {
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

      {/* keyhole cut-out */}
      <circle cx="256" cy="224" r="46" fill={holeColor} />
      <polygon points="238,252 274,252 292,348 220,348" fill={holeColor} />
    </svg>
  );
}
