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
// recoverable from the 2 remaining bundles alone. The design consequence:
// the OFFLINE strength of the recovered wallet on the new device is bounded
// by whatever the user types here. A short numeric PIN would give an
// attacker who obtains 2 bundles a ~10^8 offline crack surface — with no
// hardware anchor to slow it down. This screen therefore enforces a
// PASSPHRASE (via checkRecoveryPassphrase, min 16 chars) as the re-wrap
// credential; do NOT relax that back to a numeric PIN without owner sign-off
// and a compensating factor (hardware KEK re-enrolment before first sign,
// old-vault password verification, etc.).
// ────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Upload, FileText } from "lucide-react";
import PinPad from "@/components/security/PinPad";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useWallet } from "@/lib/WalletProvider";
import {
  tryParseRecoveryEnvelope,
  unwrapBundleWithPassphrase,
  checkRecoveryPassphrase,
  RECOVERY_PASSPHRASE_MIN_LENGTH,
} from "@/wallet-core/recoveryShare";

const BUNDLE_ENVELOPE_TYPE = "recovery-bundle-v1";

const BACK_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-foreground/90 hover:bg-white/[0.08] hover:text-foreground";

const NUMERIC_PASSPHRASE_RE = /^\d+$/;

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

function canUseNumericKeypad(value) {
  return value.trim() === "" || NUMERIC_PASSPHRASE_RE.test(value.trim());
}

