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
// 192 MiB Argon2id derivations) happens inside verify(), in the caller.
//
// UNAUDITED-PROVISIONAL.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck, Fingerprint } from 'lucide-react';
import PinPad from '@/components/security/PinPad';
import { getAuthModel } from '@/lib/authModel';

const ATTEMPT_CAP = 5;

/**
 * @param {object} props
 * @param {(creds:{pin:string,password:string}) => Promise<{allowed:boolean,message:(string|null)}>} props.verify
 *   Composes the two verifications + evaluateTwoFactor; returns the gate verdict.
 * @param {() => void} props.onSuccess  called once on an allowed verdict
 * @param {() => void} [props.onCancel]
 * @param {() => void} [props.onLock]   called after ATTEMPT_CAP wrong attempts (caller locks)
 * @param {'password'|'passkey'|'biometric'} [props.mode]  second-factor type. 'passkey'
 *   collects the PIN then triggers a WebAuthn assertion inside verify(); 'biometric'
 *   collects the PIN then triggers an OS biometric prompt inside verify() (both have
 *   no password field). 'password' collects PIN + Action Password.
 * @param {string} [props.title]
 */
export default function TwoFactorGate({ verify, onSuccess, onCancel, onLock, mode = 'password', title }) {
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  const isPasskey = mode === 'passkey';
  const isBio = mode === 'biometric';
  // Both passkey and biometric supply the second factor via an external prompt
  // (no in-field password): only the PIN is collected here.
  const isExternalFactor = isPasskey || isBio;
  const isPinModel = getAuthModel() === 'pin';
  const resolvedTitle = title || (
    isBio ? 'Confirm with your PIN + biometrics'
      : isPasskey ? 'Confirm with your PIN + passkey'
        : 'Confirm with your PIN + Action Password');
  // External-factor modes need only the PIN in-field; the second factor is the tap.
  const canSubmit = !busy && pin.length > 0 && (isExternalFactor || password.length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    let verdict;
    try {
      verdict = await verify({ pin, password });
    } catch {
      verdict = { allowed: false, message: 'Could not complete verification — not proceeding.' };
    }
    setBusy(false);
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
          : isPasskey ? 'Your PIN and a passkey tap are required for this action.'
            : 'Both factors are required for this action.'}
      </p>
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
            <Input
              id="tfg-pin"
              type="password"
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
      {!isExternalFactor && (
        <div>
          <Label htmlFor="tfg-ap">Action Password</Label>
          <Input
            id="tfg-ap"
            type="password"
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
        <p className="text-[11px] text-muted-foreground">After your PIN, your device will ask for your fingerprint or face.</p>
      )}
      {isPasskey && (
        <p className="text-[11px] text-muted-foreground">After your PIN, your browser will ask you to tap your passkey or security key.</p>
      )}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={busy}>Back</Button>
        )}
        <Button className="flex-1 gap-2" onClick={submit} disabled={!canSubmit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (isExternalFactor ? <Fingerprint className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />)} {isBio ? 'Verify with biometrics' : isPasskey ? 'Verify with passkey' : 'Verify & continue'}
        </Button>
      </div>
    </div>
  );
}
