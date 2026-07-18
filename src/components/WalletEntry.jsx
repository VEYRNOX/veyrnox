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
// ── v2 PIN AUTH ──────────────────────────────────────────────────────────────
// PROVISIONAL — independent audit complete (ECC 2026-06-23, §24; PIN/Argon2id
// path reviewed — no findings; hardware-KEK gap remains native work). Still
// BUILT, not 'verified'.
// THREAT MODEL (owner-directed model change 2026-06-22 — supersedes the v1
// "Option-A no-oracle" design; pending internal-audit review):
//   - Real 8-digit PIN  -> the REAL wallet. The real wallet is HIDDEN: nothing in
//     the UI advertises that it exists.
//   - Configured duress PIN  -> the surrendered DECOY wallet.
//   - Face ID (opt-in, set alongside the duress PIN)  -> the DECOY wallet, never
//     the real one. The real wallet is reachable ONLY by typing the real PIN.
//   - Any OTHER wrong PIN  -> a real "Incorrect PIN" error. (This DELIBERATELY
//     REMOVES the old Option-A no-oracle property: a wrong guess is now
//     distinguishable. resolveDeniabilityUnlock still spends a CONSTANT KDF count
//     so no *timing* oracle is layered on top — but the error itself IS an oracle.)
//   - 10 consecutive wrong PINs  -> irreversible local PANIC WIPE (pinAttemptGuard.js).
//   - A dedicated panic PIN  -> immediate wipe.
// Deniability now rests on HIDING the real wallet behind the secret PIN + the
// duress/Face-ID decoy (a coercer given the duress PIN/Face-ID gets a working
// decoy and never learns a real wallet exists), NOT on the removed no-oracle
// trick. The 10-attempt wipe is what makes the now-present wrong-PIN oracle
// non-fatal: an attacker cannot brute-force the real PIN — 10 tries and the
// device self-destructs.
// STILL DOES NOT fully resist OFFLINE analysis of a SEIZED device: an 8-digit PIN
// (10^8) over Argon2id is exhaustible offline in hours-days, the software attempt
// counter (localStorage) is not hardware-sealed, and the PIN path cannot raise
// Argon2id without diverging from the shared stealth-chaff params. Hardware
// binding (the KEK layer) is the planned fast-follow that closes the offline gap.
// NONE of this is "verified" — it needs the internal audit + real-device proof.

import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { useInfiniteAnimation } from "@/lib/useInfiniteAnimation";
import { isLowEndDevice } from "@/hooks/useLowEndDevice";
import { toast } from "@/lib/toast";
import {
  Shield, Wallet, Lock, KeyRound, Download, RefreshCw,
  Eye, Check, AlertTriangle, AlertOctagon, ArrowLeft, Fingerprint, ScanFace, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import VeyrnoxLogo, { VeyrnoxWordmark } from "@/components/VeyrnoxLogo";
import VaultIllustration from "@/components/VaultIllustration";
import Spinner from "@/components/Spinner";
import SeedGrid from "@/components/SeedGrid";
import ShakeOnKey from "@/components/ShakeOnKey";
import { useWallet } from "@/lib/WalletProvider";
import { isPasskeyGateError } from "@/lib/passkey";
import { KEK_UI_ERR } from "@/lib/vaultErrors";
import {
  isBiometricGateError,
  isBiometricUnlockEnabled,
  getBiometricStatus,
} from "@/lib/biometric";
import { hasStoredUnlockSecret, clearUnlockSecret } from "@/lib/biometricUnlock";
import PinPad from "@/components/security/PinPad";
import { getAuthModel, setAuthModel, shouldAutoCacheTypedPin } from "@/lib/authModel";
import { resolveOnboardingEntry } from "@/lib/onboardingEntry";
import { checkPinStrength } from "@/lib/pinStrength";
import { checkVaultPasswordStrength } from "@/lib/passwordStrength";
import { WEB_VAULT_ERR } from "@/lib/vaultErrors";
import { Capacitor } from "@capacitor/core";
import { isRecoverableSeedInputError } from "@/lib/pendingPinFlow";
import {
  registerFailedPinAttempt,
  pinAttemptWarning,
} from "@/lib/pinAttemptGuard";
import { setPendingReferral } from "@/lib/referral";
import { copySecret } from "@/lib/copySecret";
import { useRaspArtifact, sensitiveGate } from "@/rasp";
import KekEnrollmentGate from "@/components/KekEnrollmentGate";
import { useKekEnrollmentGate } from "@/lib/useKekEnrollmentGate";
import RestoreFromFile from "@/components/backup/RestoreFromFile";
import FirstRunTour from "@/components/FirstRunTour";
import { errorHaptic } from "@/lib/haptics";

// Constant-time PIN equality for setup/recovery confirm (F-11).
// Both operands are local strings with no remote attacker; this is a codebase
// consistency fix. XOR-accumulate over encoded bytes, same pattern as credentialVerifier.
const _enc = new TextEncoder();
function pinsEqual(a, b) {
  const ab = _enc.encode(a), bb = _enc.encode(b);
  if (ab.length !== bb.length) return false;
  let d = 0; for (let i = 0; i < ab.length; i++) d |= ab[i] ^ bb[i];
  return d === 0;
}

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
          <div role="alert" aria-live="assertive" className="flex items-start gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// LOUD NEXT-OPEN WIPE ACKNOWLEDGMENT (owner-approved 2026-06-22). After ANY local
// wipe (panic PIN at unlock, the 10-attempt auto-wipe, or the in-app guarded wipe) the
// next app open shows this destructive-styled screen FIRST — instead of silently
// dropping to "Get Started" with no sign the keys were destroyed. DELIBERATE next-open
// deniability tradeoff: the panic-PIN AT-UNLOCK moment stays silent (generic "Incorrect
// PIN"); only the next open is loud. Copy is honest: keys permanently destroyed,
// recoverable ONLY via the recovery phrase, server holds nothing. Both actions call
// acknowledgeWipe() (clearing the persisted marker) before routing on, so this screen
// does not reappear. PURE PRESENTATION — no wallet, no balances.
function WipedNotice({ onRestore, onStartNew }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="p-6 rounded-xl border border-destructive/40 bg-destructive/10 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
            <AlertOctagon className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-destructive">This device was wiped</h1>
          <p className="text-sm text-foreground/90">
            All wallet keys stored on this device were permanently destroyed. This cannot
            be undone. Your funds are recoverable ONLY with your recovery phrase — Veyrnox
            holds nothing on a server.
          </p>
        </div>
        <div className="space-y-3">
          <Button className="w-full gap-2" onClick={onRestore}>
            <Download className="h-4 w-4" /> Restore from recovery phrase
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={onStartNew}>
            <Wallet className="h-4 w-4" /> Start a new wallet
          </Button>
        </div>
      </div>
    </div>
  );
}

