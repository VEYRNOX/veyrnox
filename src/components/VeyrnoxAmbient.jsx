// VeyrnoxAmbient — the moving lamp cone + aurora backdrop, rendered at
// VIEWPORT scale (not clipped by max-w-sm inner containers like VeyrnoxHero
// was). Mount at WalletEntry's outer bg-background wrapper so the beam
// spans the whole screen regardless of which onboarding surface is inside.
//
// prefers-reduced-motion + isLowEndDevice gates match the original.

import { motion, useReducedMotion } from "motion/react";
import { useInfiniteAnimation } from "@/lib/useInfiniteAnimation";
import { isLowEndDevice } from "@/hooks/useLowEndDevice";

export default function VeyrnoxAmbient() {
  const reduce = useReducedMotion();
  const visible = useInfiniteAnimation();
  const animateLamp = !reduce && visible && !isLowEndDevice;

  return (
    <>
      <style>{`
        @keyframes vx-beam-breathe { 0%, 100% { opacity: 0.72; } 50% { opacity: 1; } }
        @keyframes vx-beam-sway { 0%, 100% { transform: translateX(-50%) rotate(-1.5deg); } 50% { transform: translateX(-50%) rotate(1.5deg); } }
        @keyframes vx-emitter-pulse { 0%, 100% { opacity: 0.65; transform: translateX(-50%) scale(1); } 50% { opacity: 0.95; transform: translateX(-50%) scale(1.08); } }
        .vx-lamp-beam.vx-animated { animation: vx-beam-breathe 4s ease-in-out infinite; }
        .vx-lamp-beam-inner.vx-animated { animation: vx-beam-sway 5s ease-in-out infinite; }
        .vx-lamp-emitter.vx-animated { animation: vx-emitter-pulse 2s ease-in-out infinite; }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
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
              "linear-gradient(180deg, rgba(255,176,40,0.9) 0%, rgba(255,176,40,0.35) 40%, rgba(255,176,40,0.08) 70%, transparent 90%)",
          }}
        />
        <div
          className={`vx-lamp-beam-inner absolute -top-16 left-1/2 -translate-x-1/2 opacity-90 blur-[10px] ${animateLamp ? "vx-animated" : ""}`}
          style={{
            width: 320,
            height: 480,
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
            background:
              "linear-gradient(180deg, rgba(255,220,110,0.85) 0%, rgba(255,176,40,0.25) 45%, transparent 80%)",
            transformOrigin: "50% 0%",
          }}
        />
        <div
          className={`vx-lamp-emitter absolute -top-16 left-1/2 -translate-x-1/2 opacity-100 blur-[16px] ${animateLamp ? "vx-animated" : ""}`}
          style={{
            width: 380,
            height: 240,
            background:
              "radial-gradient(ellipse at top, rgba(255,240,180,0.95) 0%, rgba(255,200,80,0.45) 40%, transparent 70%)",
          }}
        />
      </div>
    </>
  );
}
