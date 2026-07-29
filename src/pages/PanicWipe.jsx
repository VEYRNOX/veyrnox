// @ts-nocheck
// pages/PanicWipe.jsx
//
// PANIC WIPE  (S3 — Direction-C individual security).  PROVISIONAL.
// ⚠️ DESTRUCTIVE + SAFETY-CRITICAL — FLAGGED FOR SPECIFIC AUDIT SCRUTINY. ⚠️
//
// Emergency, IRREVERSIBLE destruction of the LOCAL device copy of all wallet key
// material — for a user under threat who needs to ensure nothing is recoverable
// from the device. Destroys the primary vault, the duress decoy, the entire
// stealth/hidden-wallet pool, and the panic marker. Routes through the existing
// keystore/WalletProvider; the destruction primitive lives in
// src/wallet-core/panic.js (vault.js / vaultStore.js / signing.js untouched).
//
// TWO TRIGGERS (see panic.js header for the full rationale):
//   1. PANIC PIN AT UNLOCK — a dedicated PIN entered at the normal unlock prompt
//      fires the wipe with NO confirmation (duress-appropriate: under coercion a
//      dialog is a liability). Misfire-protected by an exact-decrypt match, a
//      ≥6-char floor, and being checked only AFTER the primary unlock fails.
//   2. IN-APP GUARDED ACTION — a type-to-confirm ("WIPE") + acknowledgement
//      button for calmly decommissioning a device (here a confirmation IS right).
//
// HONEST LIMIT (stated plainly to the user): panic wipe destroys the LOCAL copy
// only. A seed backup held elsewhere (paper, password manager, another device)
// STILL recovers the wallet — that is intended. Wipe protects the device, not the
// seed. On-chain history stays public; flash-media forensic recovery is out of
// scope (we delete logical records, not sanitise media — but only ciphertext was
// ever stored).
//
// DEMO vs NATIVE:
//   - Set/remove panic PIN + the in-app guarded wipe work everywhere (testnet).
//   - The "Live demonstration" card is DEMO-gated: it stands up a throwaway real
//     vault + duress decoy + hidden wallet + panic PIN, INSPECTS local key
//     material (before), fires the wipe via the REAL unlock path, and inspects
//     again (after) to prove nothing recoverable remains — all on the simulator.

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";
import {
  Bomb, AlertOctagon, ShieldOff, CheckCircle2,
  FlaskConical, Lock, Trash2, Database, HardDrive, KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PinPad from "@/components/security/PinPad";
import { useActionGuard } from "@/components/security/useActionGuard";

// Fixed demo credentials so the simulator walkthrough is one-click reproducible.
// DEMO ONLY — never used outside the demonstration panel.
const DEMO_REAL_PW = "real-pin-2468";
const DEMO_DURESS_PW = "duress-pin-1357";
const DEMO_HIDDEN_SECRET = "hidden-key-9753";
const DEMO_PANIC_PW = "burn-everything-0000";

// The literal a user must type to arm the in-app guarded wipe.
const CONFIRM_WORD = "WIPE";

// Renders an inspectKeyMaterial() report: what local key material currently
// exists (vault blobs in IndexedDB + demo address-residue maps). Used to show
// "before" (key material present) and "after" (clean) a wipe.
function KeyMaterialReport({ report, title }) {
  const { t } = useTranslation("security");
  if (!report) return null;
  const clean = report.clean;
  const badge = clean
    ? t("panic.keys_report_no_material")
    : t(
        report.vaultBlobCount === 1
          ? "panic.keys_report_vault_blobs_one"
          : "panic.keys_report_vault_blobs_other",
        { count: report.vaultBlobCount },
      );
  return (
    <div className={`rounded-lg border p-3 text-xs space-y-2 ${clean ? "border-success/30 bg-success/5" : "border-caution/30 bg-caution/5"}`}>
      <div className="flex items-center gap-2 font-semibold">
        {clean
          ? <CheckCircle2 className="h-4 w-4 text-success" />
          : <Database className="h-4 w-4 text-caution" />}
        <span>{title}</span>
        <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold ${clean ? "bg-success/20 text-success" : "bg-caution/20 text-caution"}`}>
          {badge}
        </span>
      </div>
      <div>
        <p className="text-muted-foreground">{t("panic.keys_report_indexeddb_label")}</p>
        {report.indexedDbKeys.length === 0 ? (
          <p className="font-mono text-success">{t("panic.keys_report_indexeddb_empty")}</p>
        ) : (
          <p className="font-mono break-all">{report.indexedDbKeys.join(", ")}</p>
        )}
      </div>
      <div>
        <p className="text-muted-foreground">{t("panic.keys_report_localstorage_label")}</p>
        {report.localStorageResidue.length === 0 ? (
          <p className="font-mono text-success">{t("panic.keys_report_localstorage_empty")}</p>
        ) : (
          <p className="font-mono break-all">{report.localStorageResidue.join(", ")}</p>
        )}
      </div>
    </div>
  );
}

export default function PanicWipe() {
  const { t } = useTranslation("security");
  const {
    isUnlocked, wasWiped,
    hasVault, setDuressPin,
    setPanicPin, removePanicPin, panicWipe, inspectKeyMaterial,
    addHiddenWallet, createWallet, unlock, lock,
  } = useWallet();

  // PW-01: the in-app guarded wipe is a CRITICAL, irreversible action. Gate it
  // behind the shared two-factor re-auth guard so a coercer on an already-unlocked
  // device cannot wipe with only "WIPE" + a checkbox. When a second factor is
  // configured, requireTwoFactor pops the gate and runs the wipe ONLY on an allowed
  // verdict; when none is configured it runs immediately (opt-in — unchanged for
  // users who have set no 2FA). The type-to-confirm + acknowledgement remain as the
  // intent check on top of re-auth. I4 fail-closed.
  const { requireTwoFactor, gateModal } = useActionGuard();

  // ----- setup card state -----
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [panicPinStep, setPanicPinStep] = useState("enter");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // ----- in-app guarded wipe state -----
  const [confirmText, setConfirmText] = useState("");
  const [ack, setAck] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeReport, setWipeReport] = useState(null);

  // ----- live demo state -----
  const [vaultExists, setVaultExists] = useState(false);
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [busy, setBusy] = useState("");
  const [demoErr, setDemoErr] = useState("");

  // ----- remove panic wipe state -----
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [removed, setRemoved] = useState(false);

  const PANIC_CONFIGURED_KEY = 'veyrnox-panic-configured';
  const [panicEnabled, setPanicEnabled] = useState(
    () => { try { return localStorage.getItem(PANIC_CONFIGURED_KEY) === '1'; } catch { return false; } }
  );

  const refresh = useCallback(async () => {
    try { setVaultExists(await hasVault()); } catch { /* noop */ }
  }, [hasVault]);

  useEffect(() => { refresh(); }, [refresh]);

  // ----- setup handlers -----
  const handleSave = async () => {
    setError(""); setSaved(false);
    if (pin.length < 8) { setError(t("panic.pin_error_length")); return; }
    if (pin !== confirmPin) { setError(t("panic.pin_error_mismatch")); return; }
    setSaving(true);
    try {
      await setPanicPin(pin);
      try { localStorage.setItem(PANIC_CONFIGURED_KEY, '1'); } catch { /* best-effort */ }
      setPanicEnabled(true);
      setSaved(true);
      setPin(""); setConfirmPin(""); setPanicPinStep("enter");
      await refresh();
    } catch (e) {
      setError(e?.message || t("panic.pin_error_generic"));
    } finally {
      setSaving(false);
    }
  };

  // ----- in-app guarded wipe -----
  const handleInAppWipe = async () => {
    if (confirmText !== CONFIRM_WORD || !ack) return;
    // Re-authenticate BEFORE touching keys. The wipe body runs ONLY if the guard
    // resolves the second factor (or none is configured); a failed/cancelled gate
    // never invokes this callback, so panicWipe is never reached (fail-closed).
    requireTwoFactor(async () => {
      setWiping(true);
      try {
        const report = await panicWipe({ confirmed: true });
        setWipeReport(report);
        setConfirmText(""); setAck(false);
        await refresh();
      } finally {
        setWiping(false);
      }
    }, { title: t("panic.wipe_now_gate_title") });
  };

  // ----- remove panic wipe -----
  const handleRemovePanic = async () => {
    setRemoveError("");
    setRemoving(true);
    try {
      await removePanicPin();
      try { localStorage.removeItem(PANIC_CONFIGURED_KEY); } catch { /* best-effort */ }
      setPanicEnabled(false);
      setShowRemoveConfirm(false);
      setRemoved(true);
      await refresh();
    } catch (e) {
      setRemoveError(e?.message || t("panic.remove_error_generic"));
    } finally {
      setRemoving(false);
    }
  };

  // ----- demo handlers (use the REAL unlock + wipe path) -----
  const demoSetup = async () => {
    setBusy(t("panic.demo_busy_setup")); setDemoErr(""); setBefore(null); setAfter(null);
    try {
      if (!(await hasVault())) await createWallet(DEMO_REAL_PW);
      await setDuressPin(DEMO_DURESS_PW);       // a decoy vault ('secondary')
      await addHiddenWallet(DEMO_HIDDEN_SECRET); // a real hidden wallet in the pool
      await setPanicPin(DEMO_PANIC_PW);          // the panic marker ('tertiary')
      lock();
      setBefore(await inspectKeyMaterial());     // snapshot: key material present
      await refresh();
    } catch (e) {
      setDemoErr(e?.message || t("panic.demo_err_setup"));
    } finally {
      setBusy("");
    }
  };

  // Fire the wipe through the REAL unlock path by entering the panic PIN — exactly
  // what a user under threat would do. unlock() runs the wipe then throws the
  // generic wrong-password error (no "wiped!" tell), which we swallow here.
  const demoPanicUnlock = async () => {
    setBusy(t("panic.demo_busy_unlock")); setDemoErr("");
    try {
      await unlock(DEMO_PANIC_PW);
    } catch {
      /* expected: keys destroyed, unlock surfaces a plain failure */
    } finally {
      setAfter(await inspectKeyMaterial());      // snapshot: nothing recoverable
      await refresh();
      setBusy("");
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Bomb className="h-5 w-5 text-destructive" /> {t("panic.heading")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("panic.subhead")}
        </p>
      </div>

      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
        <AlertOctagon className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>{t("panic.permanent_banner_leading")}</b> {t("panic.permanent_banner_body")}
        </span>
      </div>

      {/* How it works — the two triggers */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-3">
          <ShieldOff className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{t("panic.how_title")}</p>
            <ul className="text-xs text-muted-foreground mt-1 space-y-1.5 list-disc pl-4">
              <li>
                <b>{t("panic.how_pin_leading")}</b> {t("panic.how_pin_body")}
              </li>
              <li>
                <b>{t("panic.how_now_leading")}</b> {t("panic.how_now_body", { word: CONFIRM_WORD })}
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* What it does / does NOT destroy — be honest */}
      <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-2">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">{t("panic.scope_title")}</p>
        </div>
        <p className="text-xs font-medium text-foreground">{t("panic.scope_deleted_label")}</p>
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
          {t("panic.scope_deleted_items", { returnObjects: true }).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
        <p className="text-xs font-medium text-foreground mt-2">{t("panic.scope_kept_label")}</p>
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
          {t("panic.scope_kept_items", { returnObjects: true }).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>

      {/* Setup card — set / remove panic PIN */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Bomb className="h-5 w-5 text-destructive" />
          <span className="font-medium">{t("panic.setup_title")}</span>
        </div>

        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            {t("panic.setup_warning")}
          </p>

          {panicPinStep === "enter" ? (
            <div className="space-y-2">
              <Label>{t("panic.pin_new_label")}</Label>
              <PinPad
                value={pin}
                onChange={setPin}
                onComplete={() => setPanicPinStep("confirm")}
                length={8}
                submitLabel={t("panic.pin_continue")}
                disabled={saving}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{t("panic.pin_confirm_label")}</Label>
              <PinPad
                value={confirmPin}
                onChange={setConfirmPin}
                onComplete={handleSave}
                length={8}
                submitLabel={t("panic.pin_save")}
                disabled={saving}
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
          {saved && <p className="text-xs text-success">{t("panic.pin_saved_ok")}</p>}
          {/* NOTE: Deniability tradeoff — exposing a "remove panic PIN" button reveals
              to an observer that the feature exists on this device and is being
              managed. This is accepted as a usability requirement for users who want
              to disable panic wipe after initially enabling it. The underlying
              `removePanicPin()` clears the panic marker but leaves chaff in the
              slot (provisionChaff.js always seeds one at creation), so the slot
              remains forensically indistinguishable. */}
        </div>

        {/* Remove panic wipe */}
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("panic.remove_prompt")}
          </p>

          {removed && (
            <p className="text-xs text-success flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> {t("panic.removed_ok")}
            </p>
          )}

          {!showRemoveConfirm ? (
            <Button
              variant={panicEnabled ? "destructive" : "outline"}
              className="w-full"
              onClick={() => setShowRemoveConfirm(true)}
              disabled={removed}
            >
              <ShieldOff className="h-4 w-4 mr-2" /> {t("panic.remove_cta")}
            </Button>
          ) : (
            <div className={`space-y-2 p-3 rounded-lg ${panicEnabled ? "bg-destructive/5 border border-destructive/30" : "bg-caution/5 border border-caution/30"}`}>
              <p className="text-xs font-semibold text-caution">
                {t("panic.remove_confirm_title")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("panic.remove_confirm_body")}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleRemovePanic}
                  disabled={removing}
                  className="flex-1"
                >
                  {removing ? t("panic.remove_confirm_yes_busy") : t("panic.remove_confirm_yes")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRemoveConfirm(false)}
                  disabled={removing}
                  className="flex-1"
                >
                  {t("panic.remove_cancel")}
                </Button>
              </div>
              {removeError && <p className="text-xs text-destructive">{removeError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* In-app guarded wipe */}
      <div className="p-5 rounded-xl border border-destructive/40 bg-destructive/5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-5 w-5 text-destructive" />
          <span className="font-semibold text-destructive">{t("panic.wipe_now_title")}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("panic.wipe_now_body_lead")}{" "}
          <b>{t("panic.wipe_now_body_undo")}</b>{" "}
          {wasWiped ? "" : t("panic.wipe_now_body_backup")}
        </p>
        <div>
          <Label className="text-xs">{t("panic.wipe_now_type_confirm", { word: CONFIRM_WORD })}</Label>
          <Input
            className="mt-1.5 font-mono"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
          />
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          <span>{t("panic.wipe_now_ack")}</span>
        </label>
        <Button
          variant="destructive"
          className="w-full gap-1.5"
          disabled={confirmText !== CONFIRM_WORD || !ack || wiping}
          onClick={handleInAppWipe}
        >
          <Bomb className="h-4 w-4" />
          {wiping ? t("panic.wipe_now_cta_busy") : t("panic.wipe_now_cta")}
        </Button>

        {wipeReport && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-success flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> {t("panic.wipe_now_done")}
            </p>
            <KeyMaterialReport report={wipeReport} title={t("panic.wipe_now_report_title")} />
          </div>
        )}
      </div>

      {/* Live demonstration — DEMO only */}
      {DEMO && (
        <div className="p-5 rounded-xl border border-dashed border-primary/40 bg-primary/5 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <span className="font-semibold">{t("panic.demo_title")}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("panic.demo_body", {
              real: DEMO_REAL_PW,
              duress: DEMO_DURESS_PW,
              hidden: DEMO_HIDDEN_SECRET,
              panic: DEMO_PANIC_PW,
            })}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={demoSetup}>
              <KeyRound className="h-3.5 w-3.5 mr-1" /> {t("panic.demo_step1")}
            </Button>
            <Button size="sm" variant="destructive" disabled={!!busy || !before} onClick={demoPanicUnlock}>
              <Bomb className="h-3.5 w-3.5 mr-1" /> {t("panic.demo_step2")}
            </Button>
            {isUnlocked && (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5 mr-1" /> {t("panic.demo_lock")}
              </Button>
            )}
          </div>

          {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
          {demoErr && <p className="text-xs text-destructive">{demoErr}</p>}

          <div className="space-y-3">
            <KeyMaterialReport report={before} title={t("panic.demo_before_title")} />
            {before && after && (
              <div className="flex items-center justify-center text-muted-foreground">
                <HardDrive className="h-4 w-4 mr-1" /> <span className="text-xs">{t("panic.demo_between_note")}</span>
              </div>
            )}
            <KeyMaterialReport report={after} title={t("panic.demo_after_title")} />
            {after?.clean && (
              <p className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> {t("panic.demo_clean_confirm")}
              </p>
            )}
          </div>
        </div>
      )}

      {!DEMO && (
        <div className="p-4 rounded-xl bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground">
            {t("panic.non_demo_hint")}
          </p>
        </div>
      )}

      {/* PW-01: two-factor re-auth gate for the in-app wipe (rendered once). */}
      {gateModal}
    </div>
  );
}
