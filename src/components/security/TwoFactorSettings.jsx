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
// (not per wallet-set) and is provisional/unaudited. UNAUDITED-PROVISIONAL.

import { useState } from 'react';
import { useWallet } from '@/lib/WalletProvider';
import {
  is2faPasskeyEnabled, set2faPasskeyEnabled, isPasskeyRegistered, isWebAuthnSupported,
} from '@/lib/passkey';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ShieldCheck, KeyRound, Lock, Trash2, Fingerprint, Send, Eye, UserX, EyeOff } from 'lucide-react';

// The critical actions the guard gates — shown explicitly so the user knows what the
// second factor actually protects (matches the useActionGuard call sites).
const GATED_ACTIONS = [
  { icon: Send, label: 'Sending funds', desc: 'every send, after the spending checks' },
  { icon: Eye, label: 'Revealing your recovery phrase', desc: 'the seed backup / QR' },
  { icon: UserX, label: 'Setting a duress PIN', desc: 'creating the decoy wallet' },
  { icon: EyeOff, label: 'Creating or hiding a hidden wallet', desc: 'stealth-pool changes' },
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
  const apTooShort = apNew.length > 0 && apNew.length < 8;
  const apMismatch = apConfirm.length > 0 && apConfirm !== apNew;
  const apCanSave = !!apVaultPw && apNew.length >= 8 && apConfirm === apNew && !apBusy;
  const resetApForm = () => { setApVaultPw(''); setApNew(''); setApConfirm(''); };
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

  // ── Passkey (possession) toggle ──
  const webauthn = isWebAuthnSupported();
  const passkeyRegistered = isPasskeyRegistered();
  const [passkey2fa, setPasskey2fa] = useState(is2faPasskeyEnabled());
  const togglePasskey2fa = (on) => {
    if (on && !passkeyRegistered) {
      toast.error('Register a passkey first (Wallet Passkeys, below).');
      return;
    }
    set2faPasskeyEnabled(on);
    setPasskey2fa(on);
    toast.success(on ? 'Passkey second factor on' : 'Passkey second factor off');
    recordAudit('settings_changed');
  };

  // Which method the guard will actually enforce (passkey wins if both are set).
  const activeMethod = (passkey2fa && passkeyRegistered) ? 'passkey'
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
          A second factor required <strong>together with your PIN</strong> before the
          most sensitive actions. Your PIN alone — even if shoulder-surfed — no longer
          authorises them. It does <strong>not</strong> change how you unlock the wallet.
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
            {activeMethod === 'passkey' ? 'PIN + Passkey' : activeMethod === 'password' ? 'PIN + Action Password' : 'Off (PIN only)'}
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
            <p className="text-[11px] text-muted-foreground">A second password you know. Verified at full vault strength (Argon2id), stored only inside your encrypted vault — per wallet-set. Two things you know on one device: strong, but <strong>not</strong> hardware 2FA.</p>
          </div>
        </div>

        {!setupBlocked && (
          <div className="space-y-3 pt-1">
            <div>
              <Label htmlFor="ap-vault">Wallet PIN / password</Label>
              <Input id="ap-vault" type="password" autoComplete="current-password" value={apVaultPw}
                onChange={e => setApVaultPw(e.target.value)} placeholder="Confirm it's you" className="mt-1.5 mono-value" />
            </div>
            <div>
              <Label htmlFor="ap-new">{actionPasswordConfigured ? 'New Action Password' : 'Action Password'}</Label>
              <Input id="ap-new" type="password" autoComplete="new-password" value={apNew}
                onChange={e => setApNew(e.target.value)} placeholder="At least 8 characters" className="mt-1.5 mono-value" />
              {apTooShort && <p className="text-[11px] text-destructive mt-1">Use at least 8 characters.</p>}
            </div>
            <div>
              <Label htmlFor="ap-confirm">Confirm</Label>
              <Input id="ap-confirm" type="password" autoComplete="new-password" value={apConfirm}
                onChange={e => setApConfirm(e.target.value)} placeholder="Re-enter the Action Password" className="mt-1.5 mono-value" />
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

      {/* ── Method B: PIN + Passkey / FIDO2 (possession) ── */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-center gap-2">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${(passkey2fa && passkeyRegistered) ? 'bg-primary/10' : 'bg-secondary'}`}>
            <Fingerprint className={`h-5 w-5 ${(passkey2fa && passkeyRegistered) ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">PIN + Passkey / FIDO2 {(passkey2fa && passkeyRegistered) && <span className="text-primary">· ON</span>}</p>
            <p className="text-[11px] text-muted-foreground">Your PIN plus a tap of a passkey or security key — a genuine <strong>possession</strong> factor. Fails closed: if the passkey can't be used, the action is refused. Device-global (not per wallet-set); losing the passkey never costs funds — your PIN + password still unlock.</p>
          </div>
          <Switch
            checked={passkey2fa && passkeyRegistered}
            onCheckedChange={togglePasskey2fa}
            disabled={!webauthn}
            aria-label="Use passkey as my second factor"
          />
        </div>
        {!webauthn && <p className="text-[11px] text-muted-foreground">This browser doesn't support WebAuthn / passkeys.</p>}
        {webauthn && !passkeyRegistered && (
          <p className="text-[11px] text-muted-foreground">No passkey registered yet — set one up in <strong>Wallet Passkeys</strong> below, then enable this.</p>
        )}
      </div>
    </div>
  );
}
