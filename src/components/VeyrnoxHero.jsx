// VeyrnoxHero — the shared onboarding hero used by every pre-vault surface
// (entry-tiles picker, PIN create, PIN confirm, seed input, unlock, first-
// receive card, wallet-created flash, restore-from-file, etc.).
//
// Slice K (2026-08-11): extracted from EntryTiles.jsx to end the chrome-drift
// loop between EntryShell (bare 56px logo, legacy tagline) and EntryTiles
// (76px logo + aurora + lamp cone + halo + new AI-Security-Advisor tagline).
// One component, one tagline, one halo, one place to change.
//
// Motion + low-end-device gates match the original EntryTiles pattern so
// existing lint/rings/reduced-motion behavior is preserved.

import { motion, useReducedMotion } from "motion/react";
import VeyrnoxLogo, { VeyrnoxWordmark } from "@/components/VeyrnoxLogo";
import { useInfiniteAnimation } from "@/lib/useInfiniteAnimation";
import { isLowEndDevice } from "@/hooks/useLowEndDevice";

export default function VeyrnoxHero({ children, className = "" }) {
  const reduce = useReducedMotion();
  const visible = useInfiniteAnimation();
  const animateLamp = !reduce && visible && !isLowEndDevice;

  const container = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
      };
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      };

  return (
    <div className={`relative w-full ${className}`}>
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
          <div className="relative">
            <div
              data-testid="logo-halo"
              aria-hidden
              className="vx-logo-halo absolute inset-0 -z-0 pointer-events-none blur-[12px]"
              style={{
                pointerEvents: "none",
                background:
                  "radial-gradient(circle, rgba(74,218,194,0.5) 0%, rgba(74,218,194,0.12) 45%, transparent 70%)",
              }}
            />
            <div className="relative z-10">
              <VeyrnoxLogo size={76} />
            </div>
          </div>
        </motion.div>

        <motion.div variants={item}>
          <VeyrnoxWordmark className="text-2xl block" />
        </motion.div>

        <motion.p variants={item} className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-[18rem]">
          Self-custody, Coercion-Resistant, AI Security Advisor. Your keys stay on this device.
        </motion.p>

        {children ? <motion.div variants={item} className="mt-8 w-full">{children}</motion.div> : null}
      </motion.div>
    </div>
  );
}