// PROVISIONING VIEW — shown while a Phase-2 PIN wallet is being atomically
// provisioned (createWalletFromPendingPin / importWalletForPendingPin), which
// runs Argon2id at 192 MiB and can take up to ~1s on flagship devices, longer
// on mid-tier hardware. This is the "your seed is being locked in" moment for
// PIN-cohort users, who never see the seed. Anchored with the same vault
// illustration used at KEK enrollment + password-cohort seed backup, so all
// three onboarding moments read as one arc. Copy cycles through the three
// honest phases that actually run inside the provisioning promise — nothing
// fake, nothing decorative. Module-level so identity is stable across
// re-renders. Reduced-motion pins the label to the first phase and skips the
// cycle.
const PROVISIONING_STEPS = [
  'Generating your recovery phrase…',
  'Encrypting your vault on this device…',
  'Sealing it to hardware…',
];
function ProvisioningView() {
  const reduce = useReducedMotion();
  const shimmerVisible = useInfiniteAnimation();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setStep((s) => (s + 1) % PROVISIONING_STEPS.length), 1400);
    return () => clearInterval(t);
  }, [reduce]);
  return (
    <div className="p-6 rounded-2xl border border-border bg-card text-center space-y-5">
      <div className="flex justify-center">
        <VaultIllustration size={168} label="Sealing your wallet" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Setting up your wallet</p>
        <div className="min-h-[1.25rem] text-xs text-muted-foreground" aria-live="polite">
          {PROVISIONING_STEPS[step]}
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Setting up wallet"
        aria-valuetext={PROVISIONING_STEPS[step]}
        className="mx-auto h-[3px] w-40 overflow-hidden rounded-full bg-secondary"
      >
        <motion.div
          aria-hidden
          className="h-full w-1/3 rounded-full bg-primary/80"
          animate={reduce || !shimmerVisible ? undefined : { x: ['-100%', '400%'] }}
          transition={reduce ? undefined : { duration: 1.8, ease: 'easeInOut', repeat: Infinity }}
        />
      </div>
    </div>
  );
}

