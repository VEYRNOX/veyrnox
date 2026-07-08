// src/components/security/TwoFactorSettings.jsx
//
// Security Settings → "Two-factor at critical actions". This is the ONE place a user
// configures the second factor that useActionGuard enforces. It lives in Security
// Settings (auth config), NOT the Security Center (alerts/sessions/limits).
//
// It explains, in plain language, WHAT 2FA does and exactly WHICH actions it gates,
// then offers two methods:
//   - PIN + Action Password  (two knowledge factors; per-set; full Argon2id cost)
//   - PIN + Passkey/FIDO2     (knowledge + possession; device-global; fails closed)
//
// HONEST FRAMING (no fake security): a password second factor is two things you KNOW
// on one device — real defense-in-depth, not hardware 2FA. A passkey adds a genuine
// possession factor (a key in this device's authenticator), but it is device-global
// (not per wallet-set) and remains provisional. PROVISIONAL — independent audit
// complete (ECC 2026-06-23, §24; H-1 passkey-bypass found and fixed — PR #340,
// resolveSend2faMethod). Still BUILT, not 'verified'.

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useWallet } from '@/lib/WalletProvider';
import {
  is2faPasskeyEnabled, set2faPasskeyEnabled, isPasskeyRegistered, isWebAuthnSupported,
  PASSKEY_REGISTRATION_EVENT,
} from '@/lib/passkey';
import {
  is2faBiometricEnabled, set2faBiometricEnabled, getBiometricStatus,
} from '@/lib/biometric';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ShieldCheck, KeyRound, Lock, Trash2, Fingerprint, Send, Eye, UserX, EyeOff } from 'lucide-react';
import PinPad from '@/components/security/PinPad';
import { getAuthModel } from '@/lib/authModel';

// The critical actions the guard gates — shown explicitly so the user knows what the
// second factor actually protects (matches the useActionGuard call sites).
const GATED_ACTIONS = [
  { icon: Send, label: 'Sending funds', desc: 'every send, after safety checks' },
  { icon: Eye, label: 'Revealing your recovery phrase', desc: 'viewing or exporting your backup' },
  { icon: UserX, label: 'Setting an Emergency PIN', desc: 'creating the Emergency wallet' },
  { icon: EyeOff, label: 'Creating or hiding a wallet', desc: 'hidden wallet changes' },
];

