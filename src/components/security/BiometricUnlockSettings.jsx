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
import { useTranslation } from 'react-i18next';
import { ScanFace, ShieldCheck, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/lib/WalletProvider';
import Spinner from '@/components/Spinner';
import {
  isBiometricUnlockEnabled,
  setBiometricUnlockEnabled,
  getBiometricStatus,
} from '@/lib/biometric';
// NOTE: setBiometricUnlockEnabled is used ONLY in the explicit confirmEnable() path
// (a deliberate user action), never automatically on mount.

export default function BiometricUnlockSettings({ embedded = false } = {}) {
  const { t } = useTranslation('wallet');
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
        // Store a translation KEY, not a resolved string, so switching language
        // mid-mount re-renders the message in the new locale. The render layer
        // reads `detailKey` first and falls back to `detail` for shapes that
        // still carry a resolved string (from getBiometricStatus itself).
        if (active) setStatus({ available: false, detailKey: 'settings.biometric_unlock.status_check_failed' });
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
  const label = status?.label || t('settings.biometric_unlock.default_label');
  const simulated = status?.simulated;

  return (
    <div className={embedded ? "space-y-4" : "p-5 rounded-xl border border-border bg-card space-y-4"}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <ScanFace className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t('settings.biometric_unlock.heading')}</h2>
        </div>
      )}

      {/* VULN-1 / VULN-2 disclosure — explicit about the security trade-off. */}
      <div
        data-testid="kdf-bypass-disclosure"
        className="flex items-start gap-2 rounded-lg bg-caution/10 border border-caution/30 px-3 py-2"
      >
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-caution">{t('settings.biometric_unlock.worth_knowing_label')}</span>{' '}
            {t('settings.biometric_unlock.kdf_disclosure')}
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
          {t('settings.biometric_unlock.app_layer_disclosure_pre')}{' '}
          {t('settings.biometric_unlock.app_layer_disclosure_mid')}{' '}
          <span className="font-medium text-foreground">{t('settings.biometric_unlock.hardware_protection_label')}</span>{' '}
          {t('settings.biometric_unlock.app_layer_disclosure_post')}
        </p>
      )}

      {/* The toggle. On a real device it is forced on (and disabled): native
          unlock always requires biometric/passcode. In demo/web it controls the
          (simulated) prompt.
          While pendingEnable is true the toggle stays visually off — enabling is
          not yet committed; the confirm panel below is the deliberate action. */}
      <div className="flex items-center justify-between">
        <div className="pe-4">
          <p className="text-sm font-medium">
            {t('settings.biometric_unlock.toggle_label')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('settings.biometric_unlock.toggle_description')}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={t('settings.biometric_unlock.toggle_label')}
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
              <span className="font-semibold text-caution">{t('settings.biometric_unlock.before_enable_label')}</span>{' '}
              {t('settings.biometric_unlock.confirm_disclosure')}
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
              {t('settings.biometric_unlock.confirm_enable_button')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={cancelEnable}
              data-testid="biometric-cancel-enable-btn"
            >
              {t('settings.biometric_unlock.cancel_button')}
            </Button>
          </div>
        </div>
      )}


      {/* Availability / status line. */}
      <div className="flex items-start gap-2 text-xs">
        {status == null ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Spinner size="sm" label={t('settings.biometric_unlock.checking_availability')} /> {t('settings.biometric_unlock.checking_availability')}
          </span>
        ) : available ? (
          <span className="flex items-start gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            <span>
              {simulated
                ? t('settings.biometric_unlock.available_simulated', { label })
                : t('settings.biometric_unlock.available', { label })}{' '}
              {status.detailKey ? t(status.detailKey) : status.detail}
            </span>
          </span>
        ) : (
          <span className="flex items-start gap-1.5 text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <span>{status.detailKey ? t(status.detailKey) : status.detail}</span>
          </span>
        )}
      </div>

      {/* Preview/test button — only meaningful where a prompt can be shown. */}
      {enabled && available && simulated && (
        <div>
          <Button variant="outline" className="w-full gap-2" onClick={runTest} disabled={testing}>
            {testing
              ? <><Loader2 className="h-4 w-4 motion-safe:animate-spin" /> {t('settings.biometric_unlock.awaiting_prompt')}</>
              : <><ScanFace className="h-4 w-4" /> {t('settings.biometric_unlock.preview_prompt')}</>}
          </Button>
          {testResult === 'ok' && (
            <p className="text-xs text-success mt-2 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t('settings.biometric_unlock.test_success')}
            </p>
          )}
          {testResult === 'cancel' && (
            <p className="text-xs text-muted-foreground mt-2">{t('settings.biometric_unlock.test_cancelled')}</p>
          )}
        </div>
      )}
    </div>
  );
}