function RecoveryPassphraseField({
  label,
  value,
  onChange,
  useKeypad,
  setUseKeypad,
  placeholder,
  autoComplete,
  submitLabel = "Done",
}) {
  const keypadEligible = canUseNumericKeypad(value);
  const showKeypad = useKeypad && keypadEligible;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => setUseKeypad((v) => !v)}
          className="text-xs font-medium text-primary hover:text-primary/80"
        >
          {showKeypad ? "Use keyboard" : "Use keypad"}
        </button>
      </div>
      {showKeypad ? (
        <>
          <PinPad
            value={value}
            onChange={onChange}
            onComplete={() => {}}
            disabled={false}
            length={Math.max(RECOVERY_PASSPHRASE_MIN_LENGTH, value.length || RECOVERY_PASSPHRASE_MIN_LENGTH)}
            submitLabel={submitLabel}
            aria-label={`${label} numeric passphrase entry`}
            numericOnly
          />
          <p className="text-xs text-muted-foreground">
            Numeric passphrases still need at least {RECOVERY_PASSPHRASE_MIN_LENGTH} digits.
          </p>
        </>
      ) : (
        <>
          <PasswordInput
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete={autoComplete}
          />
          {!keypadEligible && (
            <p className="text-xs text-muted-foreground">
              Keypad mode is available for numeric-only passphrases.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function RestoreFromShares() {
  const navigate = useNavigate();
  const { restoreFromRecoveryBundles } = useWallet();
  // ponytail: these strings sit in React state closure — String is immutable
  // in JS, so we cannot literally zero the underlying bytes. We minimise the
  // window by clearing on unmount + immediately after successful reconstruction
  // (see cleanup effect below and the success branch). The residual is bounded
  // by the GC's decision to reclaim the old snapshot string, which is the same
  // ceiling every other password-typed field on the app hits.
  const [shareA, setShareA] = useState("");
  const [shareB, setShareB] = useState("");
  const [phase, setPhase] = useState("input"); // input | passphrase | busy
  const [newPassphrase, setNewPassphrase] = useState("");
  const [newPassphraseConfirm, setNewPassphraseConfirm] = useState("");
  const [error, setError] = useState("");
  const [useKeypadA, setUseKeypadA] = useState(false);
  const [useKeypadB, setUseKeypadB] = useState(false);
  const [useKeypadNew, setUseKeypadNew] = useState(false);
  const [useKeypadConfirm, setUseKeypadConfirm] = useState(false);
  const fileRefA = useRef(null);
  const fileRefB = useRef(null);
  const [passphraseA, setPassphraseA] = useState("");
  const [passphraseB, setPassphraseB] = useState("");

  const envelopeA = useMemo(() => detectBundleEnvelope(shareA), [shareA]);
  const envelopeB = useMemo(() => detectBundleEnvelope(shareB), [shareB]);

  // Clear every credential-shaped state on unmount so navigating away doesn't
  // leave a share/bundle passphrase/new-passphrase live on the React fiber.
  useEffect(() => {
    return () => {
      setShareA("");
      setShareB("");
      setPassphraseA("");
      setPassphraseB("");
      setNewPassphrase("");
      setNewPassphraseConfirm("");
      setUseKeypadA(false);
      setUseKeypadB(false);
      setUseKeypadNew(false);
      setUseKeypadConfirm(false);
    };
  }, []);

  useEffect(() => {
    if (!canUseNumericKeypad(passphraseA)) setUseKeypadA(false);
  }, [passphraseA]);

  useEffect(() => {
    if (!canUseNumericKeypad(passphraseB)) setUseKeypadB(false);
  }, [passphraseB]);

  useEffect(() => {
    if (!canUseNumericKeypad(newPassphrase)) setUseKeypadNew(false);
  }, [newPassphrase]);

  useEffect(() => {
    if (!canUseNumericKeypad(newPassphraseConfirm)) setUseKeypadConfirm(false);
  }, [newPassphraseConfirm]);

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

  const advanceToPassphrase = useCallback(() => {
    setError("");
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
    setPhase("passphrase");
  }, [shareA, shareB, envelopeA, envelopeB, passphraseA, passphraseB]);

  const submitPassphrase = useCallback(async () => {
    setError("");
    // 2026-08-16 audit: the re-wrap credential MUST be a passphrase, not a
    // numeric PIN. See the KEK-bypass architecture note at the top of this
    // file for the rationale.
    const strength = checkRecoveryPassphrase(newPassphrase);
    if (!strength.ok) {
      setError(strength.reason || `Use at least ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters.`);
      return;
    }
    if (newPassphrase !== newPassphraseConfirm) {
      setError("Passphrases do not match.");
      return;
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
      await restoreFromRecoveryBundles([resolvedA, resolvedB], newPassphrase);
      // Zero every credential-shaped state on success. String immutability
      // means we replace the closure ref, not the bytes; the GC decides.
      setShareA(""); setShareB("");
      setNewPassphrase(""); setNewPassphraseConfirm("");
      setPassphraseA(""); setPassphraseB("");
      navigate("/");
    } catch (err) {
      setError((err instanceof Error && err.message) || "Restore failed.");
      setPhase("passphrase");
    }
  }, [newPassphrase, newPassphraseConfirm, shareA, shareB, envelopeA, envelopeB, passphraseA, passphraseB, restoreFromRecoveryBundles, navigate]);

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

      {phase === "input" && (
        <div className="space-y-4">
          <ShareInput label="Share 1" value={shareA} setValue={setShareA} fileRef={fileRefA} which="A" />
          {envelopeA && (
            <RecoveryPassphraseField
              label="Share 1 Recovery Passphrase"
              value={passphraseA}
              onChange={setPassphraseA}
              useKeypad={useKeypadA}
              setUseKeypad={setUseKeypadA}
              placeholder={`Recovery passphrase for share 1 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
              autoComplete="current-password"
              submitLabel="Done"
            />
          )}
          <ShareInput label="Share 2" value={shareB} setValue={setShareB} fileRef={fileRefB} which="B" />
          {envelopeB && (
            <RecoveryPassphraseField
              label="Share 2 Recovery Passphrase"
              value={passphraseB}
              onChange={setPassphraseB}
              useKeypad={useKeypadB}
              setUseKeypad={setUseKeypadB}
              placeholder={`Recovery passphrase for share 2 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
              autoComplete="current-password"
              submitLabel="Done"
            />
          )}
          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
          <button
            onClick={advanceToPassphrase}
            disabled={!shareA.trim() || !shareB.trim()}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {phase === "passphrase" && (
        <div className="space-y-4">
          <p className="text-sm">
            Choose a new passphrase for this device (min {RECOVERY_PASSPHRASE_MIN_LENGTH} characters).
            This must be a PASSPHRASE, not a PIN — a short PIN is not enough entropy to protect a
            cross-device restore.
          </p>
          <RecoveryPassphraseField
            label="New Device Passphrase"
            value={newPassphrase}
            onChange={setNewPassphrase}
            useKeypad={useKeypadNew}
            setUseKeypad={setUseKeypadNew}
            placeholder={`New passphrase (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
            autoComplete="new-password"
            submitLabel="Done"
          />
          <RecoveryPassphraseField
            label="Confirm New Device Passphrase"
            value={newPassphraseConfirm}
            onChange={setNewPassphraseConfirm}
            useKeypad={useKeypadConfirm}
            setUseKeypad={setUseKeypadConfirm}
            placeholder="Confirm new passphrase"
            autoComplete="new-password"
            submitLabel="Done"
          />
          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
          <button
            onClick={submitPassphrase}
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
