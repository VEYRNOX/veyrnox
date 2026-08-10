// EntryTiles — pre-vault entry picker. No wallet state, no I3 gate needed by
// construction (never rendered post-vault).
//
// Slice D1 (docs/superpowers/plans/2026-08-10-entry-tiles-slice-d1.md): replaces
// WelcomeHero's single "Get Started" action with a 3-tile choice (New / Have /
// Advanced). Each tile fires `onSelect(path)`; WalletEntry decides where each
// path routes (New/Have -> PIN-first; Advanced -> the existing .enc restore
// flow, which carries its own credential and does not need a PIN first).
//
// Hero chrome (approved mockup panel B, welcome-routing.html): logo + wordmark
// + tagline + an ambient "lamp cone" background sit above the tile list. Pure
// presentation — no wallet reads, no localStorage writes. Aurora blobs reuse
// WelcomeHero's exact pattern (useInfiniteAnimation + isLowEndDevice gate) for
// consistency; the lamp cone gets the same two gates via a single CSS class
// toggle so it collapses to a static glow under prefers-reduced-motion or on
// low-end hardware instead of running 3.2-8s loops forever.

import { Wallet, Download, Shield } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import VeyrnoxLogo, { VeyrnoxWordmark } from "@/components/VeyrnoxLogo";
import { useInfiniteAnimation } from "@/lib/useInfiniteAnimation";
import { isLowEndDevice } from "@/hooks/useLowEndDevice";

const TILES = [
  {
    path: "new",
    icon: Wallet,
    label: "New wallet",
    subtitle: "Create a fresh wallet",
  },
  {
    path: "have",
    icon: Download,
    label: "Have a wallet",
    subtitle: "Import a seed phrase",
  },
  {
    path: "advanced",
    icon: Shield,
    label: "Advanced",
    subtitle: "Restore from a backup file",
  },
];

export default function EntryTiles({ onSelect }) {
  const reduce = useReducedMotion();
  const visible = useInfiniteAnimation();
  const animateLamp = !reduce && visible && !isLowEndDevice;

  const container = {
    hidden: {},
    show: { transition: reduce ? {} : { staggerChildren: 0.09, delayChildren: 0.05 } },
  };
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      };

  return (
    <div className="relative w-full overflow-hidden">
      {/* Lamp cone keyframes, scoped here since they're only used by this
          component's ambient background — not a shared design-system
          animation, so it doesn't belong in tailwind.config.js. */}
      <style>{`
        @keyframes vx-beam-breathe { 0%, 100% { opacity: 0.72; } 50% { opacity: 1; } }
        @keyframes vx-beam-sway { 0%, 100% { transform: translateX(-50%) rotate(-1.5deg); } 50% { transform: translateX(-50%) rotate(1.5deg); } }
        @keyframes vx-emitter-pulse { 0%, 100% { opacity: 0.65; transform: translateX(-50%) scale(1); } 50% { opacity: 0.95; transform: translateX(-50%) scale(1.08); } }
        .vx-lamp-beam.vx-animated { animation: vx-beam-breathe 6s ease-in-out infinite; }
        .vx-lamp-beam-inner.vx-animated { animation: vx-beam-sway 8s ease-in-out infinite; }
        .vx-lamp-emitter.vx-animated { animation: vx-emitter-pulse 3.2s ease-in-out infinite; }
      `}</style>

      {/* Ambient backdrop: aurora blobs (WelcomeHero's pattern, reused verbatim
          for consistency) + the lamp cone. Fixed behind everything, no pointer
          events, decorative only. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {!isLowEndDevice && (
          <>
            <motion.div
              className="absolute -top-24 -start-16 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
              animate={reduce || !visible ? undefined : { x: [0, 24, 0], y: [0, 18, 0] }}
              transition={reduce ? undefined : { duration: 14, ease: "easeInOut", repeat: Infinity }}
            />
            <motion.div
              className="absolute -bottom-24 -end-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl"
              animate={reduce || !visible ? undefined : { x: [0, -20, 0], y: [0, -14, 0] }}
              transition={reduce ? undefined : { duration: 18, ease: "easeInOut", repeat: Infinity }}
            />
          </>
        )}

        {/* Outer beam */}
        <div
          className={`vx-lamp-beam absolute -top-20 left-1/2 -translate-x-1/2 opacity-[0.85] blur-[32px] ${animateLamp ? "vx-animated" : ""}`}
          style={{
            width: 620,
            height: 620,
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
            background:
              "linear-gradient(180deg, rgba(74,218,194,0.55) 0%, rgba(74,218,194,0.08) 45%, transparent 75%)",
          }}
        />
        {/* Inner beam */}
        <div
          className={`vx-lamp-beam-inner absolute -top-16 left-1/2 -translate-x-1/2 opacity-70 blur-[14px] ${animateLamp ? "vx-animated" : ""}`}
          style={{
            width: 320,
            height: 480,
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
            background:
              "linear-gradient(180deg, rgba(120,240,216,0.85) 0%, rgba(74,218,194,0.25) 30%, transparent 70%)",
            transformOrigin: "50% 0%",
          }}
        />
        {/* Emitter */}
        <div
          className={`vx-lamp-emitter absolute -top-16 left-1/2 -translate-x-1/2 opacity-75 blur-[24px] ${animateLamp ? "vx-animated" : ""}`}
          style={{
            width: 380,
            height: 240,
            background:
              "radial-gradient(ellipse at center top, rgba(160,250,224,0.9) 0%, rgba(74,218,194,0.4) 20%, transparent 55%)",
          }}
        />
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative w-full max-w-sm mx-auto flex flex-col items-center text-center pt-10"
      >
        <motion.div variants={item} className="relative mb-4">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full bg-primary/25 blur-3xl motion-safe:animate-pulse"
          />
          <VeyrnoxLogo size={76} />
        </motion.div>

        <motion.div variants={item}>
          <VeyrnoxWordmark className="text-2xl block" />
        </motion.div>

        <motion.p variants={item} className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-[18rem]">
          Self-custody, coercion-resistant. Your keys stay on this device.
        </motion.p>

        <motion.div variants={item} className="mt-8 w-full space-y-3">
          {TILES.map(({ path, icon: Icon, label, subtitle }) => (
            <Button
              key={path}
              type="button"
              variant="outline"
              className="w-full h-auto py-4 flex-col items-start gap-1 text-start"
              onClick={() => onSelect(path)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4 text-primary" /> {label}
              </span>
              <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>
            </Button>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
