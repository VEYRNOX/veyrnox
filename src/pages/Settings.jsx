// @ts-nocheck
import { useState, useEffect } from "react";
import { Capacitor } from '@capacitor/core';
const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import WhitelistManager from "../components/security/WhitelistManager";
import { useTheme } from 'next-themes';
import { base44, WALLET_GATE } from "@/api/base44Client";
import { useWallet } from "@/lib/WalletProvider";
import { useTier } from "@/lib/TierProvider";
import { getAuthModel } from "@/lib/authModel";
import { Fingerprint, Sun, Moon, ShieldAlert, ShieldCheck, Trash2, AlertTriangle, Network, CloudUpload, Key, KeyRound, Sparkles, Scale, ScrollText, FileSignature } from "lucide-react";
import { isMessageSigningEnabled, setMessageSigningEnabled } from "@/lib/messageSigning";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import BackButton from "@/components/BackButton";
import PasskeySetup from "../components/PasskeySetup";
import BiometricUnlockSettings from "../components/security/BiometricUnlockSettings";
import PasskeyUnlockSettings from "../components/security/PasskeyUnlockSettings";
import TwoFactorSettings from "../components/security/TwoFactorSettings";
import HardwareKekSettings from "../components/security/HardwareKekSettings";
import SessionSettings from "../components/security/SessionSettings";
import RehearsalSettingsRow from "@/rehearsal/RehearsalSettingsRow";
import Spinner from "@/components/Spinner";

