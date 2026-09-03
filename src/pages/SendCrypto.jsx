// @ts-nocheck
//
// ponytail: 2459 LOC (updated 2026-08-16) deliberately NOT split into
// src/pages/send/ sub-modules per the 2026-08 audit. This page is the
// pre-sign chokepoint: RASP artifact
// composition -> action-password re-auth -> gas / nonce / recipient screening
// -> Digital Shield branch vs software branch. Any structural move risks
// reordering the pre-sign gates (P2-7, #746 recovery check, #961 audited
// helpers) the SEND signing correctness depends on. Extracted candidates for
// a future audited pass (byte-identical, no reorder):
//   1. amount/rate formatting helpers (pure functions)
//   2. per-network fee-preset lookup tables
// The signing/broadcast branch stays here until independently re-audited.
import BackButton from "@/components/BackButton";
import SuccessBeacon from "@/components/SuccessBeacon";
import RiskShield from "@/components/RiskShield";
import { motion, useReducedMotion } from "motion/react";
import { Buffer } from "buffer";
import { USD_RATES, approxUsd, USD_REFERENCE_NOTE } from "@/lib/cryptos";
import { useDigitalShield } from '@/context/DigitalShieldContext';
import ReferenceRateNote from "@/components/ReferenceRateNote";
import ReferralPrompt from "@/components/ReferralPrompt";
import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowUpRight, Fingerprint, Loader2, CheckCircle2, ScanLine, ShieldCheck, ShieldAlert, AlertTriangle, ExternalLink, Lock, FileText, Fuel, Wallet } from "lucide-react";
import QRScanner from "../components/QRScanner";
import UrQrPlayer from "@/components/hw/UrQrPlayer";
import CoinLogo from "@/components/CoinLogo";
import WalletAssetPickerSheet from "@/components/send/WalletAssetPickerSheet";
import NoteEditorSheet from "@/components/send/NoteEditorSheet";
import FeeSheet from "@/components/send/FeeSheet";
import TransactionPreview from "@/components/TransactionPreview";
import TransactionIntelligencePanel from "@/components/TransactionIntelligencePanel";
import { toast } from "@/lib/toast";
import { successHaptic, errorHaptic, actionHaptic } from "@/lib/haptics";
import { parseEther, parseUnits } from "ethers";
import { useWallet } from "@/lib/WalletProvider";
import { Link, useNavigate, useSearchParams } from "react-router";
import { signAndBroadcast } from "@/wallet-core/evm/send";
import { MAX_BASE_FEE_GWEI, evmFeeOverrides } from "@/wallet-core/evm/fees";
import { getBalanceEth } from "@/wallet-core/evm/provider";
import { getBalanceSats } from "@/wallet-core/btc/provider.js";
import { getBalanceSol } from "@/wallet-core/sol/provider.js";
import { getAsset, canSend, canReceive, isEvmFamily } from "@/wallet-core/assets";
import { assetDisplayLabel, assetDisplaySymbol } from "@/lib/assetLabel";
import { isDevSendUngated } from "@/lib/devSendOverride";
import { signAndBroadcastBtc, estimateBtcSend, broadcastBtcTx } from "@/wallet-core/btc/send";
import { describeBtcPlan } from "@/wallet-core/btc/simulate";
import { signAndBroadcastSol, buildUnsignedSolTx } from "@/wallet-core/sol/send";
import { getSolNetwork } from "@/wallet-core/sol/networks.js";
import { broadcastRawTx, confirmTx } from "@/wallet-core/sol/provider.js";
import { toBaseUnits, normalizeSendResult } from "@/lib/sendDispatch";
import { getNetworkInfo, ALLOW_MAINNET } from "@/wallet-core/evm/networks";
import { sendToken, buildTokenTransfer, getTokenBalance } from "@/wallet-core/evm/token-send";
import { describeErc20Call } from "@/wallet-core/evm/calldata";
import RiskVerdictBanner from "@/components/RiskVerdictBanner";
import { score, buildRiskInputs } from "@/risk";
import { composeTransactionVerdict } from "@/risk/composeVerdict";
import { buildReviewContributor } from "@/risk/reviewContributor";
import { TIER, useRaspArtifact, getFreshRaspArtifact } from "@/rasp";
import { presignGate } from "@/sign-gate/presign";
import { deriveSigningPolicy } from "@/policy/signingPolicy";
import { simulateEvmTransaction } from "@/wallet-core/evm/simulate";
import { getToken } from "@/wallet-core/evm/tokens";
import { screenRecipient } from "@/wallet-core/evm/poison";
import { verifyLiveChainId, applyEstimatedGasLimit } from "@/wallet-core/evm/preflight.js";
import SecurityAdvisorBanner from "@/components/SecurityAdvisorBanner";
import { isValidAddressForCurrency } from "@/lib/addressValidation";
import { sendAddressErrorKind } from "@/lib/sendAddressError";
import { sendAmountErrorKind } from "@/lib/sendAmountError";
import { isSelfSend, addressesEqualForCurrency } from "@/lib/selfSend";
import { evaluateSendAgainstLimits } from "@/lib/txLimits";
import { evaluateSendGate, SEND_GATE } from "@/lib/sendGate";
import { resolveEnsName } from "@/lib/ens";
import { getProvider } from "@/wallet-core/evm/provider";
import { evaluateTwoFactor } from "@/lib/twoFactorGate";
import { SEND_2FA } from "@/lib/send2faMethod";
import { useSend2faMethod } from "@/lib/useSend2faMethod";
import { resolveMaxPriorityFeePerGas } from "@/lib/WalletConnectProvider";
import { verifyPasskeyAssertion } from "@/lib/passkey";
import { verifyBiometric2fa } from "@/lib/biometric";
import { evaluateBiometricSecondFactor } from "@/lib/stepUpFactorOutcome.js";
import { Capacitor } from "@capacitor/core";
import TwoFactorGate from "@/components/security/TwoFactorGate";
import { notifySendConfirmed, notifyRaspAlert, notifyTxRiskAlert } from "@/notify/sources";
import { defaultWalletId, sendAssetSymbols, defaultAssetSymbol, buildSendWallet, demoSendSource } from "@/lib/sendWalletSource";
import { DEMO, DEMO_POISON_ADDRESS } from "@/api/demoClient";
import { screenTransaction } from "@/api/tipScreen";
import { useTier } from "@/lib/TierProvider";
import { hasAdvisorOnlineAccess } from "@/lib/tier";
import { ZERO_FROM_ADDRESS } from "@/lib/tipZeroFrom.js";
import { persistRemoteScreenPreference, readRemoteScreenPreference } from "@/lib/remoteScreenPreference.js";
import { resolveTipChain } from "./sendCryptoTipChain";
import PinPad from "@/components/security/PinPad";
import { getAuthModel } from "@/lib/authModel";
import { isDeniabilitySessionActive, isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession.js";
import { trackEvent, EVENT } from "@/api/trackEvent";
import { requiresVerification } from "@/lib/seedVerifyGate";
import { useSendFlowTracking, useFirstSend } from "@/lib/tracking-integration";
import { normalizeDecimalInput, resolveLocale } from "@/lib/locale";
import { isRiskGateReady } from "@/lib/riskGateReady";
import { openAdvisor, publishAdvisorContext } from "@/lib/advisorBridge";
import {
  buildDigitalShieldBtcPsbt,
  buildDigitalShieldEvmRequest,
  buildDigitalShieldSolRequest,
  finalizeDigitalShieldBtcResponse,
  finalizeDigitalShieldEvmResponse,
  finalizeDigitalShieldSolResponse,
} from "@/wallet-core/hw/digitalShield.js";

// Maximum wrong-credential attempts before the vault locks (step-up re-auth).
const REAUTH_CAP = 5;

// Merge TIP threat-intel risks into a simulation result for TransactionPreview.
// Returns the original result unchanged when tipResult is absent.
function enrichWithTip(simResult, tipResult) {
  if (!simResult || !tipResult || !tipResult.risks?.length) return simResult;
  return {
    ...simResult,
    risks: [...(simResult.risks || []), ...tipResult.risks],
    source: {
      ...(simResult.source || {}),
      mode: simResult.source?.mode ? `${simResult.source.mode}+tip` : 'tip',
    },
  };
}

function parseDigitalShieldQr(raw) {
  const trimmed = String(raw || '').trim();
  if (!/^ur:/i.test(trimmed) || trimmed.length > 2048) return null;
  return trimmed.toUpperCase();
}

// M-3: form-boundary amount validity. `parseFloat(amount) <= 0` alone ACCEPTS
// scientific notation ("1e-8" parses to a small positive float) and other
// malformed inputs (locale commas, multiple dots, "1."), letting them cross the
// form boundary into the signing path where downstream parsers diverge. This
// pure predicate mirrors the canonical rule in wallet-core/amount.js
// (assertDecimalAmount): a positive, well-formed plain decimal string only —
// no exponent, sign, comma, or trailing dot. Kept exponent/precision-agnostic
// (no decimals arg) so it can gate the UI form without an asset context.
export function isFormAmountWellFormed(amountStr) {
  const s = String(amountStr ?? '').trim();
  // Plain decimal only: "123", "123.45", ".45" — rejects "", "1e-8", "-1",
  // "1,5", "1.2.3", "1." (matches assertDecimalAmount's shape rule).
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return false;
  // Must be strictly positive (rejects "0", "0.0", "0.000").
  return /[1-9]/.test(s);
}

// Address-poisoning / look-alike warning. INFORMS, never blocks; never asserts an
// address is safe — only that it resembles one the user has used before and
// couldn't be verified. Renders nothing unless the local screen is suspicious.
function PoisonWarning({ screen }) {
  const { t } = useTranslation("security");
  if (!screen?.suspicious) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/40">
      <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <div className="text-xs text-destructive space-y-1.5 min-w-0">
        <p className="font-semibold">{t("send_gates.poison.heading")}</p>
        <p className="text-destructive/90">
          {t("send_gates.poison.body")}
        </p>
        {screen.lookAlikes.map((m, i) => (
          <div key={i} className="rounded bg-destructive/10 border border-destructive/20 p-1.5">
            <p className="text-[10px] uppercase tracking-wide text-destructive/70">
              {t("send_gates.poison.resembles", {
                label: m.label,
                dateSuffix: m.date
                  ? t("send_gates.poison.resembles_date_suffix", { date: new Date(m.date).toLocaleDateString() })
                  : "",
              })}
            </p>
            <p className="mono-value break-all">{m.address}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Post-broadcast confirmation screen. This is the critical "your funds have
// left" moment — the confirmation deserves motion weight (skill rule 7: motion
// has meaning). Beacon springs in, copy stagger-fades, tx card lifts up.
// Reduced-motion pins the whole thing static.
function SendDoneView({ amount, currency, txResult, onSendAnother }) {
  const { t: tw } = useTranslation("wallet");
  const reduce = useReducedMotion();

  // Celebrate. Sustained confetti bursts + raining balloons falling from the
  // top of the viewport behind the beacon. Both suppressed under prefers-
  // reduced-motion (I4-adjacent — never surprise a user who asked the OS to
  // hush motion). Confetti is fire-and-forget; the interval is cleared on
  // unmount.
  // Funk palette — bold, saturated, wide gamut. Confetti-only celebration
  // now (balloons removed 2026-08-28); the check-mark is the one bold moment.
  const CONFETTI_COLORS = [
    "#4ADAC2", "#F5D061", "#F28FAD", "#8B5CF6", "#F97316",
    "#3B82F6", "#22C55E", "#FDE68A", "#FCA5A5", "#A5F3FC",
  ];

  useEffect(() => {
    if (reduce) return;
    let cancelled = false;
    (async () => {
      try {
        const { default: confetti } = await import("canvas-confetti");
        if (cancelled) return;
        // Locate the checkmark beacon so the explosion emanates from IT, not
        // a fixed screen coordinate. Falls back to top-third if the beacon
        // hasn't rendered yet (first paint race).
        const beacon = document.querySelector("[data-vx-beacon]");
        let ox = 0.5, oy = 0.3;
        if (beacon) {
          const r = beacon.getBoundingClientRect();
          ox = (r.left + r.width / 2) / window.innerWidth;
          oy = (r.top + r.height / 2) / window.innerHeight;
        }
        const shoot = (opts) => confetti({
          particleCount: 90,
          spread: 360,             // radial in every direction
          startVelocity: 42,
          scalar: 1,
          ticks: 220,
          gravity: 0.9,
          colors: CONFETTI_COLORS,
          shapes: ["square", "circle"],
          origin: { x: ox, y: oy },
          disableForReducedMotion: true,
          ...opts,
        });
        // One big explosion, then a smaller aftershock 180ms later.
        shoot();
        setTimeout(() => shoot({ particleCount: 40, startVelocity: 28, spread: 360 }), 180);
      } catch { /* preview-only sparkle; a load failure is not worth surfacing */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);


  const container = {
    hidden: {},
    show: { transition: reduce ? {} : { staggerChildren: 0.08, delayChildren: 0.15 } },
  };
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } },
      };
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="max-w-md mx-auto text-center py-16 space-y-5 relative"
    >
      <motion.div variants={item} className="flex justify-center relative" data-vx-beacon="true">
        <SuccessBeacon size={112} label={tw("send.done.beacon_label")} />
      </motion.div>
      <motion.h2 variants={item} className="text-xl font-bold tracking-tight">{tw("send.done.heading")}</motion.h2>
      <motion.p variants={item} className="text-sm text-muted-foreground">
        <span className="mono-value text-foreground">{amount} {currency}</span> {tw("send.done.body_suffix")}
      </motion.p>
      {txResult?.hash && (
        <motion.div variants={item} className="p-3 rounded-xl bg-secondary/30 border border-border text-start space-y-2">
          <p className="text-xs text-muted-foreground">{tw("send.done.tx_hash_label")}</p>
          <p className="text-xs mono-value break-all">{txResult.hash}</p>
          {txResult.explorerUrl && (
            <a href={txResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
              {tw("send.done.view_explorer")} <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <p className="text-[11px] text-muted-foreground">{tw("send.done.pending_note")}</p>
        </motion.div>
      )}
      <motion.div variants={item}>
        <Button variant="outline" onClick={onSendAnother}>
          {tw("send.done.send_another")}
        </Button>
      </motion.div>
      <motion.div variants={item}>
        <ReferralPrompt />
      </motion.div>
    </motion.div>
  );
}

export default function SendCrypto() {
  const { t } = useTranslation("security");
  const { t: tw } = useTranslation("wallet");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isUnlocked, wallets, activeWalletId, switchWallet, accounts, btcAccount, solAccount, withPrivateKey, withBtcPrivateKey, withSolPrivateKey, lock, verifyActiveCredential, verifyActiveCredentialDetailed, isSendReauthRequired, actionPasswordConfigured, verifyActionPassword, recordAudit, isDecoy, isHidden, vaultExists, vaultChecking } = useWallet();

  // A persisted demo flag must not exempt a session that has a real wallet.
  const demoActive = DEMO && wallets.length === 0;

  // Resolve the active 2FA method for this send (mirrors useActionGuard.resolveMethod;
  // see lib/send2faMethod.js). Audit H-1: keying the send gate off actionPasswordConfigured
  // alone silently skipped a PASSKEY-only second factor. is2faPasskeyEnabled/isPasskeyRegistered
  // are synchronous localStorage reads, so this is a plain computed value. 'none' means opt-in
  // was not configured — the send proceeds via the baseline windowed PIN step-up, unchanged.
  // L-3: reactive — re-reads the device-global biometric/passkey prefs (localStorage)
  // on a same-tab 2FA-pref change (SEND_2FA_CHANGED_EVENT), a passkey
  // registration/clear, or a cross-tab `storage` change, so a Send screen left mounted
  // while the user toggles 2FA in Settings does NOT keep a stale factor. The security
  // decision is unchanged — the hook delegates to the same pure resolveSend2faMethod.
  // I3: the resolver suppresses device-global factors in decoy/hidden sessions
  // (per-set Action Password still applies) — see lib/send2faMethod.js.
  const send2faMethod = useSend2faMethod({
    demo: demoActive,
    isNative: Capacitor.isNativePlatform(),
    actionPasswordConfigured,
    isDecoy,
    isHidden,
  });

  // Telemetry (Task 9): funnel tracking for the send flow. safeEmit()-backed —
  // never blocks/throws (I4) and is suppressed under deniability/demo by emit()'s
  // own guards (I3), so these are safe to fire unconditionally on this screen.
  const sendTracking = useSendFlowTracking();
  const markFirstSend = useFirstSend();
  useEffect(() => {
    sendTracking.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cold-load / deep-link guard: if the vault is confirmed absent (new install),
  // redirect home rather than hanging on an empty form.
  //
  // DEMO EXEMPTION: demo deliberately has no vault, so `vaultExists === false` is its
  // NORMAL state, not a broken deep link. Without this the screen rendered and then
  // redirected home the moment the async vault check resolved — measured at ~481 ms —
  // which made the send screen unreachable in demo and left the e2e spec that targets
  // it racing the redirect. The exemption is strictly `demoActive`, so a real new
  // install is still sent home exactly as before.
  const redirected = useRef(false);
  useEffect(() => {
    if (!redirected.current && !demoActive && !vaultChecking && vaultExists === false) {
      redirected.current = true;
      navigate('/', { replace: true });
    }
  }, [demoActive, vaultChecking, vaultExists, navigate]);
  // When navigated from CryptoDetailPage (?asset=ETH), wallet + asset are already
  // known — hide those pickers and show a simplified address+amount form.
  const fromDetail = !!searchParams.get("asset");
  const [walletId, setWalletId] = useState("");
  const [assetSymbol, setAssetSymbol] = useState(searchParams.get("asset") ?? "");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  // Fiat/crypto input toggle. `amount` (crypto, canonical) stays the single
  // source of truth for every downstream gate/send site — flipping the toggle
  // only changes what the input renders and how typed characters are
  // interpreted. `fiatDraft` holds the raw fiat string ONLY while
  // amountMode === 'fiat' so decimal typing is smooth (typing "1.2" doesn't
  // round-trip through crypto and back to "1.19999"). Toggle is hidden when
  // no USD rate is available (I4 — never allow a fiat entry against a
  // fabricated rate). Deniable-session note: `sendUsdRate` is already gated
  // by the same policy as balanceUsd above; no extra guard needed here.
  const [amountMode, setAmountMode] = useState('crypto');
  const [fiatDraft, setFiatDraft] = useState("");
  // LOCALE-AWARE CANONICAL FORM of the raw input, for every DERIVE / GATE / SEND
  // site below. A de-DE / fr-FR / es-ES user who types "1,5" needs the same
  // Continue button to work as an en-US user typing "1.5" — but the downstream
  // validators (isFormAmountWellFormed, wallet-core assertDecimalAmount — M-3)
  // are ASCII-only by design. This is the ONE place that translates between the
  // two. See lib/locale.js for the safety rule: an ambiguous input ("1,5" in
  // en-US) round-trips unchanged so the strict predicate still flags it — no
  // silent 10x sends.
  //
  // The RAW `amount` is kept for display-only sites (the input's own value, the
  // confirmation screen, the notification text) so the user sees back exactly
  // what they typed. Every derive/gate/send site reads canonicalAmount.
  //
  // Declared alongside `amount` (NOT next to amountNum / amountWellFormed
  // further down) because the very first tokenCalldata useMemo references it in
  // its dep array at render time — a later declaration would produce a TDZ
  // ReferenceError before the page ever mounted. Caught by web-e2e, missed by
  // unit tests that pin SendCrypto by source-read.
  const canonicalAmount = useMemo(
    () => normalizeDecimalInput(amount, resolveLocale()),
    [amount],
  );
  const [note, setNote] = useState("");
  const [step, setStep] = useState("form"); // form | verify | done
  const [showScanner, setShowScanner] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // Has the user finished with the address field at least once? Gates the error
  // ANNOUNCEMENT (see `addressInvalid`) so we never interrupt mid-entry.
  const [addressTouched, setAddressTouched] = useState(false);
  // Same, for the amount field: "0" is a legitimate prefix of "0.5".
  const [amountTouched, setAmountTouched] = useState(false);
  const [txResult, setTxResult] = useState(/** @type {any} */ (null)); // { hash, explorerUrl } from a real broadcast
  const [selectedFee, setSelectedFee] = useState(/** @type {any} */ (null)); // user-chosen EIP-1559 fee (FeeSelector)

  const { connected: digitalShieldConnected, evmAccount: digitalShieldEvmAccount, btcAccount: digitalShieldBtcAccount, solAccount: digitalShieldSolAccount } = useDigitalShield();
  const [useDigitalShieldMode, setUseDigitalShieldMode] = useState(false);
  // Progressive-disclosure wizard sheet open flags (2026-08-28). Pure UI state:
  // no security invariants touched, no persistence. Sheets close on selection.
  const [walletAssetSheetOpen, setWalletAssetSheetOpen] = useState(false);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [feeSheetOpen, setFeeSheetOpen] = useState(false);
  const [digitalShieldDialogOpen, setDigitalShieldDialogOpen] = useState(false);
  const [digitalShieldScannerOpen, setDigitalShieldScannerOpen] = useState(false);
  const [digitalShieldResponseDraft, setDigitalShieldResponseDraft] = useState("");
  const [digitalShieldResponseParts, setDigitalShieldResponseParts] = useState([]);
  const [digitalShieldFlow, setDigitalShieldFlow] = useState(null);
  const [digitalShieldError, setDigitalShieldError] = useState("");
  const [digitalShieldBusy, setDigitalShieldBusy] = useState(false);

  // STEP-UP RE-AUTH state (replaces the stranded passkey/OTP 2FA).
  const [reauthValue, setReauthValue] = useState("");
  const [reauthError, setReauthError] = useState("");
  const [reauthAttempts, setReauthAttempts] = useState(0);
  const [reauthPending, setReauthPending] = useState(false);
  const [, setReauthTick] = useState(0); // bump to force a re-render so the window check re-evaluates
  const [ensName, setEnsName] = useState("");
  const [ensResolving, setEnsResolving] = useState(false);
  const [ensResolved, setEnsResolved] = useState(/** @type {any} */ (null));

  const resolveENS = async (name) => {
    if (!name || (!name.endsWith(".eth") && !name.endsWith(".sol"))) return;
    // I3 / deniability (internal audit H-3): ENS/SNS resolution is a THIRD-PARTY
    // network call. In a decoy or hidden session it must NOT fire — a deniable
    // session makes zero backend calls, and an observer must not see a resolver
    // query tied to a send from a hidden wallet. Fail closed: paste the 0x/base58
    // address directly in these sessions (resolution is a convenience, not a gate).
    // 2026-07-14 audit MEDIUM: mirror the full triple guard used by every other
    // network-touching call site in this file (balance queries at 381/389/397 and
    // simulation at 564/587). isDeniabilitySessionActive() is a module-scoped flag
    // set independently of the WalletProvider flags — a stealth/panic-triggered
    // deniable state can have the session flag true while isDecoy/isHidden are
    // still false, and this was the only outlier that would fire resolveEnsName →
    // getProvider(network) in that window (I3 egress).
    if (isDecoy || isHidden || isDeniabilitySessionActive()) {
      toast.error(tw("send.toasts.ens_off_in_session"));
      return;
    }
    setEnsResolving(true); setEnsResolved(null);
    try {
      if (name.endsWith(".eth")) {
        // I2/I5: resolve on-chain via the user's own RPC — no third-party lookup
        // service sees the name or recipient. Traffic goes only to the same RPC
        // used for tx broadcast (audited VULN-1 fix).
        // Single source of truth (H-C): the same ALLOW_MAINNET constant that gates
        // getNetwork()/getProvider() also selects the resolver network. No separate
        // separate env-var path that could diverge from the enforced gate.
        const network = ALLOW_MAINNET ? 'mainnet' : 'sepolia';
        const provider = getProvider(network);
        const address = await resolveEnsName(provider, name);
        if (address) setEnsResolved({ name, address });
        else toast.error(tw("send.toasts.ens_not_found"));
      } else if (name.endsWith(".sol")) {
        // SNS honest-disable: no on-chain Bonfida resolver is wired yet.
        // The previous path called a third-party proxy (I2/I5 violation).
        // Paste the base58 address directly until on-chain resolution is built.
        toast.error(tw("send.toasts.sns_unavailable"));
      }
    } catch { toast.error(tw("send.toasts.ens_resolution_failed")); } finally { setEnsResolving(false); }
    // M-3 (internal audit): do NOT auto-populate the signing target with a
    // third-party-resolved address. The resolver is untrusted (a compromised/MITM'd
    // response could substitute an attacker address, and the ENS-mismatch risk input
    // can't catch it — it only compares the resolver's own output). The address stays
    // pending in `ensResolved` until the user EXPLICITLY confirms it below; only then
    // is it written to `toAddress` and signable.
  };


  // FROM-WALLET SOURCE (live vault via useWallet) — the SAME source the dashboard
  // reads. Replaces the old base44.entities.Wallet.list() (the DEMO data layer, empty
  // in a live build, which left this dropdown blank). A wallet here is a SEED holding
  // every chain; the Asset picker chooses which asset/chain to send.
  //
  // DEMO FALLBACK. Demo is a backend-less walkthrough with NO unlocked vault, so the
  // live source above is EMPTY in demo — which left BOTH pickers blank (the Asset
  // bottom-sheet opened with zero options: the reported bug). When DEMO is on AND the
  // live vault is empty, source the form from a synthetic demo wallet instead. Strictly
  // demo-only: in a real session `demoActive` is false and every value below is the
  // live one, so the real send path — and its deniability guarantees (I3) — is
  // byte-identical (a real session never reads the demo source).
  // `demoActive` is defined above (the cold-load guard needs it first).
  const demoSrc = useMemo(() => (demoActive ? demoSendSource() : null), [demoActive]);
  const srcWallets    = demoSrc ? demoSrc.wallets    : wallets;
  const srcAccounts   = demoSrc ? demoSrc.accounts   : accounts;
  const srcBtcAccount = demoSrc ? demoSrc.btcAccount : btcAccount;
  const srcSolAccount = demoSrc ? demoSrc.solAccount : solAccount;

  // DEV-ONLY testnet send ungate (lib/devSendOverride.js). The leading
  // import.meta.env.DEV is the build-time lock — a prod `vite build` collapses it to
  // false, so every ungate branch is dead-code-eliminated. isDevSendUngated() is pure
  // (env injected, no ambient fallback) → fails closed and is testable in isolation.
  const devUngated = import.meta.env.DEV && isDevSendUngated(import.meta.env);

  // Asset picker options. Normally the wallet's own enabledAssets (the list the
  // dashboard shows); in the dev-real ungate, surface EVERY supported asset so any
  // receive_only asset is verifiable without first enabling it per-wallet (older
  // wallets predate the all-assets default). VIEW-ONLY — never mutates the stored set.
  const enabledAssets = sendAssetSymbols(srcWallets, walletId, devUngated);
  // The trigger must display the wallet NAME. The selected SelectItem's content
  // isn't mounted until the dropdown opens, so the underlying Radix trigger would
  // otherwise fall back to rendering the raw wallet id — hand it the name explicitly.
  const selectedWalletName = srcWallets.find((w) => w.id === walletId)?.name || "";

  // Pre-select the wallet the dashboard marks Active (single wallet → auto-select),
  // and keep the pick valid if the wallet set changes. Deniability-safe: no count is
  // derived or shown.
  useEffect(() => {
    setWalletId((cur) => (cur && srcWallets.some((w) => w.id === cur)) ? cur : defaultWalletId(srcWallets, activeWalletId));
  }, [srcWallets, activeWalletId]);

  // The selected wallet must be the ACTIVE wallet, so the derived accounts
  // (accounts/btcAccount/solAccount) — and therefore the send address + signing key —
  // belong to it. Switching is cheap (re-derives public addresses; no vault read).
  // In demo there is no vault, so switchWallet is a no-op (it early-returns with no
  // container) and the demo wallet id simply selects the synthetic demo source.
  useEffect(() => {
    if (walletId && walletId !== activeWalletId && srcWallets.some((w) => w.id === walletId)) {
      switchWallet(walletId);
    }
  }, [walletId, activeWalletId, srcWallets, switchWallet]);

  // Default/clamp the asset to one this wallet actually shows (prefer ETH, the one
  // sendable asset). Re-runs when the wallet (and thus its asset list) changes.
  // When arriving from a detail page (?asset=BNB), honour the URL param — even if
  // the Send page was previously open showing a different asset (e.g. ETH), we must
  // overwrite state with the param symbol on every navigation that carries one.
  useEffect(() => {
    if (fromDetail) {
      const paramSymbol = searchParams.get("asset");
      if (paramSymbol) setAssetSymbol(paramSymbol);
      return;
    }
    setAssetSymbol((cur) => defaultAssetSymbol(enabledAssets, cur));
  }, [walletId, enabledAssets.join(","), fromDetail, searchParams]);

  const { data: whitelist = [] } = useQuery({
    queryKey: ["whitelisted-addresses"],
    queryFn: () => base44.entities.WhitelistedAddress.list(),
  });

  const { data: txLimits = [] } = /** @type {{ data: any[] }} */ (useQuery({
    queryKey: ["tx-limits"],
    queryFn: () => base44.entities.TransactionLimit.list(),
  }));

  // Sources for LOCAL address-poisoning screening: the addresses the user has
  // actually interacted with. All read client-side; nothing is sent anywhere.
  const { data: history = [] } = /** @type {{ data: any[] }} */ (useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 100),
    // Same reason as address-book below: shared IndexedDB store, real-session
    // rows would surface as "your recent send to X" chips in a decoy session.
    enabled: !isDecoy && !isHidden,
  }));
  const { data: addressBook = [] } = useQuery({
    queryKey: ["address-book"],
    queryFn: () => base44.entities.AddressBook.list(),
    // Codex P1 2026-08-15: address-book rows live in a SHARED IndexedDB store
    // (no per-session partition). Loading them in a decoy/hidden session would
    // let a downstream renderer (e.g. the poison-warning chip that labels a
    // matching address as "your saved contact X") leak real-session contact
    // identity. Empty list in deniable sessions matches the AddressBook page's
    // own render gate; the Send flow degrades cleanly (no saved-contact chip,
    // still validates the raw address).
    enabled: !isDecoy && !isHidden,
  });

  // Remote screening via the Veyrnox TIP. When TIP is configured
  // (VITE_TIP_BASE_URL set), defaults to ON so sanctions/threat screening is
  // active without manual opt-in. When unconfigured, defaults to OFF. The user
  // can always toggle it; the choice is persisted across sessions.
  const tipConfigured = !!import.meta.env.VITE_TIP_BASE_URL;
  // AI Security Protection tier gate — phishing / TIP recipient screening
  // is an upsell capability. Free + Safety Plus never fire the remote screen
  // regardless of the user's toggle. Kept ALONGSIDE remoteScreen (not
  // replacing it) so an AI-tier user can still opt out.
  const { currentTier } = useTier();
  const advisorOnline = hasAdvisorOnlineAccess(currentTier);
  const [remoteScreen, setRemoteScreen] = useState(() => {
    return readRemoteScreenPreference(tipConfigured);
  });
  const toggleRemoteScreen = (v) => {
    setRemoteScreen(v);
    // Codex P2 2026-08-15: never persist a decoy/hidden session's toggle to
    // shared localStorage — a coercer flipping this in a coerced session would
    // change the real user's default on the next primary unlock. In-memory
    // state still updates so the current session behaves as chosen.
    if (isDecoy || isHidden) return;
    persistRemoteScreenPreference(v);
  };

  // User-controlled simulation toggle. On by default; persisted so the choice
  // survives navigation. When off: the teaser box is hidden, both simulation
  // queries are disabled, and the verify step shows no pre-flight result.
  const [simEnabled, setSimEnabled] = useState(() => {
    try { return localStorage.getItem("veyrnox-sim-enabled") !== "0"; } catch { return true; }
  });
  const toggleSim = (v) => {
    setSimEnabled(v);
    // Codex P2 2026-08-15 — same shared-localStorage residue class as
    // toggleRemoteScreen above. In-memory only for decoy/hidden sessions.
    if (isDecoy || isHidden) return;
    try { localStorage.setItem("veyrnox-sim-enabled", v ? "1" : "0"); } catch { /* ignore */ }
  };

  // Synthesise the per-(wallet, asset) record the rest of this screen expects
  // (.currency/.address/.balance) from the live source, so downstream send / limit /
  // screening logic is unchanged. Address comes from the active wallet's derived
  // accounts (EVM shared / BTC / SOL) via resolveReceive.
  const vaultSelectedWallet = /** @type {any} */ (buildSendWallet({ wallets: srcWallets, walletId, assetSymbol, accounts: srcAccounts, btcAccount: srcBtcAccount, solAccount: srcSolAccount }));

  // Capability gate: only assets whose status is `live` may move funds. ETH is
  // live (Phase A); ERC-20 tokens (Phase B) are receive_only until a testnet
  // transfer is verified, so they read balances but cannot yet send.
  const selectedAsset = /** @type {any} */ (getAsset(assetSymbol || vaultSelectedWallet?.currency));
  const digitalShieldAccount = useMemo(() => {
    if (!useDigitalShieldMode) return null;
    if (selectedAsset?.family === "btc") return digitalShieldBtcAccount;
    if (selectedAsset?.family === "solana") return digitalShieldSolAccount;
    return digitalShieldEvmAccount;
  }, [useDigitalShieldMode, selectedAsset?.family, digitalShieldBtcAccount, digitalShieldSolAccount, digitalShieldEvmAccount]);
  const selectedWallet = /** @type {any} */ (
    useDigitalShieldMode && digitalShieldAccount
      ? { ...(vaultSelectedWallet || {}), id: `${walletId || 'hardware'}:digital-shield`, name: `${selectedWalletName || 'Wallet'} · Digital Shield`, currency: assetSymbol || vaultSelectedWallet?.currency, address: digitalShieldAccount.address, balance: 0 }
      : vaultSelectedWallet
  );
  const sendEnabled = canSend(selectedAsset);
  const isErc20 = selectedAsset?.family === "erc20";

  // `flowSendEnabled` is the UI-flow gate: it relaxes for a receive_only asset when
  // the dev ungate is active (devUngated, computed above with the build-time DCE
  // lock). The HARD signing gate (sendTx mutationFn) re-checks canSend() directly and
  // likewise relaxes only on devUngated, so the asset's status is never changed.
  const flowSendEnabled = sendEnabled || devUngated;

  // The active chain follows the selected asset. EVM assets carry their mainnet
  // network key (e.g. MATIC -> 'polygon'); BTC carries 'mainnet' and SOL 'mainnet'.
  // Family drives both dispatch and which network registry applies.
  const family = selectedAsset?.family;
  const isBtc = family === "btc";
  const isSolana = family === "solana";
  const networkKey = selectedAsset?.chain || "sepolia";
  const digitalShieldBtcUnsupported = isBtc && networkKey !== 'mainnet';
  // The EVM network registry only describes EVM chains; for BTC/SOL there is no
  // EIP-1559 fee model and the native symbol is just the asset's own currency.
  const activeNetwork = (isEvmFamily(selectedAsset) || isErc20) ? getNetworkInfo(networkKey) : null;
  const nativeSymbol = activeNetwork?.symbol || selectedWallet?.currency || "ETH";
  const networkName = activeNetwork?.name || networkKey;
  // Whether we know a live balance for this asset (EVM/ERC-20/BTC/SOL all read live).
  const balanceKnown = isEvmFamily(selectedAsset) || isErc20 || isBtc || isSolana;

  // Chain is the source of truth for balance — read it live, never the DB.
  // Native (ETH) reads via getBalanceEth; ERC-20 reads via the token contract's
  // balanceOf (with an on-chain decimals cross-check). Enabled whenever the asset
  // is at least receive-capable so balances show even before send is unlocked.
  const { data: liveBalance } = useQuery({
    queryKey: ["evm-balance", networkKey, selectedWallet?.address, selectedAsset?.symbol],
    queryFn: () => isErc20
      ? getTokenBalance({ networkKey: networkKey, symbol: selectedAsset.symbol, owner: selectedWallet.address })
      : getBalanceEth(networkKey, selectedWallet.address),
    // EVM-family only: getBalanceEth / getTokenBalance are EVM reads, so a BTC/SOL
    // selection must NOT issue a wrong-network balance request.
    // I3: never issue live balance RPC in a decoy/hidden (deniability) session.
    enabled: !demoActive && !isDecoy && !isHidden && !isDeniabilitySessionActive() && !!selectedWallet?.address && canReceive(selectedAsset) && (isEvmFamily(selectedAsset) || isErc20),
    refetchInterval: 15000,
  });

  // BTC live balance (sats → BTC). Enabled for BTC selections only, same I3/demo guards.
  const { data: btcLiveBalance } = useQuery({
    queryKey: ["btc-balance", networkKey, selectedWallet?.address],
    queryFn: async () => Number(await getBalanceSats(networkKey, selectedWallet.address)) / 1e8,
    enabled: !demoActive && !isDecoy && !isHidden && !isDeniabilitySessionActive() && !!selectedWallet?.address && canReceive(selectedAsset) && isBtc,
    refetchInterval: 30000,
  });

  // SOL live balance (lamports already converted to SOL by provider). Same guards.
  const { data: solLiveBalance } = useQuery({
    queryKey: ["sol-balance", networkKey, selectedWallet?.address],
    queryFn: async () => Number(await getBalanceSol(networkKey, selectedWallet.address)),
    enabled: !demoActive && !isDecoy && !isHidden && !isDeniabilitySessionActive() && !!selectedWallet?.address && canReceive(selectedAsset) && isSolana,
    refetchInterval: 30000,
  });

  // Unified live balance across all families (undefined while loading, null when not applicable).
  const nativeLiveBalance = isBtc ? btcLiveBalance : isSolana ? solLiveBalance : liveBalance;

  // Demo balance for the selected asset (display + the max/limit check). Mirrors the
  // seeded demo portfolio; no live RPC is issued in demo (the query above is disabled).
  const demoBalance = demoSrc ? (demoSrc.balances[assetSymbol] ?? 0) : null;

  // Decode EXACTLY what an ERC-20 send will sign, for display on the confirm
  // screen BEFORE any signature (the anti-blind-signing control). Transfers show
  // recipient/amount/token; an unlimited `approve` would surface a red warning.
  const tokenCalldata = /** @type {any} */ (useMemo(() => {
    if (!isErc20 || !toAddress || !canonicalAmount || parseFloat(canonicalAmount) <= 0) return null;
    try {
      const { data } = buildTokenTransfer({ networkKey: networkKey, symbol: selectedAsset.symbol, to: toAddress, amount: canonicalAmount });
      return describeErc20Call({ data, tokenSymbol: selectedAsset.symbol, decimals: getToken(networkKey, selectedAsset.symbol).decimals });
    } catch {
      return null; // unconfigured token / invalid input — UI shows nothing to decode
    }
  }, [isErc20, selectedAsset, toAddress, canonicalAmount]));

  // Unlimited-approval extra confirmation. Send flows are transfer-only, so this
  // stays false in normal use; it hard-gates the action only if an unlimited
  // `approve` is ever decoded.
  //
  // The reset useEffect below matches the freshness guarantee the other acks
  // (limitAck, riskAck, raspWarnBioOk, btcRiskAck) already carry: any change to
  // amount / currency / recipient invalidates a prior acknowledgement. Without
  // it a stale approvalAck could survive an in-place amount edit on the review
  // step and authorise a larger permission than the user last saw (wizard-split
  // recon 2026-08-28).
  const [approvalAck, setApprovalAck] = useState(false);
  useEffect(() => { setApprovalAck(false); }, [amount, selectedWallet?.currency, toAddress]);
  const blockedByApproval = tokenCalldata?.kind === "approve" && tokenCalldata.unlimited && !approvalAck;

  // Spend-limit acknowledgement. The cap is a warn-not-block control (matching
  // screening/simulation/anomaly): a breach surfaces a clear warning the user can
  // explicitly override. Reset whenever the breach could change — amount, asset,
  // or recipient — so a prior acknowledgement never carries over to a changed or
  // larger send (the freshness guarantee for the sign-time re-evaluation below).
  const [limitAck, setLimitAck] = useState(false);
  useEffect(() => { setLimitAck(false); }, [amount, selectedWallet?.currency, toAddress]);

  // Effective balance for max/limit checks: chain read for live assets, falling
  // back to the DB value only for not-yet-live assets (display only).
  const effectiveBalance = demoActive
    ? (demoBalance ?? 0)
    : (flowSendEnabled && nativeLiveBalance != null
        ? parseFloat(String(nativeLiveBalance))
        : (selectedWallet?.balance || 0));

  // USD conversions for the Send screen (DISPLAY ONLY — derived from the static
  // USD_RATES reference table, never a live feed; disclosed via USD_REFERENCE_NOTE).
  // `null` for an asset we have no reference price for (e.g. MATIC/AVAX) so we render
  // the crypto amount alone rather than a misleading ≈$0.
  const sendUsdRate = selectedWallet?.currency ? (USD_RATES[selectedWallet.currency] ?? null) : null;
  // A live-read asset whose on-chain balance we could NOT read yet is
  // INDETERMINATE (react-query keeps `data` undefined while the read is pending
  // OR after it throws) — the amount line already shows "reading from network…"
  // for it. Suppress the "≈ $X" companion so a failed/pending read is never
  // asserted as "· $0.00" (which the effectiveBalance→0 fallback would produce).
  // I4 fail-closed: never show a $ value we didn't confirm.
  const balanceIndeterminate = !demoActive && flowSendEnabled && nativeLiveBalance == null;
  const balanceUsd = !balanceIndeterminate && sendUsdRate != null && Number.isFinite(effectiveBalance) ? effectiveBalance * sendUsdRate : null;
  const amountNum = parseFloat(canonicalAmount);
  // Whether the typed amount is one we are willing to DERIVE FIGURES FROM. The
  // amount field is type="text" (type="number" blanked "1,5" / "1." / "1.2.3"
  // before React saw them, so the 'malformed' message could never fire for them —
  // see SendCrypto.amountInputType.test.js). Now that those strings reach state,
  // the raw parses mis-read them: parseFloat('1,5') is 1, Number('1.') is 1. Any
  // display fed those would assert a figure the user never typed, and a half-typed
  // "1." would pop a spend-limit warning mid-entry.
  //
  // NaN unless well-formed, using the SAME verdict the Continue button gates on, so
  // what the form is willing to show and what it is willing to send cannot drift.
  // Both the well-formedness check and the parse read canonicalAmount so a
  // locale-comma input is judged after normalisation — "0,5" de-DE parses as
  // 0.5, not 0, and no longer trips the "must be greater than zero" message.
  const amountWellFormed = isFormAmountWellFormed(canonicalAmount);
  const usableAmountNum = amountWellFormed ? amountNum : NaN;
  const amountUsd = sendUsdRate != null && Number.isFinite(usableAmountNum) && usableAmountNum > 0 ? usableAmountNum * sendUsdRate : null;

  const addressFormatValid = !toAddress || !selectedWallet
    ? true
    : isValidAddressForCurrency(toAddress, selectedWallet.currency);

  // Which address error applies — 'missing' | 'malformed' | null. The two cases have
  // different triggers, so they are decided together in one pure, tested helper
  // (lib/sendAddressError.js) rather than inferred from a single flag plus a ternary:
  //   - missing   → only on a submit attempt (an empty recipient is the starting
  //                 state, not a mistake). This case was previously UNREACHABLE, so
  //                 Continue silently refused with no explanation.
  //   - malformed → on blur or submit, never mid-entry: role="alert" is an ASSERTIVE
  //                 live region, and every address is malformed until it is complete,
  //                 so announcing per-character interrupts to state the obvious.
  const addressErrorKind = sendAddressErrorKind({ toAddress, addressFormatValid, addressTouched, showErrors });

  // Hoisted so the input's aria-invalid / aria-describedby and the message itself
  // cannot drift apart — they describe one control, and a field that reads "invalid"
  // while no message renders (or vice versa) is worse than neither.
  const addressInvalid = addressErrorKind !== null;

  // SELF-SEND guard (#179 S3). Compares the recipient against the active wallet's
  // OWN address for this asset, with per-currency normalization (EVM case-
  // insensitive; BTC/SOL case-significant — see lib/selfSend.js). WARN-not-block:
  // sending to yourself burns fees for no transfer (a common footgun), but a user
  // may legitimately self-transfer, so this surfaces a clear, plain-language
  // warning — it never disables Continue. Pure + local; no key/seed/network.
  const isSelfSendRecipient = isSelfSend(toAddress, selectedWallet?.address, selectedWallet?.currency);

  const currencyWhitelist = whitelist.filter(w => w.currency === selectedWallet?.currency);
  // 2026-07-14 audit LOW: per-currency compare. Previously `.toLowerCase()` on both
  // sides was semantically wrong for base58 BTC/SOL (case-significant) — two distinct
  // valid base58 addresses could compare equal and suppress the "not on whitelist"
  // warning. Reuses the same case-fold rules as isSelfSend.
  const isAddressWhitelisted = currencyWhitelist.length === 0
    ? true
    : currencyWhitelist.some(w => addressesEqualForCurrency(w.address, toAddress, selectedWallet?.currency));

  // Addresses the user has interacted with — the corpus the look-alike screen
  // compares against. Each entry carries a human label so the warning can name
  // what the recipient resembles. screenRecipient() ignores non-EVM addresses,
  // so BTC/SOL recipients simply aren't screened here.
  const knownAddresses = useMemo(() => {
    const out = [];
    for (const tx of history) {
      if (tx.to_address) out.push({ address: tx.to_address, label: tx.type === "send" ? "an address you've paid before" : "a counterparty in your history", date: tx.created_date });
      if (tx.from_address) out.push({ address: tx.from_address, label: "a counterparty in your history", date: tx.created_date });
      if (tx.address) out.push({ address: tx.address, label: "a counterparty in your history", date: tx.created_date });
    }
    for (const c of addressBook) out.push({ address: c.address, label: c.name ? `your saved contact "${c.name}"` : "a saved contact" });
    for (const w of whitelist) out.push({ address: w.address, label: "a whitelisted address" });
    return out;
  }, [history, addressBook, whitelist]);

  // LOCAL look-alike / address-poisoning screen for the current recipient.
  const poisonScreen = useMemo(
    () => screenRecipient(toAddress, knownAddresses),
    [toAddress, knownAddresses]
  );

  // TIP REMOTE SCREENING (opt-in, off by default). I2: only fires when the user
  // has explicitly enabled remoteScreen. I3: screenTransaction returns null in
  // deniability/demo. Runs at the verify step so the form step makes no call.
  //
  // resolveTipChain lives in a separate helper so the mapping can be
  // unit-tested without mounting SendCrypto (issue #1645 regression coverage).
  const tipChain = resolveTipChain(isBtc ? 'btc' : isSolana ? 'solana' : null, networkKey);

  // H-1 — the readiness gate must be derived from the SAME condition that
  // enables each query. Previously the gate was written independently of the
  // queries and drifted from them; declaring the condition once makes that
  // impossible. Both `enabled:` props below read these constants.
  const tipScreenApplies = advisorOnline && remoteScreen && (step === "review" || step === "confirm") && !!toAddress
    && !!selectedWallet?.address && addressFormatValid;

  // Unsigned SOL transaction for the TIP `solana-sim` lane. The Worker's
  // solana-sim source needs a base64-serialized Message/Transaction to feed
  // Solana's `simulateTransaction` RPC; without it the lane emits skipped.
  // Built at verify step, refreshed every 20s (blockhash drifts) — the Worker
  // still passes replaceRecentBlockhash: true so a slightly stale blockhash
  // is fine. requireAllSignatures: false already inside buildUnsignedSolTx
  // (see src/wallet-core/sol/send.js:222).
  //
  // I2/I3 gate: buildUnsignedSolTx performs a getLatestBlockhash RPC. That
  // egress must NOT fire when remote screening is off, in demo, or in a
  // decoy/hidden session — mirrors the same suppression the other simulation
  // queries apply. Codex 2nd-review flagged this as [P1] in the first pass.
  const solUnsignedTxApplies = advisorOnline && isSolana && remoteScreen && (step === "review" || step === "confirm")
    && !!toAddress && !!selectedWallet?.address && addressFormatValid
    && !!canonicalAmount && parseFloat(canonicalAmount) > 0
    && !demoActive && !isDecoy && !isHidden && !isDeniabilitySessionActive();
  const solUnsignedTxQuery = useQuery({
    queryKey: ['sol-unsigned', selectedWallet?.address, toAddress, canonicalAmount, networkKey],
    queryFn: async () => {
      const lamports = toBaseUnits(canonicalAmount, 9);
      return buildUnsignedSolTx({
        fromAddress: selectedWallet.address,
        toAddress,
        lamports,
        networkKey,
      });
    },
    enabled: solUnsignedTxApplies,
    staleTime: 20_000,
    retry: false,
  });
  // Serialized-tx string passed to TIP. For Solana we hand over the base64
  // unsigned tx if the build succeeded; on build error we DO NOT hold TIP
  // hostage — every other TIP lane (sanctions, phishing, hack, contract-risk,
  // etherscan-labels, sanctioned-address) still runs, solana-sim just emits
  // its honest skipped row. Codex 2nd-review flagged the previous gating as
  // a denial-of-screening [P1]. BTC deferred: testmempoolaccept needs a
  // fully signed raw tx we do not have pre-sign.
  const serializedTxForTip = isSolana ? solUnsignedTxQuery.data?.unsignedTxBase64 : undefined;

  // Codex P1 2026-08-15: the outbound TIP payload used to ship the wallet's
  // OWN address (`from: selectedWallet?.address`) and up to 20 previous
  // counterparties on EVERY send. The user asked us to screen ONE recipient;
  // shipping their identity + historical graph turns each screen into an
  // identity-cluster leak against TIP (and any log sink on the way). Drop
  // both. The screening quality delta is small — TIP still gets the chain,
  // action type, recipient, contract, calldata, value, and (SOL) serialized
  // tx. The `from` field stays as the zero address so TIP's parsers that
  // require it accept the shape.
  const tipQuery = useQuery({
    queryKey: ['tip-screen', toAddress, tipChain, canonicalAmount, serializedTxForTip],
    queryFn: () => screenTransaction({
      chain: tipChain,
      actionType: isErc20 ? 'token_transfer' : 'transfer',
      from: ZERO_FROM_ADDRESS[tipChain],
      to: toAddress,
      ...(isErc20 && selectedAsset?.contractAddress && { contractAddress: selectedAsset.contractAddress }),
      ...(riskCalldata && { calldata: riskCalldata }),
      ...(canonicalAmount && { valueWei: canonicalAmount }),
      ...(serializedTxForTip && { serializedTx: serializedTxForTip }),
    }),
    enabled: tipScreenApplies,
    staleTime: 30_000,
    retry: false,
  });

  // Persist non-sanctions TIP signals to the local store.
  //
  // NOTE: Sentinel reads via lookupThreatSync(), which is SEED-ONLY — it never
  // opens IndexedDB — so these rows are not yet read back anywhere. Kept as the
  // write half of the flywheel; wiring a read path is a separate change, and it
  // must NOT read sanctions (cacheTipResult refuses to store them, because a
  // cached sanctions verdict cannot track a delisting — docs/OFAC-legal-gate.md).
  // An earlier version of this comment claimed "Sentinel picks them up", which
  // was false.
  useEffect(() => {
    if (tipQuery.data && toAddress && tipQuery.data.verdict !== 'allow') {
      import('@/lib/threatIntelStore').then(m => m.cacheTipResult(toAddress, tipQuery.data)).catch(() => {});
    }
  }, [tipQuery.data, toAddress]);

  // SPEND-LIMIT ENFORCEMENT (Security Center → Tx Limits). Evaluates this send
  // against the user's per-transaction AND daily caps. The daily cap was
  // previously saved-but-never-read (security theatre); it is now enforced by
  // summing TODAY's sends from the SAME local tx-history records loaded above
  // (`history`) — see lib/txLimits.js. Fully on-device: no new fetch, no
  // phone-home. A breach disables the Continue button below and renders a clear,
  // specific reason; it never silently blocks.
  const limitEval = useMemo(
    () => evaluateSendAgainstLimits({
      amount: canonicalAmount,
      currency: selectedWallet?.currency,
      usdRates: USD_RATES,
      history: /** @type {any} */ (history),
      limits: /** @type {any} */ (txLimits),
      now: new Date(),
    }),
    [canonicalAmount, selectedWallet, history, txLimits]
  );

  // ANOMALY / FRAUD DETECTION inputs (Phase S2) — derived from the SAME local data
  // already loaded above, NOTHING fetched. `priorSends` are this asset's past
  // OUTFLOW amounts (the baseline for "unusual amount vs your own history");
  // `knownCounterparties` are every address you've transacted with / saved (for
  // the first-time-recipient check). Fed into the simulation so the deviation
  // flags render in the same pre-sign preview. Local-only; no phone-home.
  const priorSends = useMemo(
    () => history
      .filter((t) => t.type === "send" && t.currency === selectedWallet?.currency)
      .map((t) => String(t.amount))
      .filter((s) => s && s !== '0'),
    [history, selectedWallet]
  );
  const knownCounterparties = useMemo(
    () => knownAddresses.map((k) => k.address?.toLowerCase()).filter(Boolean),
    [knownAddresses]
  );
  const reviewContributor = useMemo(() => buildReviewContributor({
    recipient: toAddress || null,
    currency: selectedWallet?.currency || null,
    history,
    knownAddresses,
    whitelist,
  }), [toAddress, selectedWallet?.currency, history, knownAddresses, whitelist]);

  // PRE-SIGN TRANSACTION SIMULATION (Phase S2). Before the user confirms, dry-run
  // the transaction against the EXISTING RPC (eth_call / eth_getBalance /
  // eth_getCode) to predict the outcome (balance changes), decode the call, and
  // flag KNOWN risk patterns (unlimited approval, known-bad / look-alike
  // recipient, unverified contract, predicted revert, large outflow). LOCAL-ONLY:
  // no third-party scoring service. WARNS, never blocks; never claims "safe".
  // Disabled in DEMO (no live RPC) — the demo harness renders sample previews
  // instead. Errors are surfaced as a degraded "couldn't simulate" note, not a
  // block. Keys are never involved (simulation needs only the sender address).
  // Mirrors tipScreenApplies: one declaration, read by both the query's
  // `enabled` and the readiness gate, so the two cannot drift (H-1).
  // NOTE the EVM-family clause — this simulation NEVER runs for BTC/SOL, which
  // is exactly why keying readiness off it alone blocked those sends forever
  // (L-4).
  const txSimApplies = simEnabled && (step === "review" || step === "confirm") && !demoActive && !isDecoy && !isHidden
    && !isDeniabilitySessionActive() && (isEvmFamily(selectedAsset) || isErc20)
    && !!selectedWallet?.address && !!toAddress && addressFormatValid
    && parseFloat(canonicalAmount) > 0;

  const txSim = /** @type {any} */ (useQuery({
    queryKey: ["tx-sim", networkKey, selectedWallet?.address, toAddress, canonicalAmount, selectedAsset?.symbol, isErc20],
    queryFn: async () => {
      const from = selectedWallet.address;
      if (isErc20) {
        const t = getToken(networkKey, selectedAsset.symbol);
        const { data } = buildTokenTransfer({ networkKey, symbol: selectedAsset.symbol, to: toAddress, amount: canonicalAmount });
        return simulateEvmTransaction({
          networkKey, from, to: t.address, data, valueWei: 0n,
          nativeSymbol, tokenSymbol: selectedAsset.symbol, tokenDecimals: t.decimals,
          tokenBalance: liveBalance != null ? String(liveBalance) : /** @type {any} */ (null), knownAddresses,
          priorSends, knownCounterparties,
        });
      }
      return simulateEvmTransaction({
        networkKey, from, to: toAddress, valueWei: parseEther(String(canonicalAmount)),
        nativeSymbol, knownAddresses, priorSends, knownCounterparties,
      });
    },
    // I3: never issue simulation RPC in a decoy/hidden (deniability) session.
    enabled: txSimApplies,
    retry: false,
    staleTime: 10000,
  }));

  // BTC PRE-SIGN PREVIEW (internal audit H-1/M-2). Bitcoin has no programmable
  // execution to dry-run, so this is an HONEST decode of the EXACT transaction the
  // user is about to sign — inputs, outputs, change, and FEE — from the live
  // coin-selection plan (estimateBtcSend) decoded by describeBtcPlan. Previously the
  // BTC send showed NO fee and ran no preview; the indexer-reported fee (now clamped
  // in btc/provider.js) flowed straight into a signed tx. This surfaces the fee +
  // plan + decode-only risk flags (entire_balance / large_outflow) BEFORE signing.
  // LOCAL: only the existing Esplora indexer; no third-party scorer; no keys.
  const btcSim = /** @type {any} */ (useQuery({
    queryKey: ["btc-sim", networkKey, selectedWallet?.address, toAddress, canonicalAmount],
    queryFn: async () => {
      const fromAddress = selectedWallet.address;
      const amountSats = parseUnits(String(canonicalAmount), 8); // BTC has 8 decimals; exact, no float
      const { plan } = await estimateBtcSend({ networkKey, fromAddress, toAddress, amountSats });
      return describeBtcPlan({ plan, fromAddress });
    },
    // I3: never issue Esplora estimate RPC in a decoy/hidden (deniability) session.
    enabled: simEnabled && (step === "review" || step === "confirm") && !demoActive && !isDecoy && !isHidden && !isDeniabilitySessionActive() && isBtc
      && !!selectedWallet?.address && !!toAddress && addressFormatValid && parseFloat(canonicalAmount) > 0,
    retry: false,
    staleTime: 10000,
  }));

  // Raw calldata for the risk scorer (S2/S3/S7 read tx.data). Distinct from
  // tokenCalldata above, which is the human-readable DECODE. Native sends have no
  // calldata. Cheap + local; recomputed with the same inputs as the decode.
  const riskCalldata = useMemo(() => {
    if (!isErc20 || !toAddress || !canonicalAmount || parseFloat(canonicalAmount) <= 0) return null;
    try {
      return buildTokenTransfer({ networkKey, symbol: selectedAsset.symbol, to: toAddress, amount: canonicalAmount }).data;
    } catch {
      return null;
    }
  }, [isErc20, selectedAsset, toAddress, canonicalAmount, networkKey]);

  // PRE-SIGN RISK SCORE (src/risk) — the authoritative one-sentence verdict + the
  // RISK gate. Pure + local: maps the SAME local state the existing warnings read
  // into score()'s inputs (no new fetch, no signer/seed). recipientCode (S7) is
  // reused from the simulation's already-fetched eth_getCode (I2).
  // Also ready when simulation is disabled — the score runs without recipientCode
  // (S7 escalates to CAUTION, which now requires confirmation per score.js).
  // H-1 / L-4 — ready when EVERY contributor that applies to THIS send has
  // settled, not when the EVM simulation alone has. The old expression
  // (`DEMO || !!txSim.data || txSim.isError || !simEnabled`) both failed to wait
  // for TIP — letting a send be judged while screening was in flight, which S9
  // scores as OK because it cannot tell "not answered" from "answered, clean" —
  // and, on BTC/SOL where txSim never runs, never became true at all.
  const riskReady = isRiskGateReady({
    demo: demoActive,
    contributors: [
      { applies: txSimApplies, query: txSim },
      { applies: tipScreenApplies, query: tipQuery },
    ],
  });

  // SINGLE source of truth for the verdict: maps the live send state → score().
  // BOTH the displayed banner and the hard pre-sign gate call this, so the
  // verdict the user sees and the verdict the gate enforces can never diverge
  // (a divergence would let the gate block a verdict that was never shown, or
  // vice-versa). recipientCode is the only timing-dependent input — read at call
  // time. In DEMO there is no live RPC, so recipients are treated as EOAs ('0x'):
  // the verdict is a real computation over the entered inputs; only the chain
  // fact behind S7 is demo-seeded.
  const scoreCurrentSend = () => {
    // S7 asks "is the recipient a contract?" — an EVM-only concept fed by
    // eth_getCode. On non-EVM chains (BTC/SOL) there is no such fetch and no
    // contract-vs-EOA distinction, so treat the recipient as an EOA ('0x')
    // rather than letting S7 fail closed with a misleading warning. On EVM,
    // undefined recipientCode still means "sim errored/disabled" -> fail closed.
    const isEvmSend = isEvmFamily(selectedAsset) || isErc20;
    const recipientCode = (demoActive || !isEvmSend) ? '0x' : txSim.data?.recipientCode;
    const { unsignedTx, activeSetLocalState, chainData } = buildRiskInputs({
      to: toAddress,
      amountText: canonicalAmount,
      isErc20,
      calldata: riskCalldata,
      displayedEns: ensResolved?.name ?? null,
      ensResolvedAddress: ensResolved?.address ?? null,
      chainId: activeNetwork?.chainId,
      assetCurrency: selectedWallet?.currency,
      history,
      knownAddresses,
      whitelist,
      recipientCode,
    });
    // S9: inject TIP result into chainData when remote screening is enabled and
    // has returned. tipResult is null when opt-out, deniability, or unconfigured —
    // S9 returns OK in that case and contributes nothing to the composite.
    if (tipQuery.data) chainData.tipResult = tipQuery.data;
    return score(unsignedTx, activeSetLocalState, chainData);
  };

  // Does the risk score apply to this send at all? EVM/ERC-20 always scored
  // (local signals S1–S8). BTC/SOL scored only when TIP remote screening is
  // enabled (S9 is the sole contributor; S1–S8 are EVM-specific and return OK).
  const riskApplicable = !!toAddress && addressFormatValid && (isEvmFamily(selectedAsset) || isErc20 || (remoteScreen && (isBtc || isSolana)));
  // We wait for the simulation to settle (data or error) before judging so S7
  // doesn't flash a transient fail-closed CAUTION while eth_getCode loads.
  const riskVerdict = useMemo(() => {
    if (!riskApplicable || !riskReady) return null;
    return scoreCurrentSend();
    // scoreCurrentSend reads the live send state via closure; deps below mirror
    // every input it touches (canonicalAmount included — native sends carry value,
    // not calldata, so amount must invalidate even when riskCalldata is null).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toAddress, canonicalAmount, addressFormatValid, selectedAsset, isErc20, riskCalldata, ensResolved, activeNetwork, selectedWallet, history, knownAddresses, whitelist, riskReady, txSim.data, tipQuery.data]);


  // RISK acknowledgement ("Sign anyway"). Reset whenever the breach could change —
  // amount, asset, or recipient — so a stale ack never carries into a changed send
  // (same freshness discipline as limitAck above).
  const [riskAck, setRiskAck] = useState(false);
  useEffect(() => { setRiskAck(false); }, [amount, selectedWallet?.currency, toAddress]);

  // B5 — RASP WARN biometric re-confirm. On a WARN-tier native environment (rooted or
  // integrity-unavailable), the user must pass a biometric verify AFTER the checkbox ack
  // before the send button activates. State resets whenever inputs change (same freshness
  // discipline as riskAck) so a cleared bio can't carry into a changed send.
  const [raspWarnBioOk, setRaspWarnBioOk] = useState(false);
  useEffect(() => { setRaspWarnBioOk(false); }, [amount, selectedWallet?.currency, toAddress]);
  // While the score is still computing (simulation in flight) the verdict is
  // unknown — block the verify buttons rather than letting the user proceed into
  // a bare fail-closed error at signing. RISK additionally requires acknowledgement.
  const riskPending = riskApplicable && !riskReady;

  // RASP §7 — pre-sign ENVIRONMENT gate (Phase 3, browser + native OS + attestation).
  //
  // P2-7 (audit 2026-07-15): SendCrypto used to duplicate the OS/attestation
  // probe-sampling effects inline. That duplication has been removed — this
  // component now goes through the shared useRaspArtifact() hook, which owns the
  // G4-A foreground re-probe, G4-B 60 s heartbeat, and the attestation-on-
  // probeKey re-sample (the attestation freshness gap the inline version had).
  //
  // P2-4 (audit 2026-07-15): deferAttestation is bound to the review + confirm
  // steps so the attestation network call (Google Play Integrity / Apple App
  // Attest) does NOT fire on Send-page mount — it fires only once the user has
  // committed sign intent by entering the review step (the wizard's step 2).
  // This matches the documented "attestation only on explicit pre-sign egress"
  // boundary and stays the same under the 3-step wizard split (2026-08-28) —
  // review + confirm together == the old "verify".
  //
  // I3: attestationProbeSource() checks isDeniabilityOrDemoActive() FIRST — no
  // egress under decoy/hidden/demo. I4: a RASP crash fails closed (BLOCK).
  const raspArtifact = useRaspArtifact({ deferAttestation: step !== "review" && step !== "confirm" });
  // I4 FAIL CLOSED (RASP-A2): missing tier → strongest BLOCK, never ALLOW.
  const raspTier = raspArtifact?.tier ?? TIER.BLOCK;

  // The COMPOSITE pre-sign decision (RASP env plane ⊕ tx-risk plane), set-blind by
  // construction (presignGate takes no wallet-set handle). The signer path
  // (mutationFn) re-derives the SAME gate, so UI and enforcement cannot diverge.
  const presign = riskVerdict ? presignGate(raspTier, riskVerdict.level, riskAck) : null;
  const blockedByRisk = riskPending || (presign ? !presign.proceedAllowed : false);

  // #1664 diagnostic (DEV-only, dead-code-eliminated in production builds).
  // Traces the tipQuery lifecycle + riskVerdict outcome around Send Preview so
  // a "silent-CLEAR" regression like the one filed 2026-08-09 can be diagnosed
  // from Xcode/Chrome console without needing Safari Remote Debug attached to
  // the exact moment of Continue-tap. Only logs when tipScreenApplies is true
  // (a call is expected) OR when the state actually changed — avoids spamming
  // the console on every unrelated render.
  const prevDiagRef = useRef({ status: null, verdict: null, level: null });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!tipScreenApplies && !prevDiagRef.current.status) return;
    const status = tipQuery.status;                              // 'idle' | 'pending' | 'success' | 'error'
    const verdict = tipQuery.data?.verdict ?? null;              // 'allow' | 'warn' | 'block' | 'unknown' | 'error' | null (suppressed)
    const level = riskVerdict?.level ?? null;
    const prev = prevDiagRef.current;
    if (prev.status === status && prev.verdict === verdict && prev.level === level) return;
    prevDiagRef.current = { status, verdict, level };
    // eslint-disable-next-line no-console
    console.error('[TIP-DEBUG]', JSON.stringify({
      tipScreenApplies,
      tipQuery: { status, verdict, sanctions_hit: tipQuery.data?.sanctions ?? null },
      riskReady,
      riskVerdict: { level, sentence: riskVerdict?.sentence ?? null },
      presign_owner: presign?.owner ?? null,
    }));
  }, [tipScreenApplies, tipQuery.status, tipQuery.data, riskReady, riskVerdict, presign]);

  // B5 — biometric gate for WARN environments. `requiresBiometric` is set by degrade()
  // for ROOTED and INTEGRITY_UNAVAILABLE. Only enforced on native: verifyBiometric2fa()
  // throws immediately on web (no native platform), and ROOTED is only reachable via the
  // native OS probe. BLOCK overrides bio (the signer is already unreachable).
  const raspNeedsBio = raspArtifact?.requiresBiometric === true
    && Capacitor.isNativePlatform()
    && presign?.decision !== 'block';
  const blockedByRaspBio = raspNeedsBio && !raspWarnBioOk;

  const txIntelVerdict = useMemo(() => composeTransactionVerdict({
    localVerdict: riskVerdict,
    localApplicable: riskApplicable,
    localSettled: riskApplicable ? riskReady : false,
    tipResult: tipQuery.data ?? null,
    tipApplicable: tipScreenApplies,
    tipSettled: !tipScreenApplies || tipQuery.isSuccess || tipQuery.isError,
    review: reviewContributor,
    raspTier,
    raspArtifact,
    presign,
  }), [riskVerdict, riskApplicable, riskReady, tipQuery.data, tipQuery.isSuccess, tipQuery.isError, tipScreenApplies, reviewContributor, raspTier, raspArtifact, presign]);

  const txIntelPolicy = useMemo(() => deriveSigningPolicy({
    verdict: txIntelVerdict,
    presign,
    acknowledged: riskAck,
    raspNeedsBio,
    biometricCleared: raspWarnBioOk,
  }), [txIntelVerdict, presign, riskAck, raspNeedsBio, raspWarnBioOk]);

  const advisorTxContext = useMemo(() => {
    if ((step !== "review" && step !== "confirm") || !selectedWallet?.currency) return null;
    // Self-send detection: recipient == the sending wallet's own address.
    // EVM addresses are checksummed so compare case-insensitively; BTC/SOL
    // are case-sensitive and canonical, so lower() is a no-op for the match.
    const ownAddr = selectedWallet?.address || null;
    const isSelfSend = !!(ownAddr && toAddress && ownAddr.toLowerCase() === toAddress.toLowerCase());
    // whitelist/addressBook queries are already disabled in decoy/hidden
    // sessions (empty arrays), so these lookups fail closed on their own
    // without a second guard here.
    const addressBookHit = !!(toAddress && addressBook.some(
      (c) => c?.address && String(c.address).toLowerCase() === String(toAddress).toLowerCase()
    ));
    const isBtcAsset = selectedAsset?.family === "btc";
    const btcHigh = isBtcAsset && (btcSim?.data?.risks || []).some((r) => r.level === "high");
    return {
      transaction_intelligence: {
        asset: selectedWallet.currency,
        amount: amount || null,
        recipient: toAddress || null,
        sender_address: ownAddr,
        self_send: isSelfSend,
        level: txIntelVerdict?.level ?? null,
        owner: txIntelVerdict?.owner ?? null,
        primary_reason: txIntelVerdict?.primaryReason ?? null,
        policy_decision: txIntelPolicy?.decision ?? null,
        policy_action: txIntelPolicy?.actionLabel ?? null,
        recommend_hardware_signer: txIntelPolicy?.recommendHardwareSigner === true,
        contributors: Array.isArray(txIntelVerdict?.contributors)
          ? txIntelVerdict.contributors.map((c) => ({
              id: c.id,
              label: c.label,
              applicable: c.applicable,
              settled: c.settled,
              level: c.level ?? null,
              summary: c.summary ?? null,
            }))
          : [],
        local_signals: Array.isArray(txIntelVerdict?.localSignals)
          ? txIntelVerdict.localSignals.map((s) => ({
              id: s.id,
              level: s.level,
              summary: s.summary ?? null,
            }))
          : [],
        network: networkKey || null,
        is_testnet: activeNetwork ? activeNetwork.isTestnet === true : null,
        fee_tier: selectedFee?.tier ?? selectedFee?.label ?? null,
        whitelist_hit: currencyWhitelist.length > 0 && isAddressWhitelisted === true,
        address_book_hit: addressBookHit,
        digital_shield: {
          enabled: useDigitalShieldMode === true,
          connected: useDigitalShieldMode ? digitalShieldConnected === true : false,
        },
        rasp: {
          tier: raspTier ?? null,
          requires_biometric: raspArtifact?.requiresBiometric === true,
        },
        btc_risk_high: btcHigh,
      },
    };
  }, [step, selectedWallet, amount, toAddress, txIntelVerdict, txIntelPolicy,
      networkKey, activeNetwork, selectedFee, currencyWhitelist, isAddressWhitelisted,
      addressBook, useDigitalShieldMode, digitalShieldConnected, raspTier, raspArtifact,
      selectedAsset, btcSim?.data]);

  useEffect(() => {
    publishAdvisorContext(advisorTxContext);
    return () => publishAdvisorContext(null);
  }, [advisorTxContext]);

  const handleAskAdvisorAboutTx = () => {
    openAdvisor({
      question: "Explain this transaction risk and tell me what I should verify before signing.",
      autoSend: true,
      context: advisorTxContext,
    });
  };

  // BTC pre-sign risk gate (internal audit M-2). BTC isn't EVM-shaped, so it has no
  // `presign` verdict — instead its honest decode (btcSim → describeBtcPlan) raises
  // high-severity flags (e.g. entire_balance). A high flag requires the same explicit
  // acknowledgement as an EVM RISK verdict before signing; we also block while the BTC
  // preview is still loading so a send can never be confirmed before the user has seen
  // the fee/plan. Ack resets on any change to the breach inputs (same discipline as riskAck).
  const [btcRiskAck, setBtcRiskAck] = useState(false);
  useEffect(() => { setBtcRiskAck(false); }, [amount, selectedWallet?.currency, toAddress]);
  const btcRiskHigh = isBtc && (btcSim.data?.risks || []).some((r) => r.level === "high");
  const btcRiskPending = isBtc && btcSim.isFetching && !btcSim.data;
  const blockedByBtcRisk = btcRiskPending || (btcRiskHigh && !btcRiskAck);

  // One-shot 2FA token (audit H1): TwoFactorGate.onSuccess sets this true; the signer
  // (mutationFn) consumes it per attempt and passes it to evaluateSendGate, so the
  // second factor is enforced at the chokepoint — not only by which JSX branch renders.
  const twoFactorVerifiedRef = useRef(false);

  const evaluateCurrentSendGate = async ({ twoFactorVerified = twoFactorVerifiedRef.current } = {}) => {
    // The Send gate must stay a SINGLE chokepoint even when the UX forks into a
    // Digital Shield prepare/finalize flow. Recompute the same live inputs here
    // instead of mirroring a subset of them in UI state.

    const trimmedTo = String(toAddress || '').trim();
    const chainKey = selectedWallet?.currency;
    const networkName = activeNetwork?.name || '';
    if (!trimmedTo || !isValidAddressForCurrency(trimmedTo, chainKey, networkName)) {
      throw Object.assign(new Error('RECIPIENT_INVALID_AT_SIGN'), { code: 'RECIPIENT_INVALID_AT_SIGN' });
    }
    if (!isFormAmountWellFormed(canonicalAmount) || Number(canonicalAmount) <= 0) {
      throw Object.assign(new Error('AMOUNT_INVALID_AT_SIGN'), { code: 'AMOUNT_INVALID_AT_SIGN' });
    }

    if (requiresVerification(activeWalletId, amountUsd)) {
      throw Object.assign(new Error('VERIFY_REQUIRED'), { code: 'VERIFY_REQUIRED' });
    }

    const limitGate = evaluateSendAgainstLimits({
      amount: canonicalAmount,
      currency: selectedWallet.currency,
      usdRates: USD_RATES,
      history: /** @type {any} */ (history),
      limits: /** @type {any} */ (txLimits),
      now: new Date(),
    });

    const freshArtifact = await getFreshRaspArtifact();
    const freshRaspTier = freshArtifact?.tier ?? TIER.BLOCK;
    if (freshRaspTier !== 'allow') {
      notifyRaspAlert({ tier: freshRaspTier, sentence: freshArtifact?.sentence ?? null, ts: Date.now() });
    }

    if (tipScreenApplies && !(tipQuery.isSuccess || tipQuery.isError)) {
      throw Object.assign(
        new Error('Threat screening has not finished for this transaction yet.'),
        { code: 'TIP_SCREEN_PENDING' }
      );
    }

    let riskScoreFailed = false;
    let presignAtSign = /** @type {any} */ (null);
    let txPolicyAtSign = /** @type {any} */ (null);
    try {
      const freshScore = scoreCurrentSend();
      presignAtSign = presignGate(freshRaspTier, freshScore.level, riskAck);
      const txVerdictAtSign = composeTransactionVerdict({
        localVerdict: freshScore,
        localApplicable: riskApplicable,
        localSettled: riskApplicable ? riskReady : false,
        tipResult: tipQuery.data ?? null,
        tipApplicable: tipScreenApplies,
        tipSettled: !tipScreenApplies || tipQuery.isSuccess || tipQuery.isError,
        review: reviewContributor,
        raspTier: freshRaspTier,
        raspArtifact: freshArtifact,
        presign: presignAtSign,
      });
      txPolicyAtSign = deriveSigningPolicy({
        verdict: txVerdictAtSign,
        presign: presignAtSign,
        acknowledged: riskAck,
        raspNeedsBio: freshArtifact?.requiresBiometric === true
          && Capacitor.isNativePlatform()
          && presignAtSign?.decision !== 'block',
        biometricCleared: raspWarnBioOk,
      });
      notifyTxRiskAlert({ level: freshScore.level, sentence: freshScore.sentence, signalId: freshScore.signalId, ts: Date.now() });
    } catch {
      riskScoreFailed = true;
    }

    const raspNeedsBioAtSign = freshArtifact?.requiresBiometric === true
      && Capacitor.isNativePlatform()
      && presignAtSign?.decision !== 'block';
    if (raspNeedsBioAtSign && !raspWarnBioOk) {
      throw Object.assign(
        new Error('Biometric confirmation required before signing on a modified device.'),
        { code: 'RASP_BIO_REQUIRED' }
      );
    }

    const gate = /** @type {any} */ (evaluateSendGate({
      canSend: canSend(selectedAsset),
      devUngated,
      currency: selectedWallet?.currency,
      isUnlocked,
      demo: demoActive,
      reauthRequired: demoActive ? false : isSendReauthRequired(),
      twoFactorRequired: send2faMethod !== SEND_2FA.NONE,
      twoFactorVerified,
      limit: limitGate,
      limitAck,
      riskScoreFailed,
      txPolicy: txPolicyAtSign,
      presign: presignAtSign,
      btcRiskBlocked: isBtc && (btcSim.data?.risks || []).some((r) => r.level === "high") && !btcRiskAck,
      blockedByApproval,
    }));
    if (!gate.allowed) {
      throw Object.assign(new Error(gate.message), { code: gate.code });
    }

    if (!canSend(selectedAsset)) {
      throw new Error(
        `[Security] Send blocked: ${selectedAsset.symbol} status is "${selectedAsset.status}". ` +
        `Only verified LIVE assets may send. This is a code-level safety assertion.`
      );
    }

    return { freshArtifact, presignAtSign, txPolicyAtSign };
  };

  // Codex P2 2026-08-15: imperative in-flight latch. The three call sites of
  // sendTx.mutate() (:1510 plain confirm, :2264 2FA success, :2314 direct)
  // relied on `disabled={sendTx.isPending}` after a re-render, so a rapid
  // double-tap could enqueue TWO concurrent broadcasts before isPending
  // flipped — including self-sends. This ref flips synchronously inside
  // mutationFn's first line and clears on settle, so a second entry throws
  // an immediate reject rather than proceeding to sign/broadcast.
  const broadcastInFlightRef = useRef(false);

  const sendTx = useMutation({
    mutationFn: async () => {
      // Codex P2 2026-08-15: imperative in-flight latch. First line of the
      // mutation body flips synchronously, so a concurrent second
      // sendTx.mutate() reaches this branch and rejects before touching
      // gates / RPCs / signer. Cleared in onSettled below.
      if (broadcastInFlightRef.current) {
        throw Object.assign(new Error('BROADCAST_IN_FLIGHT'), { code: 'BROADCAST_IN_FLIGHT' });
      }
      broadcastInFlightRef.current = true;

      // One-shot: consume the 2FA token for THIS software-key attempt before the
      // shared gate evaluation, preserving the existing retry semantics.
      const twoFactorVerified = twoFactorVerifiedRef.current;
      twoFactorVerifiedRef.current = false;
      await evaluateCurrentSendGate({ twoFactorVerified });

      // NOTE: the HD-account lookup that main did here is intentionally NOT hoisted —
      // it is EVM-only (matches selectedWallet.address against an EVM account) and now
      // lives inside the EVM branch of the family dispatch below. Hoisting it would
      // throw "not in the unlocked HD set" for BTC/SOL, whose address is not an EVM
      // account.

      // Sign LOCALLY and broadcast. The signing key is transient and never
      // persisted. Branch on the asset family — each has its own derivation/
      // signing stack and send function; the human-entered `amount` is converted
      // to that chain's integer base unit (sats / lamports / wei) for signing.
      let raw;
      if (isBtc) {
        // BTC (BIP-84 P2WPKH). Auto fee-rate this slice (no fee UI). BTC -> sats.
        raw = await withBtcPrivateKey(({ privateKey, publicKey, address }) =>
          signAndBroadcastBtc({
            networkKey,
            privateKey,
            publicKey,
            fromAddress: address,
            toAddress,
            amountSats: toBaseUnits(canonicalAmount, 8),
          })
        );
      } else if (isSolana) {
        // SOL (ed25519). Base fee only this slice (no priority UI). SOL -> lamports.
        raw = await withSolPrivateKey(({ privateKey, address }) =>
          signAndBroadcastSol({
            networkKey,
            privateKey,
            fromAddress: address,
            toAddress,
            amountLamports: toBaseUnits(canonicalAmount, 9),
          })
        );
      } else {
        // EVM native + ERC-20. Map the wallet to its HD derivation index
        // (public address match). The user-selected EIP-1559 fee flows
        // straight into the signing call; null falls back to ethers'
        // auto-fill (never blocks send).
        const acct = accounts.find(a => a.address.toLowerCase() === selectedWallet.address.toLowerCase());
        if (!acct) throw new Error("Selected wallet is not in the unlocked HD set");
        const fee = selectedFee?.fee || undefined;
        raw = await withPrivateKey(acct.index, (privateKey) =>
          isErc20
            ? sendToken({ networkKey, privateKey, symbol: selectedAsset.symbol, to: toAddress, amount: canonicalAmount, fee })
            : signAndBroadcast({ networkKey, privateKey, to: toAddress, amountEth: canonicalAmount, fee })
        );
      }

      // Normalize each family's distinct result shape to one record shape.
      const { hash, explorerUrl } = normalizeSendResult(family, raw);

      // Record the REAL chain hash/signature as 'pending'. Do NOT write balances —
      // the chain is the source of truth and is read live elsewhere.
      // Codex P2 2026-08-15: DO NOT persist `note` plaintext into the local
      // Transaction store. The Base44 store lands in shared IndexedDB and is
      // readable across sessions / captured in device backups, so a memo
      // like "rent" or "bribe" written by the user becomes an avoidable
      // local forensic leak. Store a boolean tell for UX ("this send had a
      // note attached, ask the user in a follow-up") instead of the string.
      // The chain-side memo is unaffected — those live in the tx call data,
      // never in this table. If encrypted-memo persistence is added later,
      // wrap it under the vault DEK; do NOT reintroduce plaintext here.
      await base44.entities.Transaction.create({
        wallet_id: walletId,
        type: "send",
        amount: parseFloat(canonicalAmount),
        currency: selectedWallet.currency,
        to_address: toAddress,
        from_address: selectedWallet.address,
        status: "pending",
        tx_hash: hash,            // REAL chain txid / signature
        explorer_url: explorerUrl,
        has_note: !!(note && String(note).trim()),
      });

      // Refresh views. Only the EVM result exposes raw.wait(1) for a 1-conf receipt;
      // BTC is broadcast and SOL confirms internally, so for those we just invalidate
      // the transaction list (status stays 'pending'). The send-confirmed notify
      // (brief PR-2 §3) rides the EVM 1-conf receipt — it is fire-and-forget and
      // swallows any throw (I4). BTC/SOL have no confirmation callback here, so they
      // do NOT emit a (false) "confirmed" notification.
      if (typeof raw.wait === "function") {
        raw.wait(1).then(() => {
          queryClient.invalidateQueries({ queryKey: ["evm-balance", networkKey, selectedWallet.address] });
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          notifySendConfirmed({ amount: `${amount} ${selectedWallet.currency}`, to: toAddress, ts: Date.now() });
        }).catch(() => {
          // The 1-conf receipt failed (RPC error/timeout, or the tx was dropped/
          // replaced). The tx row stays 'pending' (honest); surface it so the user
          // checks the explorer rather than assuming it confirmed. Fire-and-forget
          // (I4) — a notification failure must never unwind the send path.
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          toast(tw("send.toasts.unconfirmed"));
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        // BTC/SOL: no 1-conf callback, so notify immediately on broadcast (fire-and-forget, I4).
        notifySendConfirmed({ amount: `${amount} ${selectedWallet.currency}`, to: toAddress, ts: Date.now() });
      }

      return { hash, explorerUrl };
    },
    onSuccess: (result) => {
      broadcastInFlightRef.current = false; // Codex P2 2026-08-15 latch release
      queryClient.invalidateQueries({ queryKey: ["evm-balance", networkKey, selectedWallet?.address] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setTxResult(result);
      setStep("done");
      successHaptic();
      recordAudit("send_completed"); // opt-in audit log; no-op unless enabled + primary session
      void trackEvent(EVENT.SEND_COMPLETED, { currency: selectedWallet?.currency }).catch(() => {});
      markFirstSend();
    },
    onError: (err) => {
      // Codex P2 2026-08-15 latch release. Do NOT release for the guard's own
      // reject path (BROADCAST_IN_FLIGHT) — that means a concurrent broadcast
      // is still in flight; releasing here would unlatch it and allow the
      // real double-broadcast the guard blocks.
      if (/** @type {Error & {code?: string}} */ (err)?.code !== 'BROADCAST_IN_FLIGHT') {
        broadcastInFlightRef.current = false;
      }
      // Seed-verification gate (Task 9): redirect to /verify rather than showing
      // an error toast — this isn't a failure, it's a required detour. Fires
      // before the haptic buzz used for real send failures below.
      if (/** @type {Error & {code?: string}} */ (err)?.code === 'VERIFY_REQUIRED') {
        // Say why, like the TWO_FACTOR branch below does. Navigating with no
        // message reads as the send silently vanishing.
        toast.info(tw("send.toasts.verify_required"));
        navigate('/verify', { state: { returnTo: '/send' } });
        return;
      }
      // Codex P2 2026-08-15: sign-time revalidation refusals surface as
      // corrective toasts, not the generic "send failed" — the user needs to
      // know WHY the confirm didn't broadcast (the form is fine to their eye).
      const _c = /** @type {Error & {code?: string}} */ (err)?.code;
      if (_c === 'BROADCAST_IN_FLIGHT') {
        // Silent — the concurrent broadcast is either about to succeed or
        // will surface its own error; a second toast would confuse the user.
        return;
      }
      if (_c === 'RECIPIENT_INVALID_AT_SIGN') {
        toast.error(tw("send.toasts.recipient_invalid") || 'Recipient address is not valid for this asset. Please re-enter.');
        setStep("form");
        return;
      }
      if (_c === 'AMOUNT_INVALID_AT_SIGN') {
        toast.error(tw("send.toasts.amount_invalid") || 'Amount is not valid. Please re-enter.');
        setStep("form");
        return;
      }
      errorHaptic();
      // When the network send fails AFTER 2FA was consumed, the gate throws
      // TWO_FACTOR (twoFactorVerifiedRef was already cleared — one-shot, secure).
      // Instead of a dead-end toast, re-show the TwoFactorGate so the user can
      // re-authorise without having to tap Back → Continue manually.
      // Security: twoFactorVerifiedRef.current is already false at this point
      // (cleared at line 724 before the gate ran); we are only changing which
      // UI step is rendered, not relaxing any security check.
      if (/** @type {Error & {code?: string}} */ (err)?.code === SEND_GATE.TWO_FACTOR) {
        toast.info(tw("send.toasts.two_factor_retry"));
        setStep("confirm");
        return;
      }
      toast.error(err?.message || tw("send.toasts.send_failed_fallback"));
    },
  });

  // STEP-UP: verify the re-entered credential, then send. 5 wrong → lock() (fail closed,
  // identical in real and decoy sessions — no lockout tell).
  const submitReauth = async (entered) => {
    if (reauthPending || sendTx.isPending) return;
    setReauthPending(true);
    setReauthError("");
    try {
      const result = await verifyActiveCredentialDetailed(entered);
      if (result.bricked) {
        setReauthError(tw("send.reauth.errors.unavailable"));
        return;
      }
      if (result.ok) {
        setReauthValue("");
        void startSendAttempt();
        return;
      }
      const n = reauthAttempts + 1;
      setReauthAttempts(n);
      setReauthValue("");
      if (n >= REAUTH_CAP) {
        lock();
        return;
      }
      setReauthError(tw("send.reauth.errors.incorrect", { remaining: REAUTH_CAP - n }));
    } catch {
      // Gap-5 (I4 fail closed + fail honest). This block had a `finally` but no
      // `catch`: a rejection from the verifier escaped as an unhandled rejection,
      // the spinner cleared, and the user was left staring at an unchanged screen
      // with no message and no send — a silent dead-end (same class as the 07-27
      // "Send amount dead-ended silently" finding). Surface it instead.
      //
      // Deliberately does NOT burn a step-up attempt: a thrown verifier is an infra
      // failure, not a wrong credential — an unverified step-up must never
      // authorise a broadcast; the send mutation is intentionally unreachable here.
      setReauthError(tw("send.reauth.errors.unavailable"));
    } finally {
      setReauthPending(false);
    }
  };

  const resetDigitalShieldFlow = () => {
    setDigitalShieldDialogOpen(false);
    setDigitalShieldScannerOpen(false);
    setDigitalShieldResponseDraft("");
    setDigitalShieldResponseParts([]);
    setDigitalShieldFlow(null);
    setDigitalShieldError("");
    setDigitalShieldBusy(false);
  };

  const startSendAttempt = async () => {
    if (!useDigitalShieldMode) {
      sendTx.mutate();
      return;
    }
    if (!digitalShieldConnected || !digitalShieldAccount) {
      toast.error('Import Digital Shield on the Hardware Wallet page first.');
      return;
    }
    if (digitalShieldBtcUnsupported) {
      toast.error('Digital Shield BTC signing is currently supported on Bitcoin mainnet only.');
      return;
    }
    if (isDeniabilityOrDemoActive() || DEMO) {
      toast.error('Digital Shield signing is disabled in demo and deniability sessions.');
      return;
    }
    setDigitalShieldBusy(true);
    setDigitalShieldError("");
    try {
      await evaluateCurrentSendGate();
      if (family === 'btc') {
        const amountSats = toBaseUnits(canonicalAmount, 8);
        const { plan } = await estimateBtcSend({
          networkKey,
          fromAddress: selectedWallet.address,
          toAddress,
          amountSats,
          changeAddress: selectedWallet.address,
        });
        const request = buildDigitalShieldBtcPsbt({
          account: digitalShieldAccount,
          plan,
          networkKey,
        });
        setDigitalShieldFlow({ kind: 'btc', networkKey, plan, ...request });
      } else if (family === 'solana') {
        const unsigned = await buildUnsignedSolTx({
          fromAddress: selectedWallet.address,
          toAddress,
          lamports: toBaseUnits(canonicalAmount, 9),
          networkKey,
        });
        const signDataHex = Buffer.from(unsigned.unsignedTxBase64, 'base64').toString('hex');
        const request = buildDigitalShieldSolRequest({
          account: digitalShieldAccount,
          signDataHex,
        });
        setDigitalShieldFlow({ kind: 'solana', networkKey, unsigned, ...request });
      } else {
        const provider = getProvider(networkKey);
        const feeData = await provider.getFeeData();
        const fee = selectedFee?.fee || undefined;
        const rawMaxFeePerGas = fee?.maxFeePerGas ?? feeData.maxFeePerGas ?? feeData.gasPrice;
        const feeCapGwei = MAX_BASE_FEE_GWEI[networkKey] ?? 5_000n;
        const maxFeePerGasCap = feeCapGwei * 1_000_000_000n;
        const cappedMaxFeePerGas = rawMaxFeePerGas != null && rawMaxFeePerGas > maxFeePerGasCap
          ? maxFeePerGasCap
          : rawMaxFeePerGas;
        const clampedPriorityFee = resolveMaxPriorityFeePerGas(
          fee?.maxPriorityFeePerGas ?? feeData.maxPriorityFeePerGas ?? 0n,
          cappedMaxFeePerGas,
        );
        const overrides = evmFeeOverrides((cappedMaxFeePerGas != null)
          ? {
              maxFeePerGasWei: cappedMaxFeePerGas.toString(),
              maxPriorityFeePerGasWei: clampedPriorityFee.toString(),
            }
          : undefined);
        const net = getNetworkInfo(networkKey);
        await verifyLiveChainId(provider, net.chainId);
        const pendingNonce = await provider.getTransactionCount(selectedWallet.address, 'pending');
        let tx;
        if (isErc20) {
          const built = buildTokenTransfer({ networkKey, symbol: selectedAsset.symbol, to: toAddress, amount: canonicalAmount });
          tx = {
            to: built.to,
            value: 0n,
            data: built.data,
            chainId: net.chainId,
            nonce: pendingNonce,
            type: 2,
          };
        } else {
          tx = {
            to: toAddress,
            value: parseEther(String(canonicalAmount)),
            data: '0x',
            chainId: net.chainId,
            nonce: pendingNonce,
            type: 2,
          };
        }
        await applyEstimatedGasLimit(provider, { from: selectedWallet.address, to: tx.to, value: tx.value, data: tx.data }, overrides);
        const request = buildDigitalShieldEvmRequest({
          account: digitalShieldAccount,
          tx: { ...tx, ...overrides },
        });
        setDigitalShieldFlow({ kind: isErc20 ? 'erc20' : 'evm', networkKey, ...request });
      }
      setDigitalShieldDialogOpen(true);
    } catch (err) {
      toast.error(err?.message || 'Could not prepare the Digital Shield request.');
    } finally {
      setDigitalShieldBusy(false);
    }
  };

  const finalizeDigitalShieldSend = async (input) => {
    if (!digitalShieldFlow) return;
    setDigitalShieldBusy(true);
    setDigitalShieldError("");
    try {
      const twoFactorVerified = twoFactorVerifiedRef.current;
      await evaluateCurrentSendGate({ twoFactorVerified });
      twoFactorVerifiedRef.current = false;
      let raw;
      let result;
      if (digitalShieldFlow.kind === 'btc') {
        result = finalizeDigitalShieldBtcResponse({
          session: digitalShieldFlow.session,
          unsignedPsbtHex: digitalShieldFlow.psbtHex,
          input,
        });
        raw = await broadcastBtcTx(networkKey, result.finalizedTxHex);
      } else if (digitalShieldFlow.kind === 'solana') {
        result = finalizeDigitalShieldSolResponse({
          session: digitalShieldFlow.session,
          signDataHex: digitalShieldFlow.signDataHex,
          input,
        });
        const { Transaction, PublicKey } = await import('@solana/web3.js');
        const tx = Transaction.from(Buffer.from(digitalShieldFlow.unsigned.unsignedTxBase64, 'base64'));
        tx.addSignature(new PublicKey(selectedWallet.address), Buffer.from(result.signatureHex.slice(2), 'hex'));
        const rawTx = tx.serialize();
        const sig = await broadcastRawTx(networkKey, rawTx);
        await confirmTx(
          networkKey,
          sig,
          digitalShieldFlow.unsigned.blockhash,
          digitalShieldFlow.unsigned.lastValidBlockHeight,
        );
        raw = { signature: sig, explorerUrl: `${getSolNetwork(networkKey).explorer}/tx/${sig}` };
      } else {
        result = finalizeDigitalShieldEvmResponse({
          session: digitalShieldFlow.session,
          unsignedHex: digitalShieldFlow.unsignedHex,
          input,
        });
        const txResponse = await getProvider(networkKey).broadcastTransaction(result.signedHex);
        raw = {
          hash: txResponse.hash,
          explorerUrl: `${getNetworkInfo(networkKey).explorer}/tx/${txResponse.hash}`,
          wait: (confirmations = 1) => txResponse.wait(confirmations),
        };
      }
      const normalized = normalizeSendResult(digitalShieldFlow.kind, raw);
      await base44.entities.Transaction.create({
        wallet_id: walletId,
        type: "send",
        amount: parseFloat(canonicalAmount),
        currency: selectedWallet.currency,
        to_address: toAddress,
        from_address: selectedWallet.address,
        status: "pending",
        tx_hash: normalized.hash,
        explorer_url: normalized.explorerUrl,
        has_note: !!(note && String(note).trim()),
      });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["evm-balance", networkKey, selectedWallet?.address] });
      setTxResult(normalized);
      setStep("done");
      resetDigitalShieldFlow();
      successHaptic();
      notifySendConfirmed({ amount: `${amount} ${selectedWallet.currency}`, to: toAddress, ts: Date.now() });
      recordAudit("send_completed");
      void trackEvent(EVENT.SEND_COMPLETED, { currency: selectedWallet?.currency }).catch(() => {});
      markFirstSend();
    } catch (err) {
      setDigitalShieldError(err?.message || 'Could not verify the Digital Shield response.');
      errorHaptic();
    } finally {
      setDigitalShieldBusy(false);
    }
  };

  const resetVerify = () => {
    // Intentionally does NOT reset reauthAttempts — going Back to edit must not reset the
    // wrong-attempt cap within an unlocked session. Attempts reset on a new send (Send
    // Another) or on lock/unmount. (The 64 MiB Argon2id per attempt is the real rate
    // limiter; the 5-cap → lock is the UX backstop on top of it.)
    setReauthValue(""); setReauthError(""); setApprovalAck(false);
  };

  if (step === "done") {
    return <SendDoneView
      amount={amount}
      currency={selectedWallet?.currency}
      txResult={txResult}
      // "Send another" hands back a genuinely pristine form. The touched/submitted
      // flags MUST reset with the values: left set, the second send starts already
      // "touched", so typing "0" as the first character of "0.5" fires the error on
      // keystroke one — exactly the mid-entry interruption the blur-gating removes for
      // the first send.
      onSendAnother={() => {
        setStep("form"); setAmount(""); setToAddress(""); setNote("");
        setTxResult(null); setReauthAttempts(0);
        setAmountTouched(false); setAddressTouched(false); setShowErrors(false);
      }}
    />;
  }

  return (
    <>
    <div className="max-w-md mx-auto space-y-6">
      {fromDetail && <BackButton />}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tw("send.heading")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{tw("send.subheading")}</p>
      </div>

      {/* Wizard progress indicator — three dots + step label. Signals where
          the user is without adding an extra header row. Hidden on the done
          screen (that view is its own composition). */}
      {step !== "done" && (() => {
        const stepIndex = step === "form" ? 0 : step === "review" ? 1 : 2;
        const stepLabels = [
          tw("send.wizard.step_recipient"),
          tw("send.wizard.step_review"),
          tw("send.wizard.step_confirm"),
        ];
        return (
          <div className="flex items-center justify-center gap-2" aria-label={`Step ${stepIndex + 1} of 3: ${stepLabels[stepIndex]}`}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    i === stepIndex
                      ? "w-8 bg-primary"
                      : i < stepIndex
                        ? "w-4 bg-primary/60"
                        : "w-4 bg-border"
                  }`}
                  aria-hidden="true"
                />
              </div>
            ))}
            <span className="ms-2 text-[11px] text-muted-foreground font-medium uppercase tracking-widest">
              {stepLabels[stepIndex]}
            </span>
          </div>
        );
      })()}

      <div className="space-y-4 p-5 rounded-xl border border-border bg-card">
        {fromDetail ? (
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <CoinLogo symbol={assetSymbol} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{assetDisplayLabel(assetSymbol)}</p>
              <p className="text-xs text-muted-foreground">{selectedWalletName || tw("send.wallet_fallback")}</p>
            </div>
            <div className="text-end shrink-0">
              {demoActive ? (
                <>
                  <p className="text-sm font-semibold mono-value">{demoBalance ?? "—"} {assetDisplaySymbol(assetSymbol)}</p>
                  {sendUsdRate && demoBalance != null && (
                    <p className="text-xs text-muted-foreground">${(demoBalance * sendUsdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  )}
                </>
              ) : liveBalance != null ? (
                <>
                  <p className="text-sm font-semibold mono-value">{liveBalance} {assetDisplaySymbol(assetSymbol)}</p>
                  {sendUsdRate && (
                    <p className="text-xs text-muted-foreground">${(parseFloat(liveBalance) * sendUsdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{tw("send.amount.reading_from_network")}</p>
              )}
            </div>
          </div>
        ) : (
          // Wizard step-1 header chip (2026-08-28). Replaces the two stacked
          // Select dropdowns with one tap-target that opens WalletAssetPickerSheet.
          // Same underlying state (walletId + assetSymbol) — pure UI collapse.
          <button
            type="button"
            data-testid="wallet-asset-chip"
            onClick={() => setWalletAssetSheetOpen(true)}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-secondary/40 text-start"
            aria-label="Change wallet or asset"
          >
            {assetSymbol ? <CoinLogo symbol={assetSymbol} size={32} /> : (
              <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary/20 border border-primary/40">
                <Wallet className="h-4 w-4 text-primary" />
              </span>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {assetSymbol ? assetDisplayLabel(assetSymbol) : tw("send.asset_picker.placeholder")}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {selectedWalletName || tw("send.wallet_picker.placeholder")}
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Change</span>
          </button>
        )}
        <div>
          <Label htmlFor="send-recipient">{tw("send.recipient.label")}</Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              id="send-recipient"
              value={ensName || toAddress}
              onChange={e => { const v = e.target.value; if (v.endsWith(".eth") || v.endsWith(".sol")) { setEnsName(v); setToAddress(""); setEnsResolved(null); } else { setEnsName(""); setToAddress(v); setEnsResolved(null); } }}
              onBlur={e => { setAddressTouched(true); resolveENS(e.target.value); }}
              placeholder={tw("send.recipient.placeholder")}
              // Malformed shows the red border LIVE as you type (deliberately not
              // gated on blur — visual feedback is not disruptive the way an
              // assertive announcement is); missing only after a submit attempt.
              className={`mono-value text-sm ${!addressFormatValid || addressErrorKind === 'missing' ? 'border-destructive' : ''}`}
              aria-invalid={addressInvalid || undefined}
              aria-describedby={addressInvalid ? "send-address-error" : undefined}
            />
            {ensResolving && <Loader2 className="h-4 w-4 motion-safe:animate-spin self-center shrink-0 text-muted-foreground" />}
            <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label={tw("send.recipient.scan_qr")} title={tw("send.recipient.scan_qr")} onClick={() => setShowScanner(true)}>
              <ScanLine className="h-4 w-4" />
            </Button>
          </div>
          {ensResolving && (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 motion-safe:animate-spin shrink-0" /> {tw("send.recipient.resolving")}
            </p>
          )}
          {!ensResolving && ensName && !ensResolved && !toAddress && (
            <p className="text-xs text-destructive mt-1.5 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" /> {tw("send.recipient.name_not_found")}
            </p>
          )}
          {ensResolved && (
            toAddress === ensResolved.address ? (
              // Confirmed: the user accepted the resolved address as the recipient.
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-success">
                <CheckCircle2 className="h-3 w-3 shrink-0" /> {tw("send.recipient.ens_using_prefix", { name: ensResolved.name })} <span className="mono-value break-all">{ensResolved.address}</span>
              </div>
            ) : (
              // M-3: resolved via an untrusted third-party service — require an
              // explicit confirmation before it becomes the signing target.
              <div className="mt-1.5 p-2.5 rounded-lg bg-caution/10 border border-caution/20 text-[11px] text-caution space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    <b>{ensResolved.name}</b> {tw("send.recipient.ens_confirm_intro")}
                    <br /><span className="mono-value break-all text-foreground">{ensResolved.address}</span>
                    <br />{tw("send.recipient.ens_confirm_hint")}
                  </span>
                </div>
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setToAddress(ensResolved.address)}>
                  {tw("send.recipient.use_this_address")}
                </Button>
              </div>
            )
          )}
        </div>

        {/* Mirrors the amount field's error pattern below in full: id + role="alert"
            on the message, and #send-recipient pointing at it via aria-invalid +
            aria-describedby. Before this the message rendered but was never
            ANNOUNCED — a plain <p> is still reachable in browse mode, so it was not
            invisible; what was missing is that nothing told a screen reader the
            field had gone invalid, and no role-based query could find it. This is
            the validation error a user is most likely to hit. */}
        {addressInvalid && (
          <p id="send-address-error" role="alert" className="text-xs text-destructive flex items-center gap-1.5 -mt-2">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {addressErrorKind === 'missing'
              ? t("send_gates.address_format.required")
              : t("send_gates.address_format.invalid_format", { currency: selectedWallet?.currency })}
          </p>
        )}
        {toAddress && addressFormatValid && !isAddressWhitelisted && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-caution/10 border border-caution/30 -mt-2">
            <AlertTriangle className="h-3.5 w-3.5 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-caution">{tw("send.recipient.not_whitelisted")}</p>
          </div>
        )}

        {/* Self-send warning (#179 S3). The recipient is THIS wallet's own address
            for this asset. WARN-not-block: it burns fees for no transfer, but the
            user may genuinely intend it, so we inform clearly and leave Continue
            enabled. Local string compare only — no key/seed/network touched. */}
        {toAddress && addressFormatValid && isSelfSendRecipient && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-caution/10 border border-caution/30 -mt-2">
            <AlertTriangle className="h-3.5 w-3.5 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-caution">
              {tw("send.recipient.self_send_warning")}
            </p>
          </div>
        )}

        {/* Address-poisoning / look-alike warning (local screen against history). */}
        {toAddress && addressFormatValid && (
          <div className="-mt-2"><PoisonWarning screen={poisonScreen} /></div>
        )}

        {/* Sentinel — instant local threat intel screening. Fires on every
            keystroke, before TIP or simulation. Shows nothing when clean. */}
        {toAddress && toAddress.length >= 10 && (
          <div className="-mt-2"><SecurityAdvisorBanner address={toAddress} /></div>
        )}

        {/* On-device screening disclosure collapsed to a shield-icon tooltip
            (2026-08-28). The remote-screening checkbox was removed from this
            wizard step; `remoteScreen` state and its default from
            `readRemoteScreenPreference()` still gate the TIP RPC. Surfacing the
            opt-in inside Security Center is deferred — noted in the PR body.
            The DEMO poison-address helper stays as a dev affordance. */}
        {selectedWallet && (isEvmFamily(selectedAsset) || isErc20) && (
          <div className="flex items-center gap-2 -mt-2 text-[11px] text-muted-foreground" title={tw("send.screening.local_disclosure")}>
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Checked on your device</span>
            {demoActive && (
              <button type="button" onClick={() => { setEnsName(""); setEnsResolved(null); setToAddress(DEMO_POISON_ADDRESS); }} className="ms-auto underline hover:text-foreground">
                {tw("send.screening.demo_poison_button")}
              </button>
            )}
          </div>
        )}
        {/* Simulation toggle deliberately removed from step 1 (2026-08-28).
            `simEnabled` state remains — default true from localStorage; the
            "taking too long" hint on step 2 still exposes a one-tap escape. */}

        {showScanner && (
          <QRScanner
            onScan={(value) => { setToAddress(value); setShowScanner(false); }}
            onClose={() => setShowScanner(false)}
          />
        )}
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="send-amount">{tw("send.amount.label")}</Label>
            {sendUsdRate != null && selectedWallet && (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline underline-offset-2"
                onClick={() => {
                  setAmountMode((m) => {
                    if (m === 'crypto') {
                      const n = parseFloat(canonicalAmount);
                      setFiatDraft(Number.isFinite(n) && n > 0 && sendUsdRate ? (n * sendUsdRate).toFixed(2) : "");
                      return 'fiat';
                    }
                    return 'crypto';
                  });
                }}
                aria-label={amountMode === 'crypto'
                  ? tw("send.amount.mode_fiat_aria")
                  : tw("send.amount.mode_crypto_aria", { currency: selectedWallet.currency })}
              >
                {amountMode === 'crypto' ? 'Switch to USD' : `Switch to ${selectedWallet.currency}`}
              </button>
            )}
          </div>
          {(() => {
            // Which amount error applies — decided in one pure, tested helper
            // (lib/sendAmountError.js), the same shape as the address field. See that
            // module for why 'missing' was previously unreachable and why
            // 'not-positive'/'malformed' wait for blur while 'over-balance' stays live.
            //
            // `wellFormed` is the SAME predicate the Continue button gates on below.
            // Feeding one call into both is what stops the gate and the message from
            // drifting apart — the drift that made Continue a silent dead end for
            // "1e-8" and friends.
            // Raw `amount` for the "missing" check (empty is empty in every
            // locale). canonicalAmount for wellFormed — same call the Continue
            // gate below now uses, so gate and message agree in every locale.
            const amountErrorKind = sendAmountErrorKind({
              amount, amountNum,
              wellFormed: isFormAmountWellFormed(canonicalAmount),
              amountTouched, showErrors, balanceKnown, effectiveBalance,
            });
            const amountInvalid = amountErrorKind !== null;
            return (
              <>
                <Input
                  id="send-amount"
                  // type="text", NOT type="number". The HTML value-sanitisation
                  // algorithm blanks anything that is not a "valid floating-point
                  // number" before React sees it, so "1,5", "1.2.3", "1." and "abc"
                  // arrived as "" and the form said "Amount is required" over a
                  // visibly non-empty field — the 'malformed' message added in
                  // PR #1409 could only ever fire for exponent notation. Text
                  // preserves the raw string so the validators judge what was typed.
                  //
                  // inputMode="decimal" is why type="number" was here at all: it
                  // gives mobile the decimal keypad, and it does that on a text
                  // input too. min/step are gone with the number type — they are
                  // inert on text, and keeping them would imply a UA constraint that
                  // no longer applies. Nothing is lost by that: the authoritative
                  // rejection has always been `isFormAmountWellFormed` +
                  // `sendAmountErrorKind` here and `toBaseUnits` on the send path,
                  // never the UA type (a spoofed DOM never bypassed the JS anyway).
                  //
                  // Fiat mode: value renders `fiatDraft` (raw typed string) so
                  // decimal typing stays smooth; every keystroke also converts to
                  // canonical crypto and writes `amount`, keeping downstream
                  // validators/gates authoritative. Empty/malformed fiat clears
                  // `amount` so the "missing" / "malformed" messages fire on the
                  // crypto value the same way they do in crypto mode.
                  type="text"
                  inputMode="decimal"
                  value={amountMode === 'fiat' ? fiatDraft : amount}
                  onChange={e => {
                    const raw = e.target.value;
                    if (amountMode === 'fiat') {
                      setFiatDraft(raw);
                      const parsed = parseFloat(normalizeDecimalInput(raw, resolveLocale()));
                      if (raw === '' || !Number.isFinite(parsed) || !(sendUsdRate > 0)) {
                        setAmount('');
                      } else {
                        setAmount(String(parsed / sendUsdRate));
                      }
                    } else {
                      setAmount(raw);
                    }
                  }}
                  onBlur={() => setAmountTouched(true)}
                  placeholder={amountMode === 'fiat' ? tw("send.amount.fiat_placeholder") : tw("send.amount.placeholder")}
                  className="mt-1.5 mono-value"
                  aria-invalid={amountInvalid || undefined}
                  aria-describedby={amountInvalid ? "send-amount-error" : undefined}
                />
                {amountMode === 'crypto' && amountUsd != null && (
                  <p className="text-xs text-muted-foreground mt-1"><span className="mono-value">{approxUsd(amountUsd)}</span> {tw("send.amount.being_sent")}</p>
                )}
                {amountMode === 'fiat' && Number.isFinite(usableAmountNum) && usableAmountNum > 0 && selectedWallet && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="mono-value">{tw("send.amount.approx_crypto", { amount: usableAmountNum.toPrecision(6), currency: selectedWallet.currency })}</span> {tw("send.amount.being_sent")}
                  </p>
                )}
                {selectedWallet && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {demoActive
                      ? <>{tw("send.amount.balance_prefix")} <span className="mono-value">{demoBalance} {selectedWallet.currency}</span> <span className="text-[10px]">{tw("send.amount.demo_suffix")}</span></>
                      : flowSendEnabled
                        ? <>{tw("send.amount.balance_prefix")} {nativeLiveBalance != null ? <span className="mono-value">{nativeLiveBalance} {selectedWallet.currency}</span> : tw("send.amount.reading_from_network")} <span className="text-[10px]">{tw("send.amount.live_suffix")}</span></>
                        : <>{tw("send.amount.balance_prefix")} <span className="mono-value">{selectedWallet.balance} {selectedWallet.currency}</span></>}
                    {balanceUsd != null && <> · <span className="mono-value">{approxUsd(balanceUsd)}</span></>}
                  </p>
                )}
                {/* One node, one id — the helper already decided precedence, so there
                    is no second element to keep mutually exclusive by hand.

                    POLITE, not role="alert", unlike the address field above. That field
                    only ever renders after blur or submit, so an assertive announcement
                    never lands mid-word. This node also carries 'over-balance', which is
                    deliberately live — it appears the instant the typed value crosses the
                    balance and re-appears on every re-crossing. Assertive there
                    interrupts the user mid-number, which is the interruption class this
                    whole helper exists to remove. aria-invalid + aria-describedby on the
                    input still convey the error on focus. */}
                {amountInvalid && (
                  <p id="send-amount-error" role="status" aria-live="polite" className="text-xs text-destructive mt-1">
                    {amountErrorKind === 'missing' ? tw("send.errors.amount_missing")
                      : amountErrorKind === 'not-positive' ? tw("send.errors.amount_not_positive")
                        : amountErrorKind === 'malformed' ? tw("send.errors.amount_malformed")
                          : tw("send.errors.amount_over_balance")}
                  </p>
                )}
              </>
            );
          })()}
          {(amountUsd != null || balanceUsd != null) && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{USD_REFERENCE_NOTE}</p>
          )}
        </div>

        {selectedWallet && !sendEnabled && !devUngated && (
          <div role="status" className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">{tw("send.status.not_enabled", { currency: selectedWallet.currency })}</p>
          </div>
        )}
        {selectedWallet && !sendEnabled && devUngated && (
          <div role="status" className="flex items-start gap-2 p-2.5 rounded-lg bg-caution/10 border border-caution/40">
            <AlertTriangle className="h-3.5 w-3.5 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-caution">
              <strong>{tw("send.status.dev_ungate_title")}</strong> {tw("send.status.dev_ungate_body", { currency: selectedWallet.currency })}
            </p>
          </div>
        )}
        {selectedWallet && flowSendEnabled && !isUnlocked && !demoActive && (
          <div role="status" className="flex items-start gap-2 p-2.5 rounded-lg bg-caution/10 border border-caution/30">
            <Lock className="h-3.5 w-3.5 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-caution">{tw("send.status.locked")}</p>
          </div>
        )}
        {/* Note chip (2026-08-28) — inline pill that opens NoteEditorSheet.
            Same `note` state; only the entry surface collapses. */}
        <button
          type="button"
          data-testid="note-chip"
          onClick={() => setNoteSheetOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:bg-secondary/40"
        >
          <FileText className="h-3 w-3" />
          {note ? <span className="max-w-[12rem] truncate">{note}</span> : <span>{tw("send.note.label")}</span>}
        </button>

        {/* Spend-limit breach — explicit, specific message. Per-transaction AND
            daily caps from Security Center, both now enforced (see lib/txLimits.js).
            "Sent today" is summed from local tx history; nothing leaves the device. */}
        {limitEval.blocked && usableAmountNum > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/40">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-destructive space-y-1 min-w-0">
              <p className="font-semibold">{t("send_gates.spend_limit.heading")}</p>
              {limitEval.reasons.map((r, i) => (
                <p key={i} className="text-destructive/90">
                  {r.kind === "per_tx"
                    ? t("send_gates.spend_limit.per_tx_reason", {
                        amount: approxUsd(limitEval.amountUSD),
                        currencyPrefix: r.currency === "ALL" ? "" : r.currency + " ",
                        limit: `$${r.limitUSD.toLocaleString()}`,
                      })
                    : t("send_gates.spend_limit.daily_reason", {
                        spentToday: approxUsd(r.spentTodayUSD),
                        amount: approxUsd(limitEval.amountUSD),
                        projected: approxUsd(r.projectedUSD),
                        currencyPrefix: r.currency === "ALL" ? "" : r.currency + " ",
                        limit: `$${r.limitUSD.toLocaleString()}`,
                      })}
                </p>
              ))}
              <p className="text-destructive/70">{t("send_gates.spend_limit.adjust_hint")}</p>
              <label className="flex items-start gap-2 text-destructive cursor-pointer pt-0.5">
                <input type="checkbox" checked={limitAck} onChange={e => setLimitAck(e.target.checked)} className="mt-0.5" />
                {t("send_gates.spend_limit.ack_checkbox")}
              </label>
            </div>
          </div>
        )}

        {/* Insufficient balance — explains the disabled Send button. The same
            `amount > effectiveBalance` condition already gates the button below;
            without this the button just greys out with no reason (audit: the
            over-balance case had no user feedback). */}
        {balanceKnown && usableAmountNum > 0 && usableAmountNum > effectiveBalance && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/40">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive min-w-0">
              <span className="font-semibold">{tw("send.errors.insufficient_balance_title")}</span>{" "}
              {tw("send.errors.insufficient_balance_body", { balance: effectiveBalance, currency: selectedWallet?.currency })}
            </p>
          </div>
        )}

        {/* Digital Shield toggle relocated to step 3 (2026-08-28) — see the
            full-width row card above the Confirm/Prepare-QR button. Step 1
            stays focused on WHO + HOW MUCH. */}

        {step === "form" && (
          <Button
            className={`w-full ${(!toAddress || !isFormAmountWellFormed(canonicalAmount) || !addressFormatValid || (balanceKnown && parseFloat(canonicalAmount) > effectiveBalance) || (limitEval.blocked && !limitAck)) ? "opacity-70" : ""}`}
            disabled={!walletId || !assetSymbol || !flowSendEnabled || (flowSendEnabled && !isUnlocked && !demoActive)}
            onClick={() => {
              // ponytail: sim-testing patch — VITE_SIM_BYPASS_BALANCE=1 lets an empty
              // sim wallet reach the verify step so TIP screening can be exercised.
              // DEV-only: fail-closed in release builds even if .env.local leaks the flag.
              const _simBypassBalance = import.meta.env.DEV && import.meta.env.VITE_SIM_BYPASS_BALANCE === '1';
              const invalid = !toAddress || !isFormAmountWellFormed(canonicalAmount) || !addressFormatValid
                || (!devUngated && !_simBypassBalance && balanceKnown && parseFloat(canonicalAmount) > effectiveBalance)
                || (limitEval.blocked && !limitAck);
              if (invalid) { setShowErrors(true); return; }
              setShowErrors(false);
              setStep("review");
            }}
          >
            <ArrowUpRight className="h-4 w-4 me-1.5" />
            {tw("send.buttons.continue")}
          </Button>
        )}

        {/* WIZARD STEP 2 — Review + simulation.
            Owns the RASP composite banner, TransactionIntelligencePanel, the
            simulation preview, all high-severity acks, the ERC-20 calldata
            fold, the unlimited-approval red banner, and the fee selector.
            The Continue button re-uses the SAME `blockedBy*` composite flags
            the old single-page Confirm button gated on — advancing to confirm
            is only permitted once every ack the user must set is set. This
            keeps enforcement identical to the pre-wizard shape: no new gate,
            just moved. `resetVerify()` on Back drops step-3 state + reauth. */}
        {step === "review" && (
          <div className="space-y-3">
            {/* Summary — the asset symbol links back to Home so a user
                mid-review can jump to the dashboard without losing their
                place in the flow (the confirm step re-derives state on
                remount, so navigating away is intentional, not costly). */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
              <p className="text-xs text-muted-foreground mb-1">{tw("send.verify.summary_label")}</p>
              <p className="text-lg font-bold mono-value">
                {amount}{' '}
                <Link to="/" className="underline underline-offset-2 hover:text-primary" aria-label={`Open ${selectedWallet?.currency || 'asset'} on the Home dashboard`}>
                  {selectedWallet?.currency}
                </Link>
              </p>
              {amountUsd != null && <p className="text-xs text-muted-foreground mono-value">{approxUsd(amountUsd)}</p>}
              <p className="text-sm text-muted-foreground mono-value mt-1 break-all">{toAddress}</p>
            </div>

            {/* AUTHORITATIVE pre-sign verdict — ONE sentence at the chokepoint. The
                composite gate (presign) decides which plane OWNS the copy: when the
                RASP environment plane owns (Phase 3, flag-on), its sentence shows and
                the tx banner is suppressed (never two stacked warnings). When tx owns
                (or the flag is off), the src/risk RiskVerdictBanner shows as before. */}
            {presign?.owner === 'rasp' && raspArtifact?.sentence ? (
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${presign.decision === 'block' ? 'bg-risk/10 border-risk/40 text-risk' : 'bg-caution/10 border-caution/30 text-caution'}`}>
                <RiskShield severity={presign.decision === 'block' ? 'block' : 'warn'} />
                <div className="text-xs space-y-1.5 min-w-0 font-medium">
                  <p>{raspArtifact.sentence}</p>
                  {presign.decision !== 'block' && (
                    <label className="flex items-start gap-2 cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={riskAck}
                        onChange={(e) => setRiskAck(e.target.checked)}
                      />
                      <span>{t("send_gates.rasp.proceed_ack")}</span>
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <RiskVerdictBanner verdict={riskVerdict} acknowledged={riskAck} onAcknowledge={setRiskAck} pending={riskPending} />
            )}

            <TransactionIntelligencePanel
              verdict={txIntelVerdict}
              policy={txIntelPolicy}
              onAskAdvisor={handleAskAdvisorAboutTx}
            />

            {/* B5 — biometric re-confirm on native WARN (ROOTED / INTEGRITY_UNAVAILABLE).
                Rendered OUTSIDE the owner-branch ternary so it appears regardless of which
                banner plane (rasp or tx) owns the copy. Without this, the WARN+RISK compose
                case (owner='tx', decision='confirm') would permanently block the send button
                with no reachable affordance to clear raspWarnBioOk — the same dead-end class
                as PR #834. Fail-closed: bio cancel/error leaves raspWarnBioOk false (I4). */}
            {riskAck && raspNeedsBio && !raspWarnBioOk && (
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs underline underline-offset-2 font-medium mt-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                onClick={async () => {
                  try {
                    const ok = await verifyBiometric2fa();
                    if (ok) setRaspWarnBioOk(true);
                  } catch {
                    // bio unavailable or cancelled — remain blocked (I4 fail-closed)
                  }
                }}
              >
                <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
                {t("send_gates.rasp.verify_biometrics")}
              </button>
            )}


            {/* Hint: one-tap escape while the risk check is still running. */}
            {riskPending && simEnabled && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-dashed border-border bg-card">
                <p className="text-[11px] text-muted-foreground">{tw("send.simulation.taking_too_long")}</p>
                <button
                  type="button"
                  onClick={() => toggleSim(false)}
                  className="text-[11px] font-medium text-primary underline underline-offset-2 whitespace-nowrap"
                >
                  {tw("send.simulation.turn_off")}
                </button>
              </div>
            )}

            {/* PRE-SIGN SIMULATION — predicted balance changes, decoded call, and
                KNOWN risk flags, dry-run against your own RPC before you confirm.
                Local-only baseline; TIP threat signals appended when remote
                screening is enabled (risks[] merge, same RiskRow shape). */}
            {(isEvmFamily(selectedAsset) || isErc20) && (
              <TransactionPreview result={enrichWithTip(txSim.data, tipQuery.data)} loading={txSim.isFetching && !txSim.data} error={txSim.error} />
            )}
            {/* BTC preview (H-1/M-2): the exact decoded tx + fee before signing. */}
            {isBtc && (
              <TransactionPreview result={enrichWithTip(btcSim.data, tipQuery.data)} loading={btcSim.isFetching && !btcSim.data} error={btcSim.error} />
            )}
            {/* BTC risk gate (M-2): a high-severity decode flag (e.g. sends all inputs /
                no change) must be explicitly acknowledged before Confirm & Send. */}
            {btcRiskHigh && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/40 space-y-2">
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {(btcSim.data?.risks || []).find((r) => r.level === "high")?.detail || t("send_gates.tx_sim.high_severity_fallback")}
                </p>
                <label className="flex items-start gap-2 text-xs text-destructive cursor-pointer">
                  <input type="checkbox" checked={btcRiskAck} onChange={e => setBtcRiskAck(e.target.checked)} className="mt-0.5" />
                  {t("send_gates.tx_sim.high_severity_ack")}
                </label>
              </div>
            )}

            {/* Decoded calldata for ERC-20 sends — show EXACTLY what will be
                signed before any signature (anti-blind-signing control).
                MM/Trust pattern (2026-08-28): for transfer/approve the summary
                sits behind an Advanced fold; `unknown` stays visible because it
                is a red-flag surface. TransactionPreview above already shows
                the balance change and (in Advanced) the "ERC-20 transfer" /
                "ERC-20 approve" action — this block adds the exact spender,
                permission amount and native-fee note underneath. */}
            {isErc20 && tokenCalldata && tokenCalldata.kind === "unknown" && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/40">
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t("send_gates.tx_sim.unknown_tx")}
                </p>
              </div>
            )}
            {isErc20 && tokenCalldata && tokenCalldata.kind !== "unknown" && (
              <details className="group p-3 rounded-lg bg-secondary/30 border border-border">
                <summary className="text-[11px] text-muted-foreground font-medium uppercase tracking-widest cursor-pointer select-none list-none flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> {tw("send.decode.heading")}
                  </span>
                  <span className="group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="pt-2 space-y-2">
                  {tokenCalldata.kind === "transfer" && (
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{tw("send.decode.action")}</span><span className="mono-value font-semibold">{tw("send.decode.send_tokens")}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{tw("send.decode.token")}</span><span className="font-semibold">{tokenCalldata.tokenSymbol}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{tw("send.decode.amount")}</span><span className="mono-value font-semibold">{tokenCalldata.amount} {tokenCalldata.tokenSymbol}</span></div>
                      <div className="flex justify-between gap-2 min-w-0"><span className="text-muted-foreground shrink-0">{tw("send.decode.recipient")}</span><span className="mono-value break-all">{tokenCalldata.to}</span></div>
                    </div>
                  )}
                  {tokenCalldata.kind === "approve" && (
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{tw("send.decode.action")}</span><span className="mono-value font-semibold">{tw("send.decode.grant_permission")}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{tw("send.decode.token")}</span><span className="font-semibold">{tokenCalldata.tokenSymbol}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{tw("send.decode.permission")}</span><span className={`mono-value font-semibold ${tokenCalldata.unlimited ? "text-destructive" : ""}`}>{tokenCalldata.unlimited ? tw("send.decode.unlimited_permission") : tokenCalldata.amount}</span></div>
                      <div className="flex justify-between gap-2 min-w-0"><span className="text-muted-foreground shrink-0">{tw("send.decode.spender")}</span><span className="mono-value break-all">{tokenCalldata.spender}</span></div>
                    </div>
                  )}
                  {/* Gas is always paid in the chain's native coin, even for tokens —
                      and that coin is NOT always ETH (Phase C). Read it per-chain. */}
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1 border-t border-border/60">
                    <Fuel className="h-3 w-3 shrink-0" /> {tw("send.fee.native_fee_note", { symbol: nativeSymbol, network: networkName, token: tokenCalldata.tokenSymbol || selectedWallet?.currency })}
                  </p>
                </div>
              </details>
            )}

            {/* Unlimited-approval red warning + required extra confirmation. */}
            {tokenCalldata?.kind === "approve" && tokenCalldata.unlimited && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/40 space-y-2">
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {tokenCalldata.warning}
                </p>
                <label className="flex items-start gap-2 text-xs text-destructive cursor-pointer">
                  <input type="checkbox" checked={approvalAck} onChange={e => setApprovalAck(e.target.checked)} className="mt-0.5" />
                  {t("send_gates.tx_sim.unlimited_approval_ack")}
                </label>
              </div>
            )}

            {/* Fee selection moved to step 3 (2026-08-28) as a compact row that
                opens FeeSheet. The pre-sign RASP/tx-intel/preview surface on this
                step no longer competes with fee controls. Reference-rate
                disclosure moves alongside the fee row on step 3. */}

            {/* Advance to Confirm. The condition is the SAME `blockedBy*`
                composite the pre-wizard Confirm button gated on — every ack
                the user must satisfy on this step must be satisfied before we
                render the PIN / TwoFactorGate / passkey on the next step. No
                new gate; identical enforcement, one screen later. */}
            {(() => {
              const advanceDisabled =
                blockedByApproval ||
                blockedByRisk ||
                blockedByRaspBio ||
                blockedByBtcRisk;
              return (
                <Button
                  className="w-full gap-2"
                  disabled={advanceDisabled}
                  onClick={() => { actionHaptic(); setStep("confirm"); }}
                >
                  <ArrowUpRight className="h-4 w-4" />
                  {tw("send.buttons.continue")}
                </Button>
              );
            })()}

            <Button variant="ghost" className="w-full" onClick={() => { setStep("form"); resetVerify(); }}>{tw("send.buttons.back")}</Button>
          </div>
        )}

        {/* WIZARD STEP 3 — Confirm & sign.
            Renders a compact recap + the TwoFactorGate / PIN reauth / Confirm
            & Send button IIFE that used to live inside the verify step. The
            IIFE is BYTE-EQUIVALENT to the pre-wizard shape — the four-flag AND
            visibility condition (audit-fixed 2026-07-14), the biometric
            evaluate branch, the reauth window handling — all preserved. Back
            returns to review WITHOUT dropping acks (user just wants to look at
            the sim again); returning to step 1 must go via review's Back. */}
        {step === "confirm" && (
          <div className="space-y-3">
            {/* Compact recap — same summary card the review step opens with. */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
              <p className="text-xs text-muted-foreground mb-1">{tw("send.verify.summary_label")}</p>
              <p className="text-lg font-bold mono-value">{amount} {selectedWallet?.currency}</p>
              {amountUsd != null && <p className="text-xs text-muted-foreground mono-value">{approxUsd(amountUsd)}</p>}
              <p className="text-sm text-muted-foreground mono-value mt-1 break-all">{toAddress}</p>
            </div>

            {/* Network fee — compact row that opens FeeSheet (2026-08-28).
                BTC/SOL still use an automatic fee this slice (no selector),
                so the row shows the note inline and does not open a sheet. */}
            {!isBtc && !isSolana ? (
              <>
                <button
                  type="button"
                  data-testid="fee-row"
                  onClick={() => setFeeSheetOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border hover:bg-secondary/40 text-start"
                >
                  <Fuel className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium flex-1">Network fee</span>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedFee?.label || selectedFee?.tier || "Standard"}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-primary">Change</span>
                </button>
                <ReferenceRateNote className="text-center" />
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Fuel className="h-3 w-3 shrink-0" /> {tw("send.fee.automatic", { currency: selectedWallet?.currency, network: networkName })}
              </p>
            )}

            {/* Digital Shield row — first-class per-transaction choice,
                visually equal weight to the CTA below (full-width, same
                border/padding). Kept in the wizard, NOT hidden behind
                Security Center: air-gap signing is something we actively
                promote at signing time. State + gating logic unchanged. */}
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border ${useDigitalShieldMode ? "border-primary bg-primary/5" : "border-border"} ${digitalShieldBtcUnsupported ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-secondary/30"}`}
              data-testid="digital-shield-row"
            >
              <input
                type="checkbox"
                checked={useDigitalShieldMode}
                disabled={digitalShieldBtcUnsupported}
                onChange={(e) => setUseDigitalShieldMode(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <ShieldCheck className={`h-5 w-5 mt-0.5 shrink-0 ${useDigitalShieldMode ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Digital Shield</p>
                <p className="text-xs text-muted-foreground">Sign offline via QR — your seed never touches the internet</p>
                {digitalShieldBtcUnsupported && (
                  <p className="text-[11px] text-caution mt-1">Bitcoin testnet and signet are not supported for Digital Shield yet.</p>
                )}
                {useDigitalShieldMode && digitalShieldConnected && (
                  <p className="text-[11px] text-primary mt-1">✓ Imported</p>
                )}
                {useDigitalShieldMode && !digitalShieldConnected && (
                  <p className="text-[11px] text-caution mt-1">Import it first on Hardware Wallet</p>
                )}
              </div>
            </label>

            {/* STEP-UP RE-AUTH: friction-free within the recent-auth window; re-enter the
                vault credential once it has lapsed. Skipped in demo (fake sends, no vault).
                The #137 risk gate (blockedByRisk) ALSO hard-disables the send action here, so
                a high-risk verdict blocks even an authorised user — both gates must pass. */}
            {(() => {
              // SECOND FACTOR (2FA): once configured, EVERY send requires the PIN + the
              // resolved second factor — a registered passkey (H-1) or the Action Password
              // (no recent-auth window — you opted into every-time). Additive + OPT-IN: with
              // no second factor set (send2faMethod === 'none') this branch is skipped and
              // the existing windowed PIN step-up below is byte-unchanged. Risk/approval
              // gates still come first (the gate is hidden until those pass). The Argon2id
              // checks run SEQUENTIALLY (one-at-a-time — Defect-A safe).
              // 2026-07-14 audit LOW: also gate on !blockedByRaspBio, matching the
              // parallel Confirm-button (:1828) and PinPad (:1854) branches. Without
              // this, on native RASP-WARN + 2FA-configured + tx-owner, the user could
              // complete 2FA only for the signer to throw RASP_BIO_REQUIRED — the UI
              // contract diverges from enforcement even though security is preserved.
              if (send2faMethod !== SEND_2FA.NONE && !blockedByApproval && !blockedByRisk && !blockedByBtcRisk && !blockedByRaspBio) {
                return (
                  <TwoFactorGate
                    mode={send2faMethod}
                    title={send2faMethod === SEND_2FA.BIOMETRIC ? t("send_gates.two_factor_titles.biometric") : send2faMethod === SEND_2FA.PASSKEY ? t("send_gates.two_factor_titles.passkey") : t("send_gates.two_factor_titles.password")}
                    sendError={sendTx.isError ? /** @type {Error} */ (sendTx.error) : null}
                    onCancel={() => { setStep("form"); resetVerify(); }}
                    onLock={lock}
                    onSuccess={() => { twoFactorVerifiedRef.current = true; actionHaptic(); void startSendAttempt(); }}
                    verify={async ({ pin, password }) => {
                      if (send2faMethod === SEND_2FA.BIOMETRIC) {
                        // BIOMETRIC mode: the user is already unlocked (vault open = PIN proved).
                        // TwoFactorGate shows NO PIN field in this mode — the step-up is Face ID only.
                        // FAIL CLOSED (I4) — any cancel/no-match/error counts as NOT verified.
                        //
                        // Gap-5: the old bare-catch (bioOk assigned false on any error) also made every
                        // failure indistinguishable, so a USER CANCEL, a permanently
                        // invalidated hardware key, and an unavailable sensor each burned one
                        // of TwoFactorGate's 5 attempts and captioned it "Incorrect." — five
                        // taps on the OS Cancel button locked the session. The send stays
                        // blocked in all of those cases; only the accounting and the message
                        // change, and a genuine no-match still counts. The rationale for the
                        // `pinOk: true` / `actionPasswordConfigured: true` literals moved with
                        // the logic into lib/stepUpFactorOutcome.js.
                        return evaluateBiometricSecondFactor(verifyBiometric2fa);
                      }
                      const pinOk = await verifyActiveCredential(pin);        // refreshes the auth window on success
                      if (send2faMethod === SEND_2FA.PASSKEY) {
                        // Factor 2: a WebAuthn assertion bound to this device's passkey.
                        // FAIL CLOSED (I4) — any cancel/timeout/error counts as NOT verified.
                        let passkeyOk = false;
                        try { passkeyOk = (await verifyPasskeyAssertion()) === true; } catch { passkeyOk = false; }
                        // PASSKEY is a possession factor (not the Action Password) — its
                        // "configured" precondition is the registered passkey, already
                        // required for send2faMethod to resolve to PASSKEY.
                        return evaluateTwoFactor({ pinOk, passwordOk: passkeyOk, actionPasswordConfigured: true });
                      }
                      const passwordOk = await verifyActionPassword(password);
                      // PASSWORD method: pass the REAL AP-configured state (same source
                      // resolveSend2faMethod used to pick PASSWORD). If the record is
                      // absent, evaluateTwoFactor returns NOT_CONFIGURED — fail closed.
                      return evaluateTwoFactor({ pinOk, passwordOk, actionPasswordConfigured });
                    }}
                  />
                );
              }
              const reauthRequired = !demoActive && isSendReauthRequired();
              if (!reauthRequired) {
                const confirmSendDisabled =
                  blockedByApproval ||
                  blockedByRisk ||
                  blockedByRaspBio ||
                  blockedByBtcRisk ||
                  sendTx.isPending ||
                  digitalShieldBusy;
                return (
                  <Button
                    className="w-full gap-2"
                    disabled={confirmSendDisabled}
                    onClick={() => {
                      // Re-check freshness at click time (isSendReauthRequired reads a ref, always
                      // current). If the window lapsed while idle on this screen, force a re-render so
                      // the block below switches to the step-up prompt instead of sending.
                      if (!demoActive && isSendReauthRequired()) { setReauthTick((t) => t + 1); return; }
                      actionHaptic();
                      void startSendAttempt();
                    }}
                  >
                    {sendTx.isPending || digitalShieldBusy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                    {/* blockedByRaspBio is part of confirmSendDisabled above; keep this button text pin nearby for B5. */}
                    {useDigitalShieldMode ? 'Prepare Digital Shield QR' : tw("send.buttons.confirm_send")}
                  </Button>
                );
              }
              const authModel = getAuthModel();
              return (
                <div className="space-y-3">
                  <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-widest">
                    {tw("send.reauth.prompt", { credential: authModel === "pin" ? tw("send.reauth.credential_pin") : tw("send.reauth.credential_password") })}
                  </p>
                  {reauthError && <p role="alert" className="text-xs text-center text-destructive">{reauthError}</p>}
                  {authModel === "pin" ? (
                    <PinPad
                      value={reauthValue}
                      onChange={setReauthValue}
                      onComplete={submitReauth}
                      disabled={reauthPending || sendTx.isPending || digitalShieldBusy || blockedByApproval || blockedByRisk || blockedByRaspBio || blockedByBtcRisk}
                      submitLabel={tw("send.reauth.submit_pin")}
                    />
                  ) : (
                    <>
                      <PasswordInput
                        value={reauthValue}
                        onChange={(e) => setReauthValue(e.target.value)}
                        placeholder={tw("send.reauth.password_placeholder")}
                        aria-label={tw("send.reauth.password_aria")}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter" && reauthValue && !reauthPending) submitReauth(reauthValue); }}
                      />
                      <Button
                        className="w-full gap-2"
                        disabled={!reauthValue || reauthPending || sendTx.isPending || digitalShieldBusy || blockedByApproval || blockedByRisk || blockedByRaspBio || blockedByBtcRisk}
                        onClick={() => submitReauth(reauthValue)}
                      >
                        {reauthPending || sendTx.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Lock className="h-4 w-4" />}
                        {tw("send.reauth.submit_password")}
                      </Button>
                    </>
                  )}
                </div>
              );
            })()}

            <Button variant="ghost" className="w-full" onClick={() => setStep("review")}>{tw("send.buttons.back")}</Button>
          </div>
        )}
      </div>
    </div>
    {/* Progressive-disclosure sheets. Selecting a wallet closes the sheet;
        selecting an asset does the same. Note sheet closes via its Done
        button. Fee sheet stays open across FeeSelector interactions so the
        user can preview tiers, and closes via Done. */}
    <WalletAssetPickerSheet
      open={walletAssetSheetOpen}
      onOpenChange={setWalletAssetSheetOpen}
      wallets={wallets}
      enabledAssets={enabledAssets}
      selectedWalletId={walletId}
      selectedAssetSymbol={assetSymbol}
      onSelectWallet={(id) => { setWalletId(id); }}
      onSelectAsset={(sym) => { setAssetSymbol(sym); setWalletAssetSheetOpen(false); }}
    />
    <NoteEditorSheet
      open={noteSheetOpen}
      onOpenChange={setNoteSheetOpen}
      value={note}
      onChange={setNote}
      label={tw("send.note.label")}
      placeholder={tw("send.note.placeholder")}
    />
    {!isBtc && !isSolana && (
      <FeeSheet
        open={feeSheetOpen}
        onOpenChange={setFeeSheetOpen}
        chain="evm"
        networkKey={networkKey}
        symbol={nativeSymbol}
        decimals={activeNetwork?.decimals ?? 18}
        usdRate={USD_RATES[nativeSymbol] ?? USD_RATES[selectedWallet?.currency]}
        gasLimitHint={isErc20 ? undefined : 21000}
        from={selectedWallet?.address || undefined}
        to={isErc20 ? (selectedAsset?.contractAddress || undefined) : (toAddress || undefined)}
        txData={isErc20 ? (riskCalldata || undefined) : undefined}
        value={isErc20 ? "0x0" : undefined}
        onChange={setSelectedFee}
      />
    )}
    <Dialog open={digitalShieldDialogOpen} onOpenChange={(open) => { if (!open) resetDigitalShieldFlow(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Digital Shield Signing</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground">
            Scan this request with Digital Shield, approve it on the device, then scan or paste the signed response UR below.
          </p>
          {digitalShieldFlow?.urParts?.length ? (
            <div className="space-y-2">
              <UrQrPlayer parts={digitalShieldFlow.urParts} size={220} title="Digital Shield request QR" />
              <textarea
                readOnly
                value={digitalShieldFlow.urParts.join('\n')}
                className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-[11px] font-mono"
              />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setDigitalShieldScannerOpen(true)}>
              Scan Signed QR
            </Button>
            {digitalShieldResponseParts.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => { setDigitalShieldResponseParts([]); setDigitalShieldResponseDraft(""); setDigitalShieldError(""); }}>
                Clear response
              </Button>
            )}
          </div>
          {digitalShieldResponseParts.length > 0 && (
            <div className="rounded-lg bg-secondary/40 border border-border p-3 text-xs text-muted-foreground">
              Scanned response parts: {digitalShieldResponseParts.length}
            </div>
          )}
          <Label htmlFor="digital-shield-signed-response">Signed response UR</Label>
          <textarea
            id="digital-shield-signed-response"
            value={digitalShieldResponseDraft || digitalShieldResponseParts.join('\n')}
            onChange={(e) => setDigitalShieldResponseDraft(e.target.value)}
            placeholder="Paste one UR or multiple UR response parts here"
            className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-[11px] font-mono"
          />
          {digitalShieldError ? <p className="text-xs text-destructive break-all">{digitalShieldError}</p> : null}
          <Button
            className="w-full"
            disabled={digitalShieldBusy || !(digitalShieldResponseDraft || digitalShieldResponseParts.length)}
            onClick={() => finalizeDigitalShieldSend(digitalShieldResponseDraft || digitalShieldResponseParts)}
          >
            {digitalShieldBusy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : null}
            Finalize and Broadcast
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    {digitalShieldScannerOpen && (
      <QRScanner
        parse={parseDigitalShieldQr}
        title="Scan Signed Digital Shield QR"
        helperText="Scan each signed UR fragment from the device. If there are multiple parts, reopen the scanner for the next one."
        onScan={(value) => {
          setDigitalShieldResponseParts((current) => current.includes(value) ? current : [...current, value]);
          setDigitalShieldScannerOpen(false);
        }}
        onClose={() => setDigitalShieldScannerOpen(false)}
      />
    )}
    </>
  );
}
