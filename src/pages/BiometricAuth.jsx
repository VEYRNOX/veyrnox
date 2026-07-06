// src/pages/BiometricAuth.jsx
//
// "Biometric Re-Auth" — the settings surface for requiring a biometric / passkey
// tap as the SECOND FACTOR at critical wallet actions.
//
// HONEST WIRING (no fake security — see CLAUDE.md). This page used to write a dead
// `biometric-auth-config` localStorage key that NOTHING read, register a WebAuthn
// credential it threw away, and "test" with an empty allowCredentials list that
// verified nothing. It is now a real front-end over the app's existing, audited
// second-factor machinery, and it is PLATFORM-ADAPTIVE because the genuine,
// working possession factor differs by platform:
//
//   • NATIVE (Capacitor app): the OS biometric (Face ID / Touch ID / fingerprint)
//     via @aparajita/capacitor-biometric-auth — the SAME prompt the wallet already
//     uses to unlock. WebAuthn passkeys do NOT work inside the Android WebView (no
//     platform authenticator is exposed to it), so on a real device this is the
//     only honest "biometric" factor. Drives the `veyrnox-2fa-biometric` pref
//     (lib/biometric.js → is2faBiometricEnabled / set2faBiometricEnabled), which
//     resolveSend2faMethod() + useActionGuard read and the send gate enforces.
//     No "register" step — the OS biometric is intrinsic; you just enable + test.
//
//   • WEB (browser): a WebAuthn passkey via lib/passkey.js — register the
//     credential, then the toggle drives `veyrnox-2fa-passkey`. Same enforcement.
//
// HARD BOUNDARY (lib/passkey.js, lib/biometric.js): the factor is AUTHENTICATION
// only, never key custody. It stores no seed / private key / vault secret, the
// password path stays independent, and losing it never costs funds. Fails CLOSED:
// a cancelled/failed factor blocks the action, it never auto-passes.
// TESTNET-tier; UNAUDITED-PROVISIONAL.

import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Fingerprint, ShieldCheck, ShieldOff, ShieldAlert, Smartphone, Send, Eye, UserX, EyeOff, CheckCircle, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useWallet } from "@/lib/WalletProvider";
import {
  is2faPasskeyEnabled,
  set2faPasskeyEnabled,
  isPasskeyRegistered,
  isWebAuthnSupported,
  getPasskeyStatus,
  registerPasskeyCredential,
  clearRegisteredPasskey,
  PASSKEY_REGISTRATION_EVENT,
} from "@/lib/passkey";
import {
  is2faBiometricEnabled,
  set2faBiometricEnabled,
  verifyBiometric2fa,
  getBiometricStatus,
} from "@/lib/biometric";

// The actions the second factor actually gates — sourced from useActionGuard /
// TwoFactorSettings' GATED_ACTIONS so this page describes only what truly enforces.
// These are NOT toggles: the factor protects this fixed set when it is on.
const PROTECTED_ACTIONS = [
  { icon: Send, label: "Sending funds", desc: "every send, after the spending checks" },
  { icon: Eye, label: "Revealing your recovery phrase", desc: "the seed backup / QR" },
  { icon: UserX, label: "Setting a duress PIN", desc: "creating the decoy wallet" },
  { icon: EyeOff, label: "Creating or hiding a hidden wallet", desc: "stealth-pool changes" },
];

