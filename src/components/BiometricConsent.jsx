// src/components/BiometricConsent.jsx — first-run opt-in for biometric unlock.
//
// Rendered by WalletEntry AFTER TelemetryConsent and BEFORE any wallet-setup
// step, on native platforms where a biometric sensor is available. Owner ruling
// 2026-08-27: replaces the removed FastUnlockFirstRunCard with a decision at
// the earlier point in the flow, so the user knows what they're accepting
// before they type a PIN.
//
// Accept → setBiometricUnlockEnabled(true) + enableFastpathAndBiometricUnlock,
// so the Security Center toggle reads ON and Fast Unlock caches the DEK when
// the PIN is created. Decline → setBiometricUnlockEnabled(false) explicit '0'
// (the same off-state Settings would write) — no biometric ever caches on
// unlock. Either choice writes the seen-marker so the screen never re-fires.
//
// I3: never renders in deniable/demo (isDeniabilityOrDemoActive). Setters are
// individually guarded too — same three-writer discipline as consent.js.
//
// Not shown on iOS: iOS has always defaulted to Face ID / Touch ID as its
// unlock path per platform convention; the confirmation would be noise there.
// A future ruling can flip this without touching the setters.

import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { getBiometricStatus, setBiometricUnlockEnabled, markBiometricConsentRecorded } from '@/lib/biometric';
import { enableFastpathAndBiometricUnlock, setFastpathEnabled } from '@/lib/fastpathUnlock';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

export default function BiometricConsent({ onChoice }) {
  const regionRef = useRef(null);
  const [label, setLabel] = useState('Biometric');

  useEffect(() => {
    regionRef.current?.focus();
    let live = true;
    getBiometricStatus().then((s) => {
      if (!live) return;
      // On Android the resolved label is Fingerprint / Face Unlock; on iOS it's
      // Face ID / Touch ID. Falls back to generic "Biometric" on unknown types.
      if (s?.label) setLabel(s.label);
      // No biometric sensor OR device isn't secured → nothing to enable; skip
      // silently rather than asking a question the user can't act on. Marker
      // is still recorded so the check doesn't run on every render forever.
      if (!s?.available) {
        markBiometricConsentRecorded();
        onChoice?.(false);
      }
    }).catch(() => {
      // Probe failed → assume unavailable and skip. Fail-closed.
      if (!live) return;
      markBiometricConsentRecorded();
      onChoice?.(false);
    });
    return () => { live = false; };
  }, [onChoice]);

  const choose = (grant) => {
    // Belt-and-braces: a decoy/demo flip between mount and click must not write
    // to shared markers. Same trap as consent.js and FastpathToggle.jsx.
    if (isDeniabilityOrDemoActive()) { onChoice?.(false); return; }
    if (grant) {
      enableFastpathAndBiometricUnlock();
    } else {
      setBiometricUnlockEnabled(false);
      setFastpathEnabled(false);
    }
    markBiometricConsentRecorded();
    onChoice?.(grant);
  };

  const iOS = Capacitor.getPlatform?.() === 'ios';
  const heading = iOS ? `Enable ${label}?` : `Enable ${label} unlock?`;
  const body = iOS
    ? `Unlock the wallet with ${label} instead of typing your PIN. You can change this later in Security Center.`
    : `Unlock the wallet with your ${label.toLowerCase()} instead of typing your PIN. You can change this later in Security Center.`;

  return (
    <section
      ref={regionRef}
      tabIndex={-1}
      role="group"
      aria-labelledby="biometric-consent-heading"
      className="max-w-sm mx-auto space-y-6 p-6 text-center outline-none"
      data-testid="biometric-consent"
    >
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <Fingerprint className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h2 id="biometric-consent-heading" className="text-lg font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex items-start gap-3 text-start p-3 rounded-xl bg-card border border-border">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          Your PIN still works and is the real key. The biometric only releases a
          cached copy of it — anyone able to pass your device&rsquo;s biometric can
          open the wallet.
        </p>
      </div>
      <div className="space-y-2">
        <Button className="w-full" onClick={() => choose(true)} data-testid="biometric-consent-accept">
          Enable {label}
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => choose(false)} data-testid="biometric-consent-decline">
          Not now
        </Button>
      </div>
    </section>
  );
}
