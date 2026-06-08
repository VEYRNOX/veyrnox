import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import WhitelistManager from "../components/security/WhitelistManager";
import { useTheme } from 'next-themes';
import { base44, WALLET_GATE } from "@/api/base44Client";
import { useWallet } from "@/lib/WalletProvider";
import { Shield, Fingerprint, Sun, Moon, ShieldAlert, ShieldCheck, ClipboardList, Trash2, AlertTriangle, Network, CloudUpload, Key, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import BackButton from "@/components/BackButton";
import PasskeySetup from "../components/PasskeySetup";
import BiometricUnlockSettings from "../components/security/BiometricUnlockSettings";
import PasskeyUnlockSettings from "../components/security/PasskeyUnlockSettings";
import SessionSettings from "../components/security/SessionSettings";

export default function Settings() {
  const queryClient = useQueryClient();
  const { lock } = useWallet();
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
    } catch {
      // Best-effort local cache clear; proceed to lock / sign-out regardless.
    }
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
    mutationFn: ({ walletId, credentialId }) =>
      base44.entities.Wallet.update(walletId, {
        passkey_registered: true,
        passkey_credential_id: credentialId,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wallets"] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage passkeys and wallet security
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
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          />
        </div>
      </div>

      {/* Biometric unlock (PROVISIONAL — M2b app-layer gate) */}
      <BiometricUnlockSettings />

      {/* Passkey unlock (S1 — FIDO2/WebAuthn gate, parallel to biometric) */}
      <PasskeyUnlockSettings />

      {/* Session & auto-lock (idle + background → WalletProvider.lock()) */}
      <SessionSettings />

      {/* Security Overview */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-1">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">WebAuthn / FIDO2</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Passkeys add an on-device biometric or security-key tap as an extra
          authentication factor. They never hold your keys or seed — your password
          and recovery phrase remain the independent way to unlock, so losing a
          passkey never costs funds. Transaction verification (below) can also use
          a per-wallet passkey.
        </p>
      </div>

      {/* Wallet Passkeys (per-wallet — used for transaction verification in the Send flow) */}
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

      {/* Current plan (display-only — see pages/Subscription.jsx; tier stays Free) */}
      <Link to="/plans" className="flex items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Current plan: Free</p>
            <p className="text-xs text-muted-foreground">View plans</p>
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
        <Link to="/audit" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
          <ClipboardList className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Audit Log</p>
            <p className="text-xs text-muted-foreground">Account history</p>
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
        <Link to="/cloud-backup" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
          <CloudUpload className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Encrypted Backup</p>
            <p className="text-xs text-muted-foreground">Cloud backup</p>
          </div>
        </Link>
        <Link to="/wallet-seed-qr" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px]">
          <Key className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Reveal Seed</p>
            <p className="text-xs text-muted-foreground">Backup phrase QR</p>
          </div>
        </Link>
      </div>

      {/* Danger Zone */}
      <div className="p-5 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">Danger Zone</h2>
        </div>
        {!showDelete ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Delete Account</p>
              <p className="text-xs text-muted-foreground">Permanently remove your account and all data</p>
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
              This action is <strong>permanent and irreversible</strong>. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              className="w-full rounded-lg border border-destructive/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive min-h-[44px]"
              placeholder="Type DELETE to confirm"
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