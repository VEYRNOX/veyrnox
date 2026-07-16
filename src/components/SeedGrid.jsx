// @ts-nocheck
// components/SeedGrid.jsx
//
// Shared recovery-phrase reveal grid. Used at every "here's your seed" moment
// so the ceremony reads identically:
//   1. Onboarding view=`'generate'` (fresh password-cohort user)
//   2. WalletPortfolioPage `BackupDialog` (existing-wallet backup action)
//   3. WalletPortfolioPage `AddWalletDialog` created step (add-a-second-wallet)
//
// Design decisions:
//   - Hidden by default. First tap is a big dashed drop-target — reveals lift
//     the phrase INTO view, they don't just uncover a pre-drawn thing.
//   - Numbered teal badges (`1`, `2`, … in a `bg-primary/15` pill) so the eye
//     tracks position, not just word.
//   - Words stagger-fade in on reveal (35ms cascade) — feels like the vault
//     opening. Reduced-motion pins static.
//   - Copy button uses AnimatePresence: the Check springs in (scale 0.5 → 1),
//     confirmation weight without touching the icon set.
//   - RASP `sensitiveGate` guard on clipboard copy is preserved verbatim
//     from the original inline implementation.
//
// Isolation: presentation only. No wallet-core imports.

import { useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { copySecret } from '@/lib/copySecret';
import { useRaspArtifact, sensitiveGate } from '@/rasp';

export default function SeedGrid({ mnemonic, defaultHidden = true }) {
  const [show, setShow] = useState(!defaultHidden);
  const [copied, setCopied] = useState(false);
  const raspArtifact = useRaspArtifact();
  const reduce = useReducedMotion();
  const words = (mnemonic || '').split(' ');
  const container = {
    hidden: {},
    show: { transition: reduce ? {} : { staggerChildren: 0.035 } },
  };
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
      };
  return (
    <div className="p-4 rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recovery Phrase</p>
        <div className="flex gap-1">
          <button
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide recovery phrase' : 'Show recovery phrase'}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={async () => {
              const gate = sensitiveGate(raspArtifact, 'seed-reveal');
              if (gate.blocked) {
                toast.error(gate.sentence || 'Clipboard copy is disabled on this device right now.');
                return;
              }
              await copySecret(mnemonic);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            aria-label={copied ? 'Copied to clipboard' : 'Copy recovery phrase'}
            className="relative flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="check"
                  initial={reduce ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 18 }}
                  className="flex"
                >
                  <Check className="h-4 w-4 text-success" />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex"
                >
                  <Copy className="h-4 w-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
      {show ? (
        <motion.div
          key="revealed"
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-3 gap-2"
        >
          {words.map((w, i) => (
            <motion.div
              key={i}
              variants={item}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-2 rounded-lg border border-border/60 bg-secondary/40"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-[10px] font-semibold text-primary mono-value">
                {i + 1}
              </span>
              <span className="mono-value text-xs font-semibold tracking-tight">{w}</span>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <button
          type="button"
          onClick={() => setShow(true)}
          className="w-full h-24 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Eye className="h-4 w-4" />
          <span className="text-xs">Tap to reveal your recovery phrase</span>
        </button>
      )}
    </div>
  );
}
