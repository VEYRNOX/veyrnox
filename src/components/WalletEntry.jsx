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
// panic) is set up in-app later and never appears in onboarding. The v1 PIN cohort
// follows the SAME principle: onboarding provisions ONLY a real PIN, then silently
// provisions CHAFF into both deniability slots (no user-chosen duress/panic at
// onboarding — see wallet-core/provisionChaff.js), so every PIN device is
// structurally identical regardless of what the user later personalizes. Duress and
// panic credentials are personalized later in-app (Security); stealth/hidden likewise
// remains an in-app, post-onboarding feature.
//
// ── v1 PIN AUTH (UNAUDITED-PROVISIONAL) ──────────────────────────────────────
// THREAT MODEL: v1 is SOFTWARE key derivation. It resists OBSERVED coercion — a
// non-enrolled PIN falls through to the Option-A deterministic decoy (see
// deniabilityUnlock.js / decoyFallback.js) rather than erroring, and once duress/
// panic are personalized in-app the duress credential yields the surrendered decoy
// while the panic credential wipes; no 6-digit PIN produces an error-state oracle
// (Option A) or a timing oracle (the 4th constant KDF slot, deniabilityUnlock.js).
// It does NOT fully
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
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  Shield, Wallet, Lock, Unlock, KeyRound, Download, RefreshCw,
  Eye, EyeOff, Copy, Check, AlertTriangle, ArrowLeft, Fingerprint, ScanFace, Zap,
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
import { resolveOnboardingEntry } from "@/lib/onboardingEntry";
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

// FIRST-RUN WELCOME — the branded VEYRNOX hero a fresh device lands on BEFORE the
// 6-digit PIN (lib/onboardingEntry.js: no-vault → 'welcome'). PURE PRESENTATION: it
// holds no wallet and no balances; its single "Get Started" action advances to
// PIN-create (Phase 1), so the PIN-first security order is intact. Copy is honest —
// self-custody, testnet, provisional framing (CLAUDE.md); deliberately NO "Mainnet",
// NO "partial-custody", NO shipped-AI claims. Module-level so its identity is stable
// across WalletEntry re-renders. The Framer Motion entrance + looping logo glow
// degrade to an instant, static render under prefers-reduced-motion.
function WelcomeHero({ onGetStarted }) {
  const reduce = useReducedMotion();
  const container = {
    hidden: {},
    show: { transition: reduce ? {} : { staggerChildren: 0.09, delayChildren: 0.05 } },
  };
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      };
  const features = [
    { icon: Fingerprint, label: "Biometric + PIN unlock" },
    { icon: Eye, label: "Pre-sign screening" },
    { icon: Zap, label: "Multi-chain receive & balances" },
    { icon: Lock, label: "On-device encrypted vault" },
  ];
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background overflow-hidden">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm flex flex-col items-center text-center"
      >
        {/* Brand mark with a soft pulsing teal glow. The loop is CSS-driven
            (motion-safe:animate-pulse) rather than a Framer infinite animation: it
            stays GPU-side, respects prefers-reduced-motion, and lets the JS frame
            loop go idle once the finite entrance below settles. */}
        <motion.div variants={item} className="relative mb-6">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full bg-primary/25 blur-3xl motion-safe:animate-pulse"
          />
          <VeyrnoxLogo size={76} />
        </motion.div>

        <motion.div variants={item}>
          <VeyrnoxWordmark className="text-3xl block" />
        </motion.div>

        <motion.p variants={item} className="mt-3 text-sm leading-relaxed text-muted-foreground max-w-[18rem]">
          Self-custody, coercion-resistant. Your keys never leave this device.
        </motion.p>

        {/* Honest feature bullets — provisional/testnet framing, no overclaims. */}
        <motion.ul variants={item} className="mt-8 w-full space-y-3 text-left">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-foreground/90">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              {label}
            </li>
          ))}
        </motion.ul>

        {/* The ONLY action: hand off to PIN-create. Create vs import is chosen later. */}
        <motion.div variants={item} className="mt-9 w-full">
          <motion.div whileTap={reduce ? undefined : { scale: 0.97 }} whileHover={reduce ? undefined : { scale: 1.01 }}>
            <Button className="w-full h-12 text-base gap-2" onClick={onGetStarted}>
              <Shield className="h-5 w-5" /> Get Started
            </Button>
          </motion.div>
        </motion.div>

        <motion.p variants={item} className="mt-6 text-[11px] text-muted-foreground">
          v1.0 · Testnet beta · keys stay on-device
        </motion.p>
      </motion.div>
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

