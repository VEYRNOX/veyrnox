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

  const blocked = isDecoy || isHidden;

  // Show OFF badge only when we know enrollment state and PRF is available/native.
  const showOffBadge = enrolled === false && (isNative || webPrfAvailable);

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

          <PinStrengthNotice variant="pre-enroll" />

          {error && <p role="alert" aria-live="polite" className="text-xs text-destructive">{error}</p>}

          {busy
            ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center py-4">
                <Spinner size="sm" decorative /> {t('settings.hardware_kek.enroll.busy_native')}
              </p>
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
          }

          <p className="text-[11px] text-muted-foreground">
            {t('settings.hardware_kek.enroll.footnote_native')}
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
