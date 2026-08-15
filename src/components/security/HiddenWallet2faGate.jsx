// @ts-nocheck
// src/components/security/HiddenWallet2faGate.jsx
//
// Post-unlock 2FA gate for hidden wallet reveal. This modal appears AFTER the user
// enters the reveal secret, unlocks, and transitions to a hidden wallet session —
// but BEFORE the wallet UI is accessible.
//
// Flow:
// 1. User unlocks with reveal secret → isHidden becomes true
// 2. HiddenWallet2faGate checks: isHidden && hiddenWallet2faMode !== 'none'
// 3. If 2FA enabled, modal appears with TwoFactorGate inside
// 4. User completes 2FA → hiddenWallet2faVerified becomes true, modal closes
// 5. Wallet UI is now visible

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useWallet } from '@/lib/WalletProvider';
import { evaluateTwoFactor } from '@/lib/twoFactorGate';
import { verifyPasskeyAssertion } from '@/lib/passkey';
import { verifyBiometric2fa } from '@/lib/biometric';
import { toast } from '@/lib/toast';
import TwoFactorGate from '@/components/security/TwoFactorGate';
import { EyeOff } from 'lucide-react';

export default function HiddenWallet2faGate() {
  const {
    isHidden, hiddenWallet2faMode, actionPasswordConfigured,
    verifyActiveCredentialDetailed, verifyActionPassword, lock,
  } = useWallet();
  const [verified, setVerified] = useState(false);

  // Show gate only if: in hidden session + 2FA enabled + not yet verified
  const shouldShow = isHidden && hiddenWallet2faMode !== 'none' && !verified;

  const handleSuccess = useCallback(() => {
    setVerified(true);
    // Codex P1 2026-08-15: was "Hidden wallet unlocked" — a session-type
    // tell to a coercer watching over the user's shoulder. Generic wording
    // that matches the primary-unlock toast (see WalletEntry.jsx) so the
    // observable string is identical whether the user opened the primary
    // or a hidden wallet.
    toast.success('Wallet unlocked');
  }, []);

  // NOTE: no cancel handler. This modal cannot be dismissed (see Dialog onOpenChange /
  // onInteractOutside below), so we pass onCancel={undefined} to TwoFactorGate — which
  // then renders NO "Back" button, instead of a dead no-op one that does nothing.

  const handleLock = useCallback(() => {
    // After too many failed attempts, lock the wallet
    lock();
  }, [lock]);

  const verify = useCallback(async ({ pin, password }) => {
    // For biometric mode: verify with biometric only
    if (hiddenWallet2faMode === 'biometric') {
      let bioOk = false;
      try { bioOk = (await verifyBiometric2fa()) === true; } catch { bioOk = false; }
      if (bioOk) return { allowed: true, message: null };
      return { allowed: false, message: 'Biometric verification failed.' };
    }

    // For password/passkey: verify the PIN first
    const pinResult = await verifyActiveCredentialDetailed(pin);
    if (pinResult?.bricked) {
      return { allowed: false, message: 'Verification unavailable — please re-lock and unlock.' };
    }
    const pinOk = pinResult?.ok;

    if (hiddenWallet2faMode === 'passkey') {
      // Passkey mode: PIN + WebAuthn assertion
      let passkeyOk = false;
      try { passkeyOk = (await verifyPasskeyAssertion()) === true; } catch { passkeyOk = false; }
      // PASSKEY is a possession factor (not the Action Password); its precondition is a
      // registered passkey, not the AP record — keep this leg configured-by-construction.
      return evaluateTwoFactor({ pinOk, passwordOk: passkeyOk, actionPasswordConfigured: true });
    }

    // Password mode: PIN + Action Password
    if (!password) {
      return { allowed: false, message: 'Action Password is required.' };
    }
    const passwordOk = await verifyActionPassword(password);
    // Pass the REAL actionPasswordConfigured (the active set's AP record). If it is
    // absent, evaluateTwoFactor returns NOT_CONFIGURED — fail closed, never a silent pass.
    return evaluateTwoFactor({ pinOk, passwordOk, actionPasswordConfigured });
  }, [hiddenWallet2faMode, actionPasswordConfigured, verifyActiveCredentialDetailed, verifyActionPassword]);

  if (!shouldShow) return null;

  const modeLabel = {
    password: 'PIN + Action Password',
    passkey: 'PIN + Passkey',
    biometric: 'PIN + Biometric',
  }[hiddenWallet2faMode] || 'Unknown';

  return (
    <Dialog open={shouldShow} onOpenChange={() => {/* disallow manual close */}}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        {/* Codex P1 2026-08-15: dropped every "Hidden" / "hidden wallet"
            string from the visible copy — a coercer looking at the screen
            can no longer tell this dialog is guarding a hidden session
            vs. a critical action on the primary. Same wording as the
            send-time step-up gate (see SendCrypto.jsx `two-factor at
            critical actions` copy). The EyeOff icon is also swapped for
            a neutral ShieldCheck-style implied by TwoFactorGate itself. */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EyeOff className="w-5 h-5" />
            Two-factor verification
          </DialogTitle>
          <DialogDescription>
            Complete the second factor to continue.
          </DialogDescription>
        </DialogHeader>

        <TwoFactorGate
          title={`Verify (${modeLabel})`}
          mode={hiddenWallet2faMode}
          verify={verify}
          onSuccess={handleSuccess}
          onCancel={undefined}
          onLock={handleLock}
        />

        <p className="text-xs text-muted-foreground text-center mt-4">
          This step protects access inside the app.
        </p>
      </DialogContent>
    </Dialog>
  );
}
