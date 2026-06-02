// components/WalletEntry.jsx — the on-device auth front door (base44 removal,
// Phase 2). This is THE entry point for the local build: there is no hosted
// account, so the user's seed/vault is their identity. It renders one of three
// states, driven entirely by the on-device WalletProvider:
//
//   1. No vault on this device  -> first-run: Create new wallet (generate seed,
//      set vault password, back it up once) OR Import an existing seed phrase.
//      That IS the account — no email, no signup.
//   2. Vault exists but locked  -> Unlock (vault password; biometric/passkey run
//      inside unlock()). "Forgot password?" honestly routes to seed re-import
//      (recovery = restore from seed), NOT a custodial reset.
//   3. Unlocked                 -> this component is not shown (WalletGate renders
//      the app).
//
// It calls ONLY existing WalletProvider methods (createWallet / importWallet /
// unlock / hasVault) — no crypto is implemented here. The seed-backup and
// passkey-escape-hatch patterns mirror pages/HDWalletManager.jsx so behaviour is
// identical to the existing self-custody UI.

import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { toast } from "sonner";
import {
  Shield, Wallet, Lock, Unlock, KeyRound, Download, RefreshCw,
  Eye, EyeOff, Copy, Check, AlertTriangle, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import VeyrnoxLogo from "@/components/VeyrnoxLogo";
import { useWallet } from "@/lib/WalletProvider";
import { isPasskeyGateError } from "@/lib/passkey";

// Module-level so its identity is stable across WalletEntry re-renders — a
// component defined inside render would remount its subtree on every keystroke,
// dropping focus from the password/seed inputs.
function EntryShell({ error, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <VeyrnoxLogo size={56} className="mx-auto shadow-sm" />
          <h1 className="text-xl font-bold">Veyrnox</h1>
          <p className="text-sm text-muted-foreground">Your seed phrase is your account. We never hold your keys.</p>
        </div>
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default function WalletEntry() {
  const { isUnlocked, createWallet, importWallet, unlock, hasVault } = useWallet();

  // null until we know whether a vault exists; drives unlock vs first-run.
  const [vaultExists, setVaultExists] = useState(null);
  // first-run sub-view: 'choose' | 'generate' | 'import'. When a vault exists we
  // start on 'unlock'; "Forgot password?" switches to 'import' (seed recovery).
  const [view, setView] = useState("choose");

  const [unlockPassword, setUnlockPassword] = useState("");
  const [genPassword, setGenPassword] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [generatedSeed, setGeneratedSeed] = useState("");
  const [showSeed, setShowSeed] = useState(false);
  const [copied, setCopied] = useState(false);
  // SAST M-3 escape hatch: null until the passkey gate has actually FAILED on an
  // unlock attempt; then { reason } so we can offer a signposted password-only
  // unlock for a broken/deleted passkey. Never a default-visible "skip" button.
  const [passkeyFailed, setPasskeyFailed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // recovering = the user arrived at import via "Forgot password?" (vault exists);
  // we show recovery-specific copy and an explicit "no custodial reset" notice.
  const [recovering, setRecovering] = useState(false);

  // Probe for an existing vault on mount AND whenever the vault becomes locked
  // (e.g. after sign-out / auto-lock the app re-mounts this gate). Re-probing on
  // the locked transition resets the view to the canonical state for what's on
  // the device — so locking from inside the app returns to "Unlock", never a
  // stale create/import view. While already locked, manual view navigation is
  // preserved (this effect only fires on the isUnlocked transition).
  useEffect(() => {
    if (isUnlocked) return; // app is shown; nothing to gate
    let active = true;
    // Clear any transient input/error state carried over from a prior session.
    setUnlockPassword("");
    setError("");
    setPasskeyFailed(null);
    setRecovering(false);
    hasVault()
      .then(v => {
        if (!active) return;
        setVaultExists(v);
        setView(v ? "unlock" : "choose");
      })
      .catch(() => { if (active) { setVaultExists(false); setView("choose"); } });
    return () => { active = false; };
  }, [hasVault, isUnlocked]);

  const copySeed = () => {
    navigator.clipboard.writeText(generatedSeed);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ---- Unlock (mirrors HDWalletManager.runUnlock) ----
  const runUnlock = async (skipPasskey) => {
    setError(""); setBusy(true);
    try {
      const res = await unlock(unlockPassword, { skipPasskey });
      setUnlockPassword("");
      setPasskeyFailed(null);
      if (res?.passkeySkipped === "unavailable") {
        toast.warning("Passkey unavailable on this device — unlocked with your password only.");
      } else if (res?.passkeySkipped === "escape-hatch") {
        toast.warning("Unlocked with password only. Re-register your passkey in Security settings to restore the second factor.");
      }
      // On success, isUnlocked flips and WalletGate renders the app.
    } catch (e) {
      if (isPasskeyGateError(e)) {
        setPasskeyFailed({ reason: e.reason });
        setError(
          e.reason === "cancelled"
            ? "Passkey cancelled or unavailable. Try again, or unlock with your password if your passkey was removed from this device."
            : "Your passkey couldn't be used (it may have been removed from this device). Unlock with your password below."
        );
      } else {
        setError(e?.message || "Unlock failed");
      }
    } finally { setBusy(false); }
  };

  // ---- Create (mirrors HDWalletManager.handleGenerate) ----
  const handleGenerate = async () => {
    setError("");
    if (genPassword.length < 8) { setError("Choose a vault password of at least 8 characters."); return; }
    setBusy(true);
    try {
      const seed = await createWallet(genPassword); // returns mnemonic ONCE for backup
      setGeneratedSeed(seed);
      setShowSeed(false);
      setGenPassword("");
      // NOTE: createWallet already unlocked the vault. We stay on this screen to
      // force a seed backup; "I've backed it up" lets WalletGate render the app.
    } catch (e) { setError(e?.message || "Failed to create wallet"); }
    finally { setBusy(false); }
  };

  // ---- Import (mirrors HDWalletManager.handleImport) ----
  const handleImport = async () => {
    setError("");
    if (importPassword.length < 8) { setError("Choose a vault password of at least 8 characters."); return; }
    setBusy(true);
    try {
      await importWallet(importPhrase.trim(), importPassword); // validates BIP-39 checksum + unlocks
      setImportPhrase("");
      setImportPassword("");
      // isUnlocked flips -> app renders.
    } catch (e) { setError(e?.message || "Failed to import wallet"); }
    finally { setBusy(false); }
  };

  // Unlocked → reveal the app. The one exception is right after creating a new
  // wallet: the vault is already unlocked but `generatedSeed` is still set, so we
  // hold on the seed-backup screen below until the user confirms they've saved it.
  if (isUnlocked && !generatedSeed) return <Outlet />;

  // Initial probe in flight (only relevant while still locked).
  if (vaultExists === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // ---- View: Unlock existing vault ----
  if (view === "unlock") {
    return (
      <EntryShell error={error}>
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium"><Lock className="h-4 w-4 text-muted-foreground" /> Unlock your wallet</div>
          <Label>Vault Password</Label>
          <Input
            type="password"
            value={unlockPassword}
            onChange={e => setUnlockPassword(e.target.value)}
            placeholder="Enter your vault password"
            onKeyDown={e => { if (e.key === "Enter" && unlockPassword && !busy) runUnlock(false); }}
            autoFocus
          />
          <Button className="w-full gap-2" disabled={!unlockPassword || busy} onClick={() => runUnlock(false)}>
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />} Unlock
          </Button>

          {passkeyFailed && (
            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Can't use your passkey? If it was removed from this device or your
                authenticator is unavailable, unlock with your vault password alone.
                Your password still protects the wallet.
              </p>
              <Button variant="outline" className="w-full gap-2" disabled={!unlockPassword || busy} onClick={() => runUnlock(true)}>
                <KeyRound className="h-4 w-4" /> Unlock with password only
              </Button>
            </div>
          )}
        </div>

        {/* HONEST recovery: no custodial reset. A forgotten vault password is
            recovered ONLY by re-importing the seed phrase. */}
        <button
          type="button"
          onClick={() => { setError(""); setRecovering(true); setView("import"); }}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Forgot password? <span className="text-primary">Restore from seed phrase</span>
        </button>
      </EntryShell>
    );
  }

  // ---- View: First-run choose ----
  if (view === "choose") {
    return (
      <EntryShell error={error}>
        <div className="p-6 rounded-xl border border-dashed border-border bg-card text-center space-y-4">
          <Wallet className="h-8 w-8 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">No wallet on this device yet. Create a new self-custody wallet, or import an existing seed phrase. Your password encrypts it locally — keys never leave this device.</p>
          <div className="space-y-2">
            <Button className="w-full gap-2" onClick={() => { setError(""); setView("generate"); }}>
              <Shield className="h-4 w-4" /> Create a new wallet
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={() => { setError(""); setRecovering(false); setView("import"); }}>
              <Download className="h-4 w-4" /> Import an existing seed
            </Button>
          </div>
        </div>
      </EntryShell>
    );
  }

  // ---- View: Generate new wallet ----
  if (view === "generate") {
    return (
      <EntryShell error={error}>
        {!generatedSeed ? (
          <div className="space-y-4">
            <button type="button" onClick={() => { setError(""); setView("choose"); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
            <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive">
              Your seed phrase will be shown ONCE. Write it down and store it offline — anyone with it has full access to your funds, and it is the only way to recover this wallet.
            </div>
            <div>
              <Label>Vault Password</Label>
              <Input type="password" className="mt-1.5" value={genPassword} onChange={e => setGenPassword(e.target.value)} placeholder="Encrypts your new seed on this device" />
              <p className="text-xs text-muted-foreground mt-1">Encrypts the vault (Argon2id + AES-256-GCM). Minimum 8 characters.</p>
            </div>
            <Button className="w-full gap-2" disabled={busy} onClick={handleGenerate}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Generate 12-Word Phrase
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold">Your Seed Phrase (shown once)</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowSeed(s => !s)} className="p-1.5 text-muted-foreground hover:text-foreground">{showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  <button onClick={copySeed} className="p-1.5 text-muted-foreground hover:text-foreground">{copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}</button>
                </div>
              </div>
              {showSeed ? (
                <div className="grid grid-cols-3 gap-2">
                  {generatedSeed.split(" ").map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-xs">
                      <span className="text-muted-foreground w-4 text-right">{i + 1}.</span>
                      <span className="font-mono font-semibold">{w}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-20 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Tap the eye icon to reveal your seed phrase</p>
                </div>
              )}
            </div>
            <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground flex items-start gap-2">
              <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>Your wallet is created and unlocked. Back up your phrase before continuing — it is never shown again and we cannot recover it for you.</span>
            </div>
            <Button className="w-full gap-2" onClick={() => { setGeneratedSeed(""); setShowSeed(false); }}>
              <Check className="h-4 w-4" /> I've backed it up — Continue
            </Button>
          </div>
        )}
      </EntryShell>
    );
  }

  // ---- View: Import existing seed (also the seed-recovery path) ----
  return (
    <EntryShell error={error}>
      <div className="space-y-4">
        <button type="button" onClick={() => { setError(""); setView(vaultExists ? "unlock" : "choose"); setRecovering(false); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        {recovering && (
          <div className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-600 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>There is <b>no custodial password reset</b> — we never hold your keys. Restore access by re-importing your seed phrase and setting a new vault password. This replaces the local vault on this device with the same wallet.</span>
          </div>
        )}
        <div className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-500">
          Never share your seed phrase. It is validated and encrypted locally with your password — it is never sent to a server.
        </div>
        <div>
          <Label>12 or 24-word BIP-39 Seed Phrase</Label>
          <textarea value={importPhrase} onChange={e => setImportPhrase(e.target.value)} rows={3} placeholder="word1 word2 word3 ... word12" className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div>
          <Label>{recovering ? "New Vault Password" : "Vault Password"}</Label>
          <Input type="password" className="mt-1.5" value={importPassword} onChange={e => setImportPassword(e.target.value)} placeholder="Encrypts your seed on this device" />
          <p className="text-xs text-muted-foreground mt-1">Encrypts the vault (Argon2id + AES-256-GCM). Minimum 8 characters.</p>
        </div>
        <Button className="w-full gap-2" disabled={!importPhrase.trim() || !importPassword || busy} onClick={handleImport}>
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {recovering ? "Restore Wallet" : "Validate & Import"}
        </Button>
      </div>
    </EntryShell>
  );
}
