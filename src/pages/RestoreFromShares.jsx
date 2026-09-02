// pages/RestoreFromShares.jsx
//
// Cross-device (Phase 3) shard restore. Fresh phone, no vault on disk, user
// supplies 2 of 3 recovery bundles → provider reconstructs → prompt for a NEW
// passphrase → importWallet re-encrypts under that passphrase. See
// docs/cloud-recovery-shard-spec.md and wallet-core/shardBackup.js.
//
// ─── KEK-BYPASS ARCHITECTURE (READ BEFORE EDITING) ─────────────────────────
// This flow deliberately bypasses the on-device KEK / hardware / prior
// action-password chain: any 2 recovery bundles + a new user-supplied
// credential = full seed recovery on a brand-new device. That is the whole
// POINT of cross-device recovery — a lost or destroyed device must be
// recoverable from the 2 remaining bundles alone.
//
// 2026-09-01 (owner sign-off): on NATIVE the re-wrap credential is an
// 8-digit PIN, matching every other vault-entry path (fresh create, phrase
// import, PIN recovery, file restore). The KEK gate (WalletEntry) fires
// post-restore and the PIN is handed to it via router state so it can
// auto-enrol without a second entry.
//
// HONEST LIMIT — the KEK gate is NOT an enforced compensating factor, and
// this note claimed it was ("MANDATORY before first sign") until
// 2026-09-02. It is not. Three independent ways to reach a signing surface
// from a restored vault with no hardware anchor:
//   1. KekEnrollmentGate renders an explicit "Skip for now" button, and
//      handleKekSkip (WalletEntry) only calls kekDismiss() — which is
//      setGateActive(false), in-memory. The gate re-fires next unlock; the
//      user is in the wallet now.
//   2. NO signing path consults isHardwareKekEnrolled. Grep it: the only
//      callers are SecurityPosture (display), hardwareKekStatus (the
//      definition), PersonalBackup (shard-export readiness) and two tests.
//      Not sign-gate, not SendCrypto, not CryptoSigning, not WalletConnect.
//   3. An insecure-tier device persists veyrnox-kek-insecure-tier via
//      suppressInsecureTier() and stops prompting permanently.
// So the restored vault can sit at ~27 bits (8-digit PIN + Argon2id) with
// nothing above it. That is the same exposure fresh-create carries, which
// is why the parity argument holds — but it is NOT a compensating factor,
// and must not be described as one. See issue #2257; closing the gap means
// gating the signing chokepoints on KEK enrolment, with a deliberate answer
// for devices that genuinely cannot enrol (or it becomes a lockout).
//
// Until that lands: do not write "required" / "mandatory" about KEK
// re-enrolment here or in user-facing copy. KekEnrollmentGate's own skip
// warning is the honest register to match.
//
// On WEB there is no hardware anchor, so the passphrase path is retained
// (checkRecoveryPassphrase, min 16 chars). Do NOT relax that on web
// without a new compensating factor.
// ────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router";
import { Capacitor } from "@capacitor/core";
import { ArrowLeft, Upload, FileText } from "lucide-react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useWallet } from "@/lib/WalletProvider";
import {
  tryParseRecoveryEnvelope,
  unwrapBundleWithPassphrase,
  checkRecoveryPassphrase,
  RECOVERY_PASSPHRASE_MIN_LENGTH,
} from "@/wallet-core/recoveryShare";

// Native shard restore uses an 8-digit PIN as the new vault credential;
// the KEK gate in WalletEntry re-wraps it under hardware before first sign.
const RESTORE_PIN_LENGTH = 8;
const IS_NATIVE = Capacitor.isNativePlatform();

const BUNDLE_ENVELOPE_TYPE = "recovery-bundle-v1";

const BACK_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-foreground/90 hover:bg-white/[0.08] hover:text-foreground";

/** Detect whether pasted/loaded text is a passphrase-wrapped bundle envelope
 * (recovery-bundle-v1) rather than a raw bundle. Returns the parsed envelope
 * object, or null for anything else (raw bundle JSON, empty, malformed). */
