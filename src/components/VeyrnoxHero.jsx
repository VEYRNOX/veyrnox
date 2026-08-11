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
    <div className={`relative w-full overflow-hidden ${className}`}>
      <style>{`
        @keyframes vx-beam-breathe { 0%, 100% { opacity: 0.72; } 50% { opacity: 1; } }
        @keyframes vx-beam-sway { 0%, 100% { transform: translateX(-50%) rotate(-1.5deg); } 50% { transform: translateX(-50%) rotate(1.5deg); } }
        @keyframes vx-emitter-pulse { 0%, 100% { opacity: 0.65; transform: translateX(-50%) scale(1); } 50% { opacity: 0.95; transform: translateX(-50%) scale(1.08); } }
        .vx-lamp-beam.vx-animated { animation: vx-beam-breathe 6s ease-in-out infinite; }
        .vx-lamp-beam-inner.vx-animated { animation: vx-beam-sway 8s ease-in-out infinite; }
        .vx-lamp-emitter.vx-animated { animation: vx-emitter-pulse 3.2s ease-in-out infinite; }
      `}</style>

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

        <div
          className={`vx-lamp-beam absolute -top-20 left-1/2 -translate-x-1/2 opacity-100 blur-[24px] ${animateLamp ? "vx-animated" : ""}`}
          style={{
            width: 620,
            height: 620,
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
            background:
              "linear-gradient(180deg, rgba(74,218,194,0.9) 0%, rgba(74,218,194,0.35) 40%, rgba(74,218,194,0.08) 70%, transparent 90%)",
          }}
        />
        <div
          className={`vx-lamp-beam-inner absolute -top-16 left-1/2 -translate-x-1/2 opacity-90 blur-[10px] ${animateLamp ? "vx-animated" : ""}`}
          style={{
            width: 320,
            height: 480,
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
            background:
              "linear-gradient(180deg, rgba(123,235,215,0.85) 0%, rgba(74,218,194,0.25) 45%, transparent 80%)",
            transformOrigin: "50% 0%",
          }}
        />
        <div
          className={`vx-lamp-emitter absolute -top-16 left-1/2 -translate-x-1/2 opacity-100 blur-[16px] ${animateLamp ? "vx-animated" : ""}`}
          style={{
            width: 380,
            height: 240,
            background:
              "radial-gradient(ellipse at top, rgba(123,235,215,0.9) 0%, rgba(74,218,194,0.4) 40%, transparent 70%)",
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
