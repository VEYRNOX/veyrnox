// @ts-nocheck
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
import { useTranslation } from 'react-i18next';
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
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/toast';
import { ShieldCheck, KeyRound, Lock, Trash2, Fingerprint, Send, Eye, UserX, EyeOff } from 'lucide-react';
import PinPad from '@/components/security/PinPad';
import { getAuthModel } from '@/lib/authModel';

const MIN_ACTION_PASSWORD_LENGTH = 8;

// Icons for the critical actions the guard gates — order matches
// settings.two_factor.gated_actions in the wallet locale bundle.
const GATED_ACTION_ICONS = [Send, Eye, UserX, EyeOff];

export default function TwoFactorSettings() {
  const { t } = useTranslation('wallet');
  const {
    actionPasswordConfigured, setActionPassword, clearActionPassword, isDecoy, isHidden, recordAudit,
  } = useWallet();
  const gatedActions = t('settings.two_factor.gated_actions', { returnObjects: true }).map((a, i) => ({
    ...a, icon: GATED_ACTION_ICONS[i],
  }));

  // ── Action Password (knowledge) form ──
  const [apVaultPw, setApVaultPw] = useState('');
  const [apNew, setApNew] = useState('');
  const [apConfirm, setApConfirm] = useState('');
  const [apBusy, setApBusy] = useState(false);
  // #2: trim before the length check so an all-whitespace Action Password (e.g. 8
  // spaces) is rejected — otherwise a user could set an effectively-empty second
  // factor and lock critical actions behind nothing.
  const apTooShort = apNew.length > 0 && apNew.trim().length < MIN_ACTION_PASSWORD_LENGTH;
  const apMismatch = apConfirm.length > 0 && apConfirm !== apNew;
  const apCanSave = !!apVaultPw && apNew.trim().length >= MIN_ACTION_PASSWORD_LENGTH && apConfirm === apNew && !apBusy;
  const resetApForm = () => { setApVaultPw(''); setApNew(''); setApConfirm(''); };
  const isPinModel = getAuthModel() === 'pin';
  const setupBlocked = isDecoy || isHidden; // configure from your real session only

  const handleSetActionPassword = async () => {
    setApBusy(true);
    try {
      await setActionPassword(apVaultPw, apNew);
      resetApForm();
      toast.success(actionPasswordConfigured ? t('settings.two_factor.toast_changed') : t('settings.two_factor.toast_set'));
      recordAudit('settings_changed');
    } catch (e) {
      toast.error(e?.message || t('settings.two_factor.toast_set_error'));
    } finally { setApBusy(false); }
  };

  const handleClearActionPassword = async () => {
    if (!apVaultPw) { toast.error(t('settings.two_factor.toast_confirm_pin_required')); return; }
    setApBusy(true);
    try {
      await clearActionPassword(apVaultPw);
      resetApForm();
      toast.success(t('settings.two_factor.toast_removed'));
      recordAudit('settings_changed');
    } catch (e) {
      toast.error(e?.message || t('settings.two_factor.toast_remove_error'));
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
  const [biometricLabel, setBiometricLabel] = useState(t('settings.two_factor.biometric_label_default'));
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
        ? t('settings.two_factor.toggle_biometric_needed', { label: biometricLabel })
        : t('settings.two_factor.toggle_passkey_needed'));
      return;
    }
    if (isNative) set2faBiometricEnabled(on);
    else set2faPasskeyEnabled(on);
    setPasskey2fa(on);
    toast.success(on
      ? (isNative ? t('settings.two_factor.toggle_biometric_on', { label: biometricLabel }) : t('settings.two_factor.toggle_passkey_on'))
      : (isNative ? t('settings.two_factor.toggle_biometric_off', { label: biometricLabel }) : t('settings.two_factor.toggle_passkey_off')));
    recordAudit('settings_changed');
  };

  // Which method the guard will actually enforce (possession wins if both are set).
  const activeMethod = (passkey2fa && factorReady) ? (isNative ? 'biometric' : 'passkey')
    : actionPasswordConfigured ? 'password' : 'none';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">{t('settings.two_factor.heading')}</h2>
      </div>

      {/* What it is + WHICH actions it gates (explicit) */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('settings.two_factor.intro')}
        </p>
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t('settings.two_factor.actions_protects_label')}</p>
          {gatedActions.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-2.5">
              <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm leading-tight">{label}
                <span className="text-muted-foreground"> — {desc}</span></p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground">{t('settings.two_factor.currently_enforcing')}</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${activeMethod === 'none' ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
            {activeMethod === 'biometric' ? t('settings.two_factor.badge_biometric', { label: biometricLabel })
              : activeMethod === 'passkey' ? t('settings.two_factor.badge_passkey')
              : activeMethod === 'password' ? t('settings.two_factor.badge_password')
              : t('settings.two_factor.badge_off')}
          </span>
        </div>
      </div>

      {setupBlocked && (
        <p className="text-[11px] text-muted-foreground">
          {t('settings.two_factor.setup_blocked')}
        </p>
      )}

      {/* ── Method A: PIN + Action Password (knowledge) ── */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-center gap-2">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${actionPasswordConfigured ? 'bg-primary/10' : 'bg-secondary'}`}>
            {actionPasswordConfigured ? <Lock className="h-5 w-5 text-primary" /> : <KeyRound className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{t('settings.two_factor.method_a_title')} {actionPasswordConfigured && <span className="text-primary">· {t('settings.two_factor.on_suffix')}</span>}</p>
            <p className="text-[11px] text-muted-foreground">{t('settings.two_factor.method_a_desc')}</p>
          </div>
        </div>

        {!setupBlocked && (
          <div className="space-y-3 pt-1">
            <div>
              <Label htmlFor={isPinModel ? undefined : 'ap-vault'}>{isPinModel ? t('settings.two_factor.label_pin') : t('settings.two_factor.label_wallet_password')}</Label>
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
                <PasswordInput id="ap-vault" autoComplete="current-password" value={apVaultPw}
                  onChange={e => setApVaultPw(e.target.value)} placeholder={t('settings.two_factor.pin_confirm_placeholder')} className="mt-1.5 mono-value" />
              )}
            </div>
            <div>
              <Label htmlFor="ap-new">{actionPasswordConfigured ? t('settings.two_factor.action_password_label_change') : t('settings.two_factor.action_password_label_set')}</Label>
              <PasswordInput id="ap-new" autoComplete="new-password" value={apNew}
                onChange={e => setApNew(e.target.value)} placeholder={t('settings.two_factor.action_password_placeholder')} className="mt-1.5 mono-value" />
              <p className="text-xs text-muted-foreground mt-1">{t('settings.two_factor.action_password_hint')}</p>
              {apTooShort && <p className="text-[11px] text-destructive mt-1">{t('settings.two_factor.too_short', { min: MIN_ACTION_PASSWORD_LENGTH })}</p>}
            </div>
            <div>
              <Label htmlFor="ap-confirm">{t('settings.two_factor.confirm_label')}</Label>
              <PasswordInput id="ap-confirm" autoComplete="new-password" value={apConfirm}
                onChange={e => setApConfirm(e.target.value)} placeholder={t('settings.two_factor.confirm_placeholder')} className="mt-1.5 mono-value" />
              <p className="text-xs text-muted-foreground mt-1">{t('settings.two_factor.confirm_hint')}</p>
              {apMismatch && <p className="text-[11px] text-destructive mt-1">{t('settings.two_factor.mismatch')}</p>}
            </div>
            <Button className="w-full gap-2" onClick={handleSetActionPassword} disabled={!apCanSave}>
              <KeyRound className="h-4 w-4" /> {actionPasswordConfigured ? t('settings.two_factor.save_change') : t('settings.two_factor.save_set')}
            </Button>
            {actionPasswordConfigured && (
              <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/10 gap-2"
                onClick={handleClearActionPassword} disabled={apBusy}>
                <Trash2 className="h-4 w-4" /> {t('settings.two_factor.remove')}
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
              {isNative ? t('settings.two_factor.method_b_title_native', { label: biometricLabel }) : t('settings.two_factor.method_b_title_web')} {(passkey2fa && factorReady) && <span className="text-primary">· {t('settings.two_factor.on_suffix')}</span>}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {isNative
                ? t('settings.two_factor.method_b_desc_native', { label: biometricLabel })
                : t('settings.two_factor.method_b_desc_web')}
            </p>
          </div>
          <Switch
            checked={passkey2fa && factorReady}
            onCheckedChange={togglePasskey2fa}
            disabled={!webauthn || (isNative && !bioAvailable)}
            aria-label={isNative ? t('settings.two_factor.switch_aria_native') : t('settings.two_factor.switch_aria_web')}
          />
        </div>
        {isNative && bioAvailable && (
          <p className="text-[11px] text-muted-foreground">{t('settings.two_factor.confirm_native', { label: biometricLabel })}</p>
        )}
        {isNative && !bioAvailable && (
          <p className="text-[11px] text-muted-foreground">{t('settings.two_factor.unavailable_native', { label: biometricLabel })}</p>
        )}
        {!isNative && !webauthn && <p className="text-[11px] text-muted-foreground">{t('settings.two_factor.unsupported_web')}</p>}
        {!isNative && webauthn && !passkeyRegistered && (
          <p className="text-[11px] text-muted-foreground">
            {t('settings.two_factor.register_hint_web_pre')} <strong>{t('settings.two_factor.register_hint_web_strong')}</strong> {t('settings.two_factor.register_hint_web_post')}
          </p>
        )}
      </div>
    </div>
  );
}