function detectBundleEnvelope(text) {
  if (!text || !text.trim()) return null;
  const parsed = tryParseRecoveryEnvelope(new TextEncoder().encode(text));
  return parsed && parsed.type === BUNDLE_ENVELOPE_TYPE ? parsed : null;
}

/** Resolve a picked share's text to the raw bundle JSON string
 * combineFromBundles expects — unwrapping a passphrase envelope if the
 * detector flagged one, otherwise passing the raw bundle text through. */
async function resolveBundleText(text, envelope, passphrase) {
  if (!envelope) return text;
  const bytes = await unwrapBundleWithPassphrase(envelope, passphrase);
  return new TextDecoder().decode(bytes);
}

/** Read a File object to a text string (handles .json / .txt bundle files). */
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("Could not read file."));
    r.readAsText(file);
  });
}

export default function RestoreFromShares() {
  const navigate = useNavigate();
  const { restoreFromRecoveryBundles, vaultExists } = useWallet();
  // ponytail: these strings sit in React state closure — String is immutable
  // in JS, so we cannot literally zero the underlying bytes. We minimise the
  // window by clearing on unmount + immediately after successful reconstruction
  // (see cleanup effect below and the success branch). The residual is bounded
  // by the GC's decision to reclaim the old snapshot string, which is the same
  // ceiling every other password-typed field on the app hits.
  const [shareA, setShareA] = useState("");
  const [shareB, setShareB] = useState("");
  const [phase, setPhase] = useState("input"); // input | credential | busy
  const [newPassphrase, setNewPassphrase] = useState("");
  const [newPassphraseConfirm, setNewPassphraseConfirm] = useState("");
  // Native-only: 8-digit PIN + confirm. On web the passphrase fields above are used.
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [error, setError] = useState("");
  // Contingency: existing vault on this device (from WalletProvider's
  // synchronous probe). If true, restore is blocked — user must Panic Wipe
  // first (overwriting an existing vault silently is a destructive-tap risk).
  // vaultExists is tri-state (true | false | null-unknown); only `true` blocks.
  const vaultPresent = vaultExists === true;
  const fileRefA = useRef(null);
  const fileRefB = useRef(null);
  const [passphraseA, setPassphraseA] = useState("");
  const [passphraseB, setPassphraseB] = useState("");

  const envelopeA = useMemo(() => detectBundleEnvelope(shareA), [shareA]);
  const envelopeB = useMemo(() => detectBundleEnvelope(shareB), [shareB]);

  // Clear every credential-shaped state on unmount so navigating away doesn't
  // leave a share/bundle passphrase/new-passphrase/PIN live on the React fiber.
  useEffect(() => {
    return () => {
      setShareA("");
      setShareB("");
      setPassphraseA("");
      setPassphraseB("");
      setNewPassphrase("");
      setNewPassphraseConfirm("");
      setNewPin("");
      setNewPinConfirm("");
    };
  }, []);


  const pickInto = useCallback(async (which, file) => {
    setError("");
    if (!file) return;
    try {
      const text = await readFileText(file);
      if (which === "A") setShareA(text.trim());
      else setShareB(text.trim());
    } catch (e) {
      setError((e instanceof Error && e.message) || "Could not read file.");
    }
  }, []);

  const advanceToCredential = useCallback(() => {
    setError("");
    if (vaultPresent) {
      setError(
        "This device already has a wallet. Wipe it from Settings → Panic Wipe before restoring from recovery bundles."
      );
      return;
    }
    if (!shareA.trim() || !shareB.trim()) {
      setError("Provide both recovery bundles.");
      return;
    }
    if (envelopeA && passphraseA.trim().length < RECOVERY_PASSPHRASE_MIN_LENGTH) {
      setError(`Enter the recovery passphrase for share 1 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters).`);
      return;
    }
    if (envelopeB && passphraseB.trim().length < RECOVERY_PASSPHRASE_MIN_LENGTH) {
      setError(`Enter the recovery passphrase for share 2 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters).`);
      return;
    }
    setPhase("credential");
  }, [shareA, shareB, envelopeA, envelopeB, passphraseA, passphraseB, vaultPresent]);

  const submitCredential = useCallback(async () => {
    setError("");
    if (vaultPresent) {
      setError("This device already has a wallet. Wipe it first (Settings → Panic Wipe).");
      return;
    }
    // Native: 8-digit PIN. WalletEntry's KEK gate offers re-enrol
    // post-restore, but it is SKIPPABLE and no signing path checks it — see
    // the HONEST LIMIT block in the KEK-BYPASS ARCHITECTURE note at the top
    // of this file (#2257). Web: passphrase, no hardware anchor available.
    let credential;
    if (IS_NATIVE) {
      if (!/^\d{8}$/.test(newPin)) {
        setError(`Enter your new ${RESTORE_PIN_LENGTH}-digit PIN.`);
        return;
      }
      if (newPin !== newPinConfirm) {
        setError("PINs do not match.");
        return;
      }
      credential = newPin;
    } else {
      const strength = checkRecoveryPassphrase(newPassphrase);
      if (!strength.ok) {
        setError(strength.reason || `Use at least ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters.`);
        return;
      }
      if (newPassphrase !== newPassphraseConfirm) {
        setError("Passphrases do not match.");
        return;
      }
      credential = newPassphrase;
    }
    setPhase("busy");
    // An encrypted share is unwrapped back to its raw bundle JSON here —
    // restoreFromRecoveryBundles/combineFromBundles must never see the
    // envelope shape. Fail-closed: unwrap throws on a wrong passphrase or
    // tampered envelope. Kept in its own try/catch: on a wrong passphrase
    // the user must land back on the input step (where passphraseA/B are
    // editable), not the passphrase step, which has no way to correct them.
    let resolvedA, resolvedB;
    try {
      resolvedA = await resolveBundleText(shareA.trim(), envelopeA, passphraseA);
      resolvedB = await resolveBundleText(shareB.trim(), envelopeB, passphraseB);
    } catch {
      // Generic message — never say which share's passphrase was wrong,
      // that would be an oracle.
      setError("One of the recovery passphrases was wrong. Please re-enter it and try again.");
      setPhase("input");
      return;
    }
    try {
      await restoreFromRecoveryBundles([resolvedA, resolvedB], credential);
      // Hand the just-typed PIN to WalletEntry via router state so its
      // KekEnrollmentGate can auto-enrol without a redundant re-entry. In-
      // memory only, single-consume (WalletEntry clears history state on
      // read). Passphrase path (web) has no KEK gate to feed. See the
      // KEK-BYPASS ARCHITECTURE note at the top of this file.
      const navState = IS_NATIVE ? { pendingKekEnrollPin: credential } : undefined;
      // Zero every credential-shaped state on success. String immutability
      // means we replace the closure ref, not the bytes; the GC decides.
      setShareA(""); setShareB("");
      setNewPassphrase(""); setNewPassphraseConfirm("");
      setNewPin(""); setNewPinConfirm("");
      setPassphraseA(""); setPassphraseB("");
      navigate("/", navState ? { state: navState, replace: true } : { replace: true });
    } catch (err) {
      setError((err instanceof Error && err.message) || "Restore failed.");
      setPhase("credential");
    }
  }, [newPassphrase, newPassphraseConfirm, newPin, newPinConfirm, vaultPresent, shareA, shareB, envelopeA, envelopeB, passphraseA, passphraseB, restoreFromRecoveryBundles, navigate]);

  const ShareInput = ({ label, value, setValue, fileRef, which }) => (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/40"
        >
          <Upload className="h-4 w-4" /> Pick file
        </button>
        {value && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> bundle loaded ({value.length} chars)
          </span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json,text/plain"
        className="hidden"
        onChange={(e) => pickInto(which, e.target.files?.[0])}
      />
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Or paste JSON</summary>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='{"v":1,"shareIndex":...,"shareBytes":"...","vault":{...}}'
          className="mt-2 w-full h-28 p-2 rounded-lg border border-border bg-background font-mono text-xs"
        />
      </details>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      <button type="button" onClick={() => navigate("/")} className={BACK_CHIP}>
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /> Back
      </button>
      <h1 className="text-xl font-semibold">Restore from recovery shares</h1>
      <p className="text-sm text-muted-foreground">
        Load any 2 of your 3 <code>.veyrnox-bundle.json</code> files (from your device, cloud drive, USB, etc.).
        This device rebuilds the wallet and locks it under a new passphrase — the seed never leaves the device.
      </p>

      {vaultPresent && (
        <p className="text-sm text-red-500" role="alert">
          This device already has a wallet. Wipe it from Settings → Panic Wipe before restoring
          — the restore would otherwise overwrite it.
        </p>
      )}

      {phase === "input" && (
        <div className="space-y-4">
          <ShareInput label="Share 1" value={shareA} setValue={setShareA} fileRef={fileRefA} which="A" />
          {envelopeA && (
            <PasswordInput
              value={passphraseA}
              onChange={(e) => setPassphraseA(e.target.value)}
              placeholder={`Recovery passphrase for share 1 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
              autoComplete="current-password"
            />
          )}
          <ShareInput label="Share 2" value={shareB} setValue={setShareB} fileRef={fileRefB} which="B" />
          {envelopeB && (
            <PasswordInput
              value={passphraseB}
              onChange={(e) => setPassphraseB(e.target.value)}
              placeholder={`Recovery passphrase for share 2 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
              autoComplete="current-password"
            />
          )}
          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
          <button
            onClick={advanceToCredential}
            disabled={!shareA.trim() || !shareB.trim() || vaultPresent}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {phase === "credential" && IS_NATIVE && (
        <div className="space-y-4">
          <p className="text-sm">
            Choose a new {RESTORE_PIN_LENGTH}-digit PIN for this device. After restore you
            will be prompted to turn on Hardware Protection — do it then if you can.
          </p>
          <p className="text-sm text-muted-foreground">
            Until you do, this wallet is protected by your PIN alone. Someone who copies it
            could try to break a {RESTORE_PIN_LENGTH}-digit PIN offline. You can turn
            Hardware Protection on later in Security settings.
          </p>
          <PasswordInput
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, RESTORE_PIN_LENGTH))}
            placeholder={`New ${RESTORE_PIN_LENGTH}-digit PIN`}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={RESTORE_PIN_LENGTH}
            autoComplete="new-password"
          />
          <PasswordInput
            value={newPinConfirm}
            onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, "").slice(0, RESTORE_PIN_LENGTH))}
            placeholder="Confirm PIN"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={RESTORE_PIN_LENGTH}
            autoComplete="new-password"
          />
          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
          <button
            onClick={submitCredential}
            disabled={newPin.length !== RESTORE_PIN_LENGTH || newPinConfirm.length !== RESTORE_PIN_LENGTH}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            Restore
          </button>
        </div>
      )}

      {phase === "credential" && !IS_NATIVE && (
        <div className="space-y-4">
          <p className="text-sm">
            Choose a new passphrase for this device (min {RECOVERY_PASSPHRASE_MIN_LENGTH} characters).
            Web has no hardware anchor, so a passphrase (not a PIN) is required here.
          </p>
          <PasswordInput
            value={newPassphrase}
            onChange={(e) => setNewPassphrase(e.target.value)}
            placeholder={`New passphrase (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
            autoComplete="new-password"
          />
          <PasswordInput
            value={newPassphraseConfirm}
            onChange={(e) => setNewPassphraseConfirm(e.target.value)}
            placeholder="Confirm new passphrase"
            autoComplete="new-password"
          />
          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
          <button
            onClick={submitCredential}
            disabled={!newPassphrase}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            Restore
          </button>
        </div>
      )}

      {phase === "busy" && (
        <p className="text-sm text-muted-foreground">Restoring wallet…</p>
      )}
    </div>
  );
}
