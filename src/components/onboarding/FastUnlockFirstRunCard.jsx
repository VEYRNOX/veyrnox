// @ts-nocheck
// components/onboarding/FastUnlockFirstRunCard.jsx
//
// Issue #2019 — MANDATORY first-run disclosure card for the KEK fast-path
// biometric-only unlock, under the DEFAULT-ON reversal (session ruling).
//
// The default-on flip means isFastpathEnabled() returns true on a fresh
// install even when no user choice has been recorded. This card is the
// informed-consent chokepoint that prevents any benefit of the fast-path
// (populate warm, biometric-only button) from activating before the user has
// seen it and made an explicit choice. Both "Enable" and "Not now" satisfy
// the chokepoint by marking the disclosure seen; "Not now" additionally
// writes an explicit '0' so the tri-state migration honours the OFF.
//
// Rendering guards (all AND'd):
//   - Native Android (Capacitor.getPlatform() === 'android')
//   - Biometric available (checkBiometry.isAvailable)
//   - KEK-wrapped vault (hasVaultKekWrap) — fast-path requires it
//   - Not deniability/demo (I3 — a coerced session must never see or write
//     to the shared markers)
//   - No passkey registered (owner ruling — passkey users are hidden from
//     fast-path entirely; card would offer a benefit we won't provide)
//   - hasFastpathBeenExplicitlySet() === false — user hasn't chosen
//   - hasSeenFastpathDisclosure() === false — card hasn't fired
//
// One-time: either button dismisses permanently by marking the disclosure
// seen (see setFastpathEnabled + markFastpathDisclosureSeen semantics in
// lib/fastpathUnlock.js).

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Zap } from 'lucide-react';
import { getBiometricStatus } from '@/lib/biometric';
import { isHardwareKekEnrolled } from '@/lib/hardwareKekStatus';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { isPasskeyRegistered } from '@/lib/passkey';
import {
  isFastpathEnabled,
  hasFastpathBeenExplicitlySet,
  hasSeenFastpathDisclosure,
  markFastpathDisclosureSeen,
  setFastpathEnabled,
} from '@/lib/fastpathUnlock';

const GATE_LOADING = 0;
const GATE_HIDE = 1;
const GATE_SHOW = 2;

export default function FastUnlockFirstRunCard() {
  const [gate, setGate] = useState(GATE_LOADING);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (Capacitor.getPlatform?.() !== 'android') { if (live) setGate(GATE_HIDE); return; }
        if (isDeniabilityOrDemoActive()) { if (live) setGate(GATE_HIDE); return; }
        if (isPasskeyRegistered()) { if (live) setGate(GATE_HIDE); return; }
        if (hasFastpathBeenExplicitlySet()) { if (live) setGate(GATE_HIDE); return; }
        if (hasSeenFastpathDisclosure()) { if (live) setGate(GATE_HIDE); return; }

        const bio = await getBiometricStatus();
        if (!live) return;
        if (!bio?.available) { setGate(GATE_HIDE); return; }

        const wrapped = await isHardwareKekEnrolled();
        if (!live) return;
        if (!wrapped) { setGate(GATE_HIDE); return; }

        // Sanity-belt: isFastpathEnabled defaults true here (no explicit choice),
        // asserted to keep the read live if the semantic ever flips.
        if (!isFastpathEnabled()) { setGate(GATE_HIDE); return; }

        setGate(GATE_SHOW);
      } catch {
        if (live) setGate(GATE_HIDE);
      }
    })();
    return () => { live = false; };
  }, []);

  if (gate !== GATE_SHOW) return null;

  // Belt-and-braces at write time — a decoy/demo flip between mount and click
  // must never write to the shared markers. Same three-writer trap discipline
  // as lib/consent.js and FastpathToggle.jsx.
  const guardedEnable = () => {
    if (isDeniabilityOrDemoActive()) { setGate(GATE_HIDE); return; }
    if (isPasskeyRegistered()) { setGate(GATE_HIDE); return; }
    markFastpathDisclosureSeen();
    setFastpathEnabled(true);
    setGate(GATE_HIDE);
  };
  const guardedNotNow = () => {
    if (isDeniabilityOrDemoActive()) { setGate(GATE_HIDE); return; }
    if (isPasskeyRegistered()) { setGate(GATE_HIDE); return; }
    markFastpathDisclosureSeen();
    setFastpathEnabled(false);
    setGate(GATE_HIDE);
  };

  return (
    <div
      data-testid="fastpath-first-run-card"
      role="dialog"
      aria-modal="false"
      aria-labelledby="fastpath-first-run-title"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg p-4"
    >
      <div className="rounded-xl border border-border bg-card shadow-lg p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h3 id="fastpath-first-run-title" className="font-semibold text-sm">
              Fast unlock is on
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              This lets Face ID or your fingerprint unlock the wallet without asking for your PIN.
              It&rsquo;s faster. If someone else has your phone AND can pass your device&rsquo;s
              biometric (for example, if they added their own face), they can unlock the wallet.
              Your PIN still works and everything else is unchanged.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            data-testid="fastpath-first-run-decline"
            onClick={guardedNotNow}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted"
          >
            Not now
          </button>
          <button
            type="button"
            data-testid="fastpath-first-run-enable"
            onClick={guardedEnable}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Enable Fast Unlock
          </button>
        </div>
      </div>
    </div>
  );
}
