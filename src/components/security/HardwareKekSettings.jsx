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
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';
import PinPad from '@/components/security/PinPad';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { tierToBadge } from '@/wallet-core/keystore/tierBadge.js';

// Platform detection lives at module scope so both the copy constants below and the
// CredentialEntry surface can branch on it. Native = numeric PIN; web = ≥12-char
// password (H-A minimum, verified by decryptVault inside enrollKek/unenrollKek).
const isNative = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

// The credential noun differs by platform (a numeric PIN on native, a password on web).
// Used for both the on-screen copy and the guard/error messages so a web user is never
// told to "enter your PIN" for a field that actually takes their vault password.
const CRED_NOUN = isNative ? 'PIN' : 'password';

// C-UI: the WEB enrollment/removal credential is a ≥12-char PASSWORD, not a numeric PIN,
// so on web we render a real password field (design-system <Input>) + submit <Button>,
// mirroring TwoFactorSettings' password model. On native we keep the 8-digit <PinPad>.
// The keystore call (enrollKek/unenrollKek) is unchanged — only the input surface differs.
function CredentialEntry({ value, onChange, onSubmit, disabled, submitLabel }) {
  if (isNative) {
    return (
      <PinPad
        value={value}
        onChange={onChange}
        onComplete={onSubmit}
        disabled={disabled}
        length={8}
        submitLabel={submitLabel}
      />
    );
  }
  const submit = () => onSubmit(value);
  return (
    <div className="space-y-3">
      <Input
        type="password"
        autoComplete="current-password"
        aria-label="Vault password"
        placeholder="Your vault password"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        disabled={disabled}
        className="mono-value"
      />
      <Button type="button" className="w-full" onClick={submit} disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

// Classify a thrown error by its STABLE machine CODE (not prose — copy is not a
// contract and a raw message can leak internals). Returns the plain-language string
// to show. The final fallback is deliberately GENERIC: we never render the raw
// thrown text (I4 — fail honest, and no internal-detail leak to the UI).
const WRONG_PIN_MSG = isNative
  ? 'Wrong PIN — enter the PIN you use to unlock your wallet.'
  : 'Wrong password — enter the password you use to unlock your wallet.';
const NO_HARDWARE_MSG =
  'Couldn’t reach this device’s hardware security. Try again, or use a different device.';
const MALFORMED_MSG =
  'Your stored wallet data couldn’t be read on this device.';
const GENERIC_MSG = 'Something went wrong. Please try again.';

function classifyKekError(e) {
  const code = e?.code || e?.message;
  switch (code) {
    // Wrong PIN against a KEK wrap decrypts to a failed unwrap (generic oracle).
    case KEK_ERR.UNWRAP_FAILED:
      return WRONG_PIN_MSG;
    case KEK_ERR.NO_HARDWARE_FACTOR:
      return NO_HARDWARE_MSG;
    case KEK_ERR.MALFORMED_VAULT:
      return MALFORMED_MSG;
    default:
      return GENERIC_MSG;
  }
}

// Enroll can also fail on a wrong PIN via decryptVault (which throws a vault error,
// not a KEK_ERR) and on an insecure hardware tier (ENROLL_ERR.INSECURE_TIER). Those
// are surfaced by dedicated messages before falling through to classifyKekError.
const INSECURE_TIER_MSG =
  'This device has no secure hardware element — hardware protection can’t be enabled here.';

// decryptVault (../vault.js) throws a code-less Error whose message is a STABLE
// internal sentinel ('Decryption failed: …' / 'No wallet …'). These are not
// user-facing copy — they are the module's fixed error identity — so matching their
// prefix to show wrong-PIN guidance is safe. We never render the raw message itself.
function isWrongPinVaultError(e) {
  const msg = e?.message || '';
  return msg.startsWith('Decryption failed') || msg.startsWith('No wallet');
}

export default function HardwareKekSettings() {
  const { isDecoy, isHidden, recordAudit } = useWallet();

  // null = loading, true/false = resolved
  const [enrolled, setEnrolled] = useState(null);
  // web only: null = checking, true/false = PRF available
  const [webPrfAvailable, setWebPrfAvailable] = useState(isNative ? true : null);
  // Hardware security tier persisted in the vault blob ('STRONGBOX', 'TRUSTED_ENVIRONMENT',
  // 'SecureEnclave', or null). Drives the tier-specific badge label (H-1 honesty fix).
  const [kekTier, setKekTier] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let active = true;
    if (isNative) {
      (async () => {
        try {
          // Reconcile the enrolled signal against REAL protection (I4 honesty):
          // "ON" only if the AndroidKeyStore/Keychain alias is present AND the
          // stored vault is actually KEK-wrapped. Alias-present + vault-bare is a
          // stale alias (not real protection) → honest state is OFF, and we clean
          // up the orphan so isEnrolled() stops reporting a false "ON".
          const hw = await import('@/wallet-core/keystore/hardware.js');
          const ks = getKeyStore();
          const aliasPresent = await hw.isHardwareEnrolled();
          const vaultWrapped = await ks.hasVaultKekWrap();
          if (aliasPresent && !vaultWrapped) {
            try { await hw.clearHardwareCredential(); } catch { /* best-effort */ }
          }
          const isEnrolled = aliasPresent && vaultWrapped;
          if (active) {
            setEnrolled(isEnrolled);
            // Read the persisted security tier so the badge can show the real level.
            // getVaultKekTier() is metadata-only (no biometric prompt, no secret read).
            if (isEnrolled && typeof ks.getVaultKekTier === 'function') {
              try {
                const tier = await ks.getVaultKekTier();
                setKekTier(tier);
              } catch { /* best-effort — falls back to generic badge */ }
            }
          }
        } catch {
          if (active) setEnrolled(false);
        }
      })();
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
    if (!pinToUse) { setError(`Enter your vault ${CRED_NOUN} first.`); return; }
    setError('');
    setBusy(true);
    try {
      if (isNative) {
        const { enrollHardwareCredential, getHardwareFactor } = await import('@/wallet-core/keystore/hardware.js');
        // Step 1: generate the hardware-bound key and GATE on the real security tier.
        // Fail-closed (M2): a SOFTWARE / unknown / unreadable tier throws
        // ENROLL_ERR.INSECURE_TIER here — before enrollKek — so the vault is never
        // KEK-wrapped and the "ON" badge can never show for a software-only key.
        // The returned tier is passed into enrollKek so it's persisted in the vault blob
        // and the badge can show the real protection level (H-1 honesty fix).
        // Reconcile the double-enroll guard against the REAL vault state: a stale native
        // alias (Keychain/Keystore survive a reinstall) over a bare vault must not block a
        // fresh enroll. Block only when the vault is genuinely KEK-wrapped (iOS-F6).
        const enrolledTier = await enrollHardwareCredential({
          isVaultWrapped: () => getKeyStore().hasVaultKekWrap(),
        });
        // Step 2: enroll KEK on the vault using the device-bound factor (Keychain/TEE).
        // getHardwareFactor() is called inside enrollKek — second biometric prompt.
        await getKeyStore().enrollKek(pinToUse, {
          getHardwareFactor,
          hardwareKekTier: enrolledTier?.securityLevelName ?? null,
        });
        setKekTier(enrolledTier?.securityLevelName ?? null);
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
      // Classify by STABLE machine CODE, never by prose (copy is not a contract) and
      // never render the raw thrown message (no internal-detail leak, I4).
      const code = e?.code;
      if (code === 'KEK_ENROLL_INSECURE_TIER') {
        // Machine code from hardware.js ENROLL_ERR.INSECURE_TIER.
        setError(INSECURE_TIER_MSG);
      } else if (isWrongPinVaultError(e)) {
        setError(WRONG_PIN_MSG);
      } else {
        setError(classifyKekError(e));
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
    if (!pin) { setError(`Enter your vault ${CRED_NOUN} to confirm removal.`); return; }
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
      setKekTier(null);
      setPin('');
      setRemoving(false);
      recordAudit('settings_changed');
      toast.success('Hardware protection removed.');
    } catch (e) {
      // Classify by STABLE machine CODE (UNWRAP_FAILED = wrong PIN/device). Vault
      // decrypt sentinels also map to wrong-PIN guidance; everything else is generic.
      if (isWrongPinVaultError(e)) {
        setError(WRONG_PIN_MSG);
      } else {
        setError(classifyKekError(e));
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
        {enrolled && (() => {
          // On web (PRF), kekTier is null — show "WebAuthn Protected".
          // On native, show the real tier label from the vault blob (H-1 honesty fix).
          if (!isNative) {
            return (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-success">
                <ShieldCheck className="h-3.5 w-3.5" /> WebAuthn Protected
              </span>
            );
          }
          const badge = tierToBadge(kekTier);
          const colourClass = badge.variant === 'success'
            ? 'text-success'
            : badge.variant === 'caution'
              ? 'text-caution'
              : 'text-muted-foreground';
          return (
            <span className={`ml-auto inline-flex items-center gap-1 text-xs font-semibold ${colourClass}`}>
              <ShieldCheck className="h-3.5 w-3.5" /> {badge.label}
            </span>
          );
        })()}
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
                Enter your vault {CRED_NOUN} to confirm removal.
                {isNative
                  ? ' You will be asked to authenticate with biometric.'
                  : ' You will be asked to authenticate with your passkey.'}
              </p>
              {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}
              {busy
                ? (
                  <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Removing — approve the prompt…
                  </p>
                ) : (
                  <>
                    <CredentialEntry
                      value={pin}
                      onChange={v => { setPin(v); setError(''); }}
                      onSubmit={handleUnenroll}
                      disabled={busy}
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

          {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}

          {busy
            ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Enrolling — approve the biometric prompt…
              </p>
            ) : (
              <CredentialEntry
                value={pin}
                onChange={v => { setPin(v); setError(''); }}
                onSubmit={handleEnroll}
                disabled={busy}
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
            Enter your vault password to enable hardware protection. A browser passkey will be
            created to bind your vault to this device.
          </p>

          {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}

          {busy
            ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Enrolling — approve the passkey prompt…
              </p>
            ) : (
              <CredentialEntry
                value={pin}
                onChange={v => { setPin(v); setError(''); }}
                onSubmit={handleEnroll}
                disabled={busy}
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
