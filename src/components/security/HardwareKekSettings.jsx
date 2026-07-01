// components/security/HardwareKekSettings.jsx
//
// Security Settings — "Hardware protection" KEK enrollment card.
// UNAUDITED-PROVISIONAL: the underlying hardware.js / web.js + kek.js build is built
// but not yet independently audited. The UI reflects that status honestly.
//
// Platform behaviour:
//   - Native (iOS/Android): Keychain / Keystore KEK via hardware.js
//   - Web (Chrome ≥99, Firefox ≥108): WebAuthn PRF KEK via web.js
//   - Web (Safari / no PRF): card visible but honest-disabled ("not supported")
//
// Three enrollment states per platform:
//   - Loading:      enrolled === null
//   - Not enrolled: enrolled === false  → PIN field + "Enable" button
//   - Enrolled:     enrolled === true   → status badge; remove flow available
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
  // web only: null = checking, true/false = PRF available
  const [webPrfAvailable, setWebPrfAvailable] = useState(isNative ? true : null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let active = true;
    if (isNative) {
      import('@/wallet-core/keystore/hardware.js')
        .then(m => m.isHardwareEnrolled())
        .then(v => { if (active) setEnrolled(v); })
        .catch(() => { if (active) setEnrolled(false); });
    } else {
      import('@/wallet-core/keystore/web.js').then(async m => {
        const [avail, enr] = await Promise.all([
          m.webKeyStore.isHardwareKeystoreAvailable(),
          m.webKeyStore.isHardwareEnrolled(),
        ]);
        if (active) {
          setWebPrfAvailable(avail);
          setEnrolled(enr);
        }
      }).catch(() => {
        if (active) { setWebPrfAvailable(false); setEnrolled(false); }
      });
    }
    return () => { active = false; };
  }, []);

  const handleEnroll = async (testPin) => {
    const pinToUse = testPin || pin;
    if (!pinToUse) { setError('Enter your vault PIN first.'); return; }
    setError('');
    setBusy(true);
    try {
      if (isNative) {
        const { enrollHardwareCredential, getHardwareFactor } = await import('@/wallet-core/keystore/hardware.js');
        // Step 1: create Keychain/Keystore credential + get initial H (one biometric prompt).
        await enrollHardwareCredential();
        // Step 2: enroll KEK on the vault (second biometric prompt inside enrollKek).
        await getKeyStore().enrollKek(pinToUse, { getHardwareFactor });
      } else {
        const { webKeyStore } = await import('@/wallet-core/keystore/web.js');
        // Web: one call — creates the PRF passkey and enrolls the KEK in one flow.
        await webKeyStore.enrollKek(pinToUse, { getHardwareFactor: () => webKeyStore.getHardwareFactor() });
      }
      setEnrolled(true);
      setPin('');
      recordAudit('settings_changed');
      toast.success('Hardware protection enabled — your vault now requires this device to unlock.');
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg.includes('No wallet') || msg.toLowerCase().includes('password') || msg.includes('Decryption')) {
        setError('Wrong PIN — enter the PIN you use to unlock your wallet.');
      } else {
        setError(`Failed: ${msg}`);
      }
      // Best-effort cleanup of any partially-created credential.
      try {
        if (isNative) {
          const { clearHardwareCredential } = await import('@/wallet-core/keystore/hardware.js');
          await clearHardwareCredential();
        } else {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('veyrnox-prf-cred-id');
          }
        }
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
      if (isNative) {
        const { getHardwareFactor } = await import('@/wallet-core/keystore/hardware.js');
        await getKeyStore().unenrollKek(pin, { getHardwareFactor });
      } else {
        const { webKeyStore } = await import('@/wallet-core/keystore/web.js');
        await webKeyStore.unenrollKek(pin, { getHardwareFactor: () => webKeyStore.getHardwareFactor() });
      }
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

  // Show OFF badge only when we know enrollment state and PRF is available/native.
  const showOffBadge = enrolled === false && (isNative || webPrfAvailable);

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
        {showOffBadge && (
          <span className="ml-auto text-xs text-muted-foreground">OFF</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Binds your vault to this physical device using the{' '}
        {isNative
          ? 'iOS Keychain / Android Keystore'
          : 'browser WebAuthn passkey (PRF extension)'}{' '}
        (device-bound, biometric-gated). After enabling, your wallet can only decrypt on{' '}
        <strong>this device</strong> — a stolen vault file without the device is useless,
        even with your PIN.
        {!isNative && (
          <> Supported on Chrome ≥99 and Firefox ≥108. Safari is not supported.</>
        )}
      </p>

      <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2">
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-caution">UNAUDITED-PROVISIONAL.</span>{' '}
          The hardware binding is built and device-verified but has not been independently
          audited. Enable on testnet wallets only until the audit completes.
        </p>
      </div>

      {/* Loading */}
      {enrolled === null && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking status…
        </p>
      )}

      {/* Web — PRF not supported */}
      {!isNative && enrolled !== null && !webPrfAvailable && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          WebAuthn PRF is not supported on this browser. Use Chrome ≥99 or Firefox ≥108,
          or use the iOS or Android app.
        </p>
      )}

      {/* Enrolled (native or web) */}
      {enrolled === true && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-success/10 border border-success/30 px-3 py-2">
            <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-success">Active on this device</p>
              <p className="text-xs text-muted-foreground">
                Your vault requires this device&apos;s {isNative ? 'biometric' : 'passkey'} to unlock.
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
              <p className="text-xs text-muted-foreground">
                Enter your vault PIN to confirm removal.
                {isNative
                  ? ' You will be asked to authenticate with biometric.'
                  : ' You will be asked to authenticate with your passkey.'}
              </p>
              {error && <p className="text-xs text-destructive">{error}</p>}
              {busy
                ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Removing — approve the prompt…
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

      {/* Not enrolled — native */}
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

      {/* Not enrolled — web with PRF available */}
      {!isNative && webPrfAvailable && enrolled === false && !blocked && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Enter your vault PIN to enable hardware protection. A browser passkey will be
            created to bind your vault to this device.
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {busy
            ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Enrolling — approve the passkey prompt…
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
            Your browser will ask you to authenticate with a biometric or device PIN to
            create the passkey.
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
