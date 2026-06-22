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
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";
import {
  Bomb, AlertOctagon, ShieldOff, CheckCircle2, Eye, EyeOff,
  FlaskConical, Lock, Trash2, Database, HardDrive, KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  if (!report) return null;
  const clean = report.clean;
  return (
    <div className={`rounded-lg border p-3 text-xs space-y-2 ${clean ? "border-success/30 bg-success/5" : "border-caution/30 bg-caution/5"}`}>
      <div className="flex items-center gap-2 font-semibold">
        {clean
          ? <CheckCircle2 className="h-4 w-4 text-success" />
          : <Database className="h-4 w-4 text-caution" />}
        <span>{title}</span>
        <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold ${clean ? "bg-success/20 text-success" : "bg-caution/20 text-caution"}`}>
          {clean ? "NO KEY MATERIAL" : `${report.vaultBlobCount} VAULT BLOB${report.vaultBlobCount === 1 ? "" : "S"}`}
        </span>
      </div>
      <div>
        <p className="text-muted-foreground">IndexedDB <code>veyrnox-vault / vault</code> keys:</p>
        {report.indexedDbKeys.length === 0 ? (
          <p className="font-mono text-success">— empty —</p>
        ) : (
          <p className="font-mono break-all">{report.indexedDbKeys.join(", ")}</p>
        )}
      </div>
      <div>
        <p className="text-muted-foreground">localStorage address residue:</p>
        {report.localStorageResidue.length === 0 ? (
          <p className="font-mono text-success">— none —</p>
        ) : (
          <p className="font-mono break-all">{report.localStorageResidue.join(", ")}</p>
        )}
      </div>
    </div>
  );
}

export default function PanicWipe() {
  const {
    isUnlocked, wasWiped,
    hasVault, setDuressPin,
    setPanicPin, panicWipe, inspectKeyMaterial,
    addHiddenWallet, createWallet, unlock, lock,
  } = useWallet();

  // ----- setup card state -----
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
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

  const refresh = useCallback(async () => {
    try { setVaultExists(await hasVault()); } catch { /* noop */ }
  }, [hasVault]);

  useEffect(() => { refresh(); }, [refresh]);

  // ----- setup handlers -----
  const handleSave = async () => {
    setError(""); setSaved(false);
    if (pin.length < 6) { setError("Panic/wipe PIN must be at least 6 characters"); return; }
    if (pin !== confirmPin) { setError("PINs do not match"); return; }
    setSaving(true);
    try {
      await setPanicPin(pin);
      setSaved(true);
      setPin(""); setConfirmPin("");
      await refresh();
    } catch (e) {
      setError(e?.message || "Could not save panic/wipe PIN");
    } finally {
      setSaving(false);
    }
  };

  // ----- in-app guarded wipe -----
  const handleInAppWipe = async () => {
    if (confirmText !== CONFIRM_WORD || !ack) return;
    setWiping(true);
    try {
      const report = await panicWipe({ confirmed: true });
      setWipeReport(report);
      setConfirmText(""); setAck(false);
      await refresh();
    } finally {
      setWiping(false);
    }
  };

  // ----- demo handlers (use the REAL unlock + wipe path) -----
  const demoSetup = async () => {
    setBusy("Setting up demo…"); setDemoErr(""); setBefore(null); setAfter(null);
    try {
      if (!(await hasVault())) await createWallet(DEMO_REAL_PW);
      await setDuressPin(DEMO_DURESS_PW);       // a decoy vault ('secondary')
      await addHiddenWallet(DEMO_HIDDEN_SECRET); // a real hidden wallet in the pool
      await setPanicPin(DEMO_PANIC_PW);          // the panic marker ('tertiary')
      lock();
      setBefore(await inspectKeyMaterial());     // snapshot: key material present
      await refresh();
    } catch (e) {
      setDemoErr(e?.message || "Demo setup failed");
    } finally {
      setBusy("");
    }
  };

  // Fire the wipe through the REAL unlock path by entering the panic PIN — exactly
  // what a user under threat would do. unlock() runs the wipe then throws the
  // generic wrong-password error (no "wiped!" tell), which we swallow here.
  const demoPanicUnlock = async () => {
    setBusy("Entering panic/wipe PIN at unlock…"); setDemoErr("");
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

  const explorerNote = "Addresses & on-chain history stay public regardless — wipe protects the device, not the chain.";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Bomb className="h-5 w-5 text-destructive" /> Panic Wipe
        </h1>
        <p className="text-sm text-muted-foreground">
          Emergency, irreversible destruction of this device's wallet keys.
        </p>
      </div>

      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
        <AlertOctagon className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>Provisional (testnet), pending independent audit · destructive ·
          safety-critical.</b> A panic wipe permanently destroys the local copy of
          your keys — there is no undo, and it's flagged for specific
          security-audit scrutiny.
        </span>
      </div>

      {/* How it works — the two triggers */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-3">
          <ShieldOff className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">How it fires</p>
            <ul className="text-xs text-muted-foreground mt-1 space-y-1.5 list-disc pl-4">
              <li>
                <b>Panic/wipe PIN at unlock</b> — set a dedicated PIN below. Entered at
                the <i>normal unlock screen</i>, it destroys your keys instantly
                with <b>no confirmation dialog</b>. Under genuine duress a
                "are you sure?" prompt is a liability — a coercer could cancel it,
                and it would signal what's happening. So the panic/wipe PIN fires
                silently and immediately.
              </li>
              <li>
                <b>In-app guarded wipe</b> — for calmly retiring or selling a
                device. Type <code>{CONFIRM_WORD}</code> and tick the
                acknowledgement; this path <i>does</i> confirm, because there's no
                coercion to design around.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* What it does / does NOT destroy — be honest */}
      <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-2">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">What a wipe destroys — and what it can't</p>
        </div>
        <p className="text-xs font-medium text-foreground">Destroys (local device):</p>
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
          <li>Your <b>primary vault</b>, the <b>duress decoy</b>, and the <b>entire stealth / hidden-wallet pool</b> (real + chaff slots).</li>
          <li>The <b>panic marker</b> and demo address residue — the whole vault store is cleared and the database deleted.</li>
        </ul>
        <p className="text-xs font-medium text-foreground mt-2">Does NOT destroy:</p>
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
          <li><b>A seed backup you hold elsewhere</b> (paper, password manager, another device) — the wallet is still recoverable from it. Wipe protects the device, not the seed.</li>
          <li><b>On-chain state</b> — {explorerNote}</li>
          <li><b>Flash-media forensics</b> — we delete logical records, not sanitise the medium; the mitigation is that only encrypted ciphertext was ever stored.</li>
        </ul>
      </div>

      {/* Setup card — set / remove panic PIN */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Bomb className="h-5 w-5 text-destructive" />
          <span className="font-medium">Set a panic/wipe PIN</span>
        </div>

        <div className="space-y-4">
          <div>
            <Label>New panic/wipe PIN</Label>
            <div className="relative mt-1.5">
              <Input
                type={showPin ? "text" : "password"}
                maxLength={64}
                placeholder="At least 6 characters — unlike anything you'd type by accident"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="pr-10 tracking-widest text-lg"
              />
              <button
                type="button"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPin((s) => !s)}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label>Confirm panic/wipe PIN</Label>
            <Input
              type={showPin ? "text" : "password"}
              maxLength={64}
              placeholder="Re-enter PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className="mt-1.5 tracking-widest text-lg"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            ⚠️ The panic/wipe PIN must be <b>different</b> from your real password, any
            duress PIN, and any hidden-wallet secret — otherwise that path opens at
            unlock and the wipe never fires. We can't check this for you (we never
            hold those in plaintext). Entering this PIN at unlock will
            <b> destroy your keys</b>.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {saved && <p className="text-xs text-success">✓ Panic/wipe PIN saved. Entering it at the unlock screen will wipe this device.</p>}
          <Button className="w-full" disabled={!pin || !confirmPin || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Set / Change panic/wipe PIN"}
          </Button>
          {/* No "is a panic PIN set?" indicator and no remove button BY DESIGN:
              every PIN device seeds CHAFF into the panic ('tertiary') slot
              (provisionChaff.js), so hasPanicVault() is always true and cannot
              distinguish a real panic PIN from chaff. Surfacing a "set" state would
              be a false positive, and a "remove" action would clear the chaff and
              leave an EMPTY slot — a structural deniability tell. Setting/changing
              overwrites whatever is there; that is the only safe operation. */}
        </div>
      </div>

      {/* In-app guarded wipe */}
      <div className="p-5 rounded-xl border border-destructive/40 bg-destructive/5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-5 w-5 text-destructive" />
          <span className="font-semibold text-destructive">Wipe this device now</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Immediately and irreversibly destroys the local copy of every wallet
          (primary, decoy, and any hidden wallets) on this device. Use this when
          decommissioning a device. <b>There is no undo.</b> {wasWiped ? "" : "Make sure you have a seed backup if you ever want this wallet again."}
        </p>
        <div>
          <Label className="text-xs">Type <code>{CONFIRM_WORD}</code> to confirm</Label>
          <Input
            className="mt-1.5 font-mono"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
          />
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          <span>
            I understand this <b>permanently destroys</b> the local keys and that
            only a seed backup held elsewhere could ever recover this wallet.
          </span>
        </label>
        <Button
          variant="destructive"
          className="w-full gap-1.5"
          disabled={confirmText !== CONFIRM_WORD || !ack || wiping}
          onClick={handleInAppWipe}
        >
          <Bomb className="h-4 w-4" />
          {wiping ? "Wiping…" : "Destroy local keys"}
        </Button>

        {wipeReport && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-success flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Wipe complete. Local key material destroyed.
            </p>
            <KeyMaterialReport report={wipeReport} title="Local storage after wipe" />
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
            Stands up a throwaway real wallet (<code>{DEMO_REAL_PW}</code>), a duress
            decoy (<code>{DEMO_DURESS_PW}</code>), a hidden wallet
            (<code>{DEMO_HIDDEN_SECRET}</code>), and a panic/wipe PIN
            (<code>{DEMO_PANIC_PW}</code>). Step 1 snapshots the local key material;
            step 2 enters the panic/wipe PIN at the <i>real</i> unlock prompt to fire the
            wipe; then it snapshots again to prove nothing recoverable remains.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={demoSetup}>
              <KeyRound className="h-3.5 w-3.5 mr-1" /> 1. Set up & snapshot
            </Button>
            <Button size="sm" variant="destructive" disabled={!!busy || !before} onClick={demoPanicUnlock}>
              <Bomb className="h-3.5 w-3.5 mr-1" /> 2. Enter panic/wipe PIN at unlock
            </Button>
            {isUnlocked && (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5 mr-1" /> Lock
              </Button>
            )}
          </div>

          {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
          {demoErr && <p className="text-xs text-destructive">{demoErr}</p>}

          <div className="space-y-3">
            <KeyMaterialReport report={before} title="BEFORE — local key material present" />
            {before && after && (
              <div className="flex items-center justify-center text-muted-foreground">
                <HardDrive className="h-4 w-4 mr-1" /> <span className="text-xs">panic/wipe PIN entered → wipe fired</span>
              </div>
            )}
            <KeyMaterialReport report={after} title="AFTER — nothing recoverable" />
            {after?.clean && (
              <p className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Verified: the vault store is empty and no address residue remains.
              </p>
            )}
          </div>
        </div>
      )}

      {!DEMO && (
        <div className="p-4 rounded-xl bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground">
            To use the panic/wipe PIN: lock your wallet, then enter the panic/wipe PIN at the
            unlock screen — your local keys are destroyed immediately with no
            prompt. Keep a seed backup elsewhere if you ever want the wallet again.
          </p>
        </div>
      )}
    </div>
  );
}