export default function Settings() {
  const queryClient = useQueryClient();
  const { lock, recordAudit, getAuditLogEnabled, toggleAuditLog, fetchAuditEntries } = useWallet();
  const { currentTier } = useTier();
  const isSafetyPlus = currentTier === "safety_plus";
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [auditLog, setAuditLog] = useState(() => getAuditLogEnabled());
  const [auditEntries, setAuditEntries] = useState(null);
  const [messageSigning, setMessageSigning] = useState(() => isMessageSigningEnabled());

  useEffect(() => {
    if (!auditLog) { setAuditEntries(null); return; }
    fetchAuditEntries().then(setAuditEntries).catch(() => setAuditEntries([]));
  }, [auditLog, fetchAuditEntries]);

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setIsDeleting(true);
    try {
      const [walletList, txList] = await Promise.all([
        base44.entities.Wallet.list(),
        base44.entities.Transaction.list(),
      ]);
      await Promise.all([
        ...walletList.map(w => base44.entities.Wallet.delete(w.id)),
        ...txList.map(t => base44.entities.Transaction.delete(t.id)),
      ]);
    } catch {}
    // Sign out (base44 removal, Phase 2). No hosted account in the local build —
    // lock the on-device vault so the WalletGate front door reappears. (This
    // clears the local entity cache; destroying key material is Panic Wipe.)
    if (WALLET_GATE) lock(); else await base44.auth.logout();
  };
  const { theme, setTheme } = useTheme();
  const isDark = theme !== 'light';

  const { data: wallets = [], isLoading } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const registerPasskey = useMutation({
    mutationFn: (/** @type {any} */ vars) =>
      base44.entities.Wallet.update(vars.walletId, {
        passkey_registered: true,
        passkey_credential_id: vars.credentialId,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wallets"] }),
  });

  if (isLoading) {
    return <Spinner className="h-64" label="Loading settings…" />;
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Lock, unlock, and protect your wallet
        </p>
      </div>

      {/* Theme Toggle */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              {isDark ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
            </div>
            <div>
              <p className="text-sm font-semibold">{isDark ? 'Dark Mode' : 'Light Mode'}</p>
              <p className="text-xs text-muted-foreground">Saved to this device</p>
            </div>
          </div>
          <Switch
            checked={isDark}
            onCheckedChange={(checked) => { setTheme(checked ? 'dark' : 'light'); recordAudit('settings_changed'); }}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          />
        </div>
      </div>


      {/* Activity log (opt-in, off by default — deniability-safe S4) */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ScrollText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Activity log</p>
              <p className="text-xs text-muted-foreground">Off by default · stored on this device only</p>
            </div>
          </div>
          <Switch
            checked={auditLog}
            aria-label={auditLog ? 'Disable activity log' : 'Enable activity log'}
            onCheckedChange={async (checked) => {
              await toggleAuditLog(checked);
              setAuditLog(checked);
              recordAudit('settings_changed');
            }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Private log: what you changed, sent, revoked. No amounts or addresses. Panic Wipe erases it.
        </p>
        {auditLog && auditEntries !== null && (
          <div className="mt-3 border-t border-border pt-3">
            {auditEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No events recorded yet.</p>
            ) : (
              <ul className="space-y-1">
                {[...auditEntries].reverse().map((e, i) => (
                  <li key={i} className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-mono">{e.type.replace(/_/g, ' ')}</span>
                    <span>{new Date(e.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Message signing (opt-in, OFF by default — fail-closed, I4).
          Lets the /crypto-signing page sign arbitrary text with the wallet key.
          A wallet that never blind-signs arbitrary messages is safer against
          signature-phishing, so the capability is present only when the user
          explicitly enables it. */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileSignature className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Message signing</p>
              <p className="text-xs text-muted-foreground">Off by default · stored on this device only</p>
            </div>
          </div>
          <Switch
            checked={messageSigning}
            aria-label={messageSigning ? 'Disable message signing' : 'Enable message signing'}
            onCheckedChange={(checked) => {
              setMessageSigningEnabled(checked);
              setMessageSigning(checked);
              recordAudit('settings_changed');
            }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Off by default. Lets you sign arbitrary text messages with your wallet key. Only enable if a dApp or service asks you to sign a message.
        </p>
      </div>

      {/* Security settings — shown on all platforms.
          TwoFactorSettings now handles native biometric 2FA (Face ID) via
          BiometricAuth, so it is no longer WebAuthn-only and can render on native.
          PasskeyUnlockSettings renders on native too, but NOT because WebAuthn
          works there — the Capacitor app ships NO WebAuthn plugin, so
          navigator.credentials is a dead stub. On native, lib/passkey.js routes
          registration + verification through the OS biometric
          (BiometricAuth) and the UI honestly labels the control "Biometric
          unlock", never "Passkey". Web keeps the real WebAuthn path. */}
      <BiometricUnlockSettings />
      <PasskeyUnlockSettings />
      <TwoFactorSettings />

      <HardwareKekSettings />
      <SessionSettings />
      <RehearsalSettingsRow />

      {/* Wallet Passkeys (per-wallet — used for transaction verification in the Send flow) */}
      {!isNative && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-primary" />
            Wallet Passkeys
          </h2>
          {wallets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a wallet first</p>
          ) : (
            wallets.map(wallet => (
              <div key={wallet.id} className="space-y-2">
                <p className="text-sm font-medium">{wallet.name} <span className="text-muted-foreground">({wallet.currency})</span></p>
                <PasskeySetup
                  wallet={wallet}
                  onRegistered={(credentialId) =>
                    registerPasskey.mutateAsync({ walletId: wallet.id, credentialId })
                  }
                />
              </div>
            ))
          )}
        </div>
      )}

      {/* Current plan — reflects the real entitlement from TierProvider (useTier). */}
      <Link to="/plans" className="flex items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Current plan: {isSafetyPlus ? "Safety Plus" : "Free"}</p>
            <p className="text-xs text-muted-foreground">
              {isSafetyPlus ? "Deeper security controls & advanced analytics" : "Upgrade to Safety Plus — $5.99/mo"}
            </p>
          </div>
        </div>
        <span className="text-sm text-primary font-medium">View plans</span>
      </Link>

      {/* Withdrawal Address Whitelist */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <WhitelistManager />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/security" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
          <ShieldAlert className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Security Center</p>
            <p className="text-xs text-muted-foreground">Sessions &amp; Limits</p>
          </div>
        </Link>
        <Link to="/network-manager" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
          <Network className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Network Manager</p>
            <p className="text-xs text-muted-foreground">RPC &amp; chains</p>
          </div>
        </Link>
        <Link to="/token-approvals" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Token Approvals</p>
            <p className="text-xs text-muted-foreground">View &amp; revoke allowances</p>
          </div>
        </Link>
        <Link to="/personal-backup" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
          <CloudUpload className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Encrypted Personal Backup</p>
            <p className="text-xs text-muted-foreground">Personal backup</p>
          </div>
        </Link>
        <Link to="/wallet-seed-qr" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
          <Key className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Reveal Seed</p>
            <p className="text-xs text-muted-foreground">Backup phrase QR</p>
          </div>
        </Link>
        <Link to="/wallet-access" data-testid="change-pin-link" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
          <KeyRound className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">{getAuthModel() === "pin" ? "Change PIN" : "Change vault password"}</p>
            <p className="text-xs text-muted-foreground">Access &amp; recovery</p>
          </div>
        </Link>
      </div>

      {/* Terms & legal — ordinary nav row to the static reference screen. No
          badge, no status, no count (deniability framing: nothing to read here). */}
      <Link to="/terms-legal" className="flex items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Scale className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Terms &amp; legal</p>
            <p className="text-xs text-muted-foreground">Terms, disclosures &amp; honest limits</p>
          </div>
        </div>
        <span className="text-sm text-primary font-medium">View</span>
      </Link>

      {/* Danger Zone */}
      <div className="p-5 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">Danger Zone</h2>
        </div>
        {!showDelete ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Clear local cache</p>
              <p className="text-xs text-muted-foreground">Clears saved data on this device and locks the wallet. Your recovery phrase still works. To erase keys, use Panic Wipe.</p>
            </div>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors min-h-[44px] shrink-0 select-none"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              This clears saved data and locks the wallet. Your recovery phrase still works. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              className="w-full rounded-lg border border-destructive/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive min-h-[44px]"
              placeholder="Type DELETE to confirm"
              aria-label="Type DELETE to confirm account reset"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors min-h-[44px] select-none"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "DELETE" || isDeleting}
                className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-40 hover:bg-destructive/90 transition-colors min-h-[44px] select-none"
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}