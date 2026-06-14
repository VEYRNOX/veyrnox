// src/components/security/useActionGuard.jsx
//
// Reusable critical-action guard. Drop into any page that performs a CRITICAL
// action and gate it behind two-factor with two lines:
//
//   const { requireTwoFactor, gateModal } = useActionGuard();
//   ...
//   onClick={() => requireTwoFactor(() => doTheCriticalThing(), { title: 'Reveal seed' })}
//   ...
//   {gateModal}   // render once
//
// TWO METHODS (configured in Security Settings → Two-Factor):
//   - 'password' : PIN + Action Password. Two knowledge factors, each at full vault
//                  Argon2id cost; the Action Password is stored PER SET inside the
//                  encrypted container (deniability-safe).
//   - 'passkey'  : PIN + a WebAuthn/FIDO2 assertion (possession factor). Reuses the
//                  device's registered passkey (lib/passkey.js). Device-global, not
//                  per-set. FAILS CLOSED — any assertion error/cancel = not verified.
// Passkey takes precedence when both are somehow set.
//
// When NO second factor is configured, requireTwoFactor runs the action immediately
// (opt-in — unchanged behaviour). When one IS, it pops the gate; the action runs
// ONLY on an allowed verdict. The 192 MiB Argon2id checks run SEQUENTIALLY inside
// verify() (one-at-a-time — Defect-A safe). 5 wrong attempts -> lock() (fail closed).
//
// Honest scope: the 'password' method enforces on the ACTIVE set (primary);
// decoy/hidden sessions carry no per-set record this phase (the flagged decoy-parity
// follow-up). The 'passkey' method is device-global, so it applies in any session on
// this device. UNAUDITED-PROVISIONAL.

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWallet } from '@/lib/WalletProvider';
import { evaluateTwoFactor } from '@/lib/twoFactorGate';
import { is2faPasskeyEnabled, isPasskeyRegistered, verifyPasskeyAssertion } from '@/lib/passkey';
import TwoFactorGate from './TwoFactorGate';

export function useActionGuard() {
  const { actionPasswordConfigured, verifyActiveCredential, verifyActionPassword, lock } = useWallet();
  const [pending, setPending] = useState(null); // { run, title }

  // Resolve the ACTIVE second-factor method at call time (prefs/registration are
  // read from storage). Passkey wins if both are set; password is the per-set knowledge
  // factor; otherwise there is no second factor and the action runs unguarded.
  const resolveMethod = useCallback(() => {
    if (is2faPasskeyEnabled() && isPasskeyRegistered()) return 'passkey';
    if (actionPasswordConfigured) return 'password';
    return 'none';
  }, [actionPasswordConfigured]);

  const requireTwoFactor = useCallback((run, opts = {}) => {
    if (typeof run !== 'function') return;
    const method = resolveMethod();
    if (method === 'none') { run(); return; } // opt-in: no second factor configured
    setPending({ run, title: opts.title, method });
  }, [resolveMethod]);

  const verify = useCallback(async ({ pin, password }) => {
    // Factor 1 (both methods): the unlock credential, full vault Argon2id cost.
    const pinOk = await verifyActiveCredential(pin);
    if (pending?.method === 'passkey') {
      // Factor 2: a WebAuthn assertion bound to this device's registered passkey.
      // FAIL CLOSED — a cancel, timeout, missing authenticator, or any other error
      // all count as NOT verified (the opposite of the unlock gate's degrade path).
      let passkeyOk = false;
      try { passkeyOk = (await verifyPasskeyAssertion()) === true; } catch { passkeyOk = false; }
      return evaluateTwoFactor({ pinOk, passwordOk: passkeyOk, actionPasswordConfigured: true });
    }
    // Factor 2 (password method): the Action Password, also full vault cost. Sequential
    // (never concurrent with the PIN KDF) — one 192 MiB allocation at a time.
    const passwordOk = await verifyActionPassword(password);
    return evaluateTwoFactor({ pinOk, passwordOk, actionPasswordConfigured: true });
  }, [pending, verifyActiveCredential, verifyActionPassword]);

  const gateModal = (
    <Dialog open={!!pending} onOpenChange={(open) => { if (!open) setPending(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pending?.title || 'Confirm critical action'}</DialogTitle>
        </DialogHeader>
        {pending && (
          <TwoFactorGate
            mode={pending.method === 'passkey' ? 'passkey' : 'password'}
            title={pending.title}
            verify={verify}
            onCancel={() => setPending(null)}
            onLock={() => { setPending(null); lock(); }}
            onSuccess={() => { const run = pending.run; setPending(null); run(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );

  return { requireTwoFactor, gateModal };
}
