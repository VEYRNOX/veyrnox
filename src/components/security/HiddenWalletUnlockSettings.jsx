// src/components/security/HiddenWalletUnlockSettings.jsx
//
// Security Settings → "Hidden wallet unlock 2FA". Optional second factor before
// revealing a hidden wallet. This is a PER-SET preference (like Action Password),
// stored inside the encrypted container.
//
// MODES:
//   - None           (disabled; current behavior)
//   - PIN + Password (PIN + Action Password — two knowledge factors)
//   - PIN + Passkey  (PIN + WebAuthn — knowledge + possession, device-global)
//   - PIN + Biometric (PIN + Face ID/Touch ID — on native only)
//
// HONEST FRAMING: this gate is OPTIONAL and advisory — it protects the hidden
// wallet reveal at the moment of unlock, but does not prevent an attacker from
// seeing a hidden wallet's on-chain history/balance on an explorer. Like all
// wallet-layer controls, it is a convenience gate, not a hardware guarantee.

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useWallet } from '@/lib/WalletProvider';
import {
  getBiometricStatus,
} from '@/lib/biometric';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { EyeOff, Lock, Fingerprint, Key } from 'lucide-react';

const MODES = [
  {
    value: 'none',
    label: 'None (disabled)',
    description: 'Hidden wallets open with your PIN only (current setting)',
    icon: null,
  },
  {
    value: 'password',
    label: 'PIN + Action Password',
    description: 'Same second password you use for sensitive actions',
    icon: Lock,
  },
  {
    value: 'passkey',
    label: 'PIN + Passkey',
    description: 'Your PIN plus a passkey tap on this device',
    icon: Key,
  },
  {
    value: 'biometric',
    label: 'PIN + Biometric',
    description: 'Your PIN plus Face ID or Touch ID',
    icon: Fingerprint,
    nativeOnly: true,
  },
];

export default function HiddenWalletUnlockSettings() {
  const {
    hiddenWallet2faMode, setHiddenWallet2faMode, isDecoy, isHidden, actionPasswordConfigured, recordAudit,
  } = useWallet();

  const [mode, setMode] = useState(hiddenWallet2faMode || 'none');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  const isNative = Capacitor.isNativePlatform();
  const setupBlocked = isDecoy || isHidden; // configure from real session only

  // Check biometric availability on native
  useEffect(() => {
    if (!isNative) return;
    let live = true;
    (async () => {
      try {
        const status = await getBiometricStatus();
        if (live) {
          setBioAvailable(status.isAvailable && status.isConfigured);
        }
      } catch {
        // Biometric unavailable; don't show the option
      }
    })();
    return () => { live = false; };
  }, []);

  const handleModeChange = async (newMode) => {
    // Validate prerequisites
    if (!password) {
      toast.error('Enter your wallet PIN / password to confirm');
      return;
    }
    if (newMode === 'password' && !actionPasswordConfigured) {
      toast.error('Set up an Action Password first (in "Two-factor at critical actions")');
      return;
    }
    if (newMode === 'biometric' && !bioAvailable) {
      toast.error('Face ID / Touch ID is not available on this device');
      return;
    }

    setMode(newMode);
    setBusy(true);
    try {
      await setHiddenWallet2faMode(newMode, password);
      setPassword(''); // clear password after successful change
      toast.success(`Hidden wallet unlock 2FA: ${MODES.find((m) => m.value === newMode).label}`);
      recordAudit('settings_changed');
    } catch (e) {
      toast.error(e?.message || 'Could not update hidden wallet unlock setting');
      setMode(hiddenWallet2faMode || 'none'); // revert on error
    } finally {
      setBusy(false);
    }
  };

  // Filter available modes based on platform
  const availableModes = MODES.filter((m) => {
    // TODO (TARGET): Password & biometric modes need custom UI integration
    // Current implementation uses TwoFactorGate (designed for critical actions)
    // which doesn't properly separate PIN verification from secondary factors
    // for the hidden wallet 2FA use case. Requires dedicated modal components.
    if (m.value === 'password') return false;  // Needs custom password field UI
    if (m.value === 'biometric') return false; // Needs FaceID-only UI (no PIN)
    if (m.value === 'passkey') return false;   // Passkey needs integration test
    return true; // Only 'none' (disabled) mode available
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
          <EyeOff className="w-5 h-5" />
          Hidden Wallet Extra Step
        </h3>
        <p className="text-sm text-muted-foreground">
          An optional extra step before opening a hidden wallet. Adds friction against casual or accidental access — not a coercion guarantee.
        </p>
        <p className="text-xs text-caution mt-2">
          In development — the extra step is not available yet. Today a hidden wallet opens with its secret only.
        </p>
      </div>

      {setupBlocked && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
          ℹ️ Configure from your real wallet session only (not from a decoy or hidden wallet).
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-3">
          <Label htmlFor="hidden-2fa-password">Wallet PIN / Password</Label>
          <PasswordInput
            id="hidden-2fa-password"
            placeholder="Enter your PIN or password to confirm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={setupBlocked || busy}
          />
          <p className="text-xs text-muted-foreground">
            Required to change this setting
          </p>
        </div>

        <div className="space-y-3">
          <Label htmlFor="hidden-2fa-mode">Unlock method</Label>
          <Select value={mode} onValueChange={handleModeChange} disabled={setupBlocked || busy}>
            <SelectTrigger id="hidden-2fa-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModes.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <span className="flex items-center gap-2">
                    {m.icon && <m.icon className="w-4 h-4" />}
                    {m.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {MODES.find((m) => m.value === mode)?.description}
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900 space-y-2">
        <p className="font-semibold">How it will work</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>You unlock your wallet with your PIN as usual.</li>
          <li>To open a hidden wallet, you will complete an extra step (password, passkey, or biometric). Not available yet — coming soon.</li>
          <li>Honest limit: this protects access inside the app only. On-chain history and addresses stay public to anyone who has the address.</li>
          <li>Duress wallets open with their own secret and are not affected by this setting.</li>
        </ul>
      </div>
    </div>
  );
}
