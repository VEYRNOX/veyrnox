// @ts-nocheck
// components/security/PasskeyUnlockSettings.jsx — the "Unlock with passkey"
// section for the Security settings screen (S1).
//
// Sibling of BiometricUnlockSettings.jsx. This component:
//   - registers a real FIDO2/WebAuthn passkey (web), enrolls the OS-biometric
//     gate (native — status.mode 'native-biometric'; there is NO WebAuthn
//     plugin in the Capacitor app, so all copy honestly says "Biometric
//     unlock", never "Passkey", on native), or a simulated one in demo,
//   - reads/writes the persisted "unlock with passkey" preference (enable is
//     refused until a registration exists — an enabled-but-unregistered flag
//     would be a fail-open fake gate; see canSetPasskeyUnlock),
//   - reports platform availability/status honestly,
//   - lets the user preview the (simulated, in demo) passkey prompt,
//   - removes the registered passkey.
//
// HARD BOUNDARY (see lib/passkey.js): the passkey is an AUTHENTICATION FACTOR,
// not key custody. It never touches vault crypto or the seed, stores no
// vault-decrypting secret, and the password unlock stays fully independent —
// losing the passkey never costs funds. The actual gate wiring lives in
// WalletProvider.unlock(); this is its settings surface.

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, ShieldCheck, ShieldAlert, Loader2, CheckCircle2, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/Spinner';
import { useWallet } from '@/lib/WalletProvider';
import {
  isPasskeyUnlockEnabled,
  setPasskeyUnlockEnabled,
  getPasskeyStatus,
  registerPasskeyCredential,
  clearRegisteredPasskey,
  isRegistrationCancel,
  canSetPasskeyUnlock,
} from '@/lib/passkey';

