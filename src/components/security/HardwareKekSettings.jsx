// components/security/HardwareKekSettings.jsx
//
// Security Settings — "Hardware protection" KEK enrollment card.
// UNAUDITED-PROVISIONAL: the underlying hardware.js + kek.js build is built
// but not yet independently audited. The UI reflects that status honestly.
//
// Three states:
//   - Web / unsupported: card visible but honest-disabled ("requires iOS/Android")
//   - Native, not enrolled: PIN field + "Enable" button
//   - Native, enrolled: status badge — no remove in this build (unenroll requires
//     decrypting the vault back to bare format; that flow is deferred)
//
// Blocked in decoy/hidden sessions (same guard as TwoFactorSettings).
// Never fabricates an "ON" badge without confirmed enrollment (I4).

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { HardDrive, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useWallet } from '@/lib/WalletProvider';
import { getKeyStore } from '@/wallet-core/keystore';
import PinPad from '@/components/security/PinPad';

const isNative = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

export default function HardwareKekSettings() {
  const { isDecoy, isHidden, recordAudit } = useWallet();

  // null = loading, true/false = resolved
  const [enrolled, setEnrolled] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!isNative) { setEnrolled(false); return; }
    let active = true;
    (async () => {
      try {
        // Reconcile the enrolled signal against REAL protection (I4 honesty):
        // "ON" only if the AndroidKeyStore/Keychain alias is present AND the
        // stored vault is actually KEK-wrapped. Alias-present + vault-bare is a
        // stale alias (not real protection) → honest state is OFF, and we clean
        // up the orphan so isEnrolled() stops reporting a false "ON".
        const hw = await import('@/wallet-core/keystore/hardware.js');
        const aliasPresent = await hw.isHardwareEnrolled();
        const vaultWrapped = await getKeyStore().hasVaultKekWrap();
        if (aliasPresent && !vaultWrapped) {
          try { await hw.clearHardwareCredential(); } catch { /* best-effort */ }
        }
        if (active) setEnrolled(aliasPresent && vaultWrapped);
      } catch {
        if (active) setEnrolled(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleEnroll = async (testPin) => {
    const pinToUse = testPin || pin;
    if (!pinToUse) { setError('Enter your vault PIN first.'); return; }
    setError('');
    setBusy(true);
    try {
      const { enrollHardwareCredential, getHardwareFactor } = await import('@/wallet-core/keystore/hardware.js');
      // Step 1: generate the hardware-bound key and GATE on the real security tier.
      // Fail-closed (M2): a SOFTWARE / unknown / unreadable tier throws
      // ENROLL_ERR.INSECURE_TIER here — before enrollKek — so the vault is never
      // KEK-wrapped and the "ON" badge can never show for a software-only key.
      await enrollHardwareCredential();
      // Step 2: enroll KEK on the vault using the device-bound factor (Keychain/TEE).
      // getHardwareFactor() is called inside enrollKek — second biometric prompt.
      await getKeyStore().enrollKek(pinToUse, { getHardwareFactor });
      setEnrolled(true);
      setPin('');
      recordAudit('settings_changed');
      toast.success('Hardware protection enabled — your vault now requires this device to unlock.');
    } catch (e) {
      const msg = e?.message || String(e);
      // Honest, plain-language failure when the device has no secure hardware element (M2).
      // 'KEK_ENROLL_INSECURE_TIER' is the machine code from hardware.js ENROLL_ERR.INSECURE_TIER.
      if (e?.code === 'KEK_ENROLL_INSECURE_TIER' || msg.includes('KEK_ENROLL_INSECURE_TIER')) {
        setError('This device has no secure hardware element — hardware protection can’t be enabled here.');
      } else if (msg.includes('No wallet') || msg.toLowerCase().includes('password') || msg.includes('Decryption')) {
        setError('Wrong PIN — enter the PIN you use to unlock your wallet.');
      } else {
        setError(`Failed: ${msg}`);
      }
      // Clean up the credential if enrollment failed partway.
      try {
        const { clearHardwareCredential } = await import('@/wallet-core/keystore/hardware.js');
        await clearHardwareCredential();
      } catch { /* best-effort */ }
    } finally {
      setBusy(false);
    }
  };

  const handleUnenroll = async () => {
    if (!pin) { setError('Enter your vault PIN to confirm removal.'); return; }
    setError('');
    setBusy(true);
    try {
      const { getHardwareFactor } = await import('@/wallet-core/keystore/hardware.js');
      await getKeyStore().unenrollKek(pin, { getHardwareFactor });
      setEnrolled(false);
      setPin('');
      setRemoving(false);
      recordAudit('settings_changed');
      toast.success('Hardware protection removed.');
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg.includes('UNWRAP') || msg.toLowerCase().includes('password') || msg.includes('Decryption')) {
        setError('Wrong PIN — enter the PIN you use to unlock your wallet.');
      } else {
        setError(`Failed: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const blocked = isDecoy || isHidden;

  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center gap-2">
        <HardDrive className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Hardware Protection</h2>
        {enrolled && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-success">
            <ShieldCheck className="h-3.5 w-3.5" /> ON
          </span>
        )}
        {enrolled === false && isNative && (
          <span className="ml-auto text-xs text-muted-foreground">OFF</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Binds your vault to this physical device using the{' '}
        {isNative ? 'iOS Keychain / Android Keystore' : 'platform Keystore'} (device-bound,
        biometric-gated). After enabling, your wallet can only decrypt on{' '}
        <strong>this device</strong> — a stolen vault file without the device is useless,
        even with your PIN.
      </p>

      <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2">
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-caution">UNAUDITED-PROVISIONAL.</span>{' '}
          The hardware binding is built and device-verified but has not been independently
          audited. Enable on testnet wallets only until the audit completes.
        </p>
      </div>

      {/* Web — honest-disabled */}
      {!isNative && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          Requires the iOS or Android app — not available in the browser.
        </p>
      )}

      {/* Native, loading */}
      {isNative && enrolled === null && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking status…
        </p>
      )}

      {/* Native, enrolled */}
      {isNative && enrolled === true && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-success/10 border border-success/30 px-3 py-2">
            <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-success">Active on this device</p>
              <p className="text-xs text-muted-foreground">
                Your vault requires this device's biometric to unlock.
              </p>
            </div>
          </div>

          {!removing ? (
            <button
              className="text-xs text-destructive underline"
              onClick={() => { setRemoving(true); setPin(''); setError(''); }}
            >
              Remove hardware protection
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Enter your vault PIN to confirm removal. You will be asked to authenticate with biometric.</p>
              {error && <p className="text-xs text-destructive">{error}</p>}
              {busy
                ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Removing — approve the biometric prompt…
                  </p>
                ) : (
                  <>
                    <PinPad
                      value={pin}
                      onChange={v => { setPin(v); setError(''); }}
                      onComplete={handleUnenroll}
                      disabled={busy}
                      length={8}
                      submitLabel="Remove hardware protection"
                    />
                    <button
                      className="text-xs text-muted-foreground underline"
                      onClick={() => { setRemoving(false); setPin(''); setError(''); }}
                    >
                      Cancel
                    </button>
                  </>
                )
              }
            </div>
          )}
        </div>
      )}

      {/* Native, not enrolled */}
      {isNative && enrolled === false && !blocked && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Enter your vault PIN to enable hardware protection.</p>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {busy
            ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Enrolling — approve the biometric prompt…
              </p>
            ) : (
              <PinPad
                value={pin}
                onChange={v => { setPin(v); setError(''); }}
                onComplete={handleEnroll}
                disabled={busy}
                length={8}
                submitLabel="Enable hardware protection"
              />
            )
          }

          <p className="text-[11px] text-muted-foreground">
            You will be asked to authenticate with your device biometric or passcode.
          </p>
        </div>
      )}

      {/* Blocked in decoy / hidden session */}
      {blocked && (
        <p className="text-xs text-muted-foreground">
          Hardware protection settings are not available in this session.
        </p>
      )}
    </div>
  );
}
