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
import {
  KeyRound, ShieldCheck, ShieldOff, AlertTriangle, Eye, EyeOff, CheckCircle2,
  Lock, Unlock, RefreshCw, FlaskConical, Info, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Minimum vault-password length — matches the create/import flow (HDWalletManager).
const MIN_PW = 8;

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

  const [vaultExists, setVaultExists] = useState(false);

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
      <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-600 space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <b>We cannot reset your password or recover your wallet for you.</b> Veyrnox
            is non-custodial — we never hold your keys, so there is nothing on a
            server to restore. Your <b>seed phrase is the only recovery path</b>.
            If you lose <b>both</b> your password <b>and</b> your seed phrase, your
            funds are <b>unrecoverable</b>. That is what self-custody means.
          </span>
        </div>
      </div>

      {/* CHANGE PASSWORD — while unlocked. */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
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
              Unlock your wallet first to change its password. Open the{" "}
              <b>HD Wallet Manager</b> and unlock, then return here. (Changing the
              password requires knowing the current one — that is the point.)
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
            </div>
            {cpErr && <p className="text-xs text-destructive">{cpErr}</p>}
            {cpDone && (
              <p className="text-xs text-green-600 flex items-center gap-1.5">
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

      {/* RECOVER ACCESS — forgot password -> re-import seed. */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
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

        <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-600">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Never type your seed phrase anywhere you don't trust. It is validated and
            encrypted locally — it never leaves this device. Anyone with this phrase
            has full access to your funds.
          </span>
        </div>

        <div>
          <Label>12 or 24-word recovery phrase</Label>
          <textarea
            value={recPhrase}
            onChange={(e) => setRecPhrase(e.target.value)}
            rows={3}
            placeholder="word1 word2 word3 … word12"
            className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <Label>New vault password</Label>
          <Input
            type="password"
            className="mt-1.5"
            value={recPw}
            onChange={(e) => setRecPw(e.target.value)}
            placeholder={`Encrypts your seed on this device — at least ${MIN_PW} characters`}
          />
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
        {vaultExists && (
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            A wallet already exists on this device. Recovering will <b>overwrite</b>{" "}
            the local vault with the seed you enter. If you still know your current
            password, use “Change vault password” above instead.
          </p>
        )}
      </div>

      {/* WHAT WE CANNOT DO — explicit, so no false expectation of custodial reset. */}
      <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">What Veyrnox cannot do</p>
        </div>
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
          <li>We cannot reset or recover your vault password — we never see it.</li>
          <li>We cannot email or text you a link to recover your wallet. There is nothing on our servers to recover; we hold only ciphertext we cannot decrypt.</li>
          <li>We have no key escrow and no “master key”. Support cannot restore access.</li>
          <li>If you lose both your password and your seed phrase, your funds are gone permanently.</li>
          <li>We do <b>not</b> offer guardian or social-recovery restoration of your wallet.</li>
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
                  ? <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-600 text-[11px] font-semibold inline-flex items-center gap-1"><Unlock className="h-3 w-3" /> UNLOCKED</span>
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
            To change your password: unlock your wallet, enter your current password
            and a new one above. To recover after forgetting your password: paste
            your seed phrase and choose a new password — there is no other way in,
            because only you hold the seed.
          </p>
        </div>
      )}
    </div>
  );
}
