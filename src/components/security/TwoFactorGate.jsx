// @ts-nocheck
// src/components/security/TwoFactorGate.jsx
//
// The reusable critical-action 2FA gate: collects the PIN + Action Password, runs
// the caller's verify() (which composes evaluateTwoFactor() over the two full-cost
// Argon2id checks), and invokes onSuccess on an ALLOW verdict. After CAP wrong
// attempts it calls onLock — fail closed (I4), and identical in a real OR decoy
// session so the lockout is not a deniability tell (mirrors the send step-up cap).
//
// The component is presentation + attempt-tracking only; it holds NO secret beyond
// the in-progress inputs and clears them after every attempt. The slow part (two
// 64 MiB Argon2id derivations) happens inside verify(), in the caller.
//
// PROVISIONAL — independent audit complete (ECC 2026-06-23, §24; H-1
// passkey-bypass found and fixed — PR #340, resolveSend2faMethod). Still BUILT,
// not 'verified'.

import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck, Fingerprint } from 'lucide-react';
import PinPad from '@/components/security/PinPad';
import { getAuthModel } from '@/lib/authModel';

const ATTEMPT_CAP = 5;

/**
 * @param {object} props
 * @param {(creds:{pin:string,password:string}) => Promise<{allowed:boolean,message:(string|null),oom?:boolean}>} props.verify
 *   Composes the two verifications + evaluateTwoFactor; returns the gate verdict.
 * @param {() => void} props.onSuccess  called once on an allowed verdict
 * @param {() => void} [props.onCancel]
 * @param {() => void} [props.onLock]   called after ATTEMPT_CAP wrong attempts (caller locks)
 * @param {'password'|'passkey'|'biometric'} [props.mode]  second-factor type. 'passkey'
 *   collects the PIN then triggers a WebAuthn assertion inside verify(); 'biometric'
 *   collects the PIN then triggers an OS biometric prompt inside verify() (both have
 *   no password field). 'password' collects PIN + Action Password.
 * @param {string} [props.title]
 * @param {Error|null} [props.sendError]  error from the downstream send mutation
 *   (broadcast failure after 2FA succeeded). Rendered as a persistent in-card
 *   banner so the user understands why the gate re-appeared (M-4).
 */
