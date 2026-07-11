// pages/WalletAccessReset.jsx
//
// ACCOUNT ACCESS / RESET  (S1 — individual security).  PROVISIONAL (testnet).
//
// HONEST NON-CUSTODIAL DESIGN — read first:
//   Veyrnox does NOT hold your keys, so there is NO custodial "reset my password
//   and recover my account" path. That would be a lie. This page offers exactly
//   the two things a non-custodial wallet CAN honestly do, plus blunt messaging
//   about what it cannot:
//     1. CHANGE PASSWORD (while unlocked) — re-encrypt the existing vault under a
//        new password. Requires the current password; the seed never changes.
//        (WalletProvider.changePassword -> keyStore.changePassword, which is
//        decrypt-then-re-encrypt over the UNCHANGED Argon2id+AES-GCM crypto.)
//     2. RECOVER ACCESS via SEED PHRASE — if you forgot your vault password, you
//        recover by RE-IMPORTING your seed phrase (which you hold) and setting a
//        new password. This reuses the EXISTING import flow
//        (WalletProvider.importWallet), which overwrites the local vault.
//
// What this page deliberately does NOT do (and says so): no custodial reset, no
// email/SMS recovery of the WALLET, no server-side key escrow, no "we'll restore
// your access". There is no guardian / social-recovery restoration. If you lose
// BOTH your password AND your seed, the funds are unrecoverable — by design,
// because that is what self-custody means.
//
// DEMO vs NATIVE: the change-password and recovery cards work everywhere. The
// "Live demonstration" card is DEMO-gated and exercises the REAL change-password
// path on a throwaway vault so the behaviour (old password stops working, new
// one decrypts the same accounts) is provable on the simulator.

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";
import { getAuthModel } from "@/lib/authModel";
import { checkPinStrength } from "@/lib/pinStrength";
import PinPad from "@/components/security/PinPad";
import {
  KeyRound, ShieldCheck, ShieldOff, AlertTriangle, Eye, EyeOff, CheckCircle2,
  Lock, Unlock, RefreshCw, FlaskConical, Info, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Constant-time-ish PIN equality (mirrors WalletEntry.pinsEqual): compares every
// character so a mismatch's position is not leaked by early return timing.
function pinsEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Minimum vault-password length — matches the create/import flow (HDWalletManager).
const MIN_PW = 12;

// Fixed demo credentials so the simulator walkthrough is one-click reproducible.
// DEMO ONLY — never used outside the demonstration panel.
const DEMO_OLD_PW = "old-vault-pw-2468";
const DEMO_NEW_PW = "new-vault-pw-1357";

function short(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

export default function WalletAccessReset() {
  const {
    isUnlocked, accounts, hasVault, deriveAccounts,
    changePassword, importWallet, createWallet, unlock, lock, clearVault,
  } = useWallet();

  // Auth cohort: 'pin' devices (every real vault post-PR #651) get a PIN pad;
  // 'password' is the legacy free-text fallback, kept intact below.
  const isPin = getAuthModel() === "pin";

  const [vaultExists, setVaultExists] = useState(false);

  // ----- change-PIN card (PIN cohort) -----
  // 3-step machine mirroring WalletEntry pin-recover: current -> new -> confirm.
  const [pinStep, setPinStep] = useState("current"); // 'current' | 'new' | 'confirm'
  const [curPin, setCurPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinEntry, setPinEntry] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [pinDone, setPinDone] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  // ----- seed-recovery card (PIN cohort) -----
  const [recPinEntry, setRecPinEntry] = useState("");

  // ----- change-password card -----
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [cpBusy, setCpBusy] = useState(false);
  const [cpErr, setCpErr] = useState("");
  const [cpDone, setCpDone] = useState(false);

  // ----- seed-recovery card -----
  const [recPhrase, setRecPhrase] = useState("");
  const [recPw, setRecPw] = useState("");
  const [recBusy, setRecBusy] = useState(false);
  const [recErr, setRecErr] = useState("");

  // ----- live demo state -----
  const [demoBusy, setDemoBusy] = useState("");
  const [demoErr, setDemoErr] = useState("");
  const [demoLog, setDemoLog] = useState([]);
  const [demoAddr, setDemoAddr] = useState("");

  const refresh = useCallback(async () => {
    try { setVaultExists(await hasVault()); } catch { /* noop */ }
  }, [hasVault]);

  useEffect(() => { refresh(); }, [refresh, isUnlocked]);

  // ----- change password (while unlocked) -----
  const handleChangePassword = async () => {
    setCpErr(""); setCpDone(false);
    if (newPw.length < MIN_PW) { setCpErr(`Choose a new password of at least ${MIN_PW} characters.`); return; }
    if (newPw !== confirmPw) { setCpErr("New passwords do not match."); return; }
    if (newPw === curPw) { setCpErr("New password must differ from the current one."); return; }
    setCpBusy(true);
    try {
      // Verifies the current password (by decrypting the stored vault) and
      // re-encrypts the SAME seed under the new password. A wrong current
      // password throws and changes nothing.
      await changePassword(curPw, newPw);
      setCurPw(""); setNewPw(""); setConfirmPw("");
      setCpDone(true);
      toast.success("Vault password changed. Your old password no longer works.");
    } catch (e) {
      // decryptVault throws a deliberately generic message on a wrong current
      // password OR a tampered blob — surface it as-is (no oracle).
      setCpErr(e?.message || "Could not change password");
    } finally {
      setCpBusy(false);
    }
  };

  // ----- change PIN (PIN cohort, while unlocked) -----
  // Step machine: 'current' -> 'new' (strength-gated) -> 'confirm' (match-gated).
  // Only the final confirm calls changePassword(CUR_PIN, NEW_PIN). Fails closed:
  // a weak new PIN or a mismatched confirm never touches the vault.
  const handlePinComplete = async (p) => {
    setPinErr("");
    if (pinStep === "current") {
      setCurPin(p);
      setPinEntry("");
      setPinStep("new");
      return;
    }
    if (pinStep === "new") {
      const s = checkPinStrength(p);
      if (!s.ok) { setPinErr(s.reason); setPinEntry(""); return; } // stay on 'new'
      setNewPin(p);
      setPinEntry("");
      setPinStep("confirm");
      return;
    }
    if (pinStep === "confirm") {
      if (!pinsEqual(p, newPin)) {
        // Bounce back to the new-PIN step; nothing is changed.
        setPinErr("Those PINs didn't match. Choose your new PIN again.");
        setNewPin("");
        setConfirmPin("");
        setPinEntry("");
        setPinStep("new");
        return;
      }
      setConfirmPin(p);
      setPinBusy(true);
      try {
        // Verifies the current PIN by decrypting the stored vault, then re-encrypts
        // the SAME seed under the new PIN. A wrong current PIN throws, changing nothing.
        await changePassword(curPin, p);
        setCurPin(""); setNewPin(""); setConfirmPin(""); setPinEntry("");
        setPinStep("current");
        setPinDone(true);
        toast.success("PIN changed. Your old PIN no longer works.");
      } catch (e) {
        setPinErr(e?.message || "Could not change PIN");
        setPinStep("current");
      } finally {
        setPinBusy(false);
      }
    }
  };

  // ----- seed recovery (PIN cohort) -> re-import under a new PIN -----
  const handleRecoverPin = async (p) => {
    setRecErr("");
    setRecBusy(true);
    try {
      await importWallet(recPhrase.trim(), p);
      setRecPhrase(""); setRecPinEntry("");
      await refresh();
      toast.success("Wallet recovered from your seed phrase. A new PIN is set.");
    } catch (e) {
      setRecErr(e?.message || "Could not recover from that seed phrase");
    } finally {
      setRecBusy(false);
    }
  };

  // ----- seed recovery (forgot password -> re-import) -----
  const handleRecover = async () => {
    setRecErr("");
    if (recPw.length < MIN_PW) { setRecErr(`Choose a new password of at least ${MIN_PW} characters.`); return; }
    setRecBusy(true);
    try {
      // Reuses the EXISTING import flow. importWallet validates the BIP-39
      // checksum, encrypts the seed under the new password, and overwrites the
      // local vault — so the new password opens the same wallet from now on.
      await importWallet(recPhrase.trim(), recPw);
      setRecPhrase(""); setRecPw("");
      await refresh();
      toast.success("Wallet recovered from your seed phrase. A new vault password is set.");
    } catch (e) {
      setRecErr(e?.message || "Could not recover from that seed phrase");
    } finally {
      setRecBusy(false);
    }
  };

  // ----- live demonstration (DEMO only): exercise the REAL change-password path -----
  const pushLog = (line) => setDemoLog((l) => [...l, line]);

  const demoRun = async () => {
    setDemoBusy("Running…"); setDemoErr(""); setDemoLog([]); setDemoAddr("");
    try {
      // Start from a clean slate so the walkthrough is reproducible.
      lock();
      await clearVault();
      // 1. Create a throwaway real vault under the OLD demo password. We read the
      //    address from deriveAccounts()'s RETURN value (derived synchronously from
      //    the in-memory seed) rather than the `accounts` React state, which this
      //    callback's closure can't see updating mid-run.
      await createWallet(DEMO_OLD_PW);
      const addr = deriveAccounts(1)?.[0]?.address || "";
      setDemoAddr(addr);
      pushLog(`Created a vault (password "${DEMO_OLD_PW}"). Account: ${short(addr)}`);
      // 2. Change the password to the NEW demo password (same seed).
      await changePassword(DEMO_OLD_PW, DEMO_NEW_PW);
      pushLog(`Changed password to "${DEMO_NEW_PW}" (seed unchanged).`);
      // 3. Lock, then prove the OLD password no longer opens the vault.
      lock();
      try {
        await unlock(DEMO_OLD_PW);
        pushLog("⚠️ UNEXPECTED: old password still unlocked (should not happen).");
      } catch {
        pushLog('✓ Old password "' + DEMO_OLD_PW + '" is now REJECTED.');
      }
      // 4. Prove the NEW password opens the SAME account (same keys).
      lock();
      await unlock(DEMO_NEW_PW);
      const addr2 = deriveAccounts(1)?.[0]?.address || "";
      pushLog(`✓ New password unlocked the SAME account: ${short(addr2)}` +
        (addr && addr2 && addr === addr2 ? " (identical — keys unchanged)" : ""));
      await refresh();
    } catch (e) {
      setDemoErr(e?.message || "Demo failed");
    } finally {
      setDemoBusy("");
    }
  };

  const demoReset = async () => {
    setDemoBusy("Resetting…"); setDemoErr("");
    try {
      lock();
      await clearVault();
      setDemoLog([]); setDemoAddr("");
      await refresh();
    } finally {
      setDemoBusy("");
    }
  };

  const newAddr = accounts?.[0]?.address;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" /> Account Access &amp; Recovery
        </h1>
        <p className="text-sm text-muted-foreground">
          Change your vault password, or recover access with your seed phrase.
        </p>
      </div>

      {/* HONESTY BANNER — the non-custodial truth, stated up front. */}
      <div className="p-4 rounded-xl border border-caution/30 bg-caution/5 text-xs text-caution space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <b>No password reset here.</b> We never hold your keys. Your seed phrase is your only way back in. Lose both the password and seed = funds gone forever.
          </span>
        </div>
      </div>

      {/* CHANGE PIN — PIN cohort, while unlocked. Mirrors WalletEntry pin-recover:
          a 3-step PinPad flow (current -> new -> confirm). Only a match on confirm
          calls changePassword; a weak new PIN or a mismatch fails closed (I4). */}
      {isPin && (
        <div data-testid="change-credential-card" className="p-5 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Change your PIN</p>
              <p className="text-xs text-muted-foreground">
                Re-encrypts your existing vault under a new 8-digit PIN. Your seed and
                accounts stay exactly the same — only the PIN that unlocks them changes.
              </p>
            </div>
          </div>

          {!isUnlocked ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/40 border border-border text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Unlock your wallet first. Changing the PIN requires the current one to verify you own it.
              </span>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              {pinStep === "current" && (
                <p className="text-sm font-medium">Enter your current PIN</p>
              )}
              {pinStep === "new" && (
                <p className="text-sm font-medium">Choose a new 8-digit PIN</p>
              )}
              {pinStep === "confirm" && (
                <p className="text-sm font-medium">Confirm your new PIN</p>
              )}
              <PinPad
                key={pinStep}
                value={pinEntry}
                disabled={pinBusy}
                onChange={(v) => { setPinEntry(v); if (pinErr) setPinErr(""); }}
                onComplete={handlePinComplete}
                submitLabel={pinStep === "confirm" ? "Change PIN" : "Continue"}
              />
              {pinErr && <p className="text-xs text-destructive">{pinErr}</p>}
              {pinDone && (
                <p className="text-xs text-success flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> PIN changed. Use your new PIN
                  next time you unlock.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Re-encrypts with the same strong on-device encryption as the original
                vault. Note: this changes only your <b>primary</b> wallet's PIN; any
                duress PIN or hidden-wallet secrets are independent and unchanged.
              </p>
            </div>
          )}
        </div>
      )}

      {/* CHANGE PASSWORD — legacy password cohort, while unlocked. */}
      {!isPin && (
      <div data-testid="change-credential-card" className="p-5 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Change vault password</p>
            <p className="text-xs text-muted-foreground">
              Re-encrypts your existing vault under a new password. Your seed and
              accounts stay exactly the same — only the password that unlocks them
              changes.
            </p>
          </div>
        </div>

        {!isUnlocked ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/40 border border-border text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Unlock your wallet first to verify you own the current password. Then return here to set a new one.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Current password</Label>
              <div className="relative mt-1.5">
                <Input
                  type={showPw ? "text" : "password"}
                  value={curPw}
                  onChange={(e) => setCurPw(e.target.value)}
                  placeholder="Your current vault password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Hide passwords" : "Show passwords"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>New password</Label>
              <Input
                type={showPw ? "text" : "password"}
                className="mt-1.5"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder={`At least ${MIN_PW} characters`}
              />
              <p className="text-xs text-muted-foreground mt-1">At least 12 characters · any characters allowed</p>
            </div>
            <div>
              <Label>Confirm new password</Label>
              <Input
                type={showPw ? "text" : "password"}
                className="mt-1.5"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Re-enter the new password"
              />
              <p className="text-xs text-muted-foreground mt-1">Must match your new password</p>
            </div>
            {cpErr && <p className="text-xs text-destructive">{cpErr}</p>}
            {cpDone && (
              <p className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Password changed. Use your new
                password next time you unlock.
              </p>
            )}
            <Button
              className="w-full gap-2"
              disabled={!curPw || !newPw || !confirmPw || cpBusy}
              onClick={handleChangePassword}
            >
              {cpBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Change password
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Re-encrypts with the same strong on-device encryption as the
              original vault. Note: this changes only your <b>primary</b> wallet's
              password; any duress PIN or hidden-wallet secrets are independent and
              unchanged.
            </p>
          </div>
        )}
      </div>
      )}

      {/* RECOVER ACCESS — forgot credential -> re-import seed. Shared card; the
          new-credential surface below branches on the auth cohort. */}
      <div data-testid="recover-card" className="p-5 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Forgot your password? Recover with your seed phrase</p>
            <p className="text-xs text-muted-foreground">
              The only way back into a wallet whose password you've lost is to
              re-import the seed phrase you backed up, and set a new password. This
              replaces the local vault with one encrypted under the new password.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg border border-caution/30 bg-caution/5 text-xs text-caution">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Type your seed phrase only on devices you trust. It's encrypted locally, never leaves this phone, but anyone with it has full access to your funds.
          </span>
        </div>

        <div>
          <Label>12 or 24-word recovery phrase</Label>
          <textarea
            value={recPhrase}
            onChange={(e) => setRecPhrase(e.target.value)}
            rows={3}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="word1 word2 word3 … word12"
            className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {isPin ? (
          // PIN cohort: once a seed is present, set a new PIN via the PIN pad.
          // The PIN pad's own strength/decoy handling runs downstream; the recovery
          // path re-imports under the new PIN.
          recPhrase.trim() ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Set a new 8-digit PIN</p>
              <p className="text-xs text-muted-foreground">
                This encrypts your restored wallet on this device.
              </p>
              <PinPad
                value={recPinEntry}
                disabled={recBusy}
                onChange={(v) => { setRecPinEntry(v); if (recErr) setRecErr(""); }}
                onComplete={handleRecoverPin}
                submitLabel="Recover"
              />
              {recErr && <p className="text-xs text-destructive">{recErr}</p>}
            </div>
          ) : (
            recErr ? <p className="text-xs text-destructive">{recErr}</p> : null
          )
        ) : (
        <>
        <div>
          <Label>New vault password</Label>
          <Input
            type="password"
            className="mt-1.5"
            value={recPw}
            onChange={(e) => setRecPw(e.target.value)}
            placeholder={`Encrypts your seed on this device — at least ${MIN_PW} characters`}
          />
          <p className="text-xs text-muted-foreground mt-1">At least 12 characters · any characters allowed</p>
        </div>
        {recErr && <p className="text-xs text-destructive">{recErr}</p>}
        <Button
          variant="outline"
          className="w-full gap-2"
          disabled={!recPhrase.trim() || !recPw || recBusy}
          onClick={handleRecover}
        >
          {recBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Recover &amp; set new password
        </Button>
        </>
        )}
        {vaultExists && (
          <p className=”text-[11px] text-muted-foreground flex items-start gap-1.5”>
            <Info className=”h-3.5 w-3.5 mt-0.5 shrink-0” />
            A wallet already exists here. Recovering will <b>overwrite</b> it. If you remember your password, use “Change vault password” instead.
          </p>
        )}
      </div>

      {/* WHAT WE CANNOT DO — explicit, so no false expectation of custodial reset. */}
      <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">What VEYRNOX cannot do</p>
        </div>
        <ul className=”text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5”>
          <li>No password reset — we never see it.</li>
          <li>No email/SMS recovery link. We have nothing on our servers to recover.</li>
          <li>No key escrow. Support cannot restore access.</li>
          <li>Lose both password and seed = funds gone permanently.</li>
          <li>No guardian or social recovery.</li>
        </ul>
      </div>

      {/* LIVE DEMONSTRATION — DEMO only. */}
      {DEMO && (
        <div className="p-5 rounded-xl border border-dashed border-primary/40 bg-primary/5 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <span className="font-semibold">Live demonstration (demo mode)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Exercises the REAL change-password path on a throwaway vault: create a
            vault (password <code>{DEMO_OLD_PW}</code>), change it to{" "}
            <code>{DEMO_NEW_PW}</code>, then prove the old password is rejected and
            the new one opens the very same account (the keys never changed).
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!demoBusy} onClick={demoRun}>
              Run change-password walkthrough
            </Button>
            {isUnlocked && (
              <Button size="sm" variant="ghost" disabled={!!demoBusy} onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5 mr-1" /> Lock
              </Button>
            )}
            <Button size="sm" variant="destructive" disabled={!!demoBusy} onClick={demoReset}>
              Reset demo (wipe vault)
            </Button>
          </div>

          {demoBusy && <p className="text-xs text-muted-foreground">{demoBusy}</p>}
          {demoErr && <p className="text-xs text-destructive">{demoErr}</p>}

          {(demoLog.length > 0 || demoAddr) && (
            <div className="rounded-lg border border-border bg-card p-4 text-xs space-y-1.5">
              <div className="flex items-center gap-2 mb-1">
                {isUnlocked
                  ? <span className="px-2 py-0.5 rounded bg-success/20 text-success text-[11px] font-semibold inline-flex items-center gap-1"><Unlock className="h-3 w-3" /> UNLOCKED</span>
                  : <span className="px-2 py-0.5 rounded bg-secondary text-muted-foreground text-[11px] font-semibold inline-flex items-center gap-1"><Lock className="h-3 w-3" /> LOCKED</span>}
                {isUnlocked && newAddr && <span className="font-mono text-muted-foreground">{short(newAddr)}</span>}
              </div>
              {demoLog.map((line, i) => (
                <p key={i} className="font-mono leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {!DEMO && (
        <div className="p-4 rounded-xl bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground">
            <b>Change password:</b> unlock, enter current password + new one. <b>Forgot it?</b> Paste your seed phrase and set a new password — that's the only way back.
          </p>
        </div>
      )}
    </div>
  );
}
