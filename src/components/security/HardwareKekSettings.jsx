// @ts-nocheck
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
import { HardDrive, ShieldCheck, ShieldAlert, Loader2, ArrowUpCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useWallet } from '@/lib/WalletProvider';
import { getKeyStore } from '@/wallet-core/keystore';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';
import PinPad from '@/components/security/PinPad';
import { tierToBadge } from '@/wallet-core/keystore/tierBadge.js';

// Classify a thrown error by its STABLE machine CODE (not prose — copy is not a
// contract and a raw message can leak internals). Returns the plain-language string
// to show. The final fallback is deliberately GENERIC: we never render the raw
// thrown text (I4 — fail honest, and no internal-detail leak to the UI).
const WRONG_PIN_MSG = 'Wrong PIN — enter the PIN you use to unlock your wallet.';
const NO_HARDWARE_MSG =
  'Couldn’t reach this device’s hardware security. Try again, or use a different device.';
const MALFORMED_MSG =
  'Your stored wallet data couldn’t be read on this device.';
const NOT_ENROLLED_MSG =
  'Hardware protection isn’t enabled on this vault, so there’s nothing to upgrade.';
const GENERIC_MSG = 'Something went wrong. Please try again.';
const KEY_INVALIDATED_MSG =
  'Your fingerprints changed — hardware protection was invalidated. Disable and re-enable hardware protection, or restore from your seed phrase.';

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
    case KEK_ERR.NOT_ENROLLED:
      return NOT_ENROLLED_MSG;
    case KEK_ERR.KEY_PERMANENTLY_INVALIDATED:
      return KEY_INVALIDATED_MSG;
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

const isNative = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