export default function BiometricAuth() {
  const native = Capacitor.isNativePlatform();
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Biometric Re-Auth</h1>
        <p className="text-sm text-muted-foreground">Require a {native ? "fingerprint / Face" : "passkey / Face ID / fingerprint"} check alongside your PIN before sensitive wallet actions</p>
      </div>

      {/* Honest scope banner: a factor, never key custody. */}
      <div className="flex items-start gap-2 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2.5">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          This adds a genuine <span className="font-medium text-foreground">possession factor</span> on top of your PIN — not a replacement for it. It stores no keys: losing it never costs funds, and your password still works on its own.
        </p>
      </div>

      {native ? <NativeBiometricSection /> : <WebPasskeySection />}

      {/* What the factor actually protects (NOT toggles — an honest, accurate list). */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm font-semibold">When on, it's required for</p>
        {PROTECTED_ACTIONS.map((s) => (
          <div key={s.label} className="flex items-start gap-2.5">
            <s.icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm leading-tight">{s.label}<span className="text-muted-foreground"> — {s.desc}</span></p>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground pt-1">
          Prefer a knowledge factor? Set up <span className="font-medium text-foreground">PIN + Action Password</span> in Security Settings instead — either method satisfies the same gate.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NATIVE: OS biometric (Face ID / Touch ID / fingerprint). No registration step —
// the OS biometric is intrinsic; the user just enables it and can test the prompt.
function NativeBiometricSection() {
  const { recordAudit } = useWallet();
  const [status, setStatus] = useState(null); // getBiometricStatus() result, null while loading
  const [enabled, setEnabled] = useState(() => is2faBiometricEnabled());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'cancel'
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const s = await getBiometricStatus().catch(() => null);
    setStatus(s);
    setEnabled(is2faBiometricEnabled());
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const available = status ? status.available : false;
  const simulated = status?.simulated;
  const label = status?.label || "Biometrics";
  const active = enabled && available;

  const toggleEnabled = (on) => {
    if (on && !available) {
      setError(`No usable ${label.toLowerCase()} on this device — enrol a fingerprint / face in your device settings, or use PIN + Action Password.`);
      return;
    }
    set2faBiometricEnabled(on); // the REAL pref the send gate + action guard read
    setEnabled(on);
    setError("");
    setTestResult(null);
    recordAudit("settings_changed");
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await verifyBiometric2fa(); // real OS prompt on device; simulated in demo
      setTestResult(ok ? "ok" : "cancel");
    } catch {
      setTestResult("cancel");
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <div className={`p-4 rounded-xl border ${active ? "border-success/30 bg-success/5" : "border-border bg-card"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {active ? <ShieldCheck className="h-6 w-6 text-success" /> : <ShieldOff className="h-6 w-6 text-muted-foreground" />}
            <div>
              <p className="font-semibold">{active ? "Biometric Re-Auth Enabled" : "Biometric Re-Auth Disabled"}</p>
              <p className="text-xs text-muted-foreground">
                {status == null ? "Checking biometrics…" : available ? `${label}${simulated ? " (simulated)" : ""} ready` : "Not available on this device"}
              </p>
            </div>
          </div>
          <Switch
            checked={active}
            onCheckedChange={toggleEnabled}
            disabled={status == null || !available}
            aria-label="Require biometrics at critical actions"
          />
        </div>

        {/* Make the state self-explanatory so the page never reads as "broken". */}
        {status != null && (
          <p className="text-[11px] text-muted-foreground mt-2">
            {available
              ? (active ? `${label} is required at the actions below.` : `Flip the switch to require ${label} at the actions below.`)
              : `${status.detail} Enrol a fingerprint / face in your device settings, or use PIN + Action Password in Security Settings.`}
          </p>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Smartphone className="h-4 w-4" /> Test Authentication</p>
        <Button variant="outline" className="w-full gap-2" onClick={runTest} disabled={testing || !available}>
          {testing ? <><Loader2 className="h-4 w-4 animate-spin" /> Awaiting {label}…</> : <><Fingerprint className="h-4 w-4" /> Test Biometric Now</>}
        </Button>
        {testResult === "ok" && <p className="text-xs text-success mt-2 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> {simulated ? "Simulated " : ""}authentication successful</p>}
        {testResult === "cancel" && <p className="text-xs text-muted-foreground mt-2">Biometric prompt cancelled or could not be used</p>}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEB: WebAuthn passkey. Register the credential, then the toggle drives the real
// `veyrnox-2fa-passkey` pref. (Unchanged from the web-only fix; tests pin this.)
function WebPasskeySection() {
  const { passkeyPreview, recordAudit } = useWallet();

  const [registered, setRegistered] = useState(() => isPasskeyRegistered());
  const [enabled, setEnabled] = useState(() => is2faPasskeyEnabled());
  const [status, setStatus] = useState(null); // getPasskeyStatus() result, null while loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'cancel'

  const webauthn = isWebAuthnSupported();

  const refreshStatus = useCallback(async () => {
    const s = await getPasskeyStatus().catch(() => null);
    setStatus(s);
    setRegistered(isPasskeyRegistered());
    setEnabled(is2faPasskeyEnabled());
  }, []);

  useEffect(() => {
    refreshStatus();
    const onChange = () => refreshStatus();
    window.addEventListener(PASSKEY_REGISTRATION_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(PASSKEY_REGISTRATION_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refreshStatus]);

  const supported = status ? status.supported : webauthn;
  const available = status ? status.available : webauthn;
  const simulated = status?.simulated;

  const toggleEnabled = (on) => {
    if (on && !registered) {
      setError("Register a passkey first.");
      return;
    }
    if (on && !simulated && !available) {
      setError("No usable passkey on this device right now — re-register, or use PIN + Action Password in Security Settings.");
      return;
    }
    set2faPasskeyEnabled(on); // the REAL pref the send gate + action guard read
    setEnabled(on);
    setError("");
    setTestResult(null);
    recordAudit("settings_changed");
  };

  const handleRegister = async () => {
    setBusy(true);
    setError("");
    setTestResult(null);
    try {
      await registerPasskeyCredential({ label: "Veyrnox" });
      set2faPasskeyEnabled(true);
      await refreshStatus();
      recordAudit("settings_changed");
    } catch (e) {
      if (e?.name !== "NotAllowedError") {
        setError(e?.message || "Could not register a passkey on this device.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError("");
    try {
      clearRegisteredPasskey();
      set2faPasskeyEnabled(false);
      await refreshStatus();
      setTestResult(null);
      recordAudit("settings_changed");
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await passkeyPreview();
      setTestResult(ok ? "ok" : "cancel");
    } catch {
      setTestResult("cancel");
    } finally {
      setTesting(false);
    }
  };

  const active = enabled && registered;

  return (
    <>
      {!supported && (
        <div className="p-4 rounded-xl border border-caution/30 bg-caution/5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-caution shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Passkeys Not Available Here</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This browser doesn't support WebAuthn passkeys. Use PIN + Action Password (Security Settings), or try the mobile app / a modern browser.
            </p>
          </div>
        </div>
      )}

      <div className={`p-4 rounded-xl border ${active ? "border-success/30 bg-success/5" : "border-border bg-card"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {active ? <ShieldCheck className="h-6 w-6 text-success" /> : <ShieldOff className="h-6 w-6 text-muted-foreground" />}
            <div>
              <p className="font-semibold">{active ? "Biometric Re-Auth Enabled" : "Biometric Re-Auth Disabled"}</p>
              <p className="text-xs text-muted-foreground">
                {registered
                  ? `Passkey registered${simulated ? " (simulated)" : ""} ✓`
                  : supported
                    ? "Step 1 — register a passkey to enable"
                    : "Not available on this device"}
              </p>
            </div>
          </div>
          <Switch
            checked={active}
            onCheckedChange={toggleEnabled}
            disabled={!supported || !registered || busy || (!simulated && !available)}
            aria-label="Require passkey at critical actions"
          />
        </div>

        {!active && supported && (
          <p className="text-[11px] text-muted-foreground mt-2">
            {!registered
              ? "The switch stays off until a passkey exists — register one below, then flip it on. It can't require a factor you haven't set up yet."
              : (!simulated && !available)
                ? "No usable passkey on this device right now (no Face ID / Touch ID / Windows Hello detected). Re-register, or use PIN + Action Password."
                : "Flip the switch to require your passkey at the actions listed below."}
          </p>
        )}

        {!registered && supported && (
          <>
            <Button className="w-full mt-3 gap-2" onClick={handleRegister} disabled={busy || (!simulated && !available)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
              {busy ? "Registering…" : "Register Biometric / Passkey"}
            </Button>
            {!simulated && !available && (
              <p className="text-[11px] text-muted-foreground mt-2">
                To register, set up device biometrics (Face ID / Touch ID / Windows Hello) first, or use <span className="font-medium text-foreground">PIN + Action Password</span> in Security Settings.
              </p>
            )}
          </>
        )}

        {registered && (
          <div className="mt-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            <span className="text-xs text-success font-medium">Passkey registered{simulated ? " (simulated)" : ""}</span>
            <Button size="sm" variant="ghost" className="ml-auto text-xs text-muted-foreground gap-1" onClick={handleRemove} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Smartphone className="h-4 w-4" /> Test Authentication</p>
        <Button variant="outline" className="w-full gap-2" onClick={runTest} disabled={testing || !registered || (!simulated && !available)}>
          {testing ? <><Loader2 className="h-4 w-4 animate-spin" /> Awaiting passkey…</> : <><Fingerprint className="h-4 w-4" /> Test Biometric Now</>}
        </Button>
        {testResult === "ok" && <p className="text-xs text-success mt-2 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> {simulated ? "Simulated " : ""}authentication successful</p>}
        {testResult === "cancel" && <p className="text-xs text-muted-foreground mt-2">Passkey prompt cancelled or could not be used</p>}
      </div>
    </>
  );
}
