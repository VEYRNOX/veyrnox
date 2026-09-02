// @ts-nocheck
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from '@capacitor/core';
const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import WhitelistManager from "../components/security/WhitelistManager";
import { useTheme } from 'next-themes';
import { base44, WALLET_GATE } from "@/api/base44Client";
import { useWallet } from "@/lib/WalletProvider";
import { useTier } from "@/lib/TierProvider";
import { hasSafetyPlusAccess, tierLabel, TIER } from "@/lib/tier";
import { getAuthModel } from "@/lib/authModel";
import { Fingerprint, Sun, Moon, ShieldAlert, ShieldCheck, Trash2, AlertTriangle, Network, CloudUpload, Key, KeyRound, Sparkles, Scale, ScrollText, FileSignature, BarChart3 } from "lucide-react";
import { isMessageSigningEnabled, setMessageSigningEnabled } from "@/lib/messageSigning";
import { hasConsent, setConsent } from "@/lib/consent";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";
import { publishAdvisorContext } from "@/lib/advisorBridge";
import { usePortfolioHealthInputs } from "@/lib/usePortfolioHealthInputs";
import { isDuressConfigured } from "@/lib/duressBiometricGuard";
import { Link } from "react-router";
import { Switch } from "@/components/ui/switch";
import BackButton from "@/components/BackButton";
import PasskeySetup from "../components/PasskeySetup";
import BiometricUnlockSettings from "../components/security/BiometricUnlockSettings";
import PasskeyUnlockSettings from "../components/security/PasskeyUnlockSettings";
import TwoFactorSettings from "../components/security/TwoFactorSettings";
import HardwareKekSettings from "../components/security/HardwareKekSettings";
import FastpathToggle from "../components/security/FastpathToggle";
import SessionSettings from "../components/security/SessionSettings";
import RehearsalSettingsRow from "@/rehearsal/RehearsalSettingsRow";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Spinner from "@/components/Spinner";