// PIN strength disclosure — informational only, no logic change.
// An 8-digit numeric PIN has ~100 M combinations. Argon2id raises offline exhaustion
// to ~1.9 years single-threaded, potentially days on a GPU cluster. The hardware factor
// (biometric / WebAuthn PRF) makes offline attacks infeasible because each unlock
// requires the bound device. Without a hardware factor (Safari / no PRF) Argon2id is
// the sole protection, so a longer password is strongly recommended.
function PinStrengthNotice({ variant }) {
  if (variant === 'hardware') {
    return (
      <div
        className="flex items-start gap-2 rounded-lg bg-success/10 border border-success/30 px-3 py-2"
        data-testid="pin-strength-hardware"
      >
        <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-success">Hardware-protected.</span>{' '}
          Your PIN combined with Face ID, fingerprint, or passkey makes offline attacks
          infeasible — an attacker would need both your PIN and this physical device.
        </p>
      </div>
    );
  }
  if (variant === 'no-hardware') {
    return (
      <div
        className="flex items-start gap-2 rounded-lg bg-caution/10 border border-caution/30 px-3 py-2"
        data-testid="pin-strength-no-hardware"
      >
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-caution">No hardware factor available in this browser.</span>{' '}
          Your 8-digit PIN (~100 M combinations) is protected only by Argon2id — a dedicated
          attacker could exhaust it offline in days to weeks. Use a password of 12+ characters,
          or switch to Chrome/Firefox to enable hardware protection.
        </p>
      </div>
    );
  }
  // variant === 'pre-enroll' (native or web with PRF, not yet enrolled)
  return (
    <div
      className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2"
      data-testid="pin-strength-pre-enroll"
    >
      <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">PIN strength.</span>{' '}
        An 8-digit PIN has ~100 M combinations. Argon2id slows offline attacks to roughly
        1–2 years single-threaded — but a GPU cluster could cut that to days.
        Enabling Face ID, fingerprint, or passkey above makes offline attacks infeasible
        by requiring this device for every unlock.
      </p>
    </div>
  );
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
  // Persisted hardware-KEK protocol version (native only): null = unknown/not read,
  // 1/2 = legacy wrap (H bound to a shared fixed salt), 3 = per-enrollment salt-bound.
  // A value < 3 surfaces the one-time consented "Upgrade protection" re-enroll (C-1).
  const [kekVersion, setKekVersion] = useState(null);
  const [upgrading, setUpgrading] = useState(false);

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
            // Read the persisted KEK protocol version so a legacy (< v3) vault can
            // surface the one-time consented upgrade. Metadata-only (no prompt).
            if (isEnrolled && typeof ks.getVaultKekVersion === 'function') {
              try {
                const ver = await ks.getVaultKekVersion();
                if (active) setKekVersion(ver);
              } catch { /* best-effort — the upgrade prompt just won't show */ }
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
    if (!pinToUse) { setError('Enter your vault PIN first.'); return; }
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
      // A fresh enrollment always writes a genuinely salt-bound v3 wrap, so the
      // upgrade prompt must never appear right after enabling.
      setKekVersion(3);
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
        console.error('[KEK-ENROLL] failed:', e?.code, e?.message, JSON.stringify(e), e);
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

  // One-time, user-consented re-enroll of a legacy (< v3) KEK vault to a genuinely
  // per-enrollment salt-bound v3 wrap (C-1). Native only — on web this is a no-op and
  // getVaultKekVersion() returns null, so the section never renders. Deliberately fires
  // TWO biometric prompts (unwrap the old wrap + create the new one); acceptable for a
  // one-off consented action. FAIL-CLOSED in the keystore: on any failure the vault is
  // left byte-for-byte unchanged, so a cancelled/failed upgrade is safe to retry.
  const handleUpgrade = async (testPin) => {
    const pinToUse = testPin || pin;
    if (!pinToUse) { setError('Enter your vault PIN to upgrade.'); return; }
    setError('');
    setBusy(true);
    try {
      const { getHardwareFactor } = await import('@/wallet-core/keystore/hardware.js');
      await getKeyStore().upgradeKekToV3(pinToUse, { getHardwareFactor });
      // Refresh the persisted version + tier from the vault blob (metadata-only, no prompt).
      try {
        const ks = getKeyStore();
        if (typeof ks.getVaultKekVersion === 'function') setKekVersion(await ks.getVaultKekVersion());
        if (typeof ks.getVaultKekTier === 'function') setKekTier(await ks.getVaultKekTier());
      } catch { setKekVersion(3); }
      setPin('');
      setUpgrading(false);
      recordAudit('settings_changed');
      toast.success('Hardware protection upgraded — your vault is now bound with a unique per-device key.');
    } catch (e) {
      // Same STABLE-code classification as enroll/remove; never render raw thrown text (I4).
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
        Locks your wallet to this physical device. After enabling, your wallet can only
        be opened on <strong>this device</strong>. A stolen backup file is useless without
        the device itself, even with your PIN.
        {!isNative && (
          <> Works on Chrome 99+ and Firefox 108+. Safari is not supported.</>
        )}
      </p>

      <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2">
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Device binding is active and tested on real hardware.
        </p>
      </div>

      {/* Loading */}
      {enrolled === null && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" /> Checking status…
        </p>
      )}

      {/* Web — PRF not supported */}
      {!isNative && enrolled !== null && !webPrfAvailable && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Hardware protection isn&apos;t available on this browser. Use Chrome 99+ or Firefox 108+,
            or use the iOS or Android app.
          </p>
          <PinStrengthNotice variant="no-hardware" />
        </div>
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

          <PinStrengthNotice variant="hardware" />

          {/* Upgrade available — legacy (< v3) KEK wrap, native only. One-time consented
              re-enroll to a per-enrollment salt-bound v3 wrap (C-1). Hidden while the
              remove flow is open to avoid two competing PIN entries. */}
          {isNative && kekVersion !== null && kekVersion < 3 && !removing && (
            <div className="space-y-2 rounded-lg bg-muted/40 border border-border px-3 py-2">
              <div className="flex items-start gap-2">
                <ArrowUpCircle className="h-4 w-4 text-caution shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold">Upgrade available</p>
                  <p className="text-xs text-muted-foreground">
                    Your wallet was protected with an older version that shared a key across
                    devices. Upgrade to lock it to this device only.
                    This happens once and asks you to verify twice.
                  </p>
                </div>
              </div>
              {!upgrading ? (
                <button
                  className="text-xs text-primary underline"
                  onClick={() => { setUpgrading(true); setPin(''); setError(''); }}
                >
                  Upgrade hardware protection
                </button>
              ) : (
                <div className="space-y-2">
                  {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}
                  {busy
                    ? (
                      <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                        <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> Upgrading — approve both prompts…
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Enter your vault PIN. You’ll authenticate twice to re-secure the vault.
                        </p>
                        <PinPad
                          value={pin}
                          onChange={v => { setPin(v); setError(''); }}
                          onComplete={handleUpgrade}
                          disabled={busy}
                          length={8}
                          submitLabel="Upgrade hardware protection"
                          numericOnly
                        />
                        <button
                          className="text-xs text-muted-foreground underline"
                          onClick={() => { setUpgrading(false); setPin(''); setError(''); }}
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

          {!removing ? (
            !upgrading && (
              <button
                className="text-xs text-destructive underline"
                onClick={() => { setRemoving(true); setPin(''); setError(''); }}
              >
                Remove hardware protection
              </button>
            )
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {isNative
                  ? 'Enter your PIN to confirm. You\'ll need to verify with your fingerprint or face.'
                  : 'Enter your password to confirm. You\'ll need to verify with your passkey.'}
              </p>
              {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}
              {busy
                ? (
                  <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> Removing — approve the prompt…
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
                      numericOnly
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

          <PinStrengthNotice variant="pre-enroll" />

          {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}

          {busy
            ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> Enrolling — approve the biometric prompt…
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
            Enter your 8-digit PIN to enable hardware protection. Your browser will create a
            passkey to lock your wallet to this device.
          </p>

          <PinStrengthNotice variant="pre-enroll" />

          {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}

          {busy
            ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> Enrolling — approve the passkey prompt…
              </p>
            ) : (
              <PinPad
                value={pin}
                onChange={v => { setPin(v); setError(''); }}
                onComplete={handleEnroll}
                disabled={busy}
                length={8}
                submitLabel="Enable hardware protection"
                numericOnly
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