// FIRST-RUN WELCOME — the branded VEYRNOX hero a fresh device lands on BEFORE the
// 8-digit PIN (lib/onboardingEntry.js: no-vault → 'welcome'). PURE PRESENTATION: it
// holds no wallet and no balances; its single "Get Started" action advances to
// PIN-create (Phase 1), so the PIN-first security order is intact. Copy is honest —
// self-custody, testnet, provisional framing (CLAUDE.md); deliberately NO "Mainnet",
// NO "partial-custody", NO shipped-AI claims. Module-level so its identity is stable
// across WalletEntry re-renders. The Framer Motion entrance + looping logo glow
// degrade to an instant, static render under prefers-reduced-motion.
function WelcomeHero({ onGetStarted, onRestore }) {
  const reduce = useReducedMotion();
  const visible = useInfiniteAnimation();
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
    <div className="relative min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background overflow-hidden">
      {/* Ambient aurora backdrop — two teal blobs that drift asymmetrically.
          Fixed, pointer-events off, behind everything. Pure decoration; uses
          only the design-system --primary token at low opacity, no rainbow. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Skipped entirely on low-end devices (<=4GB RAM or <=4 cores) — two
            long-running (14s/18s) Framer Motion loops are needless GPU/CPU
            cost on constrained hardware; useInfiniteAnimation above already
            pauses them when off-screen, this adds a device-capability gate. */}
        {!isLowEndDevice && (
          <>
            <motion.div
              className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
              animate={reduce || !visible ? undefined : { x: [0, 24, 0], y: [0, 18, 0] }}
              transition={reduce ? undefined : { duration: 14, ease: 'easeInOut', repeat: Infinity }}
            />
            <motion.div
              className="absolute -bottom-24 -right-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl"
              animate={reduce || !visible ? undefined : { x: [0, -20, 0], y: [0, -14, 0] }}
              transition={reduce ? undefined : { duration: 18, ease: 'easeInOut', repeat: Infinity }}
            />
          </>
        )}
      </div>
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

        {/* Third onboarding path: restore from an encrypted .enc backup file +
            its OWN backup password/PIN, WITHOUT the seed phrase. Secondary to the
            primary Create/Import flow behind "Get Started". */}
        {onRestore && (
          <motion.button
            variants={item}
            type="button"
            onClick={onRestore}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Have an encrypted backup? <span className="text-primary">Restore from a backup file</span>
          </motion.button>
        )}

        <motion.p variants={item} className="mt-6 text-[11px] text-muted-foreground">
          v1.0 · keys stay on-device
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
            <p className="text-[11px] text-muted-foreground">No wallet yet. Create or import one to send, receive, and hold funds.</p>
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
  const navigate = useNavigate();
  const {
    isUnlocked, isDecoy, createWallet, importWallet, unlock, hasVault,
    enableBiometricUnlock, unlockWithBiometric,
    exploreMode, enterExplore, leaveExplore, confirmWalletBackup,
    setupPin, createWalletFromPendingPin, importWalletForPendingPin,
    clearPendingPin, hasPendingPin, panicWipe,
    wasWiped, acknowledgeWipe,
    clearVault, validateMnemonic,
  } = useWallet();

  // null until we know whether a vault exists; drives unlock vs first-run.
  const [vaultExists, setVaultExists] = useState(null);
  // Local panic-wipe flag: set true in the isPanicWipe catch path so WipedNotice
  // renders immediately without waiting for context wasWiped to propagate through
  // a separate React batch (avoids a timing window on the wasWiped && vaultExists gate).
  const [localWiped, setLocalWiped] = useState(false);
  // first-run sub-view: 'choose' | 'generate' | 'import'. When a vault exists we
  // start on 'unlock'; "Forgot password?" switches to 'import' (seed recovery).
  const [view, setView] = useState("choose");

  // VAULT/SETTINGS DESYNC: a stale on-device vault exists but the auth-model marker
  // is missing. The user must explicitly choose Restore or a confirmed Wipe; we NEVER
  // clearVault() silently (I4). desyncConfirmWipe gates the destructive action behind
  // a typed "WIPE" confirmation. desyncWiping shows progress during the wipe.
  const [desyncConfirmWipe, setDesyncConfirmWipe] = useState(false);
  const [desyncWipeInput, setDesyncWipeInput] = useState("");
  const [desyncWiping, setDesyncWiping] = useState(false);

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

  // Check biometric preference fresh every render (not cached), so preference changes take effect immediately
  const biometricEnabled = vaultExists && isBiometricUnlockEnabled() && bioReady;
  // excludeAttestation: this surface gates seed-reveal + seed import (local seed
  // material) — not gated on the remote attestation leg (unavailable on sideloaded
  // builds → would block reveal/import). On-device threats still block. (2026-07-16)
  const raspArtifact = useRaspArtifact({ excludeAttestation: true });

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
  const [referralInput, setReferralInput] = useState("");
  // True while a PIN wallet is being ATOMICALLY provisioned (create + both chaff
  // slots + cohort + salt). Holds the dashboard back until everything is committed;
  // on failure the vault is torn down (fail closed) and we show an honest error.
  const [provisioning, setProvisioning] = useState(false);

  // MANDATORY hardware-KEK enrollment gate (post-restore AND post-fresh-create).
  // After a delete+reinstall+seed-restore on a native device the SE/StrongBox key
  // is gone and the restored vault is bare; the same gate also fires after a fresh
  // Phase-2 PIN create on hardware-capable devices (the vault has just been sealed
  // but not yet bound to the device). We hold the app back and present
  // KekEnrollmentGate so the user re-enables hardware protection before landing
  // in the wallet. Detection + enrollment logic live in useKekEnrollmentGate
  // (src/lib) to stay within the ring boundary (components cannot import
  // wallet-core directly).
  const { gateActive: kekGatePending, enroll: kekEnroll, dismiss: kekDismiss } =
    useKekEnrollmentGate({ isUnlocked });

  // Shake feedback counter — increment on any wrong-PIN / PIN-mismatch moment
  // so ShakeOnKey wrappers around the unlock and confirm PinPads fire a short
  // horizontal wiggle. Pure presentation; no security value.
  const [pinShakeKey, setPinShakeKey] = useState(0);

  // Distinguishes fresh vs restored so KekEnrollmentGate can pick honest copy.
  // Defaults to 'restored' — matches historical behaviour on an unknown path.
  // Set to 'fresh' by the two create handlers (PIN doCreateWallet + password
  // finishCreate) before the gate becomes reachable, and to 'restored' by the
  // three restore paths (PIN doImportWallet, PIN recovery, password handleImport).
  const [kekOrigin, setKekOrigin] = useState('restored');

  // Notify user when decoy wallet is unlocked (duress PIN).
  useEffect(() => {
    if (isDecoy && isUnlocked) {
      toast.success("Decoy mode active", { duration: 2000, position: "bottom-center" });
    }
  }, [isDecoy, isUnlocked]);

  // Resolve biometric availability once on mount (cheap; used by both the
  // onboarding offer and the returning one-tap button).
  // On native with available biometrics, default the onboarding offer to ON so
  // new users get Face ID without hunting through Settings. The checkbox is still
  // present and can be unchecked; this only changes the default from off to on.
  useEffect(() => {
    let active = true;
    getBiometricStatus().then(s => {
      if (!active) return;
      setBioStatus(s);
      if (s?.available && Capacitor.isNativePlatform()) setBioEnabled(true);
    }).catch(() => { if (active) setBioStatus(null); });
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

        // NATIVE VAULT/SETTINGS DESYNC: iOS Keychain persists across app deletes so a
        // reinstall (or a corrupted/partially-cleared localStorage) can find a stale
        // vault (Keychain) with no auth-model marker (localStorage cleared). The OLD
        // behaviour SILENTLY wiped the Keychain vault on cold mount — destroying key
        // material with no user sign-off. That violates I4 (fail honest, never silently
        // destroy keys): if the missing marker is a transient/partial wipe rather than
        // a true reinstall, a recoverable wallet is gone with no warning. We now route
        // to an honest desync-detection screen instead, where the user explicitly
        // chooses Restore or a confirmed Wipe. clearVault() is NEVER called silently.
        if (Capacitor.isNativePlatform() && v && !localStorage.getItem('veyrnox-auth-model')) {
          setVaultExists(v);
          setAuthModelState(getAuthModel());
          setView('vault-desync');
          setBioReady(false);
          return;
        }

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

  const copySeed = async () => {
    const gate = sensitiveGate(raspArtifact, 'seed-reveal');
    if (gate.blocked) {
      toast.error(gate.sentence || 'Clipboard copy is disabled on this device right now.');
      return;
    }
    await copySecret(generatedSeed);
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
        // SELF-HEAL: the biometric MATCH succeeded but the cached secret failed
        // to unlock the vault — the cache is STALE (e.g. it still holds a duress
        // PIN whose vault was removed). Wipe the dead cache so the one-tap button
        // stops being offered; the next successful PIN unlock re-caches the real
        // PIN (runPinUnlock) because the preference is still ON.
        try { await clearUnlockSecret(); } catch { /* best-effort */ }
        setBioReady(false);
        setError("Face ID was out of date and has been reset. Enter your PIN — Face ID will re-arm after this unlock.");
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
      // M-K — advisory cloned-authenticator warning. The unlock succeeded (the
      // password is the real control); this surfaces the signCount-stall heuristic
      // without blocking. If you did not register a new device, treat your passkey
      // as compromised and re-register it in Security settings.
      if (res?.passkeyWarning?.code === "authenticator_cloned") {
        toast.warning("Security check: your passkey's usage counter did not advance, which can mean it was copied to another device. If you didn't set up a new device, re-register your passkey in Security settings.");
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
        setUnlockPassword("");
        setPinShakeKey((k) => k + 1);
      }
    } finally { setBusy(false); }
  };

  // PIN attempt counting → AUTO-WIPE (target item 5a). Consecutive WRONG-PIN misses
  // are tracked in localStorage so the counter survives a page reload (an attacker
  // could otherwise reset an in-memory counter). After PIN_WIPE_AFTER (10) consecutive
  // misses, the device fires the REAL irreversible local panic wipe (no confirmation
  // dialog — under the threat model a dialog is a liability). The decision is the pure
  // lib/pinAttemptGuard helper; here we only persist the count and act on it.
  //
  // THREAT-MODEL CHANGE (owner-approved, Part 1): the former Option-A "wrong PIN opens
  // a decoy" behaviour is REMOVED — a wrong PIN ERRORS ("Incorrect PIN"). So a throw
  // here means a wrong PIN, UNLESS it is classified as a genuine infra/gate failure
  // (passkey/biometric), which does NOT count toward the wipe. A SUCCESSFUL unlock —
  // real PIN, a duress PIN (→ decoy), or a panic PIN (→ its own wipe) — does NOT throw,
  // so it resets the counter to 0.
  //
  // HONEST LIMIT (audit line-item): the counter is software state in localStorage, not
  // a hardware-sealed attempt count — a determined attacker with the seized device could
  // clear it out-of-band to dodge the wipe. This raises the cost of online/over-the-
  // shoulder guessing and gives a lost/stolen-device auto-destruct; it does NOT replace
  // the Argon2id offline cost or planned hardware binding. Accepted software limit.
  const PIN_ATTEMPTS_KEY = 'veyrnox-pin-attempts';
  const PIN_BACKOFF_KEY = 'veyrnox-pin-backoff-until';
  const readPinAttempts = () => {
    try { return parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0', 10) || 0; }
    catch { return 0; }
  };
  const clearPinAttempts = () => {
    try { localStorage.removeItem(PIN_ATTEMPTS_KEY); localStorage.removeItem(PIN_BACKOFF_KEY); }
    catch { /* best-effort */ }
  };

  // Returning PIN user: submit the 8-digit PIN. A PIN matching no enrolled path
  // (real / duress / panic / hidden) now FAILS with "Incorrect PIN" — the former
  // Option-A deterministic-decoy fallback was removed (owner-approved threat-model
  // change). pinModel:true is kept on the unlock() call as the cohort marker.
  const runPinUnlock = async (pin) => {
    if (!pin) { setError("Enter your PIN."); return; }
    setError(""); setBusy(true);
    try {
      await unlock(pin, { pinModel: true, skipBiometric: true });
      setUnlockPin("");
      // Success (real / duress unlocks return without throwing; the panic PIN throws
      // the isPanicWipe sentinel and never reaches here) — reset the streak.
      clearPinAttempts();
      // CRITICAL (I3/I4): the convenience cache write happens ONLY AFTER a successful
      // unlock (a MIS-TYPED PIN is never cached — the old pre-unlock write cached
      // garbage and popped a spurious OS enroll sheet on a wrong PIN), and ONLY when
      // shouldAutoCacheTypedPin allows it. With NO duress vault this caches the typed
      // (real) PIN — the sanctioned primary Face-ID flow (see removeDuressPin's
      // re-enable path). Once a DURESS vault exists it never caches: the decoy cache
      // is provisioned explicitly in the Duress PIN screen (enableDecoyBiometricUnlock),
      // never here — auto-caching the typed REAL PIN would make one-tap Face ID open
      // the REAL wallet, defeating Face-ID-to-decoy. We never overwrite an existing
      // cache, and duress-presence-unknown FAILS CLOSED (treated as duress present).
      if (isBiometricUnlockEnabled()) {
        const alreadyCached = await hasStoredUnlockSecret().catch(() => false);
        if (shouldAutoCacheTypedPin({ biometricEnabled: true, alreadyCached })) {
          try { await enableBiometricUnlock(pin); } catch { /* best-effort; non-fatal */ }
        }
      }
    } catch (e) {
      setUnlockPin("");
      // A passkey/biometric GATE failure is genuine infra, NOT a wrong PIN: keep its own
      // message and do NOT count it toward the wipe (so a flaky gate can't destroy funds).
      const isInfra = isPasskeyGateError(e) || isBiometricGateError(e);
      if (isInfra) {
        setError(e?.message || "Couldn't unlock. Try again.");
        return;
      }
      // Panic-PIN path: provider fired panicWipe() and threw a distinguishable sentinel.
      // Show WipedNotice immediately — no "Incorrect PIN" error message.
      if (e?.isPanicWipe) { setLocalWiped(true); setVaultExists(false); return; }
      // Hardware KEK permanently invalidated (Android: fingerprints changed / screen lock
      // removed → KeyPermanentlyInvalidatedException). This is NOT a wrong PIN — counting
      // it toward the wipe destroys funds after 10 retries (the data-loss bug). The ONLY
      // recovery is seed restore, so surface the path automatically (I4). Do NOT increment.
      if (e?.code === KEK_UI_ERR.KEY_PERMANENTLY_INVALIDATED) {
        setError(
          'Your fingerprints changed — hardware protection was invalidated. ' +
          'Restore your wallet from your seed phrase to regain access.'
        );
        setPinStep('seed');
        setView('pin-recover');
        return;
      }
      // Hardware factor transiently/structurally unavailable (no enrollment, lockout, HW
      // missing). Also NOT a wrong PIN — do NOT increment the wipe counter. Keep the user
      // on the unlock screen: the hardware may be transiently unavailable and they can
      // retry or go to Settings. If the device key was permanently lost (e.g. after a
      // reinstall cycle), the user must restore from their seed phrase — surface that path.
      // HARDWARE_FACTOR_DEGENERATE (all-zero H) is the same class: a hardware-output
      // failure, never a wrong PIN (Codex P1 follow-up, same wipe-counter leak).
      if (e?.code === KEK_UI_ERR.NO_HARDWARE_FACTOR || e?.code === KEK_UI_ERR.HARDWARE_FACTOR_DEGENERATE) {
        setError(
          "Hardware protection is unavailable. If this persists, your device's security key may have been lost — " +
          "use \"Forgot your PIN? Restore from seed phrase\" below to regain access."
        );
        return;
      }
      // User CANCELLED the per-use biometric sheet. This is user-initiated, NOT a wrong
      // PIN — a correct-PIN user who cancels the prompt N times must never march toward
      // the panic wipe (data-loss bug). Do NOT increment; stay on the unlock screen (I4).
      if (e?.code === KEK_UI_ERR.USER_CANCELLED) {
        setError("Unlock cancelled — try again when ready.");
        return;
      }
      // A real wrong-PIN miss. Register it and persist the new count; the pure guard
      // decides whether this miss is the wipe trigger and what to warn.
      const { attempts, shouldWipe } = registerFailedPinAttempt(readPinAttempts());
      try { localStorage.setItem(PIN_ATTEMPTS_KEY, String(attempts)); } catch { /* best-effort */ }

      if (shouldWipe) {
        // HARD STOP: PIN_WIPE_AFTER consecutive misses. Fire the REAL irreversible local
        // wipe (wallet-core/panic.js via the provider). No confirmation dialog by design.
        // Fail closed: even if the wipe call rejects, we do NOT fall back to a softer
        // state — we surface the wipe-failure honestly rather than hiding it.
        try {
          await panicWipe({ confirmed: true });
          // The vault is gone. Clear the counter and mark vaultExists false so the
          // loud WipedNotice screen renders in-session (wasWiped is already true via
          // the provider; the gate condition is wasWiped && vaultExists === false).
          clearPinAttempts();
          setVaultExists(false);
        } catch (we) {
          setError(we?.message || "This device reached the wipe limit, but the wipe could not be completed.");
        }
        return;
      }

      // Not yet at the limit: honest "Incorrect PIN", upgraded to the iOS-style
      // remaining-count warning once within a few attempts of the wipe.
      errorHaptic();
      setError(pinAttemptWarning(attempts) || "Incorrect PIN. Try again.");
      setUnlockPin("");                    // clear the entered digits
      setPinShakeKey((k) => k + 1);        // shake the pad
    } finally { setBusy(false); }
  };

  // PHASE 1: PIN setup writes credential markers only (provider.setupPin) and enters
  // the empty dashboard. NO wallet is created here — that's Phase 2 (a separate
  // dashboard action). pendingPin (in the provider) bridges the two.
  //
  // Web and native share ONE PIN cohort (no separate web "password" cohort — that
  // split was the half-finished PR #637 migration that caused the lockout bug: web
  // could CREATE a 12+ char alphanumeric vault password but could only UNLOCK via a
  // numeric-only PinPad, which cannot accept it). Web is a testing-only surface —
  // never production — so full parity with native's PIN cohort is correct here.
  const finishPinSetup = () => {
    setupPin(realPin);               // authModel='pin' + salt + pendingPin + enter explore
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
    try { setKekOrigin('fresh'); await createWalletFromPendingPin(); setProvisioning(false); }
    catch (e) {
      setProvisioning(false);
      if (e?.code === WEB_VAULT_ERR.PASSWORD_TOO_SHORT) {
        // Recoverable input constraint: the pending PIN is still valid — don't wipe it.
        // Web mainnet vaults require a ≥12-char password; the user needs to go back
        // and restart onboarding with a full password instead of a PIN.
        const msg = e.userMessage || "Web vault PIN must be at least 8 digits.";
        setError(msg);
        toast.error(msg);
        return;
      }
      clearPendingPin();
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
    try { setKekOrigin('restored'); await importWalletForPendingPin(phrase); setImportPhrasePin(""); setProvisioning(false); }
    catch (e) {
      setProvisioning(false);
      if (isRecoverableSeedInputError(e)) {
        // Recoverable user input (bad BIP-39 checksum/wordlist). consumePendingPin
        // left the pending PIN intact — KEEP it so the user can fix the phrase and
        // retry, instead of being stranded on the misleading "No PIN set" loop.
        setError("That doesn't look like a valid recovery phrase. Check the words and try again.");
        return;
      }
      if (e?.code === WEB_VAULT_ERR.PASSWORD_TOO_SHORT) {
        // Recoverable input constraint: the pending PIN is still valid — don't wipe it.
        // Web mainnet vaults require a ≥12-char password; the user needs to go back
        // and restart onboarding with a full password instead of a PIN.
        const msg = e.userMessage || "Web vault PIN must be at least 8 digits.";
        setError(msg);
        toast.error(msg);
        return;
      }
      // Genuine provisioning/teardown failure: fail closed. Clear the pending PIN;
      // the message must reflect that the user has to set their PIN again.
      if (import.meta.env.DEV) console.error('[WalletEntry] import failed:', e?.name || e);
      clearPendingPin();
      const msg = "Wallet setup couldn't finish securely, so nothing was saved. Please set your PIN and try again.";
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
    const gate = sensitiveGate(raspArtifact, 'import');
    if (gate.blocked) { setError(gate.sentence || 'Seed import is disabled on this device right now.'); return; }
    setBusy(true); setProvisioning(true); setError("");
    try {
      setKekOrigin('restored');
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

  // ---- Restore from an encrypted backup FILE (onboarding, no seed phrase) ----
  // The shared RestoreFromFile component decrypts the backup (via decryptPasswordSeal
  // or decryptPinSeal), asks the user to set a fresh 8-digit device PIN, and re-wraps
  // the vault under that PIN via finalisePinRestore. On success it calls this
  // onFinish. At that point a PIN-unlockable vault EXISTS on this device. We mark the
  // cohort 'pin' so the returning-user surface renders a PinPad (not a password
  // input). isUnlocked is still false — the user unlocks with their new device PIN,
  // which then triggers the MANDATORY hardware-KEK enrollment gate (kekOrigin
  // 'restored'), exactly like a seed re-import. The KEK gate also asks for the PIN —
  // and since the vault is PIN-cohort, it matches. Owner decision 2026-07-16.
  const handleFileRestored = () => {
    setAuthModel("pin"); setAuthModelState("pin");
    setKekOrigin('restored');
    setError(""); setRecovering(false);
    setVaultExists(true);
    setView("unlock");
  };

  // ---- Create: generate the wallet (vault password mandatory) ----
  const handleGenerate = async () => {
    setError("");
    const pw = checkVaultPasswordStrength(genPassword);
    if (!pw.ok) { setError(pw.reason); return; }
    setBusy(true);
    try {
      // Stash the password so we can cache it for Face ID if the user opts in on
      // this same screen (createWallet clears genPassword from state below).
      createdPasswordRef.current = genPassword;
      setKekOrigin('fresh');
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
    const gate = sensitiveGate(raspArtifact, 'import');
    if (gate.blocked) { setError(gate.sentence || 'Seed import is disabled on this device right now.'); return; }
    setError("");
    const pw = checkVaultPasswordStrength(importPassword);
    if (!pw.ok) { setError(pw.reason); return; }
    setBusy(true);
    try {
      setKekOrigin('restored');
      await importWallet(importPhrase.trim(), importPassword); // validates BIP-39 + unlocks
      // A restored/imported wallet is password-encrypted. If this device was in the
      // PIN cohort (e.g. PIN forgotten → "Restore from seed phrase"), leave the PIN
      // cohort so the returning surface matches the vault — otherwise the stale 'pin'
      // marker would render a PIN pad that cannot open this password vault. Done on
      // SUCCESS only: abandoning recovery leaves the existing PIN vault untouched.
      // LEGACY COHORT — pre-PR-#651 restore path. Do NOT remove: live users who ran
      // "Restore from seed phrase" before the PIN unification (PR #651, 2026-07-06) still
      // hold password-cohort vault markers. Removing this write would permanently strand
      // them on the PinPad unlock branch, which cannot accept non-digit vault passwords.
      // New users cannot reach this path: setView("generate") does not exist anywhere.
      // Known gap: this path skips provisionDeniabilityChaff() — duress/stealth/panic
      // chaff is not provisioned. Users must configure deniability manually in Settings.
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
        <ProvisioningView />
      </EntryShell>
    );
  }

  // MANDATORY hardware-KEK enrollment hold. When a restored/created vault on a
  // hardware-capable device is not yet KEK-wrapped, intercept BEFORE the app renders and
  // require the user to enroll (or explicitly skip with a labelled security tradeoff).
  // Held behind !generatedSeed so the one-time create seed-backup screen shows first.
  if (kekGatePending && isUnlocked && !generatedSeed) {
    return (
      <KekEnrollmentGate
        origin={kekOrigin}
        onEnroll={async (pin) => {
          const result = await kekEnroll(pin);
          if (result.ok) kekDismiss();
          return result;
        }}
        onSkip={kekDismiss}
      />
    );
  }

  if (isUnlocked && !generatedSeed && !kekGatePending) return <Outlet />;

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
        <Spinner size="lg" />
      </div>
    );
  }

  // ---- LOUD NEXT-OPEN WIPE ACKNOWLEDGMENT ----
  // A wipe destroyed the local key material (so there is NO vault) but the user must
  // get an unmistakable sign their keys are gone — not the silent generic onboarding.
  // Render BEFORE welcome/onboarding. Both actions acknowledgeWipe() (clear the marker)
  // BEFORE routing on so the screen does not reappear once they move forward.
  if ((wasWiped || localWiped) && vaultExists === false) {
    return (
      <WipedNotice
        onRestore={() => {
          acknowledgeWipe(); setLocalWiped(false);
          navigate("/");
          setError(""); setRecovering(true);
          setRecoverySeed(""); setRealPin(""); setRealPinConfirm("");
          setPinStep("seed"); setView("pin-recover");
        }}
        onStartNew={() => {
          acknowledgeWipe(); setLocalWiped(false);
          navigate("/");
          setError("");
          setRealPin(""); setRealPinConfirm(""); setPinStep("real");
          setView("pin-create");
        }}
      />
    );
  }

  // ---- View: Welcome (fresh-device landing, AHEAD of the PIN) ----
  // No vault exists; show the branded hero. "Get Started" advances to PIN-create,
  // resetting the PIN sub-state exactly as the cold-mount path used to.
  // The FirstRunTour overlays on this screen (once per device).
  if (view === "welcome") {
    return (
      <>
        <WelcomeHero
          onGetStarted={() => {
            setError("");
            setRealPin(""); setRealPinConfirm(""); setPinStep("real");
            setView("pin-create");
          }}
          onRestore={() => { setError(""); setView("restore-file"); }}
        />
        <FirstRunTour />
      </>
    );
  }

  // ---- View: Restore from an encrypted backup file (onboarding, no seed) ----
  // Renders the SAME shared component PersonalBackup's Restore tab uses. The backup
  // carries its own credential, so this path does NOT go through pin-create. On a
  // successful restore, handleFileRestored routes into the unlock screen (then the
  // KEK enrollment gate). onBack returns to welcome (fresh install) or unlock.
  if (view === "restore-file") {
    return (
      <EntryShell error={error}>
        <RestoreFromFile
          onBack={() => { setError(""); setView(vaultExists ? "unlock" : "welcome"); }}
          onFinish={handleFileRestored}
          backLabel="Back"
        />
      </EntryShell>
    );
  }

  // ---- View: Vault/settings desync ----
  // A stale on-device vault was found but the unlock settings (auth-model marker) are
  // missing — typically an iOS reinstall (Keychain survives the app delete) or a
  // partially-cleared localStorage. We do NOT silently clearVault() (I4: never destroy
  // keys without sign-off). Restore re-imports the seed; Wipe is gated behind a typed
  // "WIPE" confirmation before any destructive call.
  if (view === "vault-desync") {
    const doDesyncWipe = async () => {
      setError(""); setDesyncWiping(true);
      try {
        await clearVault();
        // I4 (fail honest): the vault was destroyed — raise the SAME loud, persistent
        // acknowledgement the panic-wipe path shows (setLocalWiped mirrors that flow),
        // so the user gets an unmistakable notice their keys are gone rather than a
        // silent drop into onboarding. The WipedNotice gate (wasWiped||localWiped &&
        // vaultExists===false) renders before the pin-create view below.
        setLocalWiped(true);
        setVaultExists(false);
        setDesyncConfirmWipe(false);
        setDesyncWipeInput("");
        setRealPin(""); setRealPinConfirm(""); setPinStep("real");
        setView("pin-create");
      } catch (e) {
        // Fail closed: surface the failure honestly; do not pretend the wipe happened.
        setError(e?.message || "Could not wipe the existing wallet data on this device. Try again.");
      } finally { setDesyncWiping(false); }
    };
    return (
      <EntryShell error={error}>
        <div className="p-5 rounded-xl border border-caution/40 bg-caution/10 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-caution" />
            <h1 className="text-base font-semibold">Wallet found, settings missing</h1>
          </div>
          <p className="text-sm text-foreground/90">
            An existing wallet was found on this device, but your unlock settings are
            missing. This can happen after reinstalling the app. Restore it with your
            recovery phrase, or wipe this device's data to start fresh.
          </p>
          <p className="text-xs text-muted-foreground">
            Your funds are safe as long as you have your recovery phrase — Veyrnox holds
            nothing on a server. Wiping is permanent and cannot be undone.
          </p>

          {!desyncConfirmWipe ? (
            <div className="space-y-2">
              <Button
                className="w-full gap-2"
                disabled={desyncWiping}
                onClick={() => {
                  setError(""); setRecovering(true);
                  setRecoverySeed(""); setRealPin(""); setRealPinConfirm("");
                  setPinStep("seed"); setView("pin-recover");
                }}
              >
                <Download className="h-4 w-4" /> Restore from recovery phrase
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={desyncWiping}
                onClick={() => { setError(""); setDesyncWipeInput(""); setDesyncConfirmWipe(true); }}
              >
                <AlertOctagon className="h-4 w-4" /> Wipe and start fresh
              </Button>
            </div>
          ) : (
            <div className="space-y-3 pt-1 border-t border-destructive/30">
              <p className="text-xs text-destructive">
                This permanently destroys the wallet data on this device. To confirm, type
                <b> WIPE</b> below. You can only recover with your recovery phrase.
              </p>
              <Input
                value={desyncWipeInput}
                onChange={e => setDesyncWipeInput(e.target.value)}
                placeholder="Type WIPE to confirm"
                autoCapitalize="characters"
                autoCorrect="off"
                aria-label="Type WIPE to confirm"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={desyncWipeInput.trim() !== "WIPE" || desyncWiping}
                  onClick={doDesyncWipe}
                >
                  {desyncWiping ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : <AlertOctagon className="h-4 w-4" />} Permanently wipe
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  disabled={desyncWiping}
                  onClick={() => { setDesyncConfirmWipe(false); setDesyncWipeInput(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </EntryShell>
    );
  }

  // ---- View: Unlock (PIN cohort) ----
  if (view === "unlock" && authModel === "pin") {
    const bioLabel = bioStatus?.label || "Face ID";
    return (
      <EntryShell error={error}>
        <div className="p-4 rounded-xl border border-border bg-card space-y-4">
          {biometricEnabled && !biometricFailed && (
            <>
              <Button className="w-full gap-2 h-12 text-base" disabled={busy} onClick={handleBiometricUnlock}>
                {busy ? <RefreshCw className="h-5 w-5 motion-safe:animate-spin" /> : <ScanFace className="h-5 w-5" />} Unlock with {bioLabel}
              </Button>
              <div className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">or enter your PIN</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          {biometricEnabled && biometricFailed && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {bioLabel} didn't work. Enter your PIN below — it's your real key and always works.
            </p>
          )}
          <div className="flex items-center justify-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-muted-foreground" /> Enter your PIN
          </div>
          <ShakeOnKey shakeKey={pinShakeKey}>
            <PinPad value={unlockPin} onChange={setUnlockPin} onComplete={runPinUnlock} disabled={busy} submitLabel="Unlock" />
          </ShakeOnKey>
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
          {biometricEnabled && !biometricFailed && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <ScanFace className="h-4 w-4 text-primary" /> Welcome back
              </div>
              <Button className="w-full gap-2 h-12 text-base" disabled={busy} onClick={handleBiometricUnlock}>
                {busy ? <RefreshCw className="h-5 w-5 motion-safe:animate-spin" /> : <ScanFace className="h-5 w-5" />} Unlock with {bioLabel}
              </Button>
              <div className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">or use your vault password</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-muted-foreground" /> {biometricEnabled && !biometricFailed ? "Enter your PIN" : "Unlock your wallet"}
          </div>
          {/* Password-cohort (handleImport path): render a text input so the user can
              type their vault password — numeric PinPad buttons cannot accept non-digit
              passwords and would permanently strand the user. I4: still fails closed via
              runUnlock if the credential is wrong. */}
          {authModel === "password" ? (
            <div className="space-y-2">
              <PasswordInput
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                placeholder="Vault password"
                aria-label="Vault password"
                value={unlockPassword}
                onChange={e => { setUnlockPassword(e.target.value); setError(""); }}
                onKeyDown={e => { if (e.key === "Enter" && unlockPassword && !busy) runUnlock(); }}
                disabled={busy}
              />
              <Button className="w-full" disabled={!unlockPassword || busy} onClick={() => runUnlock()}>
                {busy ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin mr-1.5" /> : null} Unlock
              </Button>
            </div>
          ) : (
            <ShakeOnKey shakeKey={pinShakeKey}>
              <PinPad value={unlockPassword} onChange={setUnlockPassword} onComplete={runUnlock} disabled={busy} submitLabel="Unlock" />
            </ShakeOnKey>
          )}

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
    // hasPendingPin = PIN cohort Phase-1 done (web and native share this cohort now).
    // Means the credential is set and the user is at the Phase-2 Create/Import choice.
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
                  <Button className="w-full gap-2" disabled={busy} onClick={() => { if (referralInput.trim()) setPendingReferral(referralInput.trim().toUpperCase()); doCreateWallet(); }}>
                    <Shield className="h-4 w-4" /> Create Wallet
                  </Button>
                  <Button variant="outline" className="w-full gap-2" disabled={busy} onClick={() => { setError(""); setImportPhrasePin(""); setChoosePinImport(true); }}>
                    <Download className="h-4 w-4" /> Import an existing seed
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Got an invite code? (optional)</Label>
                  <Input
                    value={referralInput}
                    onChange={e => setReferralInput(e.target.value.toUpperCase())}
                    placeholder="VYX-XXXXXX"
                    maxLength={10}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    className="mono-value tracking-widest text-sm"
                  />
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
                <Button className="w-full gap-2" disabled={!importPhrasePin.trim() || busy} onClick={() => { if (referralInput.trim()) setPendingReferral(referralInput.trim().toUpperCase()); doImportWallet(); }}>
                  {busy ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : <Download className="h-4 w-4" />} Restore / Import
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
          <p className="text-sm text-muted-foreground">No wallet on this device yet. Set an 8-digit PIN, then create a new self-custody wallet or import an existing seed phrase. Your PIN encrypts it locally — keys never leave this device.</p>
          <div className="space-y-2">
            <Button className="w-full gap-2" onClick={() => { setError(""); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); setView("pin-create"); }}>
              <Shield className="h-4 w-4" /> Set a PIN to continue
            </Button>
            {/* Third path: restore from an encrypted .enc backup + its own backup
                credential (no seed phrase, no new-PIN re-wrap). */}
            <button
              type="button"
              onClick={() => { setError(""); setView("restore-file"); }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Have an encrypted backup? <span className="text-primary">Restore from a backup file</span>
            </button>
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
              <p className="text-sm font-medium">Choose an 8-digit PIN</p>
              <p className="text-xs text-muted-foreground">This unlocks your wallet. An 8-digit PIN. Always guard your device.</p>
              <PinPad value={realPin} onChange={(v) => { setRealPin(v); if (error) setError(""); }} onComplete={(p) => {
                const s = checkPinStrength(p);
                if (!s.ok) { setError(s.reason); setRealPin(""); setPinStep("real"); return; }
                setError(""); setRealPinConfirm(""); setPinStep("real-confirm");
              }} />
            </div>
          )}

          {pinStep === "real-confirm" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Confirm your PIN</p>
              <PinPad value={realPinConfirm} onChange={(v) => { setRealPinConfirm(v); if (error) setError(""); }} onComplete={(p) => {
                if (!pinsEqual(p, realPin)) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
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
              <p className="text-sm font-medium">Choose a new 8-digit PIN</p>
              <p className="text-xs text-muted-foreground">This unlocks your restored wallet. Your seed stays encrypted on this device.</p>
              <PinPad value={realPin} onChange={(v) => { setRealPin(v); if (error) setError(""); }} onComplete={(p) => {
                const s = checkPinStrength(p);
                if (!s.ok) { setError(s.reason); setRealPin(""); setPinStep("real"); return; }
                setError(""); setRealPinConfirm(""); setPinStep("real-confirm");
              }} />
            </div>
          )}

          {pinStep === "real-confirm" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Confirm your new PIN</p>
              <PinPad value={realPinConfirm} onChange={(v) => { setRealPinConfirm(v); if (error) setError(""); }} onComplete={(p) => {
                if (!pinsEqual(p, realPin)) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
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
            {/* H-A — honest web-vault disclosure (I4). On web there is no hardware
                second factor: the password is the ONLY thing protecting the seed.
                Native adds the hardware KEK, so this banner is web-only. */}
            {!Capacitor.isNativePlatform() && (
              <div className="p-3 rounded-xl border border-border bg-secondary/30 text-xs text-muted-foreground flex items-start gap-2" data-testid="web-vault-entropy-notice">
                <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Web vault: your password is the only protection for your seed. Use a strong passphrase, not a short PIN. The native app adds a hardware layer.</span>
              </div>
            )}
            <div>
              <Label>Vault Password</Label>
              <PasswordInput className="mt-1.5" value={genPassword} onChange={e => setGenPassword(e.target.value)} placeholder="Encrypts your new seed on this device" aria-label="New vault password" onKeyDown={e => { if (e.key === "Enter" && !busy) handleGenerate(); }} />
              <p className="text-xs text-muted-foreground mt-1">Encrypts the vault with strong on-device encryption. At least 12 characters · any characters allowed. This is your real key — required, never skipped.</p>
            </div>
            <Button className="w-full gap-2" disabled={busy} onClick={handleGenerate}>
              {busy ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : <RefreshCw className="h-4 w-4" />} Set Password & Generate Seed
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Anchor the moment: this seed is being sealed into the on-device
                vault. The illustration mirrors the KEK enrollment screen so
                the "your wallet lives inside this device" story reads as one
                continuous arc across onboarding. */}
            <div className="flex flex-col items-center text-center gap-2 pt-1">
              <VaultIllustration size={168} label="Encrypted vault" />
              <h2 className="text-lg font-semibold tracking-tight">Sealing your wallet into the vault</h2>
              <p className="text-xs leading-relaxed text-muted-foreground max-w-[20rem]">
                These 12 words are the only backup. Write them down offline before you
                continue — they're shown once and we cannot recover them for you.
              </p>
            </div>
            <SeedGrid mnemonic={generatedSeed} />
            <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground flex items-start gap-2">
              <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>Your wallet is created and unlocked. Back up your phrase before continuing — it is never shown again and we cannot recover it for you.</span>
            </div>

            {/* Optional Face ID offer folded onto the SAME screen (skippable). */}
            <BiometricOffer status={bioStatus} enabled={bioEnabled} onToggle={setBioEnabled} />

            <Button className="w-full gap-2" disabled={busy} onClick={finishCreate}>
              {busy ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : <Check className="h-4 w-4" />} I've backed it up — Enter Wallet
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
          <PasswordInput className="mt-1.5" value={importPassword} onChange={e => setImportPassword(e.target.value)} placeholder="Encrypts your seed on this device" aria-label="Vault password for imported seed" />
          <p className="text-xs text-muted-foreground mt-1">Encrypts the vault with strong on-device encryption. At least 12 characters · any characters allowed.</p>
        </div>

        {/* Optional Face ID offer folded onto the SAME screen (skippable). */}
        <BiometricOffer status={bioStatus} enabled={bioEnabled} onToggle={setBioEnabled} />

        <Button className="w-full gap-2" disabled={!importPhrase.trim() || !importPassword || busy} onClick={handleImport}>
          {busy ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : <Download className="h-4 w-4" />} {recovering ? "Restore Wallet" : "Validate & Import"}
        </Button>
      </div>
    </EntryShell>
  );
}
