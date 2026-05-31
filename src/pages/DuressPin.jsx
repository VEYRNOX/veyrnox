// pages/DuressPin.jsx
//
// DURESS PIN / DECOY WALLET  (S3 — individual security).  PROVISIONAL.
//
// Lets the user configure a SECONDARY "duress" password. Entered at the normal
// unlock prompt, it opens a DECOY wallet (a real but separate, empty vault)
// instead of the real one — plausible deniability under coercion.
//
// This page routes through the EXISTING unlock flow (useWallet().unlock) and the
// existing keystore/crypto. The decoy is a real, separately-encrypted vault; see
// src/wallet-core/duress.js for the design and its honest limitations.
//
// DEMO vs NATIVE:
//   - The setup card (set / remove duress PIN) works everywhere.
//   - The "Live demonstration" card is DEMO-gated: it creates a throwaway real
//     vault + decoy in the browser's IndexedDB and exercises the REAL unlock
//     path so the decoy behaviour can be shown on the simulator. On native you
//     test by locking and unlocking with the duress password at the real unlock
//     screen.

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";
import {
  Shield, Eye, EyeOff, CheckCircle2, AlertTriangle, Lock, Unlock, FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Fixed demo credentials so the simulator walkthrough is one-click reproducible.
// DEMO ONLY — never used outside the demonstration panel.
const DEMO_REAL_PW = "real-pin-2468";
const DEMO_DURESS_PW = "duress-pin-1357";

function short(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

export default function DuressPin() {
  const wallet = useWallet();
  const {
    isUnlocked, isDecoy, accounts,
    hasVault, hasDuressPin, setDuressPin, removeDuressPin,
    createWallet, unlock, lock, clearVault,
  } = wallet;

  // ----- setup card state -----
  const [duressActive, setDuressActive] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedPhrase, setSavedPhrase] = useState(""); // decoy mnemonic shown once

  // ----- live demo state -----
  const [vaultExists, setVaultExists] = useState(false);
  const [realAddr, setRealAddr] = useState("");   // demo oracle: the real address
  const [tryPw, setTryPw] = useState("");
  const [tryErr, setTryErr] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    try { setDuressActive(await hasDuressPin()); } catch { /* noop */ }
    try { setVaultExists(await hasVault()); } catch { /* noop */ }
  }, [hasDuressPin, hasVault]);

  useEffect(() => { refresh(); }, [refresh]);

  // ----- setup handlers -----
  const handleSave = async () => {
    setError(""); setSavedPhrase("");
    if (pin.length < 4) { setError("Duress PIN must be at least 4 characters"); return; }
    if (pin !== confirmPin) { setError("PINs do not match"); return; }
    setSaving(true);
    try {
      const phrase = await setDuressPin(pin);
      setSavedPhrase(phrase);
      setPin(""); setConfirmPin("");
      await refresh();
    } catch (e) {
      setError(e?.message || "Could not save duress PIN");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try { await removeDuressPin(); setSavedPhrase(""); await refresh(); }
    finally { setSaving(false); }
  };

  // ----- demo handlers (use the REAL unlock path) -----
  const demoSetup = async () => {
    setBusy("Setting up demo…"); setTryErr("");
    try {
      // Create a throwaway REAL vault (idempotent: skip if one exists).
      if (!(await hasVault())) {
        await createWallet(DEMO_REAL_PW);
      }
      // Capture the real address as a demo "oracle" so we can later prove the
      // decoy session never exposes it. (Real apps never show this.)
      if (accounts?.[0]?.address) setRealAddr(accounts[0].address);
      // Configure the decoy.
      await setDuressPin(DEMO_DURESS_PW);
      lock();
      await refresh();
    } catch (e) {
      setTryErr(e?.message || "Demo setup failed");
    } finally {
      setBusy("");
    }
  };

  const demoUnlock = async (pw) => {
    setTryErr(""); setBusy("Unlocking…");
    try {
      await unlock(pw);
    } catch (e) {
      // SAME generic error whether or not a duress vault exists — no tell.
      setTryErr(e?.message || "Unlock failed");
    } finally {
      setBusy("");
    }
  };

  const demoReset = async () => {
    setBusy("Resetting…"); setTryErr("");
    try {
      lock();
      await clearVault();
      await removeDuressPin();
      setRealAddr("");
      await refresh();
    } finally {
      setBusy("");
    }
  };

  // Remember the real address the first time a non-decoy session exposes it.
  useEffect(() => {
    if (isUnlocked && !isDecoy && accounts?.[0]?.address) {
      setRealAddr(accounts[0].address);
    }
  }, [isUnlocked, isDecoy, accounts]);

  const currentAddr = accounts?.[0]?.address;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Duress PIN / Decoy Wallet</h1>
        <p className="text-sm text-muted-foreground">
          A secondary password that opens a decoy wallet under coercion.
        </p>
      </div>

      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-xs flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>Provisional (testnet).</b> Provides runtime deniability (identical UI,
          errors, and timing at unlock). It is not hidden-volume storage: a
          forensic inspection of device storage can reveal a second vault exists.
        </span>
      </div>

      {/* How it works */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">How it works</p>
            <p className="text-xs text-muted-foreground mt-1">
              Set a duress PIN that is different from your real one. If you are
              ever coerced into unlocking, enter the <b>duress PIN</b> at the
              normal unlock screen. The app opens a separate, empty <b>decoy
              wallet</b> with its own address. Your real wallet stays encrypted
              and is not referenced anywhere in the decoy session — to an
              observer there is no sign it exists.
            </p>
          </div>
        </div>
      </div>

      {/* Setup card */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {duressActive
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <AlertTriangle className="h-5 w-5 text-yellow-500" />}
            <span className="font-medium">
              {duressActive ? "Duress PIN is active" : "No Duress PIN set"}
            </span>
          </div>
          {duressActive && (
            <Button variant="destructive" size="sm" disabled={saving} onClick={handleRemove}>
              {saving ? "Removing…" : "Remove PIN"}
            </Button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <Label>New Duress PIN</Label>
            <div className="relative mt-1.5">
              <Input
                type={showPin ? "text" : "password"}
                maxLength={64}
                placeholder="At least 4 characters — different from your real PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="pr-10 tracking-widest text-lg"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPin((s) => !s)}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label>Confirm Duress PIN</Label>
            <Input
              type={showPin ? "text" : "password"}
              maxLength={64}
              placeholder="Re-enter PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className="mt-1.5 tracking-widest text-lg"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" disabled={!pin || !confirmPin || saving} onClick={handleSave}>
            {saving ? "Saving…" : duressActive ? "Update Duress PIN" : "Set Duress PIN"}
          </Button>
        </div>

        {savedPhrase && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs space-y-2">
            <p className="font-medium text-green-600">✓ Duress PIN saved. Decoy wallet created.</p>
            <p className="text-muted-foreground">
              Decoy recovery phrase (write it down if you want to fund the decoy
              wallet with a plausible small balance — otherwise it stays empty):
            </p>
            <code className="block break-words rounded bg-background p-2 text-foreground">{savedPhrase}</code>
          </div>
        )}
      </div>

      {/* Live demonstration — DEMO only */}
      {DEMO && (
        <div className="p-5 rounded-xl border border-dashed border-primary/40 bg-primary/5 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <span className="font-semibold">Live demonstration (demo mode)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Exercises the real unlock flow. Step 1 creates a throwaway real wallet
            (password <code>{DEMO_REAL_PW}</code>) and a decoy (duress password{" "}
            <code>{DEMO_DURESS_PW}</code>). Then unlock with either to compare.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={demoSetup}>
              1. Set up real + decoy
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_REAL_PW)}>
              <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock with REAL PIN
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_DURESS_PW)}>
              <Shield className="h-3.5 w-3.5 mr-1" /> Unlock with DURESS PIN
            </Button>
            {isUnlocked && (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5 mr-1" /> Lock
              </Button>
            )}
          </div>

          {/* Free-form unlock to prove a wrong PIN fails identically */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Or type any password</Label>
              <Input
                className="mt-1"
                value={tryPw}
                onChange={(e) => setTryPw(e.target.value)}
                placeholder="try the wrong password"
              />
            </div>
            <Button size="sm" disabled={!!busy || !tryPw || !vaultExists} onClick={() => demoUnlock(tryPw)}>
              Unlock
            </Button>
          </div>

          {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
          {tryErr && (
            <p className="text-xs text-destructive">
              {tryErr} <span className="text-muted-foreground">(same error for any non-matching password — no tell)</span>
            </p>
          )}

          {/* Result panel */}
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            {!isUnlocked ? (
              <p className="text-muted-foreground">Locked. Unlock above to see which wallet opens.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {isDecoy
                    ? <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-600 text-xs font-semibold">DECOY WALLET</span>
                    : <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-600 text-xs font-semibold">REAL WALLET</span>}
                </div>
                <p className="font-mono text-xs">Address: {short(currentAddr)}</p>
                <p className="text-xs text-muted-foreground">Testnet balance: 0 (empty)</p>
                {isDecoy ? (
                  <p className="text-xs text-muted-foreground">
                    This session exposes only the decoy address above. The real
                    wallet is not derived, named, or referenced here.
                  </p>
                ) : null}
                {/* DEMO ORACLE — proves the decoy never shows the real address.
                    Real apps never reveal this; shown here only to teach. */}
                {realAddr && (
                  <p className="text-[11px] text-muted-foreground/70 border-t border-border pt-2 mt-2">
                    demo oracle — real wallet address: {short(realAddr)}{" "}
                    {isDecoy && currentAddr !== realAddr ? "✓ hidden in this decoy session" : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          <Button size="sm" variant="destructive" disabled={!!busy} onClick={demoReset}>
            Reset demo (wipe vault + decoy)
          </Button>
        </div>
      )}

      {!DEMO && (
        <div className="p-4 rounded-xl bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground">
            To test: lock your wallet, then unlock with your duress PIN — the app
            opens the decoy wallet. ⚠️ Never share your Duress PIN. If you forget
            it, remove and reset it from this page using your normal login.
          </p>
        </div>
      )}
    </div>
  );
}