// POST-PIN EMPTY-DASHBOARD SHELL — renders the real app (Outlet) VIEW-ONLY behind
// a persistent, non-dismissable "Create or import a wallet" CTA. Shown AFTER
// Phase-1 PIN setup (PIN-first onboarding), never as the fresh-open landing. There
// is nothing to authenticate (no vault exists yet), so this is genuinely no-auth
// browsing; any wallet-requiring action calls requireWallet() which leaves this
// view and shows the Phase-2 create/import flow.
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
    setupPin, createWalletFromPendingPin, importWalletForPendingPin,
    clearPendingPin, hasPendingPin,
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
  // PIN onboarding sub-steps: 'real' -> 'real-confirm' -> Dashboard. Returning PIN
  // users enter on the pad. PIN RECOVERY (§4) reuses these same steps but adds a
  // 'seed' step at the front (enter the recovery phrase) and seeds the wallet from
  // it instead of generating.
  const [pinStep, setPinStep] = useState("real");
  // The validated recovery phrase held across the PIN-recovery steps (§4). Lives
  // only until finishPinRecover consumes it; wiped on success/abandon.
  const [recoverySeed, setRecoverySeed] = useState("");
  const [realPin, setRealPin] = useState("");
  const [realPinConfirm, setRealPinConfirm] = useState("");
  const [unlockPin, setUnlockPin] = useState("");
  // PHASE 2 (post-PIN, from the empty dashboard): the seed textarea for "Import an
  // existing seed", and a toggle for the Phase-2 import sub-view within the choose
  // block. The PIN is the credential here — there is NO vault-password field.
  const [importPhrasePin, setImportPhrasePin] = useState("");
  const [choosePinImport, setChoosePinImport] = useState(false);
  // True while a PIN wallet is being ATOMICALLY provisioned (create + both chaff
  // slots + cohort + salt). Holds the dashboard back until everything is committed;
  // on failure the vault is torn down (fail closed) and we show an honest error.
  const [provisioning, setProvisioning] = useState(false);

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
        // PIN-FIRST onboarding (authoritative brief): a fresh device (no vault)
        // routes to PIN-create BEFORE any dashboard — never explore-first. The
        // empty (explore) dashboard is a POST-PIN state, entered later by the
        // provider's setupPin() once Phase 1 commits its credential markers; it
        // is never the cold-mount landing. A returning user (vault exists) gets
        // the unlock gate. See lib/onboardingEntry.js for the pinned invariant.
        const entry = resolveOnboardingEntry({ hasVault: v });
        setView(entry);
        if (entry === "pin-create") { setRealPin(""); setRealPinConfirm(""); setPinStep("real"); }
        if (v && isBiometricUnlockEnabled()) {
          try { setBioReady(await hasStoredUnlockSecret()); }
          catch { setBioReady(false); }
        } else {
          setBioReady(false);
        }
      })
      .catch(() => { if (active) { setVaultExists(false); setView("pin-create"); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); setBioReady(false); } });
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

  // VULN-8: PIN attempt rate-limiting. Tracks consecutive failed attempts in
  // localStorage so the counter survives a page reload (which an attacker could
  // use to reset an in-memory counter). Back-off: 5 s after attempt 3, 30 s after
  // attempt 5, 5 min after attempt 7+. The counter resets on a successful unlock.
  // With Option A a wrong PIN opens a decoy rather than erroring — so "error" here
  // means an infrastructure failure, not a wrong PIN. For the PIN cohort the real
  // rate-limiter is Argon2id cost; this counter adds a software gate on top.
  const PIN_ATTEMPTS_KEY = 'veyrnox-pin-attempts';
  const PIN_BACKOFF_KEY = 'veyrnox-pin-backoff-until';
  function pinBackoffMs(attempts) {
    if (attempts >= 7) return 5 * 60 * 1000;
    if (attempts >= 5) return 30 * 1000;
    if (attempts >= 3) return 5 * 1000;
    return 0;
  }

  // Returning PIN user: submit the 6-digit PIN. pinModel:true enables Option A
  // (a non-enrolled PIN opens a deterministic empty decoy — never an error).
  const runPinUnlock = async (pin) => {
    // Check back-off before attempting.
    try {
      const until = parseInt(localStorage.getItem(PIN_BACKOFF_KEY) || '0', 10);
      if (Date.now() < until) {
        const secs = Math.ceil((until - Date.now()) / 1000);
        setError(`Too many attempts. Try again in ${secs} second${secs !== 1 ? 's' : ''}.`);
        return;
      }
    } catch { /* localStorage unavailable — skip back-off check */ }

    setError(""); setBusy(true);
    try {
      await unlock(pin, { pinModel: true });
      setUnlockPin("");
      // Success — clear the attempt counter.
      try { localStorage.removeItem(PIN_ATTEMPTS_KEY); localStorage.removeItem(PIN_BACKOFF_KEY); } catch { /* best-effort */ }
    } catch (e) {
      // With Option A a valid 6-digit PIN never throws for "wrong PIN"; a throw
      // here is an infra/gate failure. Clear the pad and show a neutral message.
      setUnlockPin("");
      try {
        const attempts = (parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0', 10)) + 1;
        localStorage.setItem(PIN_ATTEMPTS_KEY, String(attempts));
        const delay = pinBackoffMs(attempts);
        if (delay > 0) localStorage.setItem(PIN_BACKOFF_KEY, String(Date.now() + delay));
      } catch { /* best-effort */ }
      setError(e?.message || "Couldn't unlock. Try again.");
    } finally { setBusy(false); }
  };

  // PHASE 1: PIN setup writes credential markers only (provider.setupPin) and enters
  // the empty dashboard. NO wallet is created here — that's Phase 2 (a separate
  // dashboard action). pendingPin (in the provider) bridges the two.
  const finishPinSetup = () => {
    setupPin(realPin);                 // authModel + salt + pendingPin + enter explore
    setAuthModelState("pin");
    setRealPin(""); setRealPinConfirm(""); setError(""); setPinStep("real");
    setView("choose");                 // post-Phase-1: leaving explore lands on the create/import choice
    setChoosePinImport(false);         // reset the Phase-2 import sub-toggle
  };

  // PHASE 2 (create): leave Phase 1's markers in place and atomically materialize the
  // real wallet + both chaff slots under the in-memory pendingPin (provider method,
  // fail-closed). The provisioning gate below holds the dashboard back until it commits.
  const doCreateWallet = async () => {
    setBusy(true); setProvisioning(true); setError("");
    try { await createWalletFromPendingPin(); setProvisioning(false); }
    catch {
      clearPendingPin(); setProvisioning(false);
      const msg = "Wallet setup couldn't finish securely, so nothing was saved. Please set your PIN and try again.";
      setError(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  // PHASE 2 (import): import an existing seed under the in-memory pendingPin via the
  // provider method (PIN-cohort re-provision, so the device stays PIN cohort, never
  // 'password').
  const doImportWallet = async () => {
    const phrase = importPhrasePin.trim().replace(/\s+/g, " ");
    if (!phrase) return;
    setBusy(true); setProvisioning(true); setError("");
    try { await importWalletForPendingPin(phrase); setImportPhrasePin(""); setProvisioning(false); }
    catch (e) {
      clearPendingPin(); setProvisioning(false);
      const msg = e?.message || "Couldn't import that seed phrase. Please set your PIN and try again.";
      setError(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  // ---- PIN recovery (§4): forgot PIN -> restore seed, RE-PROVISION into the PIN
  // cohort (NOT password), so the post-recovery entry surface is the identical PIN pad
  // a non-recovered user sees — closing the cohort-transition leak the old recovery
  // (handleImport -> setAuthModel("password")) introduced. Routes through the SAME
  // provider Phase-1/Phase-2 spine: setupPin(newPin) bridges the in-memory pendingPin,
  // then importWalletForPendingPin (the PIN-cohort re-provision) seeds + provisions +
  // unlocks in one fail-closed block. No seed-backup screen — the user supplied the seed.
  // Fail-closed: a bad phrase throws inside the import, leaving the existing vault
  // untouched; we clear the bridged pendingPin so no stale PIN lingers.
  const finishPinRecover = async () => {
    setBusy(true); setProvisioning(true); setError("");
    try {
      setupPin(realPin);               // bridge the new PIN as pendingPin (markers + salt)
      await importWalletForPendingPin(recoverySeed);
      setAuthModelState("pin");
      setRecoverySeed(""); setRealPin(""); setRealPinConfirm("");
      setRecovering(false);
      setProvisioning(false);
    } catch (e) {
      // setupPin() flipped exploreMode true while bridging the new PIN; a failed
      // recovery must not leave the session stuck in explore. Inert today (the
      // recover view stays mounted), but keeps the failure state coherent.
      leaveExplore();
      clearPendingPin(); setProvisioning(false);
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
  // Hold the dashboard back while a PIN wallet is being atomically provisioned — it
  // must not render until primary + both chaff slots + cohort marker + salt are all
  // committed (fail-closed onboarding). On failure the vault is torn down and we
  // fall through to the PIN entry with an error.
  if (provisioning) {
    return (
      <EntryShell error={error}>
        <div className="p-6 rounded-xl border border-border bg-card text-center space-y-3">
          <RefreshCw className="h-6 w-6 text-primary mx-auto animate-spin" />
          <p className="text-sm font-medium">Setting up your wallet…</p>
          <p className="text-xs text-muted-foreground">Securing your wallet on this device. This takes a moment.</p>
        </div>
      </EntryShell>
    );
  }

  if (isUnlocked && !generatedSeed) return <Outlet />;

  // EXPLORE MODE: no vault on this device and the user is browsing view-only.
  // Render the real app behind a persistent create/import CTA. Tapping it (or any
  // wallet-requiring action via requireWallet()) leaves explore → the choose view.
  if (vaultExists === false && exploreMode && !generatedSeed) {
    // Leaving explore lands on the choose block, which branches on hasPendingPin
    // (pre-PIN → pin-create CTA; post-PIN → Phase-2 Create/Import). Reset view +
    // the Phase-2 import sub-toggle so the branch reliably takes over.
    const onCreate = () => { setError(""); setChoosePinImport(false); setView("choose"); leaveExplore(); };
    return <ExploreShell onCreate={onCreate}><Outlet /></ExploreShell>;
  }

  // Initial probe in flight (only relevant while still locked).
  if (vaultExists === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // ---- View: Welcome (fresh-device landing, AHEAD of the PIN) ----
  // No vault exists; show the branded hero. "Get Started" advances to PIN-create,
  // resetting the PIN sub-state exactly as the cold-mount path used to.
  if (view === "welcome") {
    return (
      <WelcomeHero
        onGetStarted={() => {
          setError("");
          setRealPin(""); setRealPinConfirm(""); setPinStep("real");
          setView("pin-create");
        }}
      />
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
            setRecoverySeed(""); setRealPin(""); setRealPinConfirm("");
            setPinStep("seed"); setView("pin-recover");
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

  // ---- View: choose (no vault, not exploring) ----
  // Reached by LEAVING explore (the "Create or import" CTA or any wallet-requiring
  // action via requireWallet()). Branches on hasPendingPin:
  //   • PIN already set (Phase 1 done) → Phase-2 choice: materialize the wallet now,
  //     either fresh (createWalletFromPendingPin) or from an imported seed
  //     (importWalletForPendingPin). The PIN is the credential — NO password field.
  //   • No PIN yet → a single CTA into PIN-create (Phase 1); both create and import
  //     require a PIN first.
  if (view === "choose") {
    if (hasPendingPin) {
      return (
        <EntryShell error={error}>
          <div className="p-6 rounded-xl border border-dashed border-border bg-card space-y-4">
            {!choosePinImport ? (
              <>
                <div className="text-center space-y-2">
                  <Wallet className="h-8 w-8 text-primary mx-auto" />
                  <p className="text-sm font-medium">No wallet yet</p>
                  <p className="text-xs text-muted-foreground">Your PIN is set. Create a fresh self-custody wallet, or import an existing seed phrase — it'll be encrypted under your PIN on this device. Keys never leave it.</p>
                </div>
                <div className="space-y-2">
                  <Button className="w-full gap-2" disabled={busy} onClick={doCreateWallet}>
                    <Shield className="h-4 w-4" /> Create Wallet
                  </Button>
                  <Button variant="outline" className="w-full gap-2" disabled={busy} onClick={() => { setError(""); setImportPhrasePin(""); setChoosePinImport(true); }}>
                    <Download className="h-4 w-4" /> Import an existing seed
                  </Button>
                </div>
                <button type="button" onClick={() => { setError(""); enterExplore(); }} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
                  ← Keep exploring (view only)
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setError(""); setImportPhrasePin(""); setChoosePinImport(false); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
                <div className="p-3 rounded-xl border border-caution/30 bg-caution/10 text-xs text-caution flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Never type your seed phrase anywhere you don't trust. It is validated and encrypted locally under your PIN — it never leaves this device.</span>
                </div>
                <div>
                  <Label>12 or 24-word BIP-39 Seed Phrase</Label>
                  <textarea value={importPhrasePin} onChange={e => setImportPhrasePin(e.target.value)} rows={3} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="word1 word2 word3 ... word12" aria-label="Recovery seed phrase" className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm mono-value resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <Button className="w-full gap-2" disabled={!importPhrasePin.trim() || busy} onClick={doImportWallet}>
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Restore / Import
                </Button>
              </>
            )}
          </div>
        </EntryShell>
      );
    }
    // PIN-FIRST: the pre-PIN intro. A fresh device lands directly on PIN-create
    // (see the mount probe); this card is the Back target from there. It routes
    // ONLY into PIN-create — there is deliberately NO "explore the dashboard"
    // affordance before a PIN is set (the empty dashboard is a post-PIN state).
    return (
      <EntryShell error={error}>
        <div className="p-6 rounded-xl border border-dashed border-border bg-card text-center space-y-4">
          <Wallet className="h-8 w-8 text-primary mx-auto" />
          <p className="text-sm font-medium">Set up your wallet</p>
          <p className="text-sm text-muted-foreground">No wallet on this device yet. Set a 6-digit PIN, then create a new self-custody wallet or import an existing seed phrase. Your PIN encrypts it locally — keys never leave this device.</p>
          <div className="space-y-2">
            <Button className="w-full gap-2" onClick={() => { setError(""); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); setView("pin-create"); }}>
              <Shield className="h-4 w-4" /> Set a PIN to continue
            </Button>
          </div>
        </div>
      </EntryShell>
    );
  }

  // ---- View: Create (PIN cohort) — choose PIN → confirm → Dashboard ----
  if (view === "pin-create") {
    return (
      <EntryShell error={error}>
        <div className="space-y-5">
          {/* PIN-FIRST: Back returns to the branded welcome hero (the fresh-device
              landing ahead of the PIN), NOT a dashboard — the empty dashboard is
              only reachable AFTER the PIN is set. */}
          <button type="button" onClick={() => { setError(""); clearPendingPin(); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); setView("welcome"); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>

          {pinStep === "real" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Choose a 6-digit PIN</p>
              <p className="text-xs text-muted-foreground">This unlocks your wallet. A 6-digit PIN is strong against a quick grab, but not against someone who keeps your device to try PINs offline — so guard the device itself.</p>
              <PinPad value={realPin} onChange={setRealPin} onComplete={() => { setError(""); setRealPinConfirm(""); setPinStep("real-confirm"); }} />
            </div>
          )}

          {pinStep === "real-confirm" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Confirm your PIN</p>
              <PinPad value={realPinConfirm} onChange={setRealPinConfirm} onComplete={(p) => {
                if (p !== realPin) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
                finishPinSetup();
              }} />
            </div>
          )}
        </div>
      </EntryShell>
    );
  }

  // ---- View: PIN recovery (§4) — seed → new PIN → confirm → Dashboard ----
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
                <textarea value={recoverySeed} onChange={e => setRecoverySeed(e.target.value)} rows={3} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="word1 word2 word3 ... word12" aria-label="Recovery seed phrase" className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm mono-value resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
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
              <p className="text-xs text-muted-foreground">This unlocks your restored wallet. Your seed stays encrypted on this device.</p>
              <PinPad value={realPin} onChange={setRealPin} onComplete={() => { setError(""); setRealPinConfirm(""); setPinStep("real-confirm"); }} />
            </div>
          )}

          {pinStep === "real-confirm" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Confirm your new PIN</p>
              <PinPad value={realPinConfirm} onChange={setRealPinConfirm} onComplete={(p) => {
                if (p !== realPin) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
                setError(""); finishPinRecover();
              }} />
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
              <p className="text-xs text-muted-foreground mt-1">Encrypts the vault with strong on-device encryption. Minimum 8 characters. This is your real key — required, never skipped.</p>
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
          <textarea value={importPhrase} onChange={e => setImportPhrase(e.target.value)} rows={3} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="word1 word2 word3 ... word12" aria-label="Recovery seed phrase" className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm mono-value resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div>
          <Label>{recovering ? "New Vault Password" : "Vault Password"}</Label>
          <Input type="password" className="mt-1.5" value={importPassword} onChange={e => setImportPassword(e.target.value)} placeholder="Encrypts your seed on this device" />
          <p className="text-xs text-muted-foreground mt-1">Encrypts the vault with strong on-device encryption. Minimum 8 characters.</p>
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