export default function TwoFactorSettings() {
  const {
    actionPasswordConfigured, setActionPassword, clearActionPassword, isDecoy, isHidden, recordAudit,
  } = useWallet();

  // ── Action Password (knowledge) form ──
  const [apVaultPw, setApVaultPw] = useState('');
  const [apNew, setApNew] = useState('');
  const [apConfirm, setApConfirm] = useState('');
  const [apBusy, setApBusy] = useState(false);
  // #2: trim before the length check so an all-whitespace Action Password (e.g. 8
  // spaces) is rejected — otherwise a user could set an effectively-empty second
  // factor and lock critical actions behind nothing.
  const apTooShort = apNew.length > 0 && apNew.trim().length < 8;
  const apMismatch = apConfirm.length > 0 && apConfirm !== apNew;
  const apCanSave = !!apVaultPw && apNew.trim().length >= 8 && apConfirm === apNew && !apBusy;
  const resetApForm = () => { setApVaultPw(''); setApNew(''); setApConfirm(''); };
  const isPinModel = getAuthModel() === 'pin';
  const setupBlocked = isDecoy || isHidden; // configure from your real session only

  const handleSetActionPassword = async () => {
    setApBusy(true);
    try {
      await setActionPassword(apVaultPw, apNew);
      resetApForm();
      toast.success(actionPasswordConfigured ? 'Action Password changed' : 'Action Password set');
      recordAudit('settings_changed');
    } catch (e) {
      toast.error(e?.message || 'Could not set the Action Password');
    } finally { setApBusy(false); }
  };

  const handleClearActionPassword = async () => {
    if (!apVaultPw) { toast.error('Enter your wallet PIN / password to confirm'); return; }
    setApBusy(true);
    try {
      await clearActionPassword(apVaultPw);
      resetApForm();
      toast.success('Action Password removed');
      recordAudit('settings_changed');
    } catch (e) {
      toast.error(e?.message || 'Could not remove the Action Password');
    } finally { setApBusy(false); }
  };

  // ── Possession-factor toggle (passkey on web, OS biometric on native) ──
  // On native (iOS/Android) the WKWebView exposes no usable WebAuthn platform
  // authenticator, so the genuine working possession factor is the OS biometric —
  // the same prompt the wallet uses to unlock. The toggle drives the BIOMETRIC 2FA
  // pref there (→ resolveSend2faMethod → SEND_2FA.BIOMETRIC), NOT the passkey pref.
  // FAIL CLOSED (I4): we only show the toggle on native once getBiometricStatus()
  // confirms a biometric/passcode is actually available — never an inert switch.
  const isNative = Capacitor.isNativePlatform();
  const webauthn = isWebAuthnSupported() || isNative;
  const [bioAvailable, setBioAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID / Touch ID');
  useEffect(() => {
    if (!isNative) return;
    let live = true;
    getBiometricStatus().then((s) => {
      if (!live) return;
      setBioAvailable(!!s.available);
      if (s.label) setBiometricLabel(s.label);
    }).catch(() => { if (live) setBioAvailable(false); });
    return () => { live = false; };
  }, [isNative]);
  // Reactive: a passkey can be registered/removed by a sibling section (Unlock
  // with Passkey) within THIS same Settings mount. Re-read on the registration
  // event passkey.js publishes (and on cross-tab `storage` changes) so the toggle
  // sees a freshly-registered passkey without a remount — otherwise togglePasskey2fa
  // keeps hitting the stale "register a passkey first" guard and silently no-ops.
  const [passkeyRegistered, setPasskeyRegistered] = useState(() => isPasskeyRegistered());
  useEffect(() => {
    const refresh = () => setPasskeyRegistered(isPasskeyRegistered());
    refresh(); // catch a registration that landed between initial read and mount
    window.addEventListener(PASSKEY_REGISTRATION_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PASSKEY_REGISTRATION_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const [passkey2fa, setPasskey2fa] = useState(isNative ? is2faBiometricEnabled() : is2faPasskeyEnabled());
  // On native the factor is "ready" when the OS biometric/passcode is available;
  // on web it is ready when a passkey is actually registered.
  const factorReady = isNative ? bioAvailable : passkeyRegistered;
  const togglePasskey2fa = (on) => {
    if (on && !factorReady) {
      toast.error(isNative
        ? `${biometricLabel} is not set up on this device.`
        : 'Register a passkey first (Wallet Passkeys, below).');
      return;
    }
    if (isNative) set2faBiometricEnabled(on);
    else set2faPasskeyEnabled(on);
    setPasskey2fa(on);
    toast.success(on
      ? (isNative ? `${biometricLabel} second factor on` : 'Passkey second factor on')
      : (isNative ? `${biometricLabel} second factor off` : 'Passkey second factor off'));
    recordAudit('settings_changed');
  };

  // Which method the guard will actually enforce (possession wins if both are set).
  const activeMethod = (passkey2fa && factorReady) ? (isNative ? 'biometric' : 'passkey')
    : actionPasswordConfigured ? 'password' : 'none';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Two-factor at critical actions</h2>
      </div>

      {/* What it is + WHICH actions it gates (explicit) */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm text-muted-foreground">
          An extra check on top of your PIN for sensitive actions. Even if someone sees you type your PIN, they still can't do these things without the second step.
        </p>
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Actions it protects</p>
          {GATED_ACTIONS.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-2.5">
              <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm leading-tight">{label}
                <span className="text-muted-foreground"> — {desc}</span></p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground">Currently enforcing:</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${activeMethod === 'none' ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
            {activeMethod === 'biometric' ? `PIN + ${biometricLabel}` : activeMethod === 'passkey' ? 'PIN + Passkey' : activeMethod === 'password' ? 'PIN + Action Password' : 'Off (PIN only)'}
          </span>
        </div>
      </div>

      {setupBlocked && (
        <p className="text-[11px] text-muted-foreground">
          You're in a decoy / hidden session. Configure two-factor from your real session.
        </p>
      )}

      {/* ── Method A: PIN + Action Password (knowledge) ── */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-center gap-2">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${actionPasswordConfigured ? 'bg-primary/10' : 'bg-secondary'}`}>
            {actionPasswordConfigured ? <Lock className="h-5 w-5 text-primary" /> : <KeyRound className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">PIN + Action Password {actionPasswordConfigured && <span className="text-primary">· ON</span>}</p>
            <p className="text-[11px] text-muted-foreground">A second password saved inside your wallet. Strong, but both passwords live on the same device.</p>
          </div>
        </div>

        {!setupBlocked && (
          <div className="space-y-3 pt-1">
            <div>
              <Label htmlFor={isPinModel ? undefined : 'ap-vault'}>{isPinModel ? 'Your PIN' : 'Wallet password'}</Label>
              {isPinModel ? (
                <div className="mt-2">
                  <PinPad
                    value={apVaultPw}
                    onChange={setApVaultPw}
                    onComplete={v => setApVaultPw(v)}
                    disabled={apBusy}
                    submitLabel={null}
                  />
                </div>
              ) : (
                <Input id="ap-vault" type="password" autoComplete="current-password" value={apVaultPw}
                  onChange={e => setApVaultPw(e.target.value)} placeholder="Confirm it's you" className="mt-1.5 mono-value" />
              )}
            </div>
            <div>
              <Label htmlFor="ap-new">{actionPasswordConfigured ? 'New Action Password' : 'Action Password'}</Label>
              <Input id="ap-new" type="password" autoComplete="new-password" value={apNew}
                onChange={e => setApNew(e.target.value)} placeholder="At least 8 characters" className="mt-1.5 mono-value" />
              <p className="text-xs text-muted-foreground mt-1">At least 8 characters · any characters allowed</p>
              {apTooShort && <p className="text-[11px] text-destructive mt-1">Use at least 8 characters.</p>}
            </div>
            <div>
              <Label htmlFor="ap-confirm">Confirm</Label>
              <Input id="ap-confirm" type="password" autoComplete="new-password" value={apConfirm}
                onChange={e => setApConfirm(e.target.value)} placeholder="Re-enter the Action Password" className="mt-1.5 mono-value" />
              <p className="text-xs text-muted-foreground mt-1">Must match your Action Password</p>
              {apMismatch && <p className="text-[11px] text-destructive mt-1">Passwords don't match.</p>}
            </div>
            <Button className="w-full gap-2" onClick={handleSetActionPassword} disabled={!apCanSave}>
              <KeyRound className="h-4 w-4" /> {actionPasswordConfigured ? 'Change Action Password' : 'Set Action Password'}
            </Button>
            {actionPasswordConfigured && (
              <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/10 gap-2"
                onClick={handleClearActionPassword} disabled={apBusy}>
                <Trash2 className="h-4 w-4" /> Remove Action Password
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Method B: possession factor — passkey on web, OS biometric on native ── */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-center gap-2">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${(passkey2fa && factorReady) ? 'bg-primary/10' : 'bg-secondary'}`}>
            <Fingerprint className={`h-5 w-5 ${(passkey2fa && factorReady) ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {isNative ? `PIN + ${biometricLabel}` : 'PIN + Passkey / FIDO2'} {(passkey2fa && factorReady) && <span className="text-primary">· ON</span>}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {isNative
                ? `Your PIN plus ${biometricLabel}. If biometrics aren't available, the action is blocked. Losing your device never loses your funds.`
                : 'Your PIN plus a passkey tap. If the passkey isn\'t available, the action is blocked. Losing it never loses your funds.'}
            </p>
          </div>
          <Switch
            checked={passkey2fa && factorReady}
            onCheckedChange={togglePasskey2fa}
            disabled={!webauthn || (isNative && !bioAvailable)}
            aria-label={isNative ? 'Use my device biometrics as my second factor' : 'Use passkey as my second factor'}
          />
        </div>
        {isNative && bioAvailable && (
          <p className="text-[11px] text-muted-foreground">Confirm critical actions with {biometricLabel}.</p>
        )}
        {isNative && !bioAvailable && (
          <p className="text-[11px] text-muted-foreground">{biometricLabel} / device passcode is not set up on this device — enable it in your device settings to use this factor.</p>
        )}
        {!isNative && !webauthn && <p className="text-[11px] text-muted-foreground">This browser doesn't support WebAuthn / passkeys.</p>}
        {!isNative && webauthn && !passkeyRegistered && (
          <p className="text-[11px] text-muted-foreground">No passkey registered yet — set one up in <strong>Wallet Passkeys</strong> below, then enable this.</p>
        )}
      </div>
    </div>
  );
}
