// @ts-nocheck
// components/EmptyState.jsx
//
// Reusable empty-state primitive. Renders a small line-art illustration that
// matches the vault visual language (near-black surface + teal accent, no
// emoji, no fill colors outside tokens) + honest copy + optional CTA.
//
// Motion: gentle stagger fade-in (100ms cascade), reduced-motion pins static.
// Skill Rule 8 `empty-states` — a beautifully-composed empty state is what
// separates "professional" from "unfinished."
//
// Variants (`kind` prop):
//   'transactions' — envelope + arrows glyph
//   'alerts'       — bell glyph
//   'wallets'      — simplified vault door
//   'search'       — magnifying glass
//   'generic'      — three dots

import { motion, useReducedMotion } from 'framer-motion';

const ILLUSTRATIONS = {
  transactions: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 24h36l6 8v20a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V28a4 4 0 0 1 4-4z" opacity="0.35" />
      <path d="M20 40l8-8m0 0h-5m5 0v5" opacity="0.9" />
      <path d="M46 34l-8 8m0 0h5m-5 0v-5" opacity="0.9" />
    </g>
  ),
  alerts: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 12v3" opacity="0.7" />
      <path d="M18 42V32a14 14 0 1 1 28 0v10l3 4H15l3-4z" opacity="0.4" />
      <path d="M28 50a4 4 0 0 0 8 0" />
    </g>
  ),
  wallets: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="32" r="20" opacity="0.3" />
      <circle cx="32" cy="32" r="12" opacity="0.6" />
      <path d="M32 22v20M22 32h20" opacity="0.35" />
      <circle cx="32" cy="32" r="4" fill="currentColor" opacity="0.7" />
    </g>
  ),
  search: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="28" cy="28" r="14" opacity="0.4" />
      <path d="M38 38l10 10" opacity="0.9" />
    </g>
  ),
  generic: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="20" cy="32" r="2.5" opacity="0.6" />
      <circle cx="32" cy="32" r="2.5" opacity="0.8" />
      <circle cx="44" cy="32" r="2.5" opacity="0.6" />
    </g>
  ),
};

export default function EmptyState({
  kind = 'generic',
  title,
  description,
  action,
  className = '',
}) {
  const reduce = useReducedMotion();
  const illustration = ILLUSTRATIONS[kind] || ILLUSTRATIONS.generic;
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
      };
  const container = {
    hidden: {},
    show: { transition: reduce ? {} : { staggerChildren: 0.08, delayChildren: 0.05 } },
  };
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={`flex flex-col items-center justify-center text-center gap-3 py-10 px-4 ${className}`}
    >
      <motion.div variants={item} className="relative flex items-center justify-center">
        <span aria-hidden className="absolute inset-0 -z-10 rounded-full bg-primary/10 blur-2xl" />
        <svg viewBox="0 0 64 64" width={80} height={80} className="text-primary" aria-hidden>
          {illustration}
        </svg>
      </motion.div>
      {title && (
        <motion.p variants={item} className="text-sm font-semibold">
          {title}
        </motion.p>
      )}
      {description && (
        <motion.p variants={item} className="text-xs text-muted-foreground max-w-[22rem] leading-relaxed">
          {description}
        </motion.p>
      )}
      {action && <motion.div variants={item}>{action}</motion.div>}
    </motion.div>
  );
}
