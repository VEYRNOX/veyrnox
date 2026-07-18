// @ts-nocheck
// components/VaultIllustration.jsx
//
// Presentation-only vault/safe illustration used at the two onboarding moments
// where the wallet meets its hardware-protected storage:
//   1. KekEnrollmentGate — an existing (or freshly created) vault has been
//      recognized and the user is being asked to bind it to the device.
//   2. WalletEntry view='generate' — a NEW wallet is about to be sealed into
//      the encrypted vault. The seed phrase moment.
//
// Design system:
//   - Near-black surfaces via CSS custom properties (background/card/border).
//   - One accent: teal (--primary, #4ADAC2).
//   - No emojis, no external assets, no hex literals — semantic tokens only.
//
// Motion:
//   - Dial rotates continuously (~24 s per revolution).
//   - Two counter-orbiting sparkles trace the outer ring.
//   - The central medallion emits a slow teal breathing pulse.
//   - Everything degrades to a fully static illustration under
//     prefers-reduced-motion (useReducedMotion → mount without animate).
//
// Isolation:
//   - React.memo. The parent must not re-render this on every keystroke.
//   - No wallet-core imports. No side effects. No refs to global state.

import { memo } from 'react';
import { motion, useReducedMotion } from "motion/react";
import { useInfiniteAnimation } from '@/lib/useInfiniteAnimation';

// 8 safe-door "bolts" arranged evenly around the medallion. Pre-computed so we
// don't recalculate trig on every re-render.
const BOLT_COUNT = 8;
const BOLTS = Array.from({ length: BOLT_COUNT }, (_, i) => {
  const angle = (i / BOLT_COUNT) * Math.PI * 2 - Math.PI / 2;
  return { cx: 100 + Math.cos(angle) * 62, cy: 100 + Math.sin(angle) * 62 };
});

// Tick marks along the rotating dial — 60 ticks, every 5th slightly longer,
// like a physical combination-lock face.
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const angle = (i / 60) * 360;
  const long = i % 5 === 0;
  return { angle, long };
});

function VaultIllustrationImpl({ size = 200, className = '', label = 'Encrypted vault' }) {
  const reduce = useReducedMotion();
  const visible = useInfiniteAnimation();
  const animate = !reduce && visible;

  const rotate = animate
    ? { animate: { rotate: 360 }, transition: { duration: 24, ease: 'linear', repeat: Infinity } }
    : {};

  const rotateReverse = animate
    ? { animate: { rotate: -360 }, transition: { duration: 18, ease: 'linear', repeat: Infinity } }
    : {};

  const pulse = animate
    ? {
        animate: { opacity: [0.35, 0.7, 0.35], scale: [1, 1.04, 1] },
        transition: { duration: 3.6, ease: 'easeInOut', repeat: Infinity },
      }
    : {};

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {/* Ambient teal aura behind the vault — CSS-driven so the JS frame loop
          stays idle. Sits below everything; pointer-events off. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/20 blur-3xl motion-safe:animate-pulse"
      />

      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        className="block drop-shadow-[0_10px_30px_rgba(74,218,194,0.15)]"
        aria-hidden
      >
        <defs>
          {/* Radial teal glow used behind the medallion. Design-system tokens
              only — hsl(var(--primary)) so light/dark themes track. */}
          <radialGradient id="vaultGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
            <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity="0.10" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
          {/* Metallic ring gradient — near-black to card surface, gives the
              vault door a physical bevel without any hex literals. */}
          <linearGradient id="vaultRing" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--card))" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="1" />
          </linearGradient>
          {/* Inner medallion face — subtle darker inset. */}
          <radialGradient id="vaultFace" cx="50%" cy="42%" r="65%">
            <stop offset="0%" stopColor="hsl(var(--card))" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* Outer bevelled ring — the safe door frame. */}
        <circle cx="100" cy="100" r="94" fill="url(#vaultRing)" stroke="hsl(var(--border))" strokeWidth="1" />
        <circle cx="100" cy="100" r="84" fill="none" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.7" />

        {/* Radial safe-door bolts — small pinned circles. */}
        {BOLTS.map((b, i) => (
          <g key={i}>
            <circle cx={b.cx} cy={b.cy} r="3.2" fill="hsl(var(--background))" stroke="hsl(var(--border))" strokeWidth="1" />
            <circle cx={b.cx} cy={b.cy} r="1.2" fill="hsl(var(--primary))" opacity="0.55" />
          </g>
        ))}

        {/* Combination dial — rotates continuously. */}
        <motion.g style={{ transformOrigin: '100px 100px' }} {...rotate}>
          <circle cx="100" cy="100" r="72" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.18" strokeWidth="1" />
          {TICKS.map((t, i) => (
            <line
              key={i}
              x1="100"
              y1={100 - 72}
              x2="100"
              y2={t.long ? 100 - 72 + 6 : 100 - 72 + 3}
              stroke="hsl(var(--primary))"
              strokeOpacity={t.long ? 0.65 : 0.28}
              strokeWidth={t.long ? 1.4 : 1}
              transform={`rotate(${t.angle} 100 100)`}
            />
          ))}
          {/* Dial indicator notch — the "combination" pointer. */}
          <path
            d="M 100 22 L 96 14 L 104 14 Z"
            fill="hsl(var(--primary))"
            opacity="0.9"
          />
        </motion.g>

        {/* Medallion face — the sealed vault door plate. */}
        <circle cx="100" cy="100" r="56" fill="url(#vaultFace)" stroke="hsl(var(--border))" strokeWidth="1" />
        {/* Teal breathing glow underneath the center shield. */}
        <motion.circle
          cx="100"
          cy="100"
          r="44"
          fill="url(#vaultGlow)"
          style={{ transformOrigin: '100px 100px' }}
          {...pulse}
        />

        {/* Central lock — a shield with a keyhole. Fully custom so we don't
            depend on lucide inside an SVG viewbox. */}
        <g transform="translate(100 100)">
          {/* Shield outline. */}
          <path
            d="M 0 -28 L 22 -18 L 22 4 C 22 20 12 28 0 32 C -12 28 -22 20 -22 4 L -22 -18 Z"
            fill="hsl(var(--background))"
            stroke="hsl(var(--primary))"
            strokeOpacity="0.75"
            strokeWidth="1.4"
          />
          {/* Keyhole — a circle over a tapered slot. */}
          <circle cx="0" cy="-4" r="4.6" fill="hsl(var(--primary))" opacity="0.95" />
          <path d="M -2.6 -4 L -1.4 12 L 1.4 12 L 2.6 -4 Z" fill="hsl(var(--primary))" opacity="0.95" />
          {/* Small verified tick just under the shield — subtle confirmation. */}
          <path
            d="M -6 20 L -1.5 24 L 7 15"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        </g>

        {/* Two counter-orbiting sparkles that trace the outer ring. Each is a
            small teal dot with a soft glow. Motion-safe. */}
        <motion.g style={{ transformOrigin: '100px 100px' }} {...rotate}>
          <circle cx="100" cy="12" r="2.4" fill="hsl(var(--primary))" />
          <circle cx="100" cy="12" r="5" fill="hsl(var(--primary))" opacity="0.25" />
        </motion.g>
        <motion.g style={{ transformOrigin: '100px 100px' }} {...rotateReverse}>
          <circle cx="100" cy="188" r="1.8" fill="hsl(var(--primary))" opacity="0.85" />
          <circle cx="100" cy="188" r="4" fill="hsl(var(--primary))" opacity="0.2" />
        </motion.g>
      </svg>
    </div>
  );
}

const VaultIllustration = memo(VaultIllustrationImpl);
export default VaultIllustration;
