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
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { HardDrive, ShieldCheck, ShieldAlert, ArrowUpCircle, Info } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useWallet } from '@/lib/WalletProvider';
import { getKeyStore } from '@/wallet-core/keystore';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';
import PinPad from '@/components/security/PinPad';
import { tierToBadge } from '@/wallet-core/keystore/tierBadge.js';
import Spinner from '@/components/Spinner';
import { KEK_INSECURE_TIER_KEY, clearKekInsecureTier } from '@/lib/useKekEnrollmentGate';
import { classifyAndroidCompatibility, ANDROID_COMPAT_CLASS } from '@/lib/androidCompatibility';

// Classify a thrown error by its STABLE machine CODE (not prose — copy is not a
// contract and a raw message can leak internals). Returns the plain-language string
// to show. The final fallback is deliberately GENERIC: we never render the raw
// thrown text (I4 — fail honest, and no internal-detail leak to the UI).
// Copy for these lives at settings.hardware_kek.errors.* in wallet.json; classifyKekError
// takes a `t` function so it can resolve the translated string for the caller's locale.
function classifyKekError(e, t) {
  const code = e?.code || e?.message;
  switch (code) {
    // Wrong PIN against a KEK wrap decrypts to a failed unwrap (generic oracle).
    case KEK_ERR.UNWRAP_FAILED:
      return t('settings.hardware_kek.errors.wrong_pin');
    case KEK_ERR.NO_HARDWARE_FACTOR:
      return t('settings.hardware_kek.errors.no_hardware');
    case KEK_ERR.MALFORMED_VAULT:
      return t('settings.hardware_kek.errors.malformed_vault');
    case KEK_ERR.NOT_ENROLLED:
      return t('settings.hardware_kek.errors.not_enrolled');
    case KEK_ERR.KEY_PERMANENTLY_INVALIDATED:
      return t('settings.hardware_kek.errors.key_invalidated');
    default:
      return t('settings.hardware_kek.errors.generic');
  }
}

// decryptVault (../vault.js) throws a code-less Error whose message is a STABLE
// internal sentinel ('Decryption failed: …' / 'No wallet …'). These are not
// user-facing copy — they are the module's fixed error identity — so matching their
// prefix to show wrong-PIN guidance is safe. We never render the raw message itself.
function isWrongPinVaultError(e) {
  const msg = e?.message || '';
  return msg.startsWith('Decryption failed') || msg.startsWith('No wallet');
}

function shouldClearCredentialOnEnrollFailure(e) {
  const code = e?.code || e?.message;
  // Only the explicit insecure-tier refusal guarantees "native alias created,
  // vault not wrapped". Retryable step-2 failures (hardware factor unavailable,
  // user-cancelled biometric, transient native refusal) must keep the credential
  // intact so a retry does not start from a self-induced stale-key state.
  return code === 'KEK_ENROLL_INSECURE_TIER';
}

const isNative = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

function prettyHardwareBacking(backing) {
  switch (backing) {
    case 'strongBox': return 'StrongBox';
    case 'tee': return 'TEE';
    case 'secureEnclave': return 'Device hardware';
    case 'none': return 'None detected';
    default: return backing ? String(backing) : 'Unknown';
  }
}

