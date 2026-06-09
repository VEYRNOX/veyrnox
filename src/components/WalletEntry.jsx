// components/WalletEntry.jsx — the on-device auth front door (base44 removal,
// Phase 2; streamlined onboarding). This is THE entry point for the local build:
// there is no hosted account, so the user's seed/vault is their identity. It
// renders one of three states, driven entirely by the on-device WalletProvider:
//
//   1. No vault on this device  -> FIRST-RUN, minimized to the fewest screens
//      that still secure the wallet:
//        a. ONE choice: Create a new wallet OR Import an existing seed.
//        b. ONE security screen (the password + seed-backup step is MANDATORY and
//           never deferred — there is no funded-but-unprotected state):
//             - Create : set vault password + Generate, then the seed is shown
//               ONCE and must be confirmed ("I've backed it up").
//             - Import : enter seed + set vault password.
//           The OPTIONAL "Enable Face ID for next time" offer is folded ONTO this
//           same screen (skippable; off by default) — no separate step.
//        -> Dashboard.
//   2. Vault exists but locked  -> RETURNING USER. Face ID / biometric is the
//      prominent one-tap entry; the vault PASSWORD is always the reachable
//      fallback (Face ID off/failed/unavailable -> "Enter your vault password").
//      The fallback is the real Argon2id-protected secret — there is NO weak
//      numeric PIN that can unlock the vault on its own. "Forgot password?"
//      honestly routes to seed re-import (recovery = restore from seed).
//   3. Unlocked                 -> this component is not shown (WalletGate renders
//      the app).
//
// SECURITY MODEL (unchanged): the vault password is THE secret; biometric is a
// CONVENIENCE gate over the existing vault (lib/biometricUnlock.js caches the
// password behind the biometric gate; the password always works as the fallback).
// No crypto is implemented here — it calls only WalletProvider methods
// (createWallet / importWallet / unlock / unlockWithBiometric / enableBiometricUnlock
// / hasVault). In the legacy PASSWORD cohort, advanced security (duress / stealth /
// panic) is set up in-app later and never appears in onboarding. In the v1 PIN
// cohort it is different: onboarding provisions a real PIN, a duress PIN + decoy,
// and an OPTIONAL panic PIN (so Face-ID-to-decoy is live from day one); stealth/
// hidden remains an in-app, post-onboarding feature.
//
// ── v1 PIN AUTH (UNAUDITED-PROVISIONAL) ──────────────────────────────────────
// THREAT MODEL: v1 is SOFTWARE key derivation. It resists OBSERVED coercion —
// Face ID and the duress PIN both yield the surrendered decoy; the panic PIN
// wipes; and no 6-digit PIN produces an error-state oracle (Option A) or a timing
// oracle (the 4th constant KDF slot, deniabilityUnlock.js). It does NOT fully
// resist OFFLINE analysis of a SEIZED device: a 6-digit PIN (10^6) over Argon2id
// is exhaustible offline in hours-days, and the PIN path cannot raise Argon2id
// without diverging from the shared stealth-chaff params (a deniability tell) —
// flagged as the #1 audit line-item, not patched here. Hardware binding (the KEK
// layer) is the planned fast-follow that closes the offline gap. KNOWN LIMIT:
// under repeated LIVE probing the configured lived-in decoy stands out from empty
// Option-A fallbacks — accepted for v1 (see docs/superpowers/specs/2026-06-08-
// v1-pin-auth-ux-design.md §7).

