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

export default function BiometricUnlockSettings() {
  const { biometricPreview, disableBiometricUnlock } = useWallet();
  const [enabled, setEnabled] = useState(() => isBiometricUnlockEnabled());
  const [status, setStatus] = useState(null); // null while loading
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'cancel'
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    getBiometricStatus().then(s => { if (active) setStatus(s); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const onToggle = (v) => {
    setEnabled(v);
    if (v) {
      setBiometricUnlockEnabled(true); // persist immediately
    } else {
      // Turning it OFF also wipes the cached one-tap password so it never
      // lingers at rest while the feature is disabled.
      disableBiometricUnlock();
    }
    setTestResult(null);
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
  // On a real device, native unlock ALWAYS requires biometric/passcode (the
  // native keyStore gates every unlock); the stored preference only drives the
  // demo prompt. Reflect that honestly instead of implying an off switch the
  // device doesn't honour. (See SECURITY_SELFREVIEW_FINDINGS.md → F-3.)
  const forcedOnDevice = status?.mode === 'native';

  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center gap-2">
        <ScanFace className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Biometric Unlock</h2>
      </div>

      {/* PROVISIONAL banner — honest about what this is. */}
      <div className="flex items-start gap-2 rounded-lg bg-caution/10 border border-caution/30 px-3 py-2">
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-caution">Provisional.</span>{' '}
          App-layer biometric gate pending security audit and likely OS-enforced
          rework. Not a guarantee of hardware-bound security.
        </p>
      </div>

      {/* The toggle. On a real device it is forced on (and disabled): native
          unlock always requires biometric/passcode. In demo/web it controls the
          (simulated) prompt. */}
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <p className="text-sm font-medium">
            {forcedOnDevice ? `${label} required on this device` : `Require ${label} on unlock`}
          </p>
          <p className="text-xs text-muted-foreground">
            {forcedOnDevice
              ? `Your wallet always asks for ${label} (or your device passcode) on this device — this can't be turned off here.`
              : `Ask for ${label} before decrypting your wallet.`}
          </p>
        </div>
        <Switch
          checked={forcedOnDevice ? true : enabled}
          onCheckedChange={onToggle}
          disabled={forcedOnDevice}
          aria-label="Require biometric unlock"
        />
      </div>

      {/* Recovery caveat on device (see FINDINGS → F-4). */}
      {forcedOnDevice && (
        <p className="text-[11px] text-muted-foreground">
          If you remove your device passcode, the on-device vault is erased for
          security — restore it with your recovery phrase.
        </p>
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
