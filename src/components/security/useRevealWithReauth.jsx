// src/components/security/useRevealWithReauth.jsx
//
// Shared "reveal a wallet's mnemonic" flow used by every seed-backup entry point
// (WalletPortfolioPage's per-wallet menu, its global unbacked-wallet banner, and
// the standalone WalletSeedQR page). Eliminates the three-place duplication of:
//   requireTwoFactor(() => {
//     const { mnemonic, reauthRequired } = revealWalletMnemonic(id, { callerGated: true });
//     if (reauthRequired) { toast.error('Session timed out...'); return; }
//     ...use mnemonic...
//   })
//
// UX FIX: previously a `reauthRequired` result (the M6 recent-auth window — see
// WalletProvider.jsx `revealWalletMnemonic` / `REAUTH_WINDOW_MS`) was a dead-end
// toast — the user had to independently re-trigger the whole reveal action. This
// hook instead surfaces an INLINE re-auth prompt (same "re-enter your PIN/password"
// primitive SendCrypto's step-up already uses — verifyActiveCredentialDetailed,
// which refreshes lastAuthAtRef on success) and, on success, retries
// revealWalletMnemonic automatically so the seed appears without the user
// re-starting the backup flow.
//
// SECURITY: no security/gating logic is changed. The FIRST call into
// revealWalletMnemonic is still made from inside requireTwoFactor exactly as
// before (unchanged 2FA gate). The M6 staleness re-check inside
// revealWalletMnemonic is untouched. The inline re-auth step below re-uses the
// SAME verifyActiveCredentialDetailed the send flow's windowed step-up already
// calls directly (not the two-factor gate) — this is intentional: `reauthRequired`
// signals only that the recent-auth WINDOW lapsed (a single-factor freshness
// check), not that the action's two-factor requirement changed. Re-running the
// full requireTwoFactor two-factor gate here would additionally be unsafe for
// method === 'biometric', whose verify() path never touches lastAuthAtRef, so a
// second requireTwoFactor pass could never clear reauthRequired. Fail-closed /
// attempt-capped identically to the send step-up (5 wrong attempts -> lock()).

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PinPad from '@/components/security/PinPad';
import { getAuthModel } from '@/lib/authModel';
import { useWallet } from '@/lib/WalletProvider';
import { useActionGuard } from '@/components/security/useActionGuard';
import { useRaspArtifact, sensitiveGate } from '@/rasp';

const REAUTH_CAP = 5;

/**
 * @param {(result: { walletId: string, mnemonic: string }) => void} onRevealed
 *   called once a mnemonic is successfully obtained (first try or after re-auth).
 */
export function useRevealWithReauth(onRevealed) {
  const { revealWalletMnemonic, verifyActiveCredentialDetailed, lock } = useWallet();
  const { requireTwoFactor, gateModal } = useActionGuard();
  const raspArtifact = useRaspArtifact();

  // { walletId } while the inline "session timed out, unlock again" prompt is open.
  const [pendingWalletId, setPendingWalletId] = useState(null);
  const [reauthValue, setReauthValue] = useState('');
  const [reauthError, setReauthError] = useState('');
  const [reauthAttempts, setReauthAttempts] = useState(0);
  const [reauthPending, setReauthPending] = useState(false);

  const resetReauth = () => {
    setPendingWalletId(null);
    setReauthValue('');
    setReauthError('');
    setReauthAttempts(0);
    setReauthPending(false);
  };

  const attemptReveal = useCallback((walletId) => {
    const { mnemonic, reauthRequired } = revealWalletMnemonic(walletId, { callerGated: true });
    if (reauthRequired) {
      setPendingWalletId(walletId);
      setReauthValue('');
      setReauthError('');
      setReauthAttempts(0);
      return;
    }
    if (mnemonic) onRevealed({ walletId, mnemonic });
  }, [revealWalletMnemonic, onRevealed]);

  // Entry point for callers: gate behind the existing 2FA action guard, then try
  // the reveal. Byte-identical first leg to the old per-callsite code.
  const revealWithReauth = useCallback((walletId, opts = {}) => {
    const gate = sensitiveGate(raspArtifact, 'seed-reveal');
    if (gate.blocked) {
      toast.error(gate.sentence || 'Seed access is disabled on this device right now.');
      return;
    }
    requireTwoFactor(() => attemptReveal(walletId), {
      title: opts.title || 'Reveal your recovery phrase',
    });
  }, [requireTwoFactor, attemptReveal, raspArtifact]);

  const submitReauth = async (entered) => {
    if (reauthPending || !pendingWalletId) return;
    setReauthPending(true);
    setReauthError('');
    try {
      const result = await verifyActiveCredentialDetailed(entered);
      if (result.bricked) {
        setReauthError('Verification unavailable — please re-lock and unlock the wallet.');
        return;
      }
      if (result.ok) {
        const walletId = pendingWalletId;
        setReauthValue('');
        resetReauth();
        attemptReveal(walletId); // lastAuthAtRef is now fresh — this call succeeds
        return;
      }
      const n = reauthAttempts + 1;
      setReauthAttempts(n);
      setReauthValue('');
      if (n >= REAUTH_CAP) {
        resetReauth();
        lock();
        return;
      }
      setReauthError(`Incorrect — try again (${REAUTH_CAP - n} left)`);
    } finally {
      setReauthPending(false);
    }
  };

  const authModel = getAuthModel();

  // Inline prompt markup — render wherever the caller wants the re-auth step to
  // appear (e.g. inside the same backup dialog the seed will show in).
  const reauthPrompt = pendingWalletId ? (
    <div className="space-y-3 p-4 rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">For your security, please unlock your wallet to reveal the recovery phrase</p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Your session timed out. Re-enter your {authModel === 'pin' ? 'PIN' : 'vault password'} to continue — the phrase will appear right after.
      </p>
      {reauthError && <p role="alert" aria-live="polite" className="text-[11px] text-destructive">{reauthError}</p>}
      {authModel === 'pin' ? (
        <PinPad
          aria-label="PIN entry"
          value={reauthValue}
          onChange={setReauthValue}
          onComplete={submitReauth}
          disabled={reauthPending}
          submitLabel="Unlock"
        />
      ) : (
        <Input
          type="password"
          autoComplete="off"
          autoFocus
          value={reauthValue}
          onChange={(e) => setReauthValue(e.target.value)}
          placeholder="Vault password"
          aria-label="Vault password to reveal recovery phrase"
          disabled={reauthPending}
          onKeyDown={(e) => { if (e.key === 'Enter' && reauthValue && !reauthPending) submitReauth(reauthValue); }}
        />
      )}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => { resetReauth(); toast.message('Backup cancelled — try again anytime.'); }} disabled={reauthPending}>
          Cancel
        </Button>
        {authModel !== 'pin' && (
          <Button
            className="flex-1 gap-2"
            onClick={() => submitReauth(reauthValue)}
            disabled={!reauthValue || reauthPending}
          >
            {reauthPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Unlock
          </Button>
        )}
      </div>
    </div>
  ) : null;

  return {
    revealWithReauth,
    reauthPrompt,
    isReauthPending: !!pendingWalletId,
    pendingWalletId,
    cancelReauth: resetReauth,
    gateModal,
  };
}
