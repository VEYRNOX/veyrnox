// @ts-nocheck
// components/security/BiometricUnlockSettings.jsx — the "Require biometric
// unlock" section for the Security settings screen.
//
// PROVISIONAL UI on M2b's app-layer biometric mechanism (flagged for audit +
// likely OS-enforced rework). This component only:
//   - reads/writes the persisted preference (lib/biometric.js → localStorage),
//   - reports biometric availability/status for the current platform,
//   - lets the user preview the (simulated, in demo) prompt.
// It does NOT touch vault crypto or the mainnet gate. The actual unlock wiring
// is in WalletProvider.unlock().

import { useEffect, useState } from 'react';
import { ScanFace, ShieldCheck, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/lib/WalletProvider';
import {
  isBiometricUnlockEnabled,
  setBiometricUnlockEnabled,
  getBiometricStatus,
} from '@/lib/biometric';
// NOTE: setBiometricUnlockEnabled is used ONLY in the explicit confirmEnable() path
// (a deliberate user action), never automatically on mount.

export default function BiometricUnlockSettings() {
  const { biometricPreview, disableBiometricUnlock, recordAudit } = useWallet();
  const [enabled, setEnabled] = useState(() => isBiometricUnlockEnabled());
  const [status, setStatus] = useState(null); // null while loading
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'cancel'
  const [testing, setTesting] = useState(false);
  // NF-2: pending-enable state. When the user flips the toggle ON we do NOT
  // persist immediately — we enter this state and show a confirmation panel.
  // Only after explicit acknowledgement do we call setBiometricUnlockEnabled.
  // The DISABLE path is always immediate (fail-safe direction, no confirm needed).
  const [pendingEnable, setPendingEnable] = useState(false);

  useEffect(() => {
    let active = true;
    getBiometricStatus()
      .then(s => {
        if (!active) return;
        setStatus(s);
        // CRITICAL (I4): READ the biometric status and surface it in the UI; do NOT
        // silently MUTATE the stored opt-in preference here. The previous auto-enable
        // (setBiometricUnlockEnabled(true) for every native user with an available
        // sensor) turned a user choice into an automatic write — opting people in
        // without consent and, in the PIN cohort, risking a real-secret cache. Enabling
        // is now only ever the user's deliberate confirm action below (confirmEnable).
        // Availability is shown via the status line / forcedOnDevice indicator only.
      })
      .catch(() => {
        // Probe failed — fail honest: render the unavailable state instead of
        // hanging on "Checking availability…" forever (mirrors PasskeyUnlockSettings).
        if (active) setStatus({ available: false, detail: 'Could not check biometric availability on this device.' });
      });
    return () => { active = false; };
  }, []);

  const onToggle = (v) => {
    if (v) {
      // NF-2: enabling is a two-step deliberate action. Enter pending state;
      // do NOT persist yet and do NOT record audit. The confirm panel handles
      // the final persist + audit call.
      setPendingEnable(true);
      setTestResult(null);
    } else {
      // Turning it OFF is always immediate — fail-safe direction, no confirm.
      // Also wipes the cached one-tap password so it never lingers at rest.
      setEnabled(false);
      setPendingEnable(false);
      disableBiometricUnlock();
      setTestResult(null);
      recordAudit('settings_changed');
    }
  };

  const confirmEnable = () => {
    // User explicitly acknowledged the trade-off — now persist.
    setBiometricUnlockEnabled(true);
    setEnabled(true);
    setPendingEnable(false);
    recordAudit('settings_changed');
  };

  const cancelEnable = () => {
    // User backed out — return toggle to OFF with no side effects.
    setPendingEnable(false);
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await biometricPreview();
      setTestResult(ok ? 'ok' : 'cancel');
    } finally {
      setTesting(false);
    }
  };

  const available = status?.available;
  const label = status?.label || 'Biometrics';
  const simulated = status?.simulated;

  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center gap-2">
        <ScanFace className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Biometric Unlock</h2>
      </div>

      {/* VULN-1 / VULN-2 disclosure — explicit about the security trade-off. */}
      <div
        data-testid="kdf-bypass-disclosure"
        className="flex items-start gap-2 rounded-lg bg-caution/10 border border-caution/30 px-3 py-2"
      >
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-caution">Worth knowing.</span>{' '}
            One-tap unlock saves your <strong>wallet password</strong> on this device,
            protected by your screen lock and biometrics. If someone gets a copy of your
            device backup without the physical device, they could access your wallet.
            Turn this off for the strongest protection.
          </p>
        </div>
      </div>

      {/* BIO-03: honest disclosure of app-layer-only biometric gate — shown only
          when biometrics are available and the user has enabled (or is enabling)
          the feature. Secondary text, not caution, to keep tone calm not alarming. */}
      {available && (enabled || pendingEnable) && (
        <p
          data-testid="biometric-app-layer-disclosure"
          className="text-xs text-muted-foreground leading-relaxed"
        >
          Biometric unlock saves your password on this device, protected by your
          fingerprint or face. This runs inside the app, not at the operating system
          level.{' '}
          For stronger device-level protection, enable{' '}
          <span className="font-medium text-foreground">Hardware Protection</span>{' '}
          (available below).
        </p>
      )}

      {/* The toggle. On a real device it is forced on (and disabled): native
          unlock always requires biometric/passcode. In demo/web it controls the
          (simulated) prompt.
          While pendingEnable is true the toggle stays visually off — enabling is
          not yet committed; the confirm panel below is the deliberate action. */}
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <p className="text-sm font-medium">
            Biometric Unlock (Primary Wallet)
          </p>
          <p className="text-xs text-muted-foreground">
            Enable one-tap unlock for your primary wallet using device biometrics.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label="Biometric Unlock (Primary Wallet)"
        />
      </div>

      {/* NF-2 confirm panel — only shown when the user has flipped ON but not
          yet acknowledged the trade-off. Reuses the caution palette of the
          disclosure box above. The confirm panel is IN ADDITION to the
          disclosure, not a replacement. */}
      {pendingEnable && (
        <div
          data-testid="biometric-enable-confirm"
          className="flex flex-col gap-3 rounded-lg bg-caution/10 border border-caution/30 px-3 py-3"
        >
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-caution">Before you enable this.</span>{' '}
              If someone gets a copy of your device backup without the physical device, they
              could access your wallet. Only turn this on if you're OK with that.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-caution/40 text-caution hover:bg-caution/10"
              onClick={confirmEnable}
              data-testid="biometric-confirm-enable-btn"
            >
              Enable one-tap unlock
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={cancelEnable}
              data-testid="biometric-cancel-enable-btn"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}


      {/* Availability / status line. */}
      <div className="flex items-start gap-2 text-xs">
        {status == null ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking availability…
          </span>
        ) : available ? (
          <span className="flex items-start gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            <span>
              {label} available{simulated ? ' (simulated in demo)' : ''}. {status.detail}
            </span>
          </span>
        ) : (
          <span className="flex items-start gap-1.5 text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <span>{status.detail}</span>
          </span>
        )}
      </div>

      {/* Preview/test button — only meaningful where a prompt can be shown. */}
      {enabled && available && simulated && (
        <div>
          <Button variant="outline" className="w-full gap-2" onClick={runTest} disabled={testing}>
            {testing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Awaiting prompt…</>
              : <><ScanFace className="h-4 w-4" /> Preview prompt</>}
          </Button>
          {testResult === 'ok' && (
            <p className="text-xs text-success mt-2 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Simulated authentication succeeded
            </p>
          )}
          {testResult === 'cancel' && (
            <p className="text-xs text-muted-foreground mt-2">Prompt cancelled</p>
          )}
        </div>
      )}
    </div>
  );
}