import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { toast } from "sonner";
import {
  Shield, Wallet, Lock, Unlock, KeyRound, Download, RefreshCw,
  Eye, EyeOff, Copy, Check, AlertTriangle, ArrowLeft, Fingerprint, ScanFace,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import VeyrnoxLogo, { VeyrnoxWordmark } from "@/components/VeyrnoxLogo";
import { useWallet } from "@/lib/WalletProvider";
import { isPasskeyGateError } from "@/lib/passkey";
import {
  isBiometricGateError,
  isBiometricUnlockEnabled,
  getBiometricStatus,
} from "@/lib/biometric";
import { hasStoredUnlockSecret } from "@/lib/biometricUnlock";
import PinPad from "@/components/security/PinPad";
import { getAuthModel, setAuthModel } from "@/lib/authModel";
import { getOrCreateDeviceSalt } from "@/wallet-core/decoyFallback";
import { provisionPinRecovery } from "@/lib/pinRecovery";
import { validateMnemonic } from "@/wallet-core/mnemonic";

// Module-level so its identity is stable across WalletEntry re-renders — a
// component defined inside render would remount its subtree on every keystroke,
// dropping focus from the password/seed inputs.
function EntryShell({ error, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <VeyrnoxLogo size={56} className="mx-auto" />
          <VeyrnoxWordmark className="text-xl block" />
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

// The OPTIONAL "Enable Face ID for next time" offer, folded onto the security
// screen (create + import) so onboarding stays at one security step. Module-level
// to keep input focus stable. Toggling here only records the user's intent — the
// actual biometric prompt + password cache happens on submit, so there is just
// ONE prompt. Off by default; fully skippable. On a platform with no biometric
// (plain web) it renders an honest note and the user simply continues.
function BiometricOffer({ status, enabled, onToggle }) {
  if (!status) return null;
  const label = status.label || "biometric";
  if (!status.available) {
    return (
      <div className="p-3 rounded-xl border border-border bg-secondary/30 text-xs text-muted-foreground flex items-start gap-2">
        <Fingerprint className="h-4 w-4 shrink-0 mt-0.5" />
        <span>{status.detail || "Biometric unlock isn't available here. Your vault password protects your wallet; you can enable biometrics later on a supported device."}</span>
      </div>
    );
  }
  return (
    <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-secondary/30 cursor-pointer">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-primary"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="text-xs">
        <span className="font-medium text-foreground flex items-center gap-1.5">
          <Fingerprint className="h-3.5 w-3.5 text-primary" /> Enable {label} unlock for next time
        </span>
        <span className="block text-muted-foreground mt-0.5">
          One tap to unlock next time. Your vault password still works any time
          {" "}{label} fails or is unavailable — it stays your real key.
        </span>
      </span>
    </label>
  );
}

// EXPLORE-MODE SHELL — renders the real app (Outlet) VIEW-ONLY behind a
// persistent, non-dismissable "Create or import a wallet" CTA. There is nothing
// to authenticate (no vault exists), so this is genuinely no-auth browsing; any
// wallet-requiring action calls requireWallet() which leaves explore and shows
// the create/import flow.
function ExploreShell({ onCreate, children }) {
  return (
    <div className="min-h-screen">
      {children}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-primary" /> Exploring — view only</p>
            <p className="text-[11px] text-muted-foreground truncate">No wallet yet. Create or import one to send, receive, and hold funds.</p>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={onCreate}>
            <Wallet className="h-3.5 w-3.5" /> Create or import
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function WalletEntry() {
  const {
    isUnlocked, createWallet, importWallet, unlock, hasVault,
    enableBiometricUnlock, unlockWithBiometric,
    exploreMode, enterExplore, leaveExplore, confirmWalletBackup,
    setDuressPin, setPanicPin,
  } = useWallet();

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
  // BIOMETRIC escape hatch (dual of passkeyFailed): true once a biometric unlock
  // attempt has FAILED/been cancelled, so we show the password-only path. The
  // vault password is still required, so this is NEVER a weaker path.
  const [biometricFailed, setBiometricFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Biometric availability for THIS platform (resolved once on mount). Drives the
  // onboarding offer and the returning-user one-tap button label.
  const [bioStatus, setBioStatus] = useState(null);
  // The user's onboarding intent to enable Face ID (applied on submit). Off by default.
  const [bioEnabled, setBioEnabled] = useState(false);
  // RETURNING USER: true only when biometric unlock is enabled AND a cached
  // password is actually present — so we show the one-tap Face ID button only
  // when it can really work (never a dead button after enabling without a cache).
  const [bioReady, setBioReady] = useState(false);
  // recovering = the user arrived at import via "Forgot password?" (vault exists);
  // we show recovery-specific copy and an explicit "no custodial reset" notice.
  const [recovering, setRecovering] = useState(false);

  // Transiently holds the just-set vault password between "Generate" and the
  // "Enable Face ID" decision on the SAME screen, so we can cache it for biometric
  // unlock if the user opts in. Wiped immediately after onboarding completes. A
  // ref (not state) so it is never copied into a render snapshot.
  const createdPasswordRef = useRef(null);

  // v1 PIN cohort. authModel is read once the vault-existence probe resolves.
  const [authModel, setAuthModelState] = useState("password");
  // PIN onboarding sub-steps: 'real' -> 'real-confirm' -> 'duress' -> 'panic' ->
  // (backup screen, gated by generatedSeed). Returning PIN users enter on the pad.
  // PIN RECOVERY (§4) reuses these same steps but adds a 'seed' step at the front
  // (enter the recovery phrase) and seeds the wallet from it instead of generating.
  const [pinStep, setPinStep] = useState("real");
  // The validated recovery phrase held across the PIN-recovery steps (§4). Lives
  // only until finishPinRecover consumes it; wiped on success/abandon.
  const [recoverySeed, setRecoverySeed] = useState("");
  const [realPin, setRealPin] = useState("");
  const [realPinConfirm, setRealPinConfirm] = useState("");
  const [duressPin, setDuressPin_] = useState("");
  const [panicPin, setPanicPin_] = useState("");
  const [unlockPin, setUnlockPin] = useState("");
  // Hold the chosen duress PIN across onboarding so we can cache it for Face ID
  // (Face-ID-to-decoy) at the end. A ref so it never lands in a render snapshot.
  const duressPinRef = useRef("");

  // Resolve biometric availability once on mount (cheap; used by both the
  // onboarding offer and the returning one-tap button).
  useEffect(() => {
    let active = true;
    getBiometricStatus().then(s => { if (active) setBioStatus(s); }).catch(() => { if (active) setBioStatus(null); });
    return () => { active = false; };
  }, []);

  // Probe for an existing vault on mount AND whenever the vault becomes locked
  // (e.g. after sign-out / auto-lock the app re-mounts this gate). Re-probing on
  // the locked transition resets the view to the canonical state for what's on
  // the device. Also resolves whether one-tap Face ID can run (toggle on + a
  // cached password present).
  useEffect(() => {
    if (isUnlocked) return; // app is shown; nothing to gate
    let active = true;
    setUnlockPassword("");
    setError("");
    setPasskeyFailed(null);
    setBiometricFailed(false);
    setRecovering(false);
    hasVault()
      .then(async v => {
        if (!active) return;
        setVaultExists(v);
        setAuthModelState(getAuthModel());
        setView(v ? "unlock" : "choose");
        // EXPLORE-FIRST: with NO vault, default to view-only explore mode so the
        // first open is the real app (honest $0 empty states), not a wall. A
        // returning user (vault exists) never explores — they get the unlock gate.
        if (!v) enterExplore();
        if (v && isBiometricUnlockEnabled()) {
          try { setBioReady(await hasStoredUnlockSecret()); }
          catch { setBioReady(false); }
        } else {
          setBioReady(false);
        }
      })
      .catch(() => { if (active) { setVaultExists(false); setView("choose"); setBioReady(false); } });
    return () => { active = false; };
  }, [hasVault, isUnlocked]);

  const copySeed = () => {
    navigator.clipboard.writeText(generatedSeed);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ---- Returning user: one-tap biometric unlock ----
  // Satisfies the biometric gate, retrieves the cached vault password, and
  // unlocks. On any failure we fail closed and reveal the password fallback (the
  // password is the real key and always works).
  const handleBiometricUnlock = async () => {
    setError(""); setBusy(true);
    try {
      await unlockWithBiometric(); // success → isUnlocked flips → app renders
    } catch (e) {
      setBiometricFailed(true);
      if (isBiometricGateError(e)) {
        setError(
          e.reason === "unavailable"
            ? "Face ID is unavailable on this device. Enter your vault password below."
            : "Face ID didn't work. Enter your vault password below — it's your real key and always works."
        );
      } else {
        setError(e?.message || "Unlock failed. Enter your vault password below.");
      }
    } finally { setBusy(false); }
  };

  // ---- Unlock with the typed vault password (the always-available fallback) ----
  // opts: { skipPasskey, skipBiometric } — escape hatches, each only ever set by
  // the explicit "Unlock with password only" buttons surfaced AFTER the matching
  // gate has failed. Both still require the correct vault password below.
  const runUnlock = async (opts = {}) => {
    setError(""); setBusy(true);
    try {
      const res = await unlock(unlockPassword, opts);
      setUnlockPassword("");
      setPasskeyFailed(null);
      setBiometricFailed(false);
      if (res?.passkeySkipped === "unavailable") {
        toast.warning("Passkey unavailable on this device — unlocked with your password only.");
      } else if (res?.passkeySkipped === "escape-hatch") {
        toast.warning("Unlocked with password only. Re-register your passkey in Security settings to restore the second factor.");
      }
      if (res?.biometricSkipped === "escape-hatch") {
        toast.warning("Unlocked with your vault password. Re-enable biometric unlock in Security settings when it's working again.");
      }
    } catch (e) {
      if (isPasskeyGateError(e)) {
        setPasskeyFailed({ reason: e.reason });
        setError(
          e.reason === "cancelled"
            ? "Passkey cancelled or unavailable. Try again, or unlock with your password if your passkey was removed from this device."
            : "Your passkey couldn't be used (it may have been removed from this device). Unlock with your password below."
        );
      } else if (isBiometricGateError(e)) {
        setBiometricFailed(true);
        setError("Biometric authentication failed or was cancelled. Unlock with your vault password below.");
      } else {
        setError(e?.message || "Unlock failed");
      }
    } finally { setBusy(false); }
  };

  // Returning PIN user: submit the 6-digit PIN. pinModel:true enables Option A
  // (a non-enrolled PIN opens a deterministic empty decoy — never an error).
  const runPinUnlock = async (pin) => {
    setError(""); setBusy(true);
    try {
      await unlock(pin, { pinModel: true });
      setUnlockPin("");
    } catch (e) {
      // With Option A a valid 6-digit PIN never throws for "wrong PIN"; a throw
      // here is an infra/gate failure. Clear the pad and show a neutral message.
      setUnlockPin("");
      setError(e?.message || "Couldn't unlock. Try again.");
    } finally { setBusy(false); }
  };

  // Finish PIN onboarding (PROVISION phase): create the real wallet under the real
  // PIN, provision a lived-in decoy under the duress PIN (so Face-ID-to-decoy works
  // from day one), optionally set a panic PIN, mark the cohort, and seed the device
  // salt. The Face-ID-to-decoy enrolment decision is made on the NEXT (seed-backup)
  // screen via BiometricOffer and applied in finishPinBackup — so that toggle is
  // actually functional (it renders AFTER this runs). The transient plaintext PIN
  // React states are wiped here as soon as the vault layer has consumed them
  // (parity with finishCreate's createdPasswordRef hygiene); duressPinRef survives
  // to the backup screen because Face-ID caches the DURESS PIN there, never the real.
  const finishPinCreate = async () => {
    setBusy(true);
    try {
      const seed = await createWallet(realPin);          // real wallet, real PIN
      await setDuressPin(duressPinRef.current);          // decoy under duress PIN
      if (panicPin) { try { await setPanicPin(panicPin); } catch { /* optional */ } }
      setAuthModel("pin");                               // select PIN surface + Option A
      getOrCreateDeviceSalt();                           // seed the deterministic-decoy salt
      setRealPin(""); setRealPinConfirm(""); setDuressPin_(""); setPanicPin_(""); // wipe transient PINs
      setGeneratedSeed(seed);  // hold on the mandatory backup screen
      setShowSeed(false);
    } catch (e) { setError(e?.message || "Failed to create wallet"); }
    finally { setBusy(false); }
  };

  // Seed-backup screen action (PIN cohort): confirm the mandatory backup, apply the
  // Face-ID-to-decoy enrolment the user chose via BiometricOffer (caches the DURESS
  // PIN, NEVER the real PIN), wipe the last live PIN ref, and enter the wallet (the
  // vault is already unlocked, so clearing generatedSeed lets the Outlet render).
  const finishPinBackup = async () => {
    setBusy(true);
    try {
      confirmWalletBackup();
      if (bioEnabled && bioStatus?.available) {
        const ok = await enableBiometricUnlock(duressPinRef.current);
        if (!ok) toast.warning("Face ID wasn't enabled — your PIN is always your way in.");
      }
    } finally {
      duressPinRef.current = ""; // wipe the last live PIN string
      setGeneratedSeed("");
      setShowSeed(false);
      setBusy(false);
    }
  };

  // ---- PIN recovery (§4): forgot PIN -> restore seed, RE-PROVISION into the PIN
  // cohort (NOT password). Mirrors finishPinCreate but seeds the wallet from the
  // imported phrase, so the post-recovery entry surface is the identical PIN pad a
  // non-recovered user sees — closing the cohort-transition leak the old recovery
  // (handleImport -> setAuthModel("password")) introduced. No seed-backup screen:
  // the user just supplied the seed. importWallet (inside provisionPinRecovery)
  // unlocks the vault, so on success the Outlet renders the app. Fail-closed: a bad
  // phrase throws BEFORE any cohort/slot change, leaving the existing PIN vault intact.
  const finishPinRecover = async (panicValue) => {
    setBusy(true);
    try {
      await provisionPinRecovery(
        { importWallet, setDuressPin, setPanicPin, setAuthModel, getOrCreateDeviceSalt },
        { seed: recoverySeed, realPin, duressPin: duressPinRef.current, panicPin: panicValue },
      );
      setAuthModelState("pin"); // keep the component's cohort state in sync (parity with handleImport)
      setRecoverySeed(""); setRealPin(""); setRealPinConfirm(""); setDuressPin_(""); setPanicPin_("");
      duressPinRef.current = "";
      setRecovering(false);
    } catch (e) {
      setError(e?.message || "Couldn't restore from that seed phrase");
    } finally { setBusy(false); }
  };

  // ---- Create: generate the wallet (vault password mandatory) ----
  const handleGenerate = async () => {
    setError("");
    if (genPassword.length < 8) { setError("Choose a vault password of at least 8 characters."); return; }
    setBusy(true);
    try {
      // Stash the password so we can cache it for Face ID if the user opts in on
      // this same screen (createWallet clears genPassword from state below).
      createdPasswordRef.current = genPassword;
      const seed = await createWallet(genPassword); // returns mnemonic ONCE for backup
      setGeneratedSeed(seed);
      setShowSeed(false);
      setBioEnabled(false);
      setGenPassword("");
      // createWallet already unlocked the vault; we stay on this screen to FORCE a
      // seed backup. "I've backed it up — Continue" lets WalletGate render the app.
    } catch (e) { createdPasswordRef.current = null; setError(e?.message || "Failed to create wallet"); }
    finally { setBusy(false); }
  };

  // ---- Create: finish onboarding (confirm backup + optional Face ID) ----
  const finishCreate = async () => {
    setBusy(true);
    try {
      // The user confirmed the mandatory backup — mark wallet 1 backed up so the
      // multi-wallet portfolio doesn't then warn about the wallet they just saved.
      confirmWalletBackup();
      if (bioEnabled && bioStatus?.available && createdPasswordRef.current) {
        const ok = await enableBiometricUnlock(createdPasswordRef.current);
        if (!ok) toast.warning("Biometric unlock wasn't enabled — your vault password is always your way in. You can enable it later in Security settings.");
      }
    } finally {
      createdPasswordRef.current = null; // wipe the transient password
      setGeneratedSeed("");              // release the hold → WalletGate renders the app
      setShowSeed(false);
      setBusy(false);
    }
  };

  // ---- Import an existing seed (vault password mandatory) ----
  const handleImport = async () => {
    setError("");
    if (importPassword.length < 8) { setError("Choose a vault password of at least 8 characters."); return; }
    setBusy(true);
    try {
      await importWallet(importPhrase.trim(), importPassword); // validates BIP-39 + unlocks
      // A restored/imported wallet is password-encrypted. If this device was in the
      // PIN cohort (e.g. PIN forgotten → "Restore from seed phrase"), leave the PIN
      // cohort so the returning surface matches the vault — otherwise the stale 'pin'
      // marker would render a PIN pad that cannot open this password vault. Done on
      // SUCCESS only: abandoning recovery leaves the existing PIN vault untouched.
      setAuthModel("password"); setAuthModelState("password");
      // Optionally enable Face ID for next time (importWallet reset any prior
      // wallet's biometric state, so we enable AFTER it). The vault password is
      // always the fallback.
      if (bioEnabled && bioStatus?.available) {
        const ok = await enableBiometricUnlock(importPassword);
        if (!ok) toast.warning("Biometric unlock wasn't enabled — your vault password is always your way in.");
      }
      setImportPhrase("");
      setImportPassword("");
      // isUnlocked flips -> app renders.
    } catch (e) { setError(e?.message || "Failed to import wallet"); }
    finally { setBusy(false); }
  };

  // Unlocked → reveal the app. The ONLY exception is the one-time seed-backup
  // screen during first-run create: the vault is already unlocked, but we keep
  // holding while `generatedSeed` is set until the user confirms the backup.
  if (isUnlocked && !generatedSeed) return <Outlet />;

  // EXPLORE MODE: no vault on this device and the user is browsing view-only.
  // Render the real app behind a persistent create/import CTA. Tapping it (or any
  // wallet-requiring action via requireWallet()) leaves explore → the choose view.
  if (vaultExists === false && exploreMode && !generatedSeed) {
    return <ExploreShell onCreate={leaveExplore}><Outlet /></ExploreShell>;
  }

  // Initial probe in flight (only relevant while still locked).
  if (vaultExists === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // ---- View: Unlock (PIN cohort) ----
  if (view === "unlock" && authModel === "pin") {
    const bioLabel = bioStatus?.label || "Face ID";
    return (
      <EntryShell error={error}>
        <div className="p-4 rounded-xl border border-border bg-card space-y-4">
          {bioReady && !biometricFailed && (
            <>
              <Button className="w-full gap-2 h-12 text-base" disabled={busy} onClick={handleBiometricUnlock}>
                {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <ScanFace className="h-5 w-5" />} Unlock with {bioLabel}
              </Button>
              <div className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">or enter your PIN</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          {bioReady && biometricFailed && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {bioLabel} didn't work. Enter your PIN below — it's your real key and always works.
            </p>
          )}
          <div className="flex items-center justify-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-muted-foreground" /> Enter your PIN
          </div>
          <PinPad value={unlockPin} onChange={setUnlockPin} onComplete={runPinUnlock} disabled={busy} />
        </div>

        {/* HONEST recovery: no custodial reset. A forgotten PIN is recovered ONLY by
            re-importing the seed phrase, which RE-PROVISIONS the device back into the
            PIN cohort (§4) — set a new PIN, restore the seed under it, decoy/wipe slots
            re-provision. The post-recovery surface is this same PIN pad, so recovery
            leaves no observable "this user recovered" tell (see finishPinRecover). */}
        <button
          type="button"
          onClick={() => {
            setError(""); setRecovering(true);
            setRecoverySeed(""); setRealPin(""); setRealPinConfirm(""); setDuressPin_(""); setPanicPin_("");
            duressPinRef.current = ""; setPinStep("seed"); setView("pin-recover");
          }}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Forgot your PIN? <span className="text-primary">Restore from seed phrase</span>
        </button>
      </EntryShell>
    );
  }

  // ---- View: Unlock existing vault (returning user) ----
  if (view === "unlock") {
    const bioLabel = bioStatus?.label || "Face ID";
    return (
      <EntryShell error={error}>
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          {/* PROMINENT one-tap Face ID entry (only when it can actually run). */}
          {bioReady && !biometricFailed && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <ScanFace className="h-4 w-4 text-primary" /> Welcome back
              </div>
              <Button className="w-full gap-2 h-12 text-base" disabled={busy} onClick={handleBiometricUnlock}>
                {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <ScanFace className="h-5 w-5" />} Unlock with {bioLabel}
              </Button>
              <div className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">or use your vault password</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-muted-foreground" /> {bioReady && !biometricFailed ? "Enter your vault password" : "Unlock your wallet"}
          </div>
          <Label>Vault Password</Label>
          <Input
            type="password"
            value={unlockPassword}
            onChange={e => setUnlockPassword(e.target.value)}
            placeholder="Enter your vault password"
            onKeyDown={e => { if (e.key === "Enter" && unlockPassword && !busy) runUnlock(); }}
            autoFocus={!bioReady || biometricFailed}
          />
          <Button className="w-full gap-2" disabled={!unlockPassword || busy} onClick={() => runUnlock()}>
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />} Unlock
          </Button>

          {passkeyFailed && (
            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Can't use your passkey? If it was removed from this device or your
                authenticator is unavailable, unlock with your vault password alone.
                Your password still protects the wallet.
              </p>
              <Button variant="outline" className="w-full gap-2" disabled={!unlockPassword || busy} onClick={() => runUnlock({ skipPasskey: true })}>
                <KeyRound className="h-4 w-4" /> Unlock with password only
              </Button>
            </div>
          )}

          {biometricFailed && (
            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Biometric / Face ID didn't work? Unlock with your vault password
                alone — your password is the real key and always works, even when
                biometrics are unavailable.
              </p>
              <Button variant="outline" className="w-full gap-2" disabled={!unlockPassword || busy} onClick={() => runUnlock({ skipBiometric: true })}>
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

  // ---- View: First-run choose (ONE clear decision) ----
  if (view === "choose") {
    return (
      <EntryShell error={error}>
        <div className="p-6 rounded-xl border border-dashed border-border bg-card text-center space-y-4">
          <Wallet className="h-8 w-8 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">No wallet on this device yet. Create a new self-custody wallet, or import an existing seed phrase. Your password encrypts it locally — keys never leave this device.</p>
          <div className="space-y-2">
            <Button className="w-full gap-2" onClick={() => { setError(""); setBioEnabled(false); setPinStep("real"); setRealPin(""); setRealPinConfirm(""); setDuressPin_(""); setPanicPin_(""); duressPinRef.current = ""; setView("pin-create"); }}>
              <Shield className="h-4 w-4" /> Create a new wallet
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={() => { setError(""); setBioEnabled(false); setRecovering(false); setView("import"); }}>
              <Download className="h-4 w-4" /> Import an existing seed
            </Button>
          </div>
          <button type="button" onClick={() => enterExplore()} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Keep exploring (view only)
          </button>
        </div>
      </EntryShell>
    );
  }

  // ---- View: Create (PIN cohort) — real PIN → confirm → duress → optional panic → seed backup ----
  if (view === "pin-create") {
    if (!generatedSeed) {
      return (
        <EntryShell error={error}>
          <div className="space-y-5">
            <button type="button" onClick={() => { setError(""); setView("choose"); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>

            {pinStep === "real" && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Choose a 6-digit PIN</p>
                <p className="text-xs text-muted-foreground">This unlocks your wallet. It encrypts your seed on this device (Argon2id + AES-256-GCM).</p>
                <PinPad value={realPin} onChange={setRealPin} onComplete={() => { setError(""); setRealPinConfirm(""); setPinStep("real-confirm"); }} />
              </div>
            )}

            {pinStep === "real-confirm" && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Confirm your PIN</p>
                <PinPad value={realPinConfirm} onChange={setRealPinConfirm} onComplete={(p) => {
                  if (p !== realPin) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
                  setError(""); setPinStep("duress");
                }} />
              </div>
            )}

            {pinStep === "duress" && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Set a duress PIN</p>
                <p className="text-xs text-muted-foreground">If you're ever forced to unlock, enter this instead — it opens a separate everyday wallet, never your real one. Face ID opens this wallet too. Use it day-to-day so it looks lived-in.</p>
                <PinPad value={duressPin} onChange={setDuressPin_} onComplete={(p) => {
                  if (p === realPin) { setError("Your duress PIN must be different from your real PIN."); setDuressPin_(""); return; }
                  setError(""); duressPinRef.current = p; setPinStep("panic");
                }} />
              </div>
            )}

            {pinStep === "panic" && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Set a panic PIN <span className="text-muted-foreground font-normal">(optional)</span></p>
                <p className="text-xs text-muted-foreground">Entering this at unlock <b>irreversibly wipes</b> this device's wallet copy. Choose something you'd never type by accident, or skip it.</p>
                <PinPad value={panicPin} onChange={setPanicPin_} onComplete={(p) => {
                  if (p === realPin || p === duressPinRef.current) { setError("Your panic PIN must differ from your real and duress PINs."); setPanicPin_(""); return; }
                  setError(""); finishPinCreate();
                }} />
                <button type="button" disabled={busy} onClick={() => { setPanicPin_(""); finishPinCreate(); }} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Skip — don't set a panic PIN
                </button>
              </div>
            )}
          </div>
        </EntryShell>
      );
    }
    return (
      <EntryShell error={error}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold">Your Seed Phrase (shown once)</p>
              <div className="flex gap-2">
                <button onClick={() => setShowSeed(s => !s)} aria-label={showSeed ? "Hide seed phrase" : "Reveal seed phrase"} className="p-1.5 text-muted-foreground hover:text-foreground">{showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                <button onClick={copySeed} aria-label={copied ? "Seed phrase copied" : "Copy seed phrase"} className="p-1.5 text-muted-foreground hover:text-foreground">{copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}</button>
              </div>
            </div>
            {showSeed ? (
              <div className="grid grid-cols-3 gap-2">
                {generatedSeed.split(" ").map((w, i) => (
                  <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-xs">
                    <span className="text-muted-foreground w-4 text-right mono-value">{i + 1}.</span>
                    <span className="mono-value font-semibold">{w}</span>
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
            <span>Back up your phrase before continuing — it is never shown again and we cannot recover it for you.</span>
          </div>
          <BiometricOffer status={bioStatus} enabled={bioEnabled} onToggle={setBioEnabled} />
          <Button className="w-full gap-2" disabled={busy} onClick={finishPinBackup}>
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} I've backed it up — Enter Wallet
          </Button>
        </div>
      </EntryShell>
    );
  }

  // ---- View: PIN recovery (§4) — seed → new PIN → confirm → duress → optional panic ----
  // Re-provisions a forgotten-PIN restore back into the PIN cohort so the result is
  // indistinguishable from a fresh onboarding (same PIN pad, same slots). No seed-
  // backup screen — the user just supplied the seed. finishPinRecover does the work.
  if (view === "pin-recover") {
    return (
      <EntryShell error={error}>
        <div className="space-y-5">
          <button type="button" onClick={() => { setError(""); setRecovering(false); setView("unlock"); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>

          {pinStep === "seed" && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Restore from your seed phrase</p>
                <p className="text-xs text-muted-foreground">Enter your 12 or 24-word recovery phrase, then set a new PIN. There is no custodial reset — only you hold the seed.</p>
              </div>
              <div className="p-3 rounded-xl border border-caution/30 bg-caution/10 text-xs text-caution flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Never type your seed phrase anywhere you don't trust. It is validated and encrypted locally — it never leaves this device.</span>
              </div>
              <div>
                <Label>12 or 24-word recovery phrase</Label>
                <textarea value={recoverySeed} onChange={e => setRecoverySeed(e.target.value)} rows={3} placeholder="word1 word2 word3 ... word12" aria-label="Recovery seed phrase" className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm mono-value resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <Button className="w-full gap-2" disabled={!recoverySeed.trim() || busy} onClick={() => {
                const phrase = recoverySeed.trim().replace(/\s+/g, " ");
                if (!validateMnemonic(phrase)) { setError("That doesn't look like a valid recovery phrase. Check the words and try again."); return; }
                setRecoverySeed(phrase); setError(""); setRealPin(""); setRealPinConfirm(""); setPinStep("real");
              }}>
                <Download className="h-4 w-4" /> Continue
              </Button>
            </div>
          )}

          {pinStep === "real" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Choose a new 6-digit PIN</p>
              <p className="text-xs text-muted-foreground">This unlocks your restored wallet. It encrypts your seed on this device (Argon2id + AES-256-GCM).</p>
              <PinPad value={realPin} onChange={setRealPin} onComplete={() => { setError(""); setRealPinConfirm(""); setPinStep("real-confirm"); }} />
            </div>
          )}

          {pinStep === "real-confirm" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Confirm your new PIN</p>
              <PinPad value={realPinConfirm} onChange={setRealPinConfirm} onComplete={(p) => {
                if (p !== realPin) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
                setError(""); setPinStep("duress");
              }} />
            </div>
          )}

          {pinStep === "duress" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Set a duress PIN</p>
              <p className="text-xs text-muted-foreground">If you're ever forced to unlock, enter this instead — it opens a separate everyday wallet, never your real one. Face ID opens this wallet too. Use it day-to-day so it looks lived-in.</p>
              <PinPad value={duressPin} onChange={setDuressPin_} onComplete={(p) => {
                if (p === realPin) { setError("Your duress PIN must be different from your real PIN."); setDuressPin_(""); return; }
                setError(""); duressPinRef.current = p; setPinStep("panic");
              }} />
            </div>
          )}

          {pinStep === "panic" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Set a panic PIN <span className="text-muted-foreground font-normal">(optional)</span></p>
              <p className="text-xs text-muted-foreground">Entering this at unlock <b>irreversibly wipes</b> this device's wallet copy. Choose something you'd never type by accident, or skip it.</p>
              <PinPad value={panicPin} onChange={setPanicPin_} onComplete={(p) => {
                if (p === realPin || p === duressPinRef.current) { setError("Your panic PIN must differ from your real and duress PINs."); setPanicPin_(""); return; }
                setError(""); finishPinRecover(p);
              }} />
              <button type="button" disabled={busy} onClick={() => { setPanicPin_(""); finishPinRecover(""); }} className="text-xs text-muted-foreground hover:text-foreground underline">
                Skip — don't set a panic PIN
              </button>
            </div>
          )}
        </div>
      </EntryShell>
    );
  }

  // ---- View: Create — ONE security screen (password → seed backup → Face ID) ----
  if (view === "generate") {
    return (
      <EntryShell error={error}>
        {!generatedSeed ? (
          <div className="space-y-4">
            <button type="button" onClick={() => { setError(""); setView("choose"); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
            <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive">
              Your seed phrase will be shown ONCE on the next step. You'll write it down and confirm before entering the wallet — anyone with it has full access to your funds, and it is the only way to recover this wallet.
            </div>
            <div>
              <Label>Vault Password</Label>
              <Input type="password" className="mt-1.5" value={genPassword} onChange={e => setGenPassword(e.target.value)} placeholder="Encrypts your new seed on this device" onKeyDown={e => { if (e.key === "Enter" && !busy) handleGenerate(); }} />
              <p className="text-xs text-muted-foreground mt-1">Encrypts the vault (Argon2id + AES-256-GCM). Minimum 8 characters. This is your real key — required, never skipped.</p>
            </div>
            <Button className="w-full gap-2" disabled={busy} onClick={handleGenerate}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Set Password & Generate Seed
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold">Your Seed Phrase (shown once)</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowSeed(s => !s)} aria-label={showSeed ? "Hide seed phrase" : "Reveal seed phrase"} className="p-1.5 text-muted-foreground hover:text-foreground">{showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  <button onClick={copySeed} aria-label={copied ? "Seed phrase copied" : "Copy seed phrase"} className="p-1.5 text-muted-foreground hover:text-foreground">{copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}</button>
                </div>
              </div>
              {showSeed ? (
                <div className="grid grid-cols-3 gap-2">
                  {generatedSeed.split(" ").map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-xs">
                      <span className="text-muted-foreground w-4 text-right mono-value">{i + 1}.</span>
                      <span className="mono-value font-semibold">{w}</span>
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

            {/* Optional Face ID offer folded onto the SAME screen (skippable). */}
            <BiometricOffer status={bioStatus} enabled={bioEnabled} onToggle={setBioEnabled} />

            <Button className="w-full gap-2" disabled={busy} onClick={finishCreate}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} I've backed it up — Enter Wallet
            </Button>
          </div>
        )}
      </EntryShell>
    );
  }

  // ---- View: Import an existing seed (also the seed-recovery path) ----
  return (
    <EntryShell error={error}>
      <div className="space-y-4">
        <button type="button" onClick={() => { setError(""); setView(vaultExists ? "unlock" : "choose"); setRecovering(false); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        {recovering && (
          <div className="p-3 rounded-xl border border-caution/30 bg-caution/10 text-xs text-caution flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>There is <b>no custodial password reset</b> — we never hold your keys. Restore access by re-importing your seed phrase and setting a new vault password. This replaces the local vault on this device with the same wallet.</span>
          </div>
        )}
        <div className="p-3 rounded-xl border border-caution/30 bg-caution/10 text-xs text-caution">
          Never share your seed phrase. It is validated and encrypted locally with your password — it is never sent to a server.
        </div>
        <div>
          <Label>12 or 24-word BIP-39 Seed Phrase</Label>
          <textarea value={importPhrase} onChange={e => setImportPhrase(e.target.value)} rows={3} placeholder="word1 word2 word3 ... word12" aria-label="Recovery seed phrase" className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm mono-value resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div>
          <Label>{recovering ? "New Vault Password" : "Vault Password"}</Label>
          <Input type="password" className="mt-1.5" value={importPassword} onChange={e => setImportPassword(e.target.value)} placeholder="Encrypts your seed on this device" />
          <p className="text-xs text-muted-foreground mt-1">Encrypts the vault (Argon2id + AES-256-GCM). Minimum 8 characters.</p>
        </div>

        {/* Optional Face ID offer folded onto the SAME screen (skippable). */}
        <BiometricOffer status={bioStatus} enabled={bioEnabled} onToggle={setBioEnabled} />

        <Button className="w-full gap-2" disabled={!importPhrase.trim() || !importPassword || busy} onClick={handleImport}>
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {recovering ? "Restore Wallet" : "Validate & Import"}
        </Button>
      </div>
    </EntryShell>
  );
}
