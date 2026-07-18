// @ts-nocheck
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Fingerprint, ShieldCheck, AlertCircle, KeyRound } from "lucide-react";
import {
  isPasskeyRegistered,
  isWebAuthnSupported,
  verifyPasskeyAssertion,
  classifyPasskeyError,
} from "@/lib/passkey";

export default function QuickLock({ onUnlock }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // SAST M-1: shown only after the passkey assertion HARD-fails (broken/deleted
  // credential or authenticator error), so a genuinely-unusable passkey can't
  // trap the user on this screen — mirrors the vault unlock's M-3 escape hatch.
  const [recoverable, setRecoverable] = useState(false);

  // This is the dashboard's soft SCREEN lock (distinct from the vault unlock in
  // WalletProvider — the vault is already decrypted here). When a real passkey
  // is registered we require a genuine assertion against THAT credential; with
  // no passkey (or no WebAuthn) it degrades to an immediate unlock so the screen
  // is never bricked. It holds/derives no key material either way.
  //
  // SAST M-1 (fail-open fix): once we DECIDE to attempt an assertion (a passkey
  // is registered AND WebAuthn is supported), we no longer silently unlock on a
  // thrown error — that was a fail-open. A cancel stays locked (retry); a hard
  // failure (deleted credential / authenticator error) stays locked too but
  // reveals an explicit "Continue without passkey" recovery, justified ONLY
  // because this screen protects no secret (the vault is already decrypted).
  const handleUnlock = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isPasskeyRegistered() && isWebAuthnSupported()) {
        await verifyPasskeyAssertion(); // scoped to our credential; throws on cancel
      }
      // No passkey, or no WebAuthn API at all: nothing to assert against, so the
      // screen-lock degrades to an unlock (it guards no secret) — unchanged.
      onUnlock();
    } catch (err) {
      if (classifyPasskeyError(err) === "cancelled") {
        setError("Authentication was cancelled or denied. Try again.");
      } else {
        // Hard failure: the passkey could not be used. Fail CLOSED, but offer a
        // deliberate recovery so a broken passkey can't strand the dashboard.
        setError("Your passkey couldn't be used. It may have been removed from this device.");
        setRecoverable(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-background/95 backdrop-blur-md">
      <div className="flex flex-col items-center gap-5 text-center px-6">
        <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
          <Fingerprint className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold tracking-tight">Dashboard Locked</p>
          <p className="text-sm text-muted-foreground max-w-[220px]">
            Authenticate with Face ID, Touch ID, or your device PIN to view your balances.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <Button
          className="gap-2 px-8 h-11 text-base"
          onClick={handleUnlock}
          disabled={loading}
        >
          {loading ? (
            <>
              <div className="h-4 w-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full motion-safe:animate-spin" />
              Authenticating…
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" />
              Unlock with Biometrics
            </>
          )}
        </Button>

        {/* SAST M-1 recovery: only after a HARD passkey failure. This screen
            protects no secret (the vault is already decrypted), so continuing
            without the passkey here is safe — and necessary so a deleted/broken
            credential can't permanently trap the dashboard behind the blur. */}
        {recoverable && (
          <Button
            variant="outline"
            className="gap-2 px-6 h-10 text-sm"
            onClick={onUnlock}
            disabled={loading}
          >
            <KeyRound className="h-4 w-4" />
            Continue without passkey
          </Button>
        )}
      </div>
    </div>
  );
}