export default function Settings() {
  const { t } = useTranslation("wallet");
  const queryClient = useQueryClient();
  const {
    lock, recordAudit, getAuditLogEnabled, toggleAuditLog, fetchAuditEntries,
    // Branch review 2026-08-15 (S-2/A-1) — see AuditLog.jsx for why this
    // defaults true: it governs the aria annotation only, never the write.
    auditLogWritable = true,
    isUnlocked, isDecoy, isHidden,
  } = useWallet();
  const { currentTier } = useTier();
  const isSafetyPlus = hasSafetyPlusAccess(currentTier);
  const planLabel = tierLabel(currentTier);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [auditLog, setAuditLog] = useState(() => getAuditLogEnabled());
  const [auditEntries, setAuditEntries] = useState(null);
  const [messageSigning, setMessageSigning] = useState(() => isMessageSigningEnabled());
  // Off in a decoy/demo session rather than reflecting the real device's answer:
  // "off" is the honest resting state of an opt-in control, and it keeps a coerced
  // session from disclosing a preference the primary wallet set (I3).
  const [telemetry, setTelemetry] = useState(
    () => !isDeniabilityOrDemoActive() && hasConsent(),
  );

  useEffect(() => {
    if (!auditLog) { setAuditEntries(null); return; }
    fetchAuditEntries().then(setAuditEntries).catch(() => setAuditEntries([]));
  }, [auditLog, fetchAuditEntries]);

  // Publish live non-secret settings state to the Security Advisor. Fully
  // suppressed (null) in decoy/hidden/demo/locked — the advisor sees nothing
  // rather than a decoy-shaped payload, matching the WalletConnect publisher.
  // KEK + passkey/biometric come from the shared R2 facade that is already
  // fail-closed and I3-safe.
  const { isVaultKekEnrolled, hasPasskeyOrBiometric, isDeniability } =
    usePortfolioHealthInputs({ isUnlocked });
  const [duressConfigured, setDuressCfg] = useState(false);
  useEffect(() => {
    if (isDeniability || !isUnlocked) { setDuressCfg(false); return; }
    try { setDuressCfg(isDuressConfigured() === true); } catch { setDuressCfg(false); }
  }, [isDeniability, isUnlocked]);
  useEffect(() => {
    if (isDecoy || isHidden || isDeniability || !isUnlocked) {
      publishAdvisorContext(null);
      return;
    }
    let consented = false;
    try { consented = hasConsent() === true; } catch { consented = false; }
    publishAdvisorContext({
      settings: {
        kek_enrolled: isVaultKekEnrolled === true,
        biometric_or_passkey: hasPasskeyOrBiometric === true,
        duress_configured: duressConfigured === true,
        telemetry_consent: consented,
        safety_plus_active: isSafetyPlus === true,
      },
    });
    return () => publishAdvisorContext(null);
  }, [isDecoy, isHidden, isDeniability, isUnlocked, isVaultKekEnrolled,
      hasPasskeyOrBiometric, duressConfigured, isSafetyPlus]);

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

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.heading")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("settings.subhead")}
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
              <p className="text-sm font-semibold">{isDark ? t("settings.theme.dark") : t("settings.theme.light")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.theme.saved_note")}</p>
            </div>
          </div>
          <Switch
            checked={isDark}
            onCheckedChange={(checked) => { setTheme(checked ? 'dark' : 'light'); recordAudit('settings_changed'); }}
            aria-label={isDark ? t("settings.theme.switch_to_light") : t("settings.theme.switch_to_dark")}
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
              <p className="text-sm font-semibold">{t("settings.activity_log.label")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.activity_log.description")}</p>
            </div>
          </div>
          {/* S-2 (branch review 2026-08-15). `setAuditLog(checked)` used to run
              unconditionally after the await, so in a decoy/hidden session — where
              toggleAuditLog refuses — the switch still rendered ON and the entries
              panel below opened on a log that was never enabled, until a remount
              silently reverted it (the initial state re-reads getAuditLogEnabled()).
              Drive local state off the APPLIED verdict, never off the argument.
              A-1: same aria-disabled treatment as AuditLog.jsx — annotated, not
              removed from the tab order, so the control still reads as present.

              PARTIAL vs AuditLog.jsx, deliberately: that page carries a hardcoded
              English sentence naming the decoy/hidden limitation, so it can point
              aria-describedby at a real explanation. The only candidate here is
              settings.activity_log.help, which describes the feature and says
              nothing about decoy sessions — pointing at it would announce a
              reason that is not there. Conveying the reason needs a new i18n key
              across 44 locales; that is a separate change, not a silent machine
              translation. A screen-reader user gets "dimmed" without the why. */}
          <Switch
            checked={auditLog}
            aria-label={auditLog ? t("settings.activity_log.disable_aria") : t("settings.activity_log.enable_aria")}
            aria-disabled={!auditLogWritable || undefined}
            onCheckedChange={async (checked) => {
              const applied = await toggleAuditLog(checked);
              if (!applied) return;
              setAuditLog(checked);
              recordAudit('settings_changed');
            }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("settings.activity_log.help")}
        </p>
        {auditLog && auditEntries !== null && (
          <div className="mt-3 border-t border-border pt-3">
            {auditEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t("settings.activity_log.no_events")}</p>
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
              <p className="text-sm font-semibold">{t("settings.message_signing.label")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.message_signing.description")}</p>
            </div>
          </div>
          <Switch
            checked={messageSigning}
            aria-label={messageSigning ? t("settings.message_signing.disable_aria") : t("settings.message_signing.enable_aria")}
            onCheckedChange={(checked) => {
              setMessageSigningEnabled(checked);
              setMessageSigning(checked);
              recordAudit('settings_changed');
            }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("settings.message_signing.help")}
        </p>
      </div>

      {/* Privacy — anonymous usage data. The onboarding consent screen tells the
          user "You can change this anytime in Settings → Privacy", so this
          control has to actually exist: a promise in the UI that no surface
          delivers is exactly the kind of claim the honesty bar forbids.
          Turning it off stops all egress immediately — trackEvent() re-reads
          consent on every call, so there is nothing to flush or restart. */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t("settings.telemetry.label")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.telemetry.description")}</p>
            </div>
          </div>
          <Switch
            checked={telemetry}
            aria-label={telemetry ? t("settings.telemetry.disable_aria") : t("settings.telemetry.enable_aria")}
            onCheckedChange={(checked) => {
              // The switch always MOVES — a control that visibly refuses to flip
              // would itself be a tell that this session is not the real one. The
              // shared-key WRITE is what a decoy session must not do, and
              // setConsent() self-suppresses there (I3 guard in lib/consent.js).
              setTelemetry(checked);
              setConsent(checked);
              recordAudit('settings_changed');
            }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("settings.telemetry.help")}
        </p>
      </div>

      {/* Language — Phase 2 slice 1. Writes route through lib/locale.js setLocale
          which is I3-gated (no-op in decoy/duress/stealth/demo), so a coerced
          tap cannot flip the real user's stored language or leave a "someone
          changed the language" tell. Non-English catalogs are machine-
          translated and the switcher renders an MT-pending banner until human
          review (see i18n/index.js MACHINE_TRANSLATED). */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <LanguageSwitcher />
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
      {/* Codex P1 2026-08-15: device-global auth prefs (biometric-unlock,
          passkey-unlock, two-factor, hardware KEK) read/write shared
          localStorage AND touch native secure-storage. Rendering these
          controls in a decoy/hidden session (a) tells the coercer what
          the real user has configured (read-side leak) and (b) lets them
          flip real device-global prefs (write-side leak, K-2 class). The
          lib-layer setters were gated to no-op in deniable this same
          wave (biometric.js, messageSigning.js, auditLog.js), but the
          controls themselves should not render either — otherwise the
          decoy sees a toggle whose state does not match what a click
          produces, which is its own tell. Hide the whole security-
          settings block in deniable, leaving a neutral one-liner. Same
          pattern the /login-activity page uses. */}
      {isDeniabilityOrDemoActive() ? (
        <div className="p-5 rounded-xl border border-border bg-card">
          <p className="text-sm text-muted-foreground">
            Security settings are managed from your unlocked wallet.
          </p>
        </div>
      ) : (
        <>
          <div className="p-5 rounded-xl border border-border bg-card space-y-5">
            <div className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">
                {isNative ? "Biometric" : "Unlock Methods"}
              </h2>
            </div>

            <div className="space-y-5">
              <BiometricUnlockSettings embedded />
              <div className="border-t border-border" />
              <PasskeyUnlockSettings embedded />
            </div>
          </div>
          <TwoFactorSettings />

          <HardwareKekSettings />
          {/* Fast unlock (#2019): Android-only opt-in biometric-only unlock
              path. Renders null on non-Android and in decoy/demo (I3). */}
          <FastpathToggle />
          <SessionSettings />
          <RehearsalSettingsRow />
        </>
      )}

      {/* Wallet Passkeys (per-wallet — used for transaction verification in the Send flow) */}
      {!isNative && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-primary" />
            Wallet Passkeys
          </h2>
          {isLoading ? (
            <Spinner className="h-16" label="Loading wallet passkeys…" />
          ) : wallets.length === 0 ? (
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
            <p className="text-sm font-semibold">Current plan: {planLabel}</p>
            <p className="text-xs text-muted-foreground">
              {isSafetyPlus
                ? currentTier === TIER.AI_SECURITY_PROTECTION
                  ? "Includes every Safety Plus feature plus live TIP-backed Vigil answers"
                  : "Deeper security controls & advanced analytics"
                : currentTier === TIER.AI_SECURITY_PROTECTION
                  ? "Live TIP-backed Vigil answers"
                  : "Upgrade to Safety Plus or AI Security Protection"}
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
          <h2 className="font-semibold">{t("settings.delete_account.title")}</h2>
        </div>
        {!showDelete ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t("settings.delete_account.clear_cache_label")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.delete_account.clear_cache_description")}</p>
            </div>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors min-h-[44px] shrink-0 select-none"
            >
              <Trash2 className="h-4 w-4" />
              {t("settings.delete_account.delete_button")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              {t("settings.delete_account.confirm_prompt_pre")} <strong>DELETE</strong> {t("settings.delete_account.confirm_prompt_post")}
            </p>
            <input
              className="w-full rounded-lg border border-destructive/40 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive min-h-[44px]"
              placeholder={t("settings.delete_account.confirm_placeholder")}
              aria-label={t("settings.delete_account.confirm_aria")}
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors min-h-[44px] select-none"
              >
                {t("settings.delete_account.cancel")}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "DELETE" || isDeleting}
                className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-40 hover:bg-destructive/90 transition-colors min-h-[44px] select-none"
              >
                {isDeleting ? t("settings.delete_account.deleting") : t("settings.delete_account.confirm_delete")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