export default function TwoFactorGate({ verify, onSuccess, onCancel, onLock, mode = 'password', title, sendError }) {
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  // Tracks whether the current error came from a network/infra failure (thrown
  // exception) rather than a wrong credential. Network errors do NOT burn an
  // attempt and keep the fields intact — the user should be able to retry
  // without penalty.
  const [isNetworkError, setIsNetworkError] = useState(false);

  const isPasskey = mode === 'passkey';
  const isBio = mode === 'biometric';
  // On native, the 'passkey' possession factor is satisfied by the OS biometric
  // (the WKWebView exposes no usable WebAuthn authenticator), so the copy must say
  // Face ID / Touch ID rather than "tap your passkey" (honest UX, no fake claims).
  const isNative = Capacitor.isNativePlatform();
  // Both passkey and biometric supply the second factor via an external prompt
  // (no in-field password): only the PIN is collected here.
  const isExternalFactor = isPasskey || isBio;
  const isPinModel = getAuthModel() === 'pin';
  const resolvedTitle = title || (
    isBio ? 'Confirm with your PIN + biometrics'
      : isPasskey ? 'Confirm with your PIN + passkey'
        : 'Confirm with your PIN + Action Password');
  // Biometric mode: no PIN field — biometric is the only step-up. Passkey/password
  // modes still collect the PIN as factor 1.
  // #2: gate on the TRIMMED value so a whitespace-only PIN/Action Password cannot be
  // submitted. This does NOT bypass the gate (real credentials are still verified by
  // verify()); it only prevents a blank entry from burning one of the ATTEMPT_CAP
  // attempts and accidentally locking the user out.
  const canSubmit = !busy && (isBio || (pin.trim().length > 0 && (isPasskey || password.trim().length > 0)));

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    setIsNetworkError(false);
    let verdict;
    let threw = false;
    try {
      verdict = await verify({ pin, password });
    } catch {
      threw = true;
    }
    setBusy(false);
    if (threw) {
      // Network / infra failure — do NOT burn an attempt or clear the fields.
      // Show the error and a retry button so the user can re-attempt without penalty.
      setIsNetworkError(true);
      setError('Could not reach the verification service. Check your connection and try again.');
      return;
    }
    if (verdict?.allowed) {
      onSuccess?.();
      return;
    }
    // audit-H5: OOM verdict means the session verifier was never captured (Argon2id
    // OOM at unlock). This is not a wrong-credential attempt — don't burn the cap.
    if (verdict?.oom) {
      setError(verdict.message || 'Step-up re-auth unavailable — please lock and unlock.');
      return;
    }
    const n = attempts + 1;
    setAttempts(n);
    setPin('');
    setPassword('');
    if (n >= ATTEMPT_CAP) {
      onLock?.();
      return;
    }
    setError(`${verdict?.message || 'Incorrect.'} (${ATTEMPT_CAP - n} left)`);
  };

  return (
    <div className="space-y-3 p-4 rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">{resolvedTitle}</p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {isBio ? 'Your PIN and a fingerprint / Face check are required for this action.'
          : isPasskey ? (isNative ? 'Your PIN and a Face ID / Touch ID check are required for this action.' : 'Your PIN and a passkey tap are required for this action.')
            : 'Both factors are required for this action.'}
      </p>
      {!isBio && (
        <div>
          {isPinModel ? (
            <PinPad
              aria-label="8-digit PIN"
              value={pin}
              onChange={setPin}
              onComplete={(digits) => setPin(digits)}
              submitLabel="Verify"
              disabled={busy}
            />
          ) : (
            <>
              <Label htmlFor="tfg-pin">Vault password</Label>
              <PasswordInput
                id="tfg-pin"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                className="mt-1.5 mono-value"
                disabled={busy}
              />
            </>
          )}
        </div>
      )}
      {!isExternalFactor && (
        <div>
          <Label htmlFor="tfg-ap">Action Password</Label>
          <PasswordInput
            id="tfg-ap"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            className="mt-1.5 mono-value"
            disabled={busy}
          />
        </div>
      )}
      {isBio && (
        <p id="tfg-external-help" className="text-[11px] text-muted-foreground">After your PIN, your device will ask for your fingerprint or face.</p>
      )}
      {isPasskey && (
        <p id="tfg-external-help" className="text-[11px] text-muted-foreground">{isNative ? 'After your PIN, Face ID / Touch ID will confirm this action.' : 'After your PIN, your browser will ask you to tap your passkey or security key.'}</p>
      )}
      {/* M-4: persistent banner when the downstream broadcast failed after 2FA succeeded.
          Shown above the attempt-error so the user sees the send outcome first. */}
      {sendError && (
        <p role="alert" aria-live="polite" className="text-[11px] text-destructive">
          Send failed — please verify again to retry.
        </p>
      )}
      {/* #4 a11y: announce the attempt-error (the "(N left)" copy) to assistive tech. */}
      {error && (
        <div className="space-y-2">
          <p role="alert" aria-live="polite" className="text-[11px] text-destructive">{error}</p>
          {isNetworkError && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] px-3"
              onClick={() => { setError(''); setIsNetworkError(false); submit(); }}
              disabled={busy}
            >
              Try again
            </Button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={busy}>Back</Button>
        )}
        {/* #4 a11y: for external-factor modes, tie the helper text to the submit so a
            screen reader announces what the button will trigger (a passkey/biometric prompt). */}
        <Button
          className="flex-1 gap-2"
          onClick={submit}
          disabled={!canSubmit}
          aria-describedby={isExternalFactor ? 'tfg-external-help' : undefined}
        >
          {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : (isExternalFactor ? <Fingerprint className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />)} {isBio ? 'Verify with biometrics' : isPasskey ? 'Verify with passkey' : 'Verify & continue'}
        </Button>
      </div>
    </div>
  );
}
