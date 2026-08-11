// WalletCreatedFlash — honest post-CREATE celebration + backup nudge.
// Slice G+H plan §2 (docs/superpowers/plans/2026-08-10-wallet-created-flash-slice-g.md).
//
// Copy is LOCKED (plan "Honest copy" section) — do not paraphrase. No
// Shamir/2-of-3 language: that's a spec (docs/cloud-recovery-shard-spec.md),
// not shipped. `compact` reuses this for BackupNagSheet (halved padding,
// smaller seal, no pulse ring, still animates in). prefers-reduced-motion is
// fully honoured: no SVG stroke-draw, no pulse, no stagger, no breathing CTA.
//
// Reuses WelcomeHero/EntryTiles' aurora + reduced-motion pattern rather than
// inventing a new one (isLowEndDevice not gated here — this screen renders
// once, briefly, not in an infinite loop like the tile picker's ambient glow).

import { ArrowRight, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";

function CheckSeal({ reduce, compact }) {
  const size = compact ? 56 : 96;
  if (reduce) {
    // Static, fully-drawn — no <animate>, no non-zero stroke-dashoffset.
    return (
      <div className="relative mx-auto grid place-items-center" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(74,218,194,0.15)" strokeWidth="3" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="#4ADAC2" strokeWidth="3" strokeLinecap="round" />
          <path d="M30 52 L45 66 L72 36" fill="none" stroke="#4ADAC2" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="relative mx-auto grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(74,218,194,0.15)" strokeWidth="3" />
        <motion.circle
          cx="50" cy="50" r="46" fill="none" stroke="#4ADAC2" strokeWidth="3" strokeLinecap="round"
          style={{ rotate: -90, transformOrigin: "50% 50%", filter: "drop-shadow(0 0 12px rgba(74,218,194,0.6))" }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.2, 0.65, 0.3, 1], delay: 0.25 }}
        />
        <motion.path
          d="M30 52 L45 66 L72 36" fill="none" stroke="#4ADAC2" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(74,218,194,0.8))" }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1], delay: 0.95 }}
        />
      </svg>
      {!compact && (
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: "rgba(74,218,194,0.5)" }}
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 1.1, repeat: Infinity }}
        />
      )}
    </div>
  );
}

export default function WalletCreatedFlash({ onPrimary, onDismiss, compact = false }) {
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    show: { transition: reduce ? {} : { staggerChildren: 0.09, delayChildren: 0.05 } },
  };
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } };

  return (
    <div
      data-wallet-created-flash
      data-compact={compact ? "true" : undefined}
      className={
        compact
          ? "relative w-full max-w-sm mx-auto overflow-hidden"
          : "relative w-full max-w-sm mx-auto overflow-hidden py-6"
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-40"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(74,218,194,0.20), transparent 65%)," +
            "radial-gradient(40% 30% at 30% 30%, rgba(74,218,194,0.10), transparent 70%)," +
            "radial-gradient(40% 30% at 70% 20%, rgba(123,235,215,0.08), transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col items-center text-center">
        <motion.div variants={item} className={compact ? "mb-3" : "mb-5"}>
          <CheckSeal reduce={reduce} compact={compact} />
        </motion.div>

        <motion.div variants={item} className="font-mono text-[11px] tracking-[0.28em] uppercase text-primary">
          WALLET
        </motion.div>

        <motion.h1
          variants={item}
          className={compact ? "mt-1 mb-2 text-2xl font-extrabold text-foreground" : "mt-1.5 mb-3 text-4xl font-extrabold text-foreground"}
        >
          Created.
        </motion.h1>

        {!compact && (
          <motion.p variants={item} className="mb-6 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
            Your keys were generated and encrypted on this device. Your seed never leaves it.
          </motion.p>
        )}

        <motion.div
          variants={item}
          role="note"
          aria-label="Set up Personal Backup"
          className={
            (compact ? "p-3 mb-3 " : "p-4 mb-3 ") +
            "relative flex items-start gap-3 rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/[0.06] to-primary/[0.02] text-start overflow-hidden"
          }
        >
          {!compact && !reduce && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                background: "linear-gradient(120deg, transparent 30%, rgba(74,218,194,0.35) 50%, transparent 70%)",
                backgroundSize: "200% 100%",
                animation: "vx-flash-sheen 3.8s ease-in-out 2s infinite",
              }}
            />
          )}
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-primary/15 text-primary">
            <ShieldCheck className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h3 className="mb-1 text-[15px] font-semibold text-foreground">Set up Personal Backup</h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Encrypted backup file. You set a backup password and a backup PIN — either one decrypts the file. Store at least one safely.
            </p>
          </div>
        </motion.div>

        <motion.div variants={item} className="mt-1.5 grid w-full gap-2.5">
          <motion.div
            animate={compact || reduce ? undefined : { boxShadow: ["0 8px 24px rgba(74,218,194,0.24)", "0 10px 32px rgba(74,218,194,0.42)", "0 8px 24px rgba(74,218,194,0.24)"] }}
            transition={compact || reduce ? undefined : { duration: 3.6, ease: "easeInOut", repeat: Infinity }}
            className="rounded-xl"
          >
            <Button type="button" onClick={onPrimary} className="w-full gap-2" size="lg">
              Set up Personal Backup
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
          <Button type="button" variant="outline" onClick={onDismiss} className="w-full">
            Skip for now — take me to my wallet
          </Button>
        </motion.div>

        {!compact && (
          <motion.p variants={item} className="mt-3.5 font-mono text-[11px] tracking-[0.08em] text-muted-foreground/60">
            Advanced: view raw seed later under More → Show recovery phrase
          </motion.p>
        )}
      </motion.div>

      {!compact && !reduce && (
        <style>{`@keyframes vx-flash-sheen { 0%,100% { background-position: 200% 0; } 50% { background-position: -50% 0; } }`}</style>
      )}
    </div>
  );
}
