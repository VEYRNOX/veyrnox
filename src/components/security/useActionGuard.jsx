// src/components/security/useActionGuard.jsx
//
// Reusable critical-action guard. Drop into any page that performs a CRITICAL
// action and gate it behind the PIN + Action Password 2FA with two lines:
//
//   const { requireTwoFactor, gateModal } = useActionGuard();
//   ...
//   onClick={() => requireTwoFactor(() => doTheCriticalThing(), { title: 'Reveal seed' })}
//   ...
//   {gateModal}   // render once
//
// When NO Action Password is configured, requireTwoFactor runs the action
// immediately (opt-in — unchanged behaviour for wallets without a second factor).
// When one IS configured, it pops the gate; the action runs ONLY on an allowed
// verdict. The two 192 MiB Argon2id checks run SEQUENTIALLY inside verify()
// (one-at-a-time — Defect-A safe). 5 wrong attempts -> lock() (fail closed).
//
// Honest scope: this enforces on the ACTIVE set (primary). Decoy/hidden sessions
// carry no record this phase (they are bare-mnemonic) so requireTwoFactor runs the
// action without a prompt there — the flagged decoy-parity follow-up. UNAUDITED-PROVISIONAL.

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWallet } from '@/lib/WalletProvider';
import { evaluateTwoFactor } from '@/lib/twoFactorGate';
import TwoFactorGate from './TwoFactorGate';

export function useActionGuard() {
  const { actionPasswordConfigured, verifyActiveCredential, verifyActionPassword, lock } = useWallet();
  const [pending, setPending] = useState(null); // { run: () => void, title: string }

  const requireTwoFactor = useCallback((run, opts = {}) => {
    if (typeof run !== 'function') return;
    if (!actionPasswordConfigured) { run(); return; } // opt-in: no second factor configured
    setPending({ run, title: opts.title || 'Confirm with your PIN + Action Password' });
  }, [actionPasswordConfigured]);

  const verify = useCallback(async ({ pin, password }) => {
    const pinOk = await verifyActiveCredential(pin);          // sequential (one KDF at a time)
    const passwordOk = await verifyActionPassword(password);
    return evaluateTwoFactor({ pinOk, passwordOk, actionPasswordConfigured: true });
  }, [verifyActiveCredential, verifyActionPassword]);

  const gateModal = (
    <Dialog open={!!pending} onOpenChange={(open) => { if (!open) setPending(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pending?.title || 'Confirm critical action'}</DialogTitle>
        </DialogHeader>
        {pending && (
          <TwoFactorGate
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