export default function PasskeyUnlockSettings() {
  const { t } = useTranslation('wallet');
  const { passkeyPreview } = useWallet();
  const [enabled, setEnabled] = useState(() => isPasskeyUnlockEnabled());
  const [status, setStatus] = useState(null); // null while loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'cancel'
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    const s = await getPasskeyStatus().catch(() => null);
    setStatus(s);
    setEnabled(isPasskeyUnlockEnabled());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const registered = status?.registered;
  const available = status?.available;
  const supported = status?.supported;
  const simulated = status?.simulated;
  // NATIVE: the factor is the OS biometric, not a FIDO2 passkey — all copy below
  // must say so (honesty at the presentation layer; see lib/passkey.js).
  const nativeBio = status?.mode === 'native-biometric';
  const label = status?.label || t('settings.passkey_unlock.default_label');

  const onToggle = (v) => {
    // FAIL-CLOSED GUARD: WalletProvider.runPasskeyGate() silently SKIPS when no
    // credential is registered, so persisting enabled=true without one would be
    // a fake gate (fail-open). Refuse to enable until registration completes.
    if (!canSetPasskeyUnlock({ requestedOn: v, registered: !!registered })) return;
    setEnabled(v);
    setPasskeyUnlockEnabled(v); // persist immediately
    setTestResult(null);
  };

  const handleRegister = async () => {
    setBusy(true);
    setError('');
    setTestResult(null);
    try {
      await registerPasskeyCredential({ label: 'Veyrnox unlock' });
      // Turning it on immediately after registering matches user intent (they
      // just opted in). They can flip it back off here at any time.
      setPasskeyUnlockEnabled(true);
      await refresh();
    } catch (e) {
      // Only a genuine user-cancel of the OS sheet is quietly ignorable — and the
      // cancel signal is platform-scoped (web: NotAllowedError; native: the
      // biometric plugin's userCancel). Everything else is surfaced (I4): on
      // native, swallowing NotAllowedError here is what made Register look like
      // it silently did nothing when the WebView's dead WebAuthn stub threw it.
      if (!isRegistrationCancel(e, nativeBio)) {
        setError(e?.message || (nativeBio
          ? t('settings.passkey_unlock.enroll_error')
          : t('settings.passkey_unlock.register_error')));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError('');
    try {
      clearRegisteredPasskey(); // forgets our public handle + disables the gate
      await refresh();
      setTestResult(null);
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await passkeyPreview();
      setTestResult(ok ? 'ok' : 'cancel');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">{nativeBio ? t('settings.passkey_unlock.heading_native') : t('settings.passkey_unlock.heading_web')}</h2>
      </div>

      {/* Honest scope banner: convenience factor, never the path to funds. */}
      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          {nativeBio ? (
            <>
              {t('settings.passkey_unlock.scope_banner_native_pre')}{' '}
              <span className="font-medium text-foreground">{t('settings.passkey_unlock.extra_step_label')}</span>,{' '}
              {t('settings.passkey_unlock.scope_banner_native_post')}
            </>
          ) : (
            <>
              {t('settings.passkey_unlock.scope_banner_web_pre')}{' '}
              <span className="font-medium text-foreground">{t('settings.passkey_unlock.extra_step_label')}</span>,{' '}
              {t('settings.passkey_unlock.scope_banner_web_post')}
            </>
          )}
        </p>
      </div>

      {/* Register / registered state. */}
      {!registered ? (
        <div className="space-y-2">
          <Button
            className="w-full gap-2"
            onClick={handleRegister}
            disabled={busy || (!simulated && !available)}
          >
            {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {nativeBio ? t('settings.passkey_unlock.enroll_button') : t('settings.passkey_unlock.register_button')}
          </Button>
          {!simulated && !supported && (
            <p className="text-[11px] text-muted-foreground">
              {nativeBio
                ? t('settings.passkey_unlock.not_setup_native')
                : t('settings.passkey_unlock.not_supported_web')}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-success/20 bg-success/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">
                {nativeBio ? t('settings.passkey_unlock.enrolled_native') : t('settings.passkey_unlock.registered_web')}{simulated ? t('settings.passkey_unlock.simulated_suffix') : ''}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={handleRemove}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('settings.passkey_unlock.remove_button')}
            </Button>
          </div>

          {/* The unlock toggle — only meaningful once a passkey exists. */}
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <p className="text-sm font-medium">
                {nativeBio ? t('settings.passkey_unlock.require_toggle_native') : t('settings.passkey_unlock.require_toggle_web', { label })}
              </p>
              <p className="text-xs text-muted-foreground">
                {nativeBio
                  ? t('settings.passkey_unlock.require_toggle_desc_native')
                  : t('settings.passkey_unlock.require_toggle_desc_web')}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {t('settings.passkey_unlock.applies_all_sessions')}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              aria-label={nativeBio ? t('settings.passkey_unlock.require_toggle_native') : t('settings.passkey_unlock.require_toggle_aria_web')}
            />
          </div>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
          <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Availability / status line. */}
      <div className="flex items-start gap-2 text-xs">
        {status == null ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Spinner size="sm" label={t('settings.passkey_unlock.checking_availability')} /> {t('settings.passkey_unlock.checking_availability')}
          </span>
        ) : available ? (
          <span className="flex items-start gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            <span>{simulated ? t('settings.passkey_unlock.simulated_in_demo', { label }) : ''}{status.detail}</span>
          </span>
        ) : (
          <span className="flex items-start gap-1.5 text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <span>{status.detail}</span>
          </span>
        )}
      </div>

      {/* Preview/test button — only meaningful when registered + can prompt. */}
      {registered && enabled && available && (
        <div>
          <Button variant="outline" className="w-full gap-2" onClick={runTest} disabled={testing}>
            {testing
              ? <><Loader2 className="h-4 w-4 motion-safe:animate-spin" /> {nativeBio ? t('settings.passkey_unlock.awaiting_biometric') : t('settings.passkey_unlock.awaiting_passkey')}</>
              : <><KeyRound className="h-4 w-4" /> {nativeBio ? t('settings.passkey_unlock.preview_biometric_prompt') : t('settings.passkey_unlock.preview_passkey_prompt')}</>}
          </Button>
          {testResult === 'ok' && (
            <p className="text-xs text-success mt-2 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {simulated ? t('settings.passkey_unlock.simulated_prefix') : ''}{nativeBio ? t('settings.passkey_unlock.biometric_verified') : t('settings.passkey_unlock.passkey_verified')}
            </p>
          )}
          {testResult === 'cancel' && (
            <p className="text-xs text-muted-foreground mt-2">
              {nativeBio ? t('settings.passkey_unlock.biometric_prompt_cancelled') : t('settings.passkey_unlock.passkey_prompt_cancelled')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
