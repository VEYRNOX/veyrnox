// components/security/BiometricPrompt.jsx — the SIMULATED biometric overlay.
//
// PROVISIONAL / DEMO ONLY. This is a clearly-labelled *stub* of an OS biometric
// sheet, shown in demo mode (VITE_DEMO_MODE / ?demo) so the unlock flow is
// visible on the simulator without invoking real OS security. On a real device
// the actual Face ID / Touch ID sheet is presented by the OS from inside M2b's
// keyStore.unlock() (native.js) — this component is NEVER shown there.
//
// It must never be mistaken for real security: it carries an explicit
// "Simulated — demo mode" badge and does no cryptographic work whatsoever.
//
// Behaviour: on mount it auto-"scans" and resolves success after a short delay
// (so the simulator demo flows without a tap), while still offering an explicit
// Cancel to exercise the failure/cancel path. onResult(true) = authenticated,
// onResult(false) = cancelled.

import { useEffect, useState } from 'react';
import { ScanFace, X, ShieldAlert } from 'lucide-react';

const AUTO_SUCCESS_MS = 1600;

export default function BiometricPrompt({ label = 'Face ID', onResult }) {
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    // Auto-resolve success so the demo unlock flows hands-free on the simulator.
    // Cleared if the user cancels first (component unmounts → timer cleared).
    const t = setTimeout(() => {
      setScanning(false);
      onResult(true);
    }, AUTO_SUCCESS_MS);
    return () => clearTimeout(t);
  }, [onResult]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} (simulated)`}
    >
      <div className="w-full sm:max-w-sm m-0 sm:m-4 rounded-t-2xl sm:rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
        {/* Unmissable "this is a stub" banner. */}
        <div className="mb-4 flex items-center justify-center gap-1.5 rounded-md bg-caution/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-caution">
          <ShieldAlert className="h-3.5 w-3.5" />
          Simulated — demo mode
        </div>

        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
          <ScanFace
            className={`h-11 w-11 text-primary ${scanning ? 'animate-pulse' : ''}`}
          />
        </div>

        <h2 className="mt-4 text-lg font-semibold">{label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {scanning ? 'Scanning your face…' : 'Authenticated'}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Unlock your Veyrnox wallet
        </p>

        <button
          type="button"
          onClick={() => onResult(false)}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-secondary transition-colors min-h-[44px] select-none"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