// PIN strength disclosure — informational only, no logic change.
// An 8-digit numeric PIN has ~100 M combinations. Argon2id raises offline exhaustion
// to ~1.9 years single-threaded, potentially days on a GPU cluster. The hardware factor
// (biometric / WebAuthn PRF) makes offline attacks infeasible because each unlock
// requires the bound device. Without a hardware factor (Safari / no PRF) Argon2id is
// the sole protection, so a longer password is strongly recommended.
function PinStrengthNotice({ variant }) {
  const { t } = useTranslation('wallet');
  if (variant === 'hardware') {
    return (
      <div
        className="flex items-start gap-2 rounded-lg bg-success/10 border border-success/30 px-3 py-2"
        data-testid="pin-strength-hardware"
      >
        <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-success">{t('settings.hardware_kek.pin_strength.hardware_title')}</span>{' '}
          {t('settings.hardware_kek.pin_strength.hardware_body')}
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
          <span className="font-semibold text-caution">{t('settings.hardware_kek.pin_strength.no_hardware_title')}</span>{' '}
          {t('settings.hardware_kek.pin_strength.no_hardware_body')}
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
        <span className="font-semibold">{t('settings.hardware_kek.pin_strength.pre_enroll_title')}</span>{' '}
        {t('settings.hardware_kek.pin_strength.pre_enroll_body')}
      </p>
    </div>
  );
}

export default function HardwareKekSettings() {
  const { t } = useTranslation('wallet');
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
  const [nativeSnapshot, setNativeSnapshot] = useState(null);
  const [retesting, setRetesting] = useState(false);
  // Persisted "device previously failed the hardware-tier gate" verdict from
  // useKekEnrollmentGate. Shown as a caution banner in the enroll branch so
  // the user knows retrying is expected to fail again (Chinese OEM Keystore
  // reporting SOFTWARE, no StrongBox/TEE, Android<11) — but they CAN retry.
  const [previouslyIneligible, setPreviouslyIneligible] = useState(() => {
    try { return localStorage.getItem(KEK_INSECURE_TIER_KEY) === '1'; } catch { return false; }
  });
  const androidCompatibility = nativeSnapshot?.platform === 'android'
    ? classifyAndroidCompatibility(nativeSnapshot)
    : null;

  useEffect(() => {
    let active = true;
    // Codex P1 2026-08-15: don't run the native KEK probe (Keychain / Keystore
    // touch + orphan cleanup) in a decoy/hidden session. The render is now
    // early-returned above for the blocked branch, but the probe itself could
    // still leave a native-storage side effect (cleaning up a stale alias)
    // that the primary session then sees. Skip entirely — the enrolled
    // state stays null, the render never reads it anyway.
    if (isDecoy || isHidden) return () => { active = false; };
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
            if (typeof ks.getNativeSecuritySnapshot === 'function') {
              try {
                const snapshot = await ks.getNativeSecuritySnapshot();
                if (active) setNativeSnapshot(snapshot);
              } catch { /* best-effort — diagnostics only */ }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDecoy, isHidden]);

  const handleEnroll = async (testPin) => {
    const pinToUse = testPin || pin;
    if (!pinToUse) { setError(t('settings.hardware_kek.errors.enter_pin_first')); return; }
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
      // Successful enrollment proves the device DOES meet the tier requirement
      // (transient state, OS update, wallet reinstall on a capable device).
      // Clear the persisted-ineligible verdict so the unlock gate stops
      // suppressing itself. Safe from Settings: this handler is invoked by
      // the user, and enrollment succeeded — the verdict was stale.
      clearKekInsecureTier();
      setPreviouslyIneligible(false);
      setPin('');
      recordAudit('settings_changed');
      toast.success(t('settings.hardware_kek.toast.enabled'));
    } catch (e) {
      // Classify by STABLE machine CODE, never by prose (copy is not a contract) and
      // never render the raw thrown message (no internal-detail leak, I4).
      const code = e?.code;
      if (code === 'KEK_ENROLL_INSECURE_TIER') {
        // Machine code from hardware.js ENROLL_ERR.INSECURE_TIER.
        setError(t('settings.hardware_kek.errors.insecure_tier'));
      } else if (isWrongPinVaultError(e)) {
        setError(t('settings.hardware_kek.errors.wrong_pin'));
      } else {
        console.error('[KEK-ENROLL] failed:', e?.code);
        setError(classifyKekError(e, t));
      }
      if (shouldClearCredentialOnEnrollFailure(e)) {
        // Best-effort cleanup only for the partial-enroll case where the native
        // credential was created but refused on tier honesty grounds.
        try {
          if (isNative) {
            const { clearHardwareCredential } = await import('@/wallet-core/keystore/hardware.js');
            await clearHardwareCredential();
          } else if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('veyrnox-prf-cred-id');
          }
        } catch { /* best-effort */ }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUnenroll = async () => {
    if (!pin) { setError(t('settings.hardware_kek.errors.enter_pin_confirm_removal')); return; }
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
      toast.success(t('settings.hardware_kek.toast.removed'));
    } catch (e) {
      // Classify by STABLE machine CODE (UNWRAP_FAILED = wrong PIN/device). Vault
      // decrypt sentinels also map to wrong-PIN guidance; everything else is generic.
      if (isWrongPinVaultError(e)) {
        setError(t('settings.hardware_kek.errors.wrong_pin'));
      } else {
        setError(classifyKekError(e, t));
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
    if (!pinToUse) { setError(t('settings.hardware_kek.errors.enter_pin_upgrade')); return; }
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
      toast.success(t('settings.hardware_kek.toast.upgraded'));
    } catch (e) {
      // Same STABLE-code classification as enroll/remove; never render raw thrown text (I4).
      if (isWrongPinVaultError(e)) {
        setError(t('settings.hardware_kek.errors.wrong_pin'));
      } else {
        setError(classifyKekError(e, t));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRetestDeviceSecurity = async () => {
    setRetesting(true);
    setError('');
    try {
      const ks = getKeyStore();
      if (typeof ks.refreshNativeSecuritySnapshot === 'function') {
        const snapshot = await ks.refreshNativeSecuritySnapshot();
        setNativeSnapshot(snapshot);
        if (snapshot?.platform === 'android') {
          const compatibility = classifyAndroidCompatibility(snapshot);
          if (compatibility.canAttemptEnrollment) {
            clearKekInsecureTier();
            setPreviouslyIneligible(false);
          }
        }
      }
    } catch {
      setError('Could not retest this device right now. Please try again.');
    } finally {
      setRetesting(false);
    }
  };

  const blocked = isDecoy || isHidden;

  // Show OFF badge only when we know enrollment state and PRF is available/native.
  const showOffBadge = enrolled === false && (isNative || webPrfAvailable);

  // Codex P1 2026-08-15: previously `blocked` gated ONLY the not-enrolled
  // enroll form. The enrolled/off/tier-badge/upgrade/remove UI still
  // rendered from the mount probe's real KEK state — so a decoy/hidden
  // session could observe the real device's enrollment status AND reach
  // upgrade/remove buttons. Two-chokepoint fix: (a) Settings.jsx already
  // hides the whole security-settings block in deniable (PR #1822), and
  // (b) this early-return here fails closed for ANY other caller that
  // might mount this component outside the Settings tree. Neutral copy
  // matches the section header so nothing about the real posture leaks.
  if (blocked) {
    return (
      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t('settings.hardware_kek.heading')}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.hardware_kek.blocked')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center gap-2">
        <HardDrive className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">{t('settings.hardware_kek.heading')}</h2>
        {enrolled && (() => {
          // On web (PRF), kekTier is null — show "WebAuthn Protected".
          // On native, show the real tier label from the vault blob (H-1 honesty fix).
          if (!isNative) {
            return (
              <span className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-success">
                <ShieldCheck className="h-3.5 w-3.5" /> {t('settings.hardware_kek.badge_webauthn')}
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
            <span className={`ms-auto inline-flex items-center gap-1 text-xs font-semibold ${colourClass}`}>
              <ShieldCheck className="h-3.5 w-3.5" /> {badge.label}
            </span>
          );
        })()}
        {showOffBadge && (
          <span className="ms-auto text-xs text-muted-foreground">{t('settings.hardware_kek.badge_off')}</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t('settings.hardware_kek.description_pre')}
        <strong>{t('settings.hardware_kek.description_device')}</strong>
        {t('settings.hardware_kek.description_post')}
        {!isNative && (
          <> {t('settings.hardware_kek.description_web_suffix')}</>
        )}
      </p>

      <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2">
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          {t('settings.hardware_kek.device_binding_note')}
        </p>
      </div>

      {isNative && nativeSnapshot && (
        <div
          data-testid="android-security-snapshot"
          className="space-y-2 rounded-lg bg-muted/40 border border-border px-3 py-3"
        >
          <p className="text-xs font-semibold text-foreground">Device compatibility snapshot</p>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Device</span>
            <span>
              {nativeSnapshot.manufacturer || nativeSnapshot.model
                ? [nativeSnapshot.manufacturer, nativeSnapshot.model].filter(Boolean).join(' ')
                : 'Unknown device'}
            </span>
            <span className="font-medium text-foreground">Platform</span>
            <span>
              {nativeSnapshot.platform === 'android'
                ? `Android${nativeSnapshot.sdkInt ? ` (API ${nativeSnapshot.sdkInt})` : ''}`
                : 'iOS'}
            </span>
            <span className="font-medium text-foreground">Biometrics</span>
            <span>
              {nativeSnapshot.biometricAvailable
                ? 'Available'
                : nativeSnapshot.deviceIsSecure
                  ? 'Not enrolled - device credential fallback only'
                  : 'Unavailable'}
            </span>
            <span className="font-medium text-foreground">Hardware backing</span>
            <span>{prettyHardwareBacking(nativeSnapshot.hardwareBacking)}</span>
          </div>
          {androidCompatibility?.summary && (
            <p className="text-xs text-muted-foreground">
              {androidCompatibility.summary}
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {enrolled === null && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Spinner size="sm" decorative /> {t('settings.hardware_kek.checking_status')}
        </p>
      )}

      {/* Web — PRF not supported */}
      {!isNative && enrolled !== null && !webPrfAvailable && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('settings.hardware_kek.web_prf_unsupported')}
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
              <p className="text-xs font-semibold text-success">{t('settings.hardware_kek.enrolled.active_title')}</p>
              <p className="text-xs text-muted-foreground">
                {isNative
                  ? t('settings.hardware_kek.enrolled.active_body_native')
                  : t('settings.hardware_kek.enrolled.active_body_web')}
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
                  <p className="text-xs font-semibold">{t('settings.hardware_kek.upgrade.available_title')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.hardware_kek.upgrade.available_body')}
                  </p>
                </div>
              </div>
              {!upgrading ? (
                <button
                  className="text-xs text-primary underline"
                  onClick={() => { setUpgrading(true); setPin(''); setError(''); }}
                >
                  {t('settings.hardware_kek.upgrade.cta')}
                </button>
              ) : (
                <div className="space-y-2">
                  {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}
                  {busy
                    ? (
                      <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                        <Spinner size="sm" decorative /> {t('settings.hardware_kek.upgrade.busy')}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.hardware_kek.upgrade.prompt')}
                        </p>
                        <PinPad
                          value={pin}
                          onChange={v => { setPin(v); setError(''); }}
                          onComplete={handleUpgrade}
                          disabled={busy}
                          length={8}
                          submitLabel={t('settings.hardware_kek.upgrade.cta')}
                          numericOnly
                        />
                        <button
                          className="text-xs text-muted-foreground underline"
                          onClick={() => { setUpgrading(false); setPin(''); setError(''); }}
                        >
                          {t('settings.hardware_kek.upgrade.cancel')}
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
                {t('settings.hardware_kek.remove.cta')}
              </button>
            )
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {isNative
                  ? t('settings.hardware_kek.remove.prompt_native')
                  : t('settings.hardware_kek.remove.prompt_web')}
              </p>
              {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}
              {busy
                ? (
                  <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                    <Spinner size="sm" decorative /> {t('settings.hardware_kek.remove.busy')}
                  </p>
                ) : (
                  <>
                    <PinPad
                      value={pin}
                      onChange={v => { setPin(v); setError(''); }}
                      onComplete={handleUnenroll}
                      disabled={busy}
                      length={8}
                      submitLabel={t('settings.hardware_kek.remove.cta')}
                      numericOnly
                    />
                    <button
                      className="text-xs text-muted-foreground underline"
                      onClick={() => { setRemoving(false); setPin(''); setError(''); }}
                    >
                      {t('settings.hardware_kek.remove.cancel')}
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
          <p className="text-xs text-muted-foreground">{t('settings.hardware_kek.enroll.prompt_native')}</p>

          {previouslyIneligible && (
            <div
              className="flex items-start gap-2 rounded-lg bg-caution/10 border border-caution/30 px-3 py-2"
              data-testid="kek-previously-ineligible"
            >
              <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                Hardware protection could not be enabled on this device before
                (StrongBox or TEE was unavailable). You can try again — an OS
                update or a change in device state may allow it now.
              </p>
            </div>
          )}

          {nativeSnapshot?.platform === 'android' && androidCompatibility?.className === ANDROID_COMPAT_CLASS.TEE && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                This device can still enable hardware protection, but it uses TEE-backed security rather than StrongBox. That is expected on many Android builds, including some OnePlus and Samsung devices.
              </p>
            </div>
          )}

          {nativeSnapshot?.platform === 'android' && androidCompatibility?.className === ANDROID_COMPAT_CLASS.DEVICE_CREDENTIAL_ONLY && (
            <div className="flex items-start gap-2 rounded-lg bg-caution/10 border border-caution/30 px-3 py-2">
              <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                Veyrnox cannot enable hardware protection yet because this device has no enrolled biometrics. Add a fingerprint or face unlock in system settings, then retry.
              </p>
            </div>
          )}

          {nativeSnapshot?.platform === 'android' && androidCompatibility?.className === ANDROID_COMPAT_CLASS.UNSUPPORTED && (
            <div className="flex items-start gap-2 rounded-lg bg-caution/10 border border-caution/30 px-3 py-2">
              <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                This Android build is currently falling back to password-only protection because Veyrnox could not confirm a supported hardware-backed biometric path.
              </p>
            </div>
          )}

          {nativeSnapshot?.platform === 'android' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs text-primary underline disabled:text-muted-foreground"
                onClick={handleRetestDeviceSecurity}
                disabled={retesting || busy}
              >
                {retesting ? 'Retesting device security...' : 'Retest device security'}
              </button>
              <p className="text-[11px] text-muted-foreground">
                Re-run the Android security checks after an OS update, a new biometric enrollment, or a device security setting change.
              </p>
            </div>
          )}

          {(androidCompatibility?.showPreEnrollNotice ?? true) && (
            <PinStrengthNotice variant="pre-enroll" />
          )}

          {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}

          {busy
            ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                <Spinner size="sm" decorative /> {t('settings.hardware_kek.enroll.busy_native')}
              </p>
            ) : (
              androidCompatibility?.canAttemptEnrollment === false ? (
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">
                    Hardware protection is unavailable on this device right now. You can continue using your wallet with password protection and retry later if the device security state changes.
                  </p>
                </div>
              ) : (
                <PinPad
                  value={pin}
                  onChange={v => { setPin(v); setError(''); }}
                  onComplete={handleEnroll}
                  disabled={busy}
                  length={8}
                  submitLabel={t('settings.hardware_kek.enroll.cta')}
                />
              )
            )
          }

          <p className="text-[11px] text-muted-foreground">
            {androidCompatibility?.className === ANDROID_COMPAT_CLASS.TEE
              ? 'TEE-backed Android devices are supported, but vendor-specific biometric prompts and reenrollment behavior may differ from Pixel.'
              : t('settings.hardware_kek.enroll.footnote_native')}
          </p>
        </div>
      )}

      {/* Not enrolled — web with PRF available */}
      {!isNative && webPrfAvailable && enrolled === false && !blocked && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t('settings.hardware_kek.enroll.prompt_web')}
          </p>

          <PinStrengthNotice variant="pre-enroll" />

          {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}

          {busy
            ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                <Spinner size="sm" decorative /> {t('settings.hardware_kek.enroll.busy_web')}
              </p>
            ) : (
              <PinPad
                value={pin}
                onChange={v => { setPin(v); setError(''); }}
                onComplete={handleEnroll}
                disabled={busy}
                length={8}
                submitLabel={t('settings.hardware_kek.enroll.cta')}
                numericOnly
              />
            )
          }

          <p className="text-[11px] text-muted-foreground">
            {t('settings.hardware_kek.enroll.footnote_web')}
          </p>
        </div>
      )}

      {/* Blocked in decoy / hidden session */}
      {blocked && (
        <p className="text-xs text-muted-foreground">
          {t('settings.hardware_kek.blocked')}
        </p>
      )}
    </div>
  );
}
