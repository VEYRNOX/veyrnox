// components/FirstRunTour.jsx
//
// A lightweight first-run tour that highlights key security features on the
// unlocked wallet, AFTER the wallet has been created. Fires at most once per
// device: wallet CREATION arms it (armTour), the unlocked wallet shows it, and
// dismissal consumes it. Fixes: #1160 (ECC F-P3-3).
//
// Placement (WalletEntry.jsx, the `isUnlocked` branch) is deliberate: every step
// describes something you do with a wallet you already have — set a duress PIN,
// hide a wallet, export a backup, bind the PIN to biometrics. Shown on the
// pre-creation choose screen it advertised features the user could not act on
// yet, interrupting the create/import decision. Do not move it back ahead of
// wallet creation without revisiting the step copy.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, Ghost, CloudUpload, Fingerprint, X } from 'lucide-react';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const TOUR_SEEN_KEY = 'veyrnox-first-run-tour-seen';
const TOUR_ARMED_KEY = 'veyrnox-first-run-tour-armed';

// The tour fires ONLY after a wallet is created on this device — never on a
// plain unlock. Absence-of-seen is not the trigger: that would also fire for an
// existing user who never happened to see the old pre-creation tour, putting a
// full-screen modal over the wallet of someone who never created one here.
// Creation arms it explicitly; the unlocked wallet consumes it.
//
// Deliberately NOT armed by the recovery paths (PIN recovery, file restore) or
// by seed import — those restore a wallet that already existed, so the user is
// not new. Only fresh creation counts.
export function armTour() {
  try {
    if (isDeniabilityOrDemoActive()) return; // I3: no decoy/demo session writes real state
    localStorage.setItem(TOUR_ARMED_KEY, '1');
  } catch { /* storage unavailable — tour simply never fires */ }
}

const STEPS = [
  {
    icon: ShieldCheck,
    title: 'Security Dashboard',
    description: 'Monitor your wallet\'s security posture, RASP integrity, and audit status in one place.',
  },
  {
    icon: Lock,
    title: 'Duress PIN',
    description: 'Set a decoy PIN that opens a separate empty wallet under coercion — your real funds stay hidden.',
  },
  {
    icon: Ghost,
    title: 'Stealth Wallets',
    description: 'Hide wallets behind an extra passphrase layer. Even with device access, they\'re invisible.',
  },
  {
    icon: CloudUpload,
    title: 'Personal Backup',
    description: 'Export an encrypted seed backup to a file. Restore on any device with your password.',
  },
  {
    icon: Fingerprint,
    title: 'Hardware Protection',
    description: 'Bind your PIN to Face ID or fingerprint — PIN exhaustion attacks require your biometric per attempt.',
  },
];

export function shouldShowTour() {
  try {
    return !!localStorage.getItem(TOUR_ARMED_KEY) && !localStorage.getItem(TOUR_SEEN_KEY);
  } catch { return false; }
}

export default function FirstRunTour({ onDone }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!shouldShowTour()) { onDone?.(); return; }
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(TOUR_SEEN_KEY, '1');
      localStorage.removeItem(TOUR_ARMED_KEY); // consumed — don't leave it primed
    } catch { /* storage unavailable */ }
    onDone?.();
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else dismiss();
  };

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="tour-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={dismiss}
        >
          <motion.div
            key={`tour-step-${step}`}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="text-xs text-muted-foreground font-medium">
                Quick Tour · {step + 1}/{STEPS.length}
              </p>
              <button onClick={dismiss} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{current.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={dismiss}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 active:scale-95 transition-all"
                >
                  Skip
                </button>
                <button
                  onClick={next}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-95 transition-all"
                >
                  {step < STEPS.length - 1 ? 'Next' : 'Get Started'}
                </button>
              </div>

              {/* Progress dots */}
              <div className="flex justify-center gap-1.5 pt-1">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
