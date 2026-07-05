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
import { KeyRound, ShieldCheck, ShieldAlert, Loader2, CheckCircle2, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
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
  const label = status?.label || 'Passkey';

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
          ? 'Could not enroll biometric unlock on this device.'
          : 'Could not register a passkey on this device.'));
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
        <h2 className="font-semibold">{nativeBio ? 'Biometric unlock' : 'Unlock with Passkey'}</h2>
      </div>

      {/* Honest scope banner: convenience factor, never the path to funds. */}
      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          {nativeBio ? (
            <>
              Your device biometric (fingerprint or face) runs before unlocking —
              an <span className="font-medium text-foreground">additional factor</span>,
              not a replacement for your password. This is the phone&apos;s own
              biometric check, not a passkey. Your password and recovery phrase
              still unlock on their own, so losing biometrics never costs funds.
              No keys are stored in it.
            </>
          ) : (
            <>
              A passkey (FIDO2 / WebAuthn) adds a quick biometric or security-key tap
              before unlocking — an <span className="font-medium text-foreground">additional factor</span>,
              not a replacement for your password. Your password and recovery phrase
              still unlock on their own, so losing the passkey never costs funds. No
              keys are stored in it.
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {nativeBio ? 'Enroll biometric unlock' : 'Register a passkey'}
          </Button>
          {!simulated && !supported && (
            <p className="text-[11px] text-muted-foreground">
              {nativeBio
                ? 'Device biometrics are not set up. Add a fingerprint or face unlock in your device settings first — your password still unlocks.'
                : 'WebAuthn isn\'t available in this browser. Passkey unlock works in the mobile app and modern browsers; use your password here.'}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-success/20 bg-success/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">
                {nativeBio ? 'Biometric unlock enrolled' : 'Passkey registered'}{simulated ? ' (simulated)' : ''}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={handleRemove}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>

          {/* The unlock toggle — only meaningful once a passkey exists. */}
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <p className="text-sm font-medium">
                {nativeBio ? 'Require biometric unlock' : `Require ${label} on unlock`}
              </p>
              <p className="text-xs text-muted-foreground">
                {nativeBio
                  ? 'Ask for your device biometric before unlocking (your password still works).'
                  : 'Ask for your passkey before unlocking (your password still works).'}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              aria-label={nativeBio ? 'Require biometric unlock' : 'Require passkey unlock'}
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
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking availability…
          </span>
        ) : available ? (
          <span className="flex items-start gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            <span>{simulated ? `${label} simulated in demo. ` : ''}{status.detail}</span>
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
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {nativeBio ? 'Awaiting biometric…' : 'Awaiting passkey…'}</>
              : <><KeyRound className="h-4 w-4" /> {nativeBio ? 'Preview biometric prompt' : 'Preview passkey prompt'}</>}
          </Button>
          {testResult === 'ok' && (
            <p className="text-xs text-success mt-2 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {simulated ? 'Simulated ' : ''}{nativeBio ? 'biometric verified' : 'passkey verified'}
            </p>
          )}
          {testResult === 'cancel' && (
            <p className="text-xs text-muted-foreground mt-2">
              {nativeBio ? 'Biometric prompt cancelled' : 'Passkey prompt cancelled'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
