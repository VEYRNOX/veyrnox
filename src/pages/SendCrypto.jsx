// @ts-nocheck
import BackButton from "@/components/BackButton";
import SuccessBeacon from "@/components/SuccessBeacon";
import RiskShield from "@/components/RiskShield";
import { motion, useReducedMotion } from "framer-motion";
import { USD_RATES, approxUsd, USD_REFERENCE_NOTE } from "@/lib/cryptos";
import { useTrezor } from '../context/TrezorContext.jsx';
// Issue #961 (SEND H-1): the Trezor EVM branch now goes through the audited
// hw-send.js helpers (signAndBroadcastEvmTrezor / signAndBroadcastEvmTrezorToken),
// NOT the raw device wrapper — those helpers apply the M-2/#746 recovery check,
// the 'pending' block-tag nonce + sanity window, and estimated gas + headroom.
// BTC + SOL Trezor branches still use their raw wrappers (unrelated to #961).
import { trezorSignBtcTx, trezorSignSolTx } from '../wallet-core/hw/trezor.js';
import { signAndBroadcastEvmTrezor, signAndBroadcastEvmTrezorToken } from '../wallet-core/evm/hw-send.js';
import { TrezorConnectModal } from '../components/hw/TrezorConnectModal.jsx';
import { TrezorUnsupportedScreen } from '../components/hw/TrezorUnsupportedScreen.jsx';
import ReferenceRateNote from "@/components/ReferenceRateNote";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowUpRight, Fingerprint, Loader2, CheckCircle2, ScanLine, ShieldCheck, ShieldAlert, AlertTriangle, ExternalLink, Lock, FileText, Fuel, Wallet, Activity } from "lucide-react";
import QRScanner from "../components/QRScanner";
import FeeSelector from "@/components/FeeSelector";
import CoinLogo from "@/components/CoinLogo";
import TransactionPreview from "@/components/TransactionPreview";
import TransactionSimulationDemo from "@/components/TransactionSimulationDemo";
import { toast } from "sonner";
import { parseEther, parseUnits } from "ethers";
import { useWallet } from "@/lib/WalletProvider";
import { useNavigate, useSearchParams } from "react-router-dom";
import { signAndBroadcast } from "@/wallet-core/evm/send";
import { MAX_BASE_FEE_GWEI } from "@/wallet-core/evm/fees";
import { getBalanceEth } from "@/wallet-core/evm/provider";
import { getBalanceSats } from "@/wallet-core/btc/provider.js";
import { getBalanceSol } from "@/wallet-core/sol/provider.js";
import { getAsset, canSend, canReceive, isEvmFamily } from "@/wallet-core/assets";
import { isDevSendUngated } from "@/lib/devSendOverride";
import { signAndBroadcastBtc, estimateBtcSend, broadcastBtcTx } from "@/wallet-core/btc/send";
import { describeBtcPlan } from "@/wallet-core/btc/simulate";
import { signAndBroadcastSol, buildUnsignedSolTx, broadcastSignedSolTx, attachSolSignature } from "@/wallet-core/sol/send";
import { toBaseUnits, normalizeSendResult } from "@/lib/sendDispatch";
import { getNetworkInfo, ALLOW_MAINNET } from "@/wallet-core/evm/networks";
import { sendToken, buildTokenTransfer, getTokenBalance } from "@/wallet-core/evm/token-send";
import { describeErc20Call } from "@/wallet-core/evm/calldata";
import RiskVerdictBanner from "@/components/RiskVerdictBanner";
import { score, buildRiskInputs } from "@/risk";
import { TIER, useRaspArtifact, getFreshRaspArtifact } from "@/rasp";
import { presignGate } from "@/sign-gate/presign";
import { simulateEvmTransaction } from "@/wallet-core/evm/simulate";
import { getToken } from "@/wallet-core/evm/tokens";
import { screenRecipient } from "@/wallet-core/evm/poison";
import { isValidAddressForCurrency } from "@/lib/addressValidation";
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
import { Capacitor } from "@capacitor/core";
import TwoFactorGate from "@/components/security/TwoFactorGate";
import { notifySendConfirmed, notifyRaspAlert, notifyTxRiskAlert } from "@/notify/sources";
import { defaultWalletId, sendAssetSymbols, defaultAssetSymbol, buildSendWallet, demoSendSource } from "@/lib/sendWalletSource";
import { DEMO, DEMO_POISON_ADDRESS } from "@/api/demoClient";
import PinPad from "@/components/security/PinPad";
import { getAuthModel } from "@/lib/authModel";
import { isDeniabilitySessionActive, isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession.js";

// Maximum wrong-credential attempts before the vault locks (step-up re-auth).
const REAUTH_CAP = 5;

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
  if (!screen?.suspicious) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/40">
      <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <div className="text-xs text-destructive space-y-1.5 min-w-0">
        <p className="font-semibold">This address looks suspicious — check every character carefully</p>
        <p className="text-destructive/90">
          This recipient looks like an address you've used before — same first and last
          characters, different middle. Scammers craft look-alike addresses hoping you copy
          the wrong one. We couldn't verify this address; compare every character, not just
          the ends.
        </p>
        {screen.lookAlikes.map((m, i) => (
          <div key={i} className="rounded bg-destructive/10 border border-destructive/20 p-1.5">
            <p className="text-[10px] uppercase tracking-wide text-destructive/70">
              Resembles {m.label}{m.date ? ` · ${new Date(m.date).toLocaleDateString()}` : ""}
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
  const reduce = useReducedMotion();
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
      className="max-w-md mx-auto text-center py-16 space-y-5"
    >
      <motion.div variants={item} className="flex justify-center">
        <SuccessBeacon size={112} label="Transaction broadcast" />
      </motion.div>
      <motion.h2 variants={item} className="text-xl font-bold tracking-tight">Transaction Broadcast</motion.h2>
      <motion.p variants={item} className="text-sm text-muted-foreground">
        <span className="mono-value text-foreground">{amount} {currency}</span> signed locally and sent to the network
      </motion.p>
      {txResult?.hash && (
        <motion.div variants={item} className="p-3 rounded-xl bg-secondary/30 border border-border text-left space-y-2">
          <p className="text-xs text-muted-foreground">Transaction hash</p>
          <p className="text-xs mono-value break-all">{txResult.hash}</p>
          {txResult.explorerUrl && (
            <a href={txResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
              View on block explorer <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <p className="text-[11px] text-muted-foreground">Pending until confirmed on the network. Balance updates from the blockchain, not a stored value.</p>
        </motion.div>
      )}
      <motion.div variants={item}>
        <Button variant="outline" onClick={onSendAnother}>
          Send Another
        </Button>
      </motion.div>
    </motion.div>
  );
}

export default function SendCrypto() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isUnlocked, wallets, activeWalletId, switchWallet, accounts, btcAccount, solAccount, withPrivateKey, withBtcPrivateKey, withSolPrivateKey, lock, verifyActiveCredential, verifyActiveCredentialDetailed, isSendReauthRequired, actionPasswordConfigured, verifyActionPassword, recordAudit, isDecoy, isHidden, vaultExists, vaultChecking } = /** @type {any} */ (useWallet());

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
    demo: DEMO,
    isNative: Capacitor.isNativePlatform(),
    actionPasswordConfigured,
    isDecoy,
    isHidden,
  });

  // Cold-load / deep-link guard: if the vault is confirmed absent (new install),
  // redirect home rather than hanging on an empty form.
  const redirected = useRef(false);
  useEffect(() => {
    if (!redirected.current && !vaultChecking && vaultExists === false) {
      redirected.current = true;
      navigate('/', { replace: true });
    }
  }, [vaultChecking, vaultExists, navigate]);
  // When navigated from CryptoDetailPage (?asset=ETH), wallet + asset are already
  // known — hide those pickers and show a simplified address+amount form.
  const fromDetail = !!searchParams.get("asset");
  const [walletId, setWalletId] = useState("");
  const [assetSymbol, setAssetSymbol] = useState(searchParams.get("asset") ?? "");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState("form"); // form | verify | done
  const [showScanner, setShowScanner] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [txResult, setTxResult] = useState(/** @type {any} */ (null)); // { hash, explorerUrl } from a real broadcast
  const [selectedFee, setSelectedFee] = useState(/** @type {any} */ (null)); // user-chosen EIP-1559 fee (FeeSelector)

  // TREZOR hardware-wallet signing mode
  const { connected: trezorConnected, platform: trezorPlatform, evmAddress: trezorEvmAddress, btcAddress: trezorBtcAddress, solAddress: trezorSolAddress } = useTrezor();
  const [useTrezorMode, setUseTrezorMode] = useState(false);
  const [trezorModalOpen, setTrezorModalOpen] = useState(false);

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
      toast.error("Name resolution is off in this session — paste the address directly.");
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
        else toast.error("ENS name not found");
      } else if (name.endsWith(".sol")) {
        // SNS honest-disable: no on-chain Bonfida resolver is wired yet.
        // The previous path called a third-party proxy (I2/I5 violation).
        // Paste the base58 address directly until on-chain resolution is built.
        toast.error("Solana name resolution is not available yet — paste the address directly.");
      }
    } catch { toast.error("Name resolution failed"); } finally { setEnsResolving(false); }
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
  const demoActive = DEMO && wallets.length === 0;
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
  }));
  const { data: addressBook = [] } = useQuery({
    queryKey: ["address-book"],
    queryFn: () => base44.entities.AddressBook.list(),
  });

  // Opt-in, off-by-default remote screening. DISCLOSED privacy trade-off: turning
  // this on would send the recipient address to a third-party threat-intel API,
  // leaking your intent off-device. The default is LOCAL-ONLY look-alike
  // detection, which queries nothing. Persisted as a display preference.
  const [remoteScreen, setRemoteScreen] = useState(() => {
    try { return localStorage.getItem("veyrnox-remote-screen") === "1"; } catch { return false; }
  });
  const toggleRemoteScreen = (v) => {
    setRemoteScreen(v);
    try { localStorage.setItem("veyrnox-remote-screen", v ? "1" : "0"); } catch { /* ignore */ }
  };

  // User-controlled simulation toggle. On by default; persisted so the choice
  // survives navigation. When off: the teaser box is hidden, both simulation
  // queries are disabled, and the verify step shows no pre-flight result.
  const [simEnabled, setSimEnabled] = useState(() => {
    try { return localStorage.getItem("veyrnox-sim-enabled") !== "0"; } catch { return true; }
  });
  const toggleSim = (v) => {
    setSimEnabled(v);
    try { localStorage.setItem("veyrnox-sim-enabled", v ? "1" : "0"); } catch { /* ignore */ }
  };

  // Synthesise the per-(wallet, asset) record the rest of this screen expects
  // (.currency/.address/.balance) from the live source, so downstream send / limit /
  // screening logic is unchanged. Address comes from the active wallet's derived
  // accounts (EVM shared / BTC / SOL) via resolveReceive.
  const selectedWallet = /** @type {any} */ (buildSendWallet({ wallets: srcWallets, walletId, assetSymbol, accounts: srcAccounts, btcAccount: srcBtcAccount, solAccount: srcSolAccount }));

  // Capability gate: only assets whose status is `live` may move funds. ETH is
  // live (Phase A); ERC-20 tokens (Phase B) are receive_only until a testnet
  // transfer is verified, so they read balances but cannot yet send.
  const selectedAsset = /** @type {any} */ (getAsset(selectedWallet?.currency));
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
    if (!isErc20 || !toAddress || !amount || parseFloat(amount) <= 0) return null;
    try {
      const { data } = buildTokenTransfer({ networkKey: networkKey, symbol: selectedAsset.symbol, to: toAddress, amount });
      return describeErc20Call({ data, tokenSymbol: selectedAsset.symbol, decimals: getToken(networkKey, selectedAsset.symbol).decimals });
    } catch {
      return null; // unconfigured token / invalid input — UI shows nothing to decode
    }
  }, [isErc20, selectedAsset, toAddress, amount]));

  // Unlimited-approval extra confirmation. Send flows are transfer-only, so this
  // stays false in normal use; it hard-gates the action only if an unlimited
  // `approve` is ever decoded.
  const [approvalAck, setApprovalAck] = useState(false);
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
  const amountNum = parseFloat(amount);
  const amountUsd = sendUsdRate != null && Number.isFinite(amountNum) && amountNum > 0 ? amountNum * sendUsdRate : null;

  const addressFormatValid = !toAddress || !selectedWallet
    ? true
    : isValidAddressForCurrency(toAddress, selectedWallet.currency);

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

  // SPEND-LIMIT ENFORCEMENT (Security Center → Tx Limits). Evaluates this send
  // against the user's per-transaction AND daily caps. The daily cap was
  // previously saved-but-never-read (security theatre); it is now enforced by
  // summing TODAY's sends from the SAME local tx-history records loaded above
  // (`history`) — see lib/txLimits.js. Fully on-device: no new fetch, no
  // phone-home. A breach disables the Continue button below and renders a clear,
  // specific reason; it never silently blocks.
  const limitEval = useMemo(
    () => evaluateSendAgainstLimits({
      amount,
      currency: selectedWallet?.currency,
      usdRates: USD_RATES,
      history: /** @type {any} */ (history),
      limits: /** @type {any} */ (txLimits),
      now: new Date(),
    }),
    [amount, selectedWallet, history, txLimits]
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
      .map((t) => Number(t.amount))
      .filter((n) => Number.isFinite(n) && n > 0),
    [history, selectedWallet]
  );
  const knownCounterparties = useMemo(
    () => knownAddresses.map((k) => k.address?.toLowerCase()).filter(Boolean),
    [knownAddresses]
  );

  // PRE-SIGN TRANSACTION SIMULATION (Phase S2). Before the user confirms, dry-run
  // the transaction against the EXISTING RPC (eth_call / eth_getBalance /
  // eth_getCode) to predict the outcome (balance changes), decode the call, and
  // flag KNOWN risk patterns (unlimited approval, known-bad / look-alike
  // recipient, unverified contract, predicted revert, large outflow). LOCAL-ONLY:
  // no third-party scoring service. WARNS, never blocks; never claims "safe".
  // Disabled in DEMO (no live RPC) — the demo harness renders sample previews
  // instead. Errors are surfaced as a degraded "couldn't simulate" note, not a
  // block. Keys are never involved (simulation needs only the sender address).
  const txSim = /** @type {any} */ (useQuery({
    queryKey: ["tx-sim", networkKey, selectedWallet?.address, toAddress, amount, selectedAsset?.symbol, isErc20],
    queryFn: async () => {
      const from = selectedWallet.address;
      if (isErc20) {
        const t = getToken(networkKey, selectedAsset.symbol);
        const { data } = buildTokenTransfer({ networkKey, symbol: selectedAsset.symbol, to: toAddress, amount });
        return simulateEvmTransaction({
          networkKey, from, to: t.address, data, valueWei: 0n,
          nativeSymbol, tokenSymbol: selectedAsset.symbol, tokenDecimals: t.decimals,
          tokenBalance: liveBalance != null ? String(liveBalance) : /** @type {any} */ (null), knownAddresses,
          priorSends, knownCounterparties,
        });
      }
      return simulateEvmTransaction({
        networkKey, from, to: toAddress, valueWei: parseEther(String(amount)),
        nativeSymbol, knownAddresses, priorSends, knownCounterparties,
      });
    },
    // I3: never issue simulation RPC in a decoy/hidden (deniability) session.
    enabled: simEnabled && step === "verify" && !DEMO && !isDecoy && !isHidden && !isDeniabilitySessionActive() && (isEvmFamily(selectedAsset) || isErc20)
      && !!selectedWallet?.address && !!toAddress && addressFormatValid && parseFloat(amount) > 0,
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
    queryKey: ["btc-sim", networkKey, selectedWallet?.address, toAddress, amount],
    queryFn: async () => {
      const fromAddress = selectedWallet.address;
      const amountSats = parseUnits(String(amount), 8); // BTC has 8 decimals; exact, no float
      const { plan } = await estimateBtcSend({ networkKey, fromAddress, toAddress, amountSats });
      return describeBtcPlan({ plan, fromAddress });
    },
    // I3: never issue Esplora estimate RPC in a decoy/hidden (deniability) session.
    enabled: simEnabled && step === "verify" && !DEMO && !isDecoy && !isHidden && !isDeniabilitySessionActive() && isBtc
      && !!selectedWallet?.address && !!toAddress && addressFormatValid && parseFloat(amount) > 0,
    retry: false,
    staleTime: 10000,
  }));

  // Raw calldata for the risk scorer (S2/S3/S7 read tx.data). Distinct from
  // tokenCalldata above, which is the human-readable DECODE. Native sends have no
  // calldata. Cheap + local; recomputed with the same inputs as the decode.
  const riskCalldata = useMemo(() => {
    if (!isErc20 || !toAddress || !amount || parseFloat(amount) <= 0) return null;
    try {
      return buildTokenTransfer({ networkKey, symbol: selectedAsset.symbol, to: toAddress, amount }).data;
    } catch {
      return null;
    }
  }, [isErc20, selectedAsset, toAddress, amount, networkKey]);

  // PRE-SIGN RISK SCORE (src/risk) — the authoritative one-sentence verdict + the
  // RISK gate. Pure + local: maps the SAME local state the existing warnings read
  // into score()'s inputs (no new fetch, no signer/seed). recipientCode (S7) is
  // reused from the simulation's already-fetched eth_getCode (I2).
  // Also ready when simulation is disabled — the score runs without recipientCode
  // (S7 escalates to CAUTION, which now requires confirmation per score.js).
  const riskReady = DEMO || !!txSim.data || txSim.isError || !simEnabled;

  // SINGLE source of truth for the verdict: maps the live send state → score().
  // BOTH the displayed banner and the hard pre-sign gate call this, so the
  // verdict the user sees and the verdict the gate enforces can never diverge
  // (a divergence would let the gate block a verdict that was never shown, or
  // vice-versa). recipientCode is the only timing-dependent input — read at call
  // time. In DEMO there is no live RPC, so recipients are treated as EOAs ('0x'):
  // the verdict is a real computation over the entered inputs; only the chain
  // fact behind S7 is demo-seeded.
  const scoreCurrentSend = () => {
    const recipientCode = DEMO ? '0x' : txSim.data?.recipientCode;
    const { unsignedTx, activeSetLocalState, chainData } = buildRiskInputs({
      to: toAddress,
      amountText: amount,
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
    return score(unsignedTx, activeSetLocalState, chainData);
  };

  // Does the risk score apply to this send at all? (EVM family / ERC-20 with a
  // format-valid recipient.) Non-EVM sends are not scored.
  const riskApplicable = !!toAddress && addressFormatValid && (isEvmFamily(selectedAsset) || isErc20);
  // We wait for the simulation to settle (data or error) before judging so S7
  // doesn't flash a transient fail-closed CAUTION while eth_getCode loads.
  const riskVerdict = useMemo(() => {
    if (!riskApplicable || !riskReady) return null;
    return scoreCurrentSend();
    // scoreCurrentSend reads the live send state via closure; deps below mirror
    // every input it touches (amount included — native sends carry value, not
    // calldata, so amount must invalidate even when riskCalldata is null).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toAddress, amount, addressFormatValid, selectedAsset, isErc20, riskCalldata, ensResolved, activeNetwork, selectedWallet, history, knownAddresses, whitelist, riskReady, txSim.data]);

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
  // P2-4 (audit 2026-07-15): deferAttestation is bound to step === "verify" so
  // the attestation network call (Google Play Integrity / Apple App Attest)
  // does NOT fire on Send-page mount — it fires only once the user has
  // committed sign intent by entering the verify step. This matches the
  // documented "attestation only on explicit pre-sign egress" boundary.
  //
  // I3: attestationProbeSource() checks isDeniabilityOrDemoActive() FIRST — no
  // egress under decoy/hidden/demo. I4: a RASP crash fails closed (BLOCK).
  const raspArtifact = useRaspArtifact({ deferAttestation: step !== 'verify' });
  // I4 FAIL CLOSED (RASP-A2): missing tier → strongest BLOCK, never ALLOW.
  const raspTier = raspArtifact?.tier ?? TIER.BLOCK;

  // The COMPOSITE pre-sign decision (RASP env plane ⊕ tx-risk plane), set-blind by
  // construction (presignGate takes no wallet-set handle). The signer path
  // (mutationFn) re-derives the SAME gate, so UI and enforcement cannot diverge.
  const presign = riskVerdict ? presignGate(raspTier, riskVerdict.level, riskAck) : null;
  const blockedByRisk = riskPending || (presign ? !presign.proceedAllowed : false);

  // B5 — biometric gate for WARN environments. `requiresBiometric` is set by degrade()
  // for ROOTED and INTEGRITY_UNAVAILABLE. Only enforced on native: verifyBiometric2fa()
  // throws immediately on web (no native platform), and ROOTED is only reachable via the
  // native OS probe. BLOCK overrides bio (the signer is already unreachable).
  const raspNeedsBio = raspArtifact?.requiresBiometric === true
    && Capacitor.isNativePlatform()
    && presign?.decision !== 'block';
  const blockedByRaspBio = raspNeedsBio && !raspWarnBioOk;

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

  const sendTx = useMutation({
    mutationFn: async () => {
      // DEFENSE-IN-DEPTH: re-assert EVERY UI gate at signing time, as one ordered
      // decision, so no stale UI state can broadcast past a tripped gate. The order
      // and the user-facing messages live in the pure evaluateSendGate()
      // (lib/sendGate.js), which is exhaustively unit-tested — so the enforced
      // verdict cannot drift from this call site. Each raw input below is recomputed
      // here against live state / a fresh risk score.

      // 7 — spend limits, recomputed against the latest local history (per-tx + daily).
      const limitGate = evaluateSendAgainstLimits({
        amount,
        currency: selectedWallet.currency,
        usdRates: USD_RATES,
        history: /** @type {any} */ (history),
        limits: /** @type {any} */ (txLimits),
        now: new Date(),
      });

      // 8 — pre-sign risk. Uses the SAME scoreCurrentSend() the banner renders, so the
      // enforced verdict matches what the user saw. Fail closed: if scoring throws,
      // mark it failed and the gate refuses to sign. Otherwise compose the tx verdict
      // with the RASP environment tier (Phase 3; raspTier is ALLOW when the flag is
      // off → reduces to the tx-risk gate).
      //
      // P2-1 (audit 2026-07-15): fetch a FRESH RASP artifact right here on the sign
      // hot-path instead of reusing the closure's `raspTier` (which could be up
      // to ~60 s stale — last heartbeat sample). An attacker who injected a hook
      // AFTER the last probe but BEFORE the user tapped Send previously slipped
      // past a stale ALLOW. getFreshRaspArtifact awaits both the OS and
      // attestation legs with a 1500 ms fail-closed timeout (WC pattern);
      // timeout/throw/shape-drift → BLOCK. Never a fabricated CLEAN.
      const freshArtifact = await getFreshRaspArtifact();
      const freshRaspTier = freshArtifact?.tier ?? TIER.BLOCK;
      // Emit a security notification if RASP found a non-clean environment at sign time.
      // Fire-and-forget (I4) — the notification path must never block or unwind the send.
      if (freshRaspTier !== 'allow') {
        notifyRaspAlert({ tier: freshRaspTier, sentence: freshArtifact?.sentence ?? null, ts: Date.now() });
      }

      let riskScoreFailed = false;
      let presignAtSign = /** @type {any} */ (null);
      try {
        const freshScore = scoreCurrentSend();
        presignAtSign = presignGate(freshRaspTier, freshScore.level, riskAck);
        // Fire-and-forget (I4) — notification failure must never block or unwind the send.
        notifyTxRiskAlert({ level: freshScore.level, sentence: freshScore.sentence, signalId: freshScore.signalId, ts: Date.now() });
      } catch {
        riskScoreFailed = true;
      }

      // B5 — RASP WARN biometric enforcement chokepoint (I4 fail-closed).
      // Defense-in-depth: re-assert the bio gate at sign time so UI state cannot be
      // bypassed. Uses the FRESH artifact (P2-1), not the stale closure, so a
      // just-injected hook cannot slip past biometric friction.
      const raspNeedsBioAtSign = freshArtifact?.requiresBiometric === true
        && Capacitor.isNativePlatform()
        && presignAtSign?.decision !== 'block';
      if (raspNeedsBioAtSign && !raspWarnBioOk) {
        throw Object.assign(
          new Error('Biometric confirmation required before signing on a modified device.'),
          { code: 'RASP_BIO_REQUIRED' }
        );
      }

      // The single ordered verdict (capability → unlock → re-auth → limits → risk →
      // approval). canSend() stays the production truth, relaxed only by the dev,
      // testnet-only, build-eliminated ungate. Mainnet stays gated in networks.js.
      // One-shot: consume the 2FA token for THIS attempt (a retry must re-verify).
      const twoFactorVerified = twoFactorVerifiedRef.current;
      twoFactorVerifiedRef.current = false;

      const gate = /** @type {any} */ (evaluateSendGate({
        canSend: canSend(selectedAsset),
        devUngated,
        currency: selectedWallet?.currency,
        isUnlocked,
        demo: DEMO,                                    // demo has no vault → re-auth exempt
        reauthRequired: DEMO ? false : isSendReauthRequired(),
        // Second factor (audit H1): when a second factor is configured — Action Password
        // OR a registered passkey (H-1 fix) — it must be verified THIS send, enforced here
        // so a recently-authed session can't reach the signer on PIN recency alone.
        // evaluateSendGate exempts demo internally; send2faMethod is already 'none' in demo.
        twoFactorRequired: send2faMethod !== SEND_2FA.NONE,
        twoFactorVerified,
        limit: limitGate,
        limitAck,
        riskScoreFailed,
        presign: presignAtSign,
        // BTC risk re-checked from the settled preview at signing time (M-2), so a
        // high decode flag can't be bypassed by stale UI state — mirrors how the EVM
        // verdict is recomputed above.
        btcRiskBlocked: isBtc && (btcSim.data?.risks || []).some((r) => r.level === "high") && !btcRiskAck,
        blockedByApproval,
      }));
      if (!gate.allowed) {
        throw Object.assign(new Error(gate.message), { code: gate.code });
      }

      // CODE-LEVEL SEND GUARD (Task 7 — audit remediation). Defense-in-depth:
      // even if the gate above was somehow bypassed or a stale UI state persisted,
      // this hard assertion ensures no unverified asset can sign. Only assets with
      // status === LIVE may send — period. This is a wallet-core–layer invariant.
      if (!canSend(selectedAsset)) {
        throw new Error(
          `[Security] Send blocked: ${selectedAsset.symbol} status is "${selectedAsset.status}". ` +
          `Only verified LIVE assets may send. This is a code-level safety assertion.`
        );
      }

      // NOTE: the HD-account lookup that main did here is intentionally NOT hoisted —
      // it is EVM-only (matches selectedWallet.address against an EVM account) and now
      // lives inside the EVM branch of the family dispatch below. Hoisting it would
      // throw "not in the unlocked HD set" for BTC/SOL, whose address is not an EVM
      // account.

      // I3 hardware-send gate (#972 P1, codex round 2). The old hw/trezor.js
      // module's requireWebUsb() gated ALL three device paths (EVM/BTC/SOL) on
      // isDeniabilitySessionActive() — throwing TREZOR_DENIABILITY_BLOCKED before
      // any RPC or device call. My earlier hotfix restored that gate inside
      // hw-send.js's public entrypoints, but the caller pre-computes a fee-clamp
      // (getFeeData for EVM) / a UTXO+blockhash preflight (BTC/SOL) BEFORE reaching
      // those helpers — leaking one RPC round-trip. Under decoy/hidden with a
      // Trezor connected the device holds the REAL seed regardless of session
      // type, so any egress here is an I3 violation AND a coercion-exfil vector.
      // One gate above the family dispatch catches all three Trezor branches;
      // software-key sends are UNAFFECTED (decoy has its own decoy vault, that
      // path is legitimate). Error string matches hw-send.js exactly so downstream
      // catch-by-message keeps working. Demo-mode check mirrors hw/trezor.js's
      // deniabilityActive() — a demo build (VITE_DEMO_MODE / veyrnox-demo=1)
      // must never touch a real Trezor device or leak fee/nonce RPC (codex
      // round-2 finding, #972 P1b).
      // Use the LIVE deniability-OR-demo check (round-3 codex finding): the
      // module-level DEMO constant is a load-time IIFE snapshot, so a
      // veyrnox-demo=1 flag flipped AFTER import wouldn't fire this gate. The
      // shared helper reads both signals fresh on every call.
      if (useTrezorMode && (isDeniabilityOrDemoActive() || DEMO)) {
        throw new Error('TREZOR_DENIABILITY_BLOCKED');
      }

      // Sign LOCALLY and broadcast. The signing key is transient and never
      // persisted. Branch on the asset family — each has its own derivation/
      // signing stack and send function; the human-entered `amount` is converted
      // to that chain's integer base unit (sats / lamports / wei) for signing.
      let raw;
      if (isBtc) {
        if (useTrezorMode) {
          if (!trezorConnected) throw new Error('Trezor not connected');
          if (!trezorBtcAddress) throw new Error('Trezor BTC address not available');
          // BTC Trezor path: the key never leaves the device (I1). Build a
          // coin-selection plan against the Trezor-derived address (it owns the
          // UTXOs and receives change), translate it into the device's input/
          // output shape, sign on-device, then broadcast the signed bytes.
          const amountSats = toBaseUnits(amount, 8);
          const { plan } = await estimateBtcSend({
            networkKey,
            fromAddress: trezorBtcAddress,
            toAddress,
            amountSats,
            changeAddress: trezorBtcAddress,
          });
          // coinselect plan -> @trezor/connect signTransaction shape. Recipient
          // outputs use { address, amountSats }; the change output (isChange) is
          // collapsed into changeAmountSats so the device derives + pays-to-self.
          const changeOut = plan.outputs.find((o) => o.isChange);
          const trezorPlan = {
            inputs: plan.inputs.map((i) => ({ txid: i.txid, vout: i.vout, amountSats: BigInt(i.value) })),
            outputs: plan.outputs
              .filter((o) => !o.isChange)
              .map((o) => ({ address: o.address, amountSats: BigInt(o.value) })),
            changeAmountSats: changeOut ? BigInt(changeOut.value) : 0n,
          };
          const signedHex = await trezorSignBtcTx({ plan: trezorPlan, networkKey });
          raw = await broadcastBtcTx(networkKey, signedHex);
        } else {
          // BTC (BIP-84 P2WPKH). Auto fee-rate this slice (no fee UI). BTC -> sats.
          raw = await withBtcPrivateKey(({ privateKey, publicKey, address }) =>
            signAndBroadcastBtc({
              networkKey,
              privateKey,
              publicKey,
              fromAddress: address,
              toAddress,
              amountSats: toBaseUnits(amount, 8),
            })
          );
        }
      } else if (isSolana) {
        if (useTrezorMode) {
          if (!trezorConnected) throw new Error('Trezor not connected');
          if (!trezorSolAddress) throw new Error('Trezor SOL address not available');
          // SOL Trezor path: the key never leaves the device (I1). Build the
          // unsigned transfer (fresh blockhash via the network provider), sign it
          // on-device, reattach the device signature, then broadcast.
          const lamports = toBaseUnits(amount, 9);
          const { unsignedTxBase64 } = await buildUnsignedSolTx({
            fromAddress: trezorSolAddress,
            toAddress,
            lamports,
            networkKey,
          });
          const signatureHex = await trezorSignSolTx({ serializedTxBase64: unsignedTxBase64 });
          const signedTxBase64 = attachSolSignature(unsignedTxBase64, trezorSolAddress, signatureHex);
          raw = await broadcastSignedSolTx(signedTxBase64, networkKey);
        } else {
          // SOL (ed25519). Base fee only this slice (no priority UI). SOL -> lamports.
          raw = await withSolPrivateKey(({ privateKey, address }) =>
            signAndBroadcastSol({
              networkKey,
              privateKey,
              fromAddress: address,
              toAddress,
              amountLamports: toBaseUnits(amount, 9),
            })
          );
        }
      } else {
        // EVM native + ERC-20.
        if (useTrezorMode) {
          if (!trezorConnected) throw new Error('Trezor not connected');
          // Fee-clamp still lives here (NOT inside hw-send.js): the merge of
          // selectedFee with the provider's fee-data fallback is a UI concern,
          // and the F-08-TREZOR / L-2 caps must apply BEFORE the fee crosses the
          // wallet-core boundary. We pre-compute the clamped values, then pass
          // them into the audited helper via a normal { ...Wei } fee object so
          // the exact clamped numbers are what get signed.
          const provider = getProvider(networkKey);
          const feeData = await provider.getFeeData();
          const fee = selectedFee?.fee || undefined;
          const rawMaxFeePerGas = fee?.maxFeePerGas ?? feeData.maxFeePerGas ?? feeData.gasPrice;
          // F-08-TREZOR (I5: RPC untrusted): clamp maxFeePerGas to the same
          // per-network ceiling the regular tier maths uses, so a misreporting
          // provider can't inflate the fee on a hardware signer that only shows
          // raw values. Fall back to the highest cap if the network key is unknown.
          const feeCapGwei = MAX_BASE_FEE_GWEI[networkKey] ?? 5_000n;
          const maxFeePerGasCap = feeCapGwei * 1_000_000_000n;
          const cappedMaxFeePerGas = rawMaxFeePerGas != null && rawMaxFeePerGas > maxFeePerGasCap
            ? maxFeePerGasCap
            : rawMaxFeePerGas;
          // L-2 (I5: RPC untrusted): clamp the priority fee against the already-
          // capped maxFeePerGas via the shared pure helper, so a misreporting
          // provider can't pin an implausibly large tip on a hardware signer.
          const clampedPriorityFee = resolveMaxPriorityFeePerGas(
            fee?.maxPriorityFeePerGas ?? feeData.maxPriorityFeePerGas ?? 0n,
            cappedMaxFeePerGas,
          );
          // Shape the clamped values into the { ...Wei } fee object hw-send.js
          // expects (evmFeeOverrides). gasLimit is intentionally omitted — the
          // helper estimates + applies +20% headroom (issue #961: replaces the
          // old hardcoded 21000n/65000n that broke L2 native + USDT transfers).
          //
          // TODO(#972 P2a): the confirmation screen's displayed fee is computed
          // from the tier hint's 21000/65000 gasLimit, but the signed tx uses
          // estimateGas + 20%. The Trezor device screen shows the actual value
          // (so a careful user can catch the divergence) but in-app numbers and
          // signed numbers diverge. Fix requires resolving gasLimit BEFORE the
          // confirm screen renders and threading it through both the display and
          // the signed tx. Deferred from the #972 hotfix — see follow-up.
          const clampedFee = (cappedMaxFeePerGas != null)
            ? {
                maxFeePerGasWei: cappedMaxFeePerGas.toString(),
                maxPriorityFeePerGasWei: clampedPriorityFee.toString(),
              }
            : undefined;
          if (isErc20) {
            raw = await signAndBroadcastEvmTrezorToken({
              networkKey,
              fromAddress: trezorEvmAddress,
              symbol: selectedAsset.symbol,
              to: toAddress,
              amount,
              fee: clampedFee,
            });
          } else {
            raw = await signAndBroadcastEvmTrezor({
              networkKey,
              fromAddress: trezorEvmAddress,
              to: toAddress,
              amountEth: amount,
              fee: clampedFee,
            });
          }
        } else {
          // Map the wallet to its HD derivation index (public address match).
          // The user-selected EIP-1559 fee flows straight into the signing call;
          // null falls back to ethers' auto-fill (never blocks send).
          const acct = accounts.find(a => a.address.toLowerCase() === selectedWallet.address.toLowerCase());
          if (!acct) throw new Error("Selected wallet is not in the unlocked HD set");
          const fee = selectedFee?.fee || undefined;
          raw = await withPrivateKey(acct.index, (privateKey) =>
            isErc20
              ? sendToken({ networkKey, privateKey, symbol: selectedAsset.symbol, to: toAddress, amount, fee })
              : signAndBroadcast({ networkKey, privateKey, to: toAddress, amountEth: amount, fee })
          );
        }
      }

      // Normalize each family's distinct result shape to one record shape.
      const { hash, explorerUrl } = normalizeSendResult(family, raw);

      // Record the REAL chain hash/signature as 'pending'. Do NOT write balances —
      // the chain is the source of truth and is read live elsewhere.
      await base44.entities.Transaction.create({
        wallet_id: walletId,
        type: "send",
        amount: parseFloat(amount),
        currency: selectedWallet.currency,
        to_address: toAddress,
        from_address: selectedWallet.address,
        status: "pending",
        tx_hash: hash,            // REAL chain txid / signature
        explorer_url: explorerUrl,
        note,
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
          toast("Couldn't confirm this transaction on the network yet — it may still be pending. Check the explorer.");
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        // BTC/SOL: no 1-conf callback, so notify immediately on broadcast (fire-and-forget, I4).
        notifySendConfirmed({ amount: `${amount} ${selectedWallet.currency}`, to: toAddress, ts: Date.now() });
      }

      return { hash, explorerUrl };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["evm-balance", networkKey, selectedWallet?.address] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setTxResult(result);
      setStep("done");
      recordAudit("send_completed"); // opt-in audit log; no-op unless enabled + primary session
    },
    onError: (err) => {
      // When the network send fails AFTER 2FA was consumed, the gate throws
      // TWO_FACTOR (twoFactorVerifiedRef was already cleared — one-shot, secure).
      // Instead of a dead-end toast, re-show the TwoFactorGate so the user can
      // re-authorise without having to tap Back → Continue manually.
      // Security: twoFactorVerifiedRef.current is already false at this point
      // (cleared at line 724 before the gate ran); we are only changing which
      // UI step is rendered, not relaxing any security check.
      if (/** @type {Error & {code?: string}} */ (err)?.code === SEND_GATE.TWO_FACTOR) {
        setStep("verify");
        return;
      }
      toast.error(err?.message || "Send failed");
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
        setReauthError("Verification unavailable — please re-lock and unlock the wallet.");
        return;
      }
      if (result.ok) {
        setReauthValue("");
        sendTx.mutate();
        return;
      }
      const n = reauthAttempts + 1;
      setReauthAttempts(n);
      setReauthValue("");
      if (n >= REAUTH_CAP) {
        lock();
        return;
      }
      setReauthError(`Incorrect — try again (${REAUTH_CAP - n} left)`);
    } finally {
      setReauthPending(false);
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
      onSendAnother={() => { setStep("form"); setAmount(""); setToAddress(""); setNote(""); setTxResult(null); setReauthAttempts(0); }}
    />;
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      {fromDetail && <BackButton />}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Send Crypto</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Transfer funds securely</p>
      </div>

      <div className="space-y-4 p-5 rounded-xl border border-border bg-card">
        {fromDetail ? (
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <CoinLogo symbol={assetSymbol} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{getAsset(assetSymbol)?.name || assetSymbol}</p>
              <p className="text-xs text-muted-foreground">{selectedWalletName || "Wallet"}</p>
            </div>
            <div className="text-right shrink-0">
              {demoActive ? (
                <>
                  <p className="text-sm font-semibold mono-value">{demoBalance ?? "—"} {assetSymbol}</p>
                  {sendUsdRate && demoBalance != null && (
                    <p className="text-xs text-muted-foreground">${(demoBalance * sendUsdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  )}
                </>
              ) : liveBalance != null ? (
                <>
                  <p className="text-sm font-semibold mono-value">{liveBalance} {assetSymbol}</p>
                  {sendUsdRate && (
                    <p className="text-xs text-muted-foreground">${(parseFloat(liveBalance) * sendUsdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">reading…</p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div>
              <Label id="send-wallet-label">From Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="mt-1.5" aria-labelledby="send-wallet-label">
                  <SelectValue placeholder="Select wallet">
                    {selectedWalletName ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-gradient-to-br from-[#4ADAC2] via-[#A78BFA] to-[#F472B6] shadow-[0_0_6px_rgba(74,218,194,0.5)]">
                          <Wallet className="h-3 w-3 text-white drop-shadow-sm" />
                        </span>
                        {selectedWalletName}
                      </span>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {wallets.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-gradient-to-br from-[#4ADAC2] via-[#A78BFA] to-[#F472B6] shadow-[0_0_6px_rgba(74,218,194,0.5)]">
                          <Wallet className="h-3 w-3 text-white drop-shadow-sm" />
                        </span>
                        <span>{w.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label id="send-asset-label">Asset</Label>
              <Select value={assetSymbol} onValueChange={setAssetSymbol} disabled={/** @type {any} */ (!walletId)}>
                <SelectTrigger className="mt-1.5 h-12 [&>span]:flex [&>span]:items-center [&>span]:gap-3" aria-labelledby="send-asset-label">
                  <SelectValue placeholder="Select asset">
                    {assetSymbol ? (
                      <>
                        <CoinLogo symbol={assetSymbol} size={32} />
                        <span>{getAsset(assetSymbol)?.name || assetSymbol} — {assetSymbol}</span>
                      </>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {enabledAssets.map(sym => {
                    const a = getAsset(sym);
                    return (
                      <SelectItem key={sym} value={sym}>
                        <div className="flex items-center gap-2">
                          <CoinLogo symbol={sym} size={20} />
                          <span>{a?.name || sym} — {sym}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div>
          <Label htmlFor="send-recipient">Send to (address or name)</Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              id="send-recipient"
              value={ensName || toAddress}
              onChange={e => { const v = e.target.value; if (v.endsWith(".eth") || v.endsWith(".sol")) { setEnsName(v); setToAddress(""); setEnsResolved(null); } else { setEnsName(""); setToAddress(v); setEnsResolved(null); } }}
              onBlur={e => resolveENS(e.target.value)}
              placeholder="Paste an address or enter a name (e.g. vitalik.eth)"
              className={`mono-value text-sm ${!addressFormatValid ? 'border-destructive' : ''}`}
            />
            {ensResolving && <Loader2 className="h-4 w-4 animate-spin self-center shrink-0 text-muted-foreground" />}
            <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label="Scan QR code" title="Scan QR code" onClick={() => setShowScanner(true)}>
              <ScanLine className="h-4 w-4" />
            </Button>
          </div>
          {ensResolving && (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" /> Resolving name…
            </p>
          )}
          {!ensResolving && ensName && !ensResolved && !toAddress && (
            <p className="text-xs text-destructive mt-1.5 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" /> Name not found — check the spelling or paste the address directly.
            </p>
          )}
          {ensResolved && (
            toAddress === ensResolved.address ? (
              // Confirmed: the user accepted the resolved address as the recipient.
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-success">
                <CheckCircle2 className="h-3 w-3 shrink-0" /> Using {ensResolved.name} → <span className="mono-value break-all">{ensResolved.address}</span>
              </div>
            ) : (
              // M-3: resolved via an untrusted third-party service — require an
              // explicit confirmation before it becomes the signing target.
              <div className="mt-1.5 p-2.5 rounded-lg bg-caution/10 border border-caution/20 text-[11px] text-caution space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    <b>{ensResolved.name}</b> looked up privately on the blockchain to:
                    <br /><span className="mono-value break-all text-foreground">{ensResolved.address}</span>
                    <br />Confirm this address is correct before sending.
                  </span>
                </div>
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setToAddress(ensResolved.address)}>
                  Use this address
                </Button>
              </div>
            )
          )}
        </div>

        {(toAddress || showErrors) && !addressFormatValid && (
          <p className="text-xs text-destructive flex items-center gap-1.5 -mt-2">
            <AlertTriangle className="h-3 w-3" />
            {toAddress ? `Invalid ${selectedWallet?.currency} address format` : "Recipient address is required"}
          </p>
        )}
        {toAddress && addressFormatValid && !isAddressWhitelisted && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-caution/10 border border-caution/30 -mt-2">
            <AlertTriangle className="h-3.5 w-3.5 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-caution">This address is not on your whitelist. Double-check before proceeding. You can add trusted addresses in Settings.</p>
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
              You're sending to your own wallet address. This moves nothing between wallets and still costs a network fee. Double-check the recipient before continuing.
            </p>
          </div>
        )}

        {/* Address-poisoning / look-alike warning (local screen against history). */}
        {toAddress && addressFormatValid && (
          <div className="-mt-2"><PoisonWarning screen={poisonScreen} /></div>
        )}

        {/* Local-first screening disclosure + the off-by-default remote opt-in.
            Only relevant for EVM recipients (the look-alike screen targets EVM
            addresses). The DEMO helper makes the warning trivially reproducible. */}
        {selectedWallet && (isEvmFamily(selectedAsset) || isErc20) && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border -mt-2">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground space-y-1.5 flex-1 min-w-0">
              <p>Recipients are <span className="font-medium">checked on your device</span> for scam addresses against your own history — nothing leaves your device.</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={remoteScreen} onChange={e => toggleRemoteScreen(e.target.checked)} />
                <span>Also screen against an online threat database <span className="text-destructive/80">(sends this address to a third party)</span></span>
              </label>
              {remoteScreen && (
                <p className="text-destructive/80">Online screening is enabled, but no provider is configured in this build — screening stays local, so we couldn't verify this against an external list.</p>
              )}
              {DEMO && (
                <button type="button" onClick={() => { setEnsName(""); setEnsResolved(null); setToAddress(DEMO_POISON_ADDRESS); }} className="underline hover:text-foreground">
                  Demo: paste a look-alike address
                </button>
              )}
            </div>
          </div>
        )}
        {/* Transaction Simulation / Screening — toggle visible in both demo and
            live mode. In demo the panel body shows representative risk samples;
            in live mode it shows the feature teaser (real sim runs at verify). */}
        {step === "form" && (
          <div className={`space-y-2.5 p-3 rounded-xl border border-dashed ${simEnabled ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Activity className={`h-3.5 w-3.5 ${simEnabled ? "text-primary" : "text-muted-foreground"}`} />
                Transaction Simulation
              </p>
              <Switch
                id="sim-toggle"
                checked={simEnabled}
                onCheckedChange={toggleSim}
                aria-label="Toggle transaction simulation"
              />
            </div>
            {simEnabled && (
              DEMO ? <TransactionSimulationDemo /> : (
                <>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Before you sign, we run a local pre-flight check — no third-party
                    services, no data leaves your device.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Address risk (poison / lookalike)",
                      "Contract decode",
                      "Unlimited approval flag",
                      "Revert prediction",
                      "Anomaly vs your history",
                      "Large outflow warning",
                    ].map((label) => (
                      <span
                        key={label}
                        className="text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Results appear at the next step once you enter an address and amount.
                  </p>
                </>
              )
            )}
            {!simEnabled && (
              <p className="text-[11px] text-muted-foreground">
                Simulation is off — no pre-flight check will run before signing.
              </p>
            )}
          </div>
        )}

        {showScanner && (
          <QRScanner
            onScan={(value) => { setToAddress(value); setShowScanner(false); }}
            onClose={() => setShowScanner(false)}
          />
        )}
        <div>
          <Label htmlFor="send-amount">Amount</Label>
          <Input id="send-amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-1.5 mono-value" />
          {amountUsd != null && (
            <p className="text-xs text-muted-foreground mt-1"><span className="mono-value">{approxUsd(amountUsd)}</span> being sent</p>
          )}
          {selectedWallet && (
            <p className="text-xs text-muted-foreground mt-1">
              {demoActive
                ? <>Balance: <span className="mono-value">{demoBalance} {selectedWallet.currency}</span> <span className="text-[10px]">(demo)</span></>
                : flowSendEnabled
                  ? <>Balance: {nativeLiveBalance != null ? <span className="mono-value">{nativeLiveBalance} {selectedWallet.currency}</span> : "reading from network…"} <span className="text-[10px]">(live)</span></>
                  : <>Balance: <span className="mono-value">{selectedWallet.balance} {selectedWallet.currency}</span></>}
              {balanceUsd != null && <> · <span className="mono-value">{approxUsd(balanceUsd)}</span></>}
            </p>
          )}
          {(amount || showErrors) && Number.isFinite(amountNum) && amountNum <= 0 && (
            <p className="text-xs text-destructive mt-1">
              {amount ? "Amount must be greater than zero" : "Amount is required"}
            </p>
          )}
          {balanceKnown && amount && Number.isFinite(amountNum) && amountNum > 0 && amountNum > effectiveBalance && (
            <p className="text-xs text-destructive mt-1">Insufficient balance</p>
          )}
          {(amountUsd != null || balanceUsd != null) && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{USD_REFERENCE_NOTE}</p>
          )}
        </div>

        {selectedWallet && !sendEnabled && !devUngated && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">Sending is not yet enabled for {selectedWallet.currency}. This asset is receive-only until its crypto path is verified.</p>
          </div>
        )}
        {selectedWallet && !sendEnabled && devUngated && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-caution/10 border border-caution/40">
            <AlertTriangle className="h-3.5 w-3.5 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-caution">
              <strong>DEV UNGATE ACTIVE</strong> — the send gate is bypassed for {selectedWallet.currency} via VITE_DEV_UNGATE_SEND (dev build only). This asset's status is unchanged (still <strong>not</strong> live); mainnet remains gated. Testnet verification only — never ship this build.
            </p>
          </div>
        )}
        {selectedWallet && flowSendEnabled && !isUnlocked && !demoActive && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-caution/10 border border-caution/30">
            <Lock className="h-3.5 w-3.5 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-caution">Your wallet is locked. Unlock it in Wallet Settings to sign and send.</p>
          </div>
        )}
        <div>
          <Label htmlFor="send-note">Note (optional)</Label>
          <Input id="send-note" value={note} onChange={e => setNote(e.target.value)} placeholder="What's this for?" className="mt-1.5" />
        </div>

        {/* Spend-limit breach — explicit, specific message. Per-transaction AND
            daily caps from Security Center, both now enforced (see lib/txLimits.js).
            "Sent today" is summed from local tx history; nothing leaves the device. */}
        {limitEval.blocked && parseFloat(amount) > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/40">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-destructive space-y-1 min-w-0">
              <p className="font-semibold">This send exceeds the spending limit you set</p>
              {limitEval.reasons.map((r, i) => (
                <p key={i} className="text-destructive/90">
                  {r.kind === "per_tx"
                    ? `This send (${approxUsd(limitEval.amountUSD)}) exceeds your ${r.currency === "ALL" ? "" : r.currency + " "}per-transaction cap of $${r.limitUSD.toLocaleString()}.`
                    : `You've already sent ${approxUsd(r.spentTodayUSD)} today; this send (${approxUsd(limitEval.amountUSD)}) would reach ${approxUsd(r.projectedUSD)}, over your ${r.currency === "ALL" ? "" : r.currency + " "}daily cap of $${r.limitUSD.toLocaleString()}.`}
                </p>
              ))}
              <p className="text-destructive/70">Adjust the amount, or change the limit in Security Center.</p>
              <label className="flex items-start gap-2 text-destructive cursor-pointer pt-0.5">
                <input type="checkbox" checked={limitAck} onChange={e => setLimitAck(e.target.checked)} className="mt-0.5" />
                I understand this exceeds my limit — send anyway.
              </label>
            </div>
          </div>
        )}

        {/* Insufficient balance — explains the disabled Send button. The same
            `amount > effectiveBalance` condition already gates the button below;
            without this the button just greys out with no reason (audit: the
            over-balance case had no user feedback). */}
        {balanceKnown && parseFloat(amount) > 0 && parseFloat(amount) > effectiveBalance && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/40">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive min-w-0">
              <span className="font-semibold">Insufficient balance.</span>{" "}
              You have {effectiveBalance} {selectedWallet?.currency} available to send (after the
              network fee). Reduce the amount to continue.
            </p>
          </div>
        )}

        {/* TREZOR SIGNING TOGGLE */}
        {trezorPlatform === 'unsupported' && useTrezorMode && <TrezorUnsupportedScreen />}
        {trezorPlatform !== 'unsupported' && (
          <div className="flex items-center gap-3 my-4">
            <label className="flex items-center gap-2 text-muted-foreground text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useTrezorMode}
                onChange={(e) => { setUseTrezorMode(e.target.checked); if (e.target.checked && !trezorConnected) setTrezorModalOpen(true); }}
                className="accent-primary"
              />
              Sign with Trezor
            </label>
            {useTrezorMode && trezorConnected && <span className="text-primary text-xs">✓ Device connected</span>}
            {useTrezorMode && !trezorConnected && (
              <button onClick={() => setTrezorModalOpen(true)} className="bg-transparent border-none text-primary text-xs cursor-pointer underline">
                Connect device
              </button>
            )}
          </div>
        )}
        <TrezorConnectModal open={trezorModalOpen} onClose={() => setTrezorModalOpen(false)} onConnected={() => setTrezorModalOpen(false)} btcNetworkKey={networkKey === 'btc-mainnet' ? 'btc-mainnet' : 'btc-testnet'} />

        {step === "form" && (
          <Button
            className={`w-full ${(!toAddress || !isFormAmountWellFormed(amount) || !addressFormatValid || (balanceKnown && parseFloat(amount) > effectiveBalance) || (limitEval.blocked && !limitAck)) ? "opacity-70" : ""}`}
            disabled={!walletId || !assetSymbol || !flowSendEnabled || (flowSendEnabled && !isUnlocked && !demoActive)}
            onClick={() => {
              const invalid = !toAddress || !isFormAmountWellFormed(amount) || !addressFormatValid
                || (balanceKnown && parseFloat(amount) > effectiveBalance)
                || (limitEval.blocked && !limitAck);
              if (invalid) { setShowErrors(true); return; }
              setShowErrors(false);
              setStep("verify");
            }}
          >
            <ArrowUpRight className="h-4 w-4 mr-1.5" />
            Continue
          </Button>
        )}

        {step === "verify" && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
              <p className="text-xs text-muted-foreground mb-1">You're sending</p>
              <p className="text-lg font-bold mono-value">{amount} {selectedWallet?.currency}</p>
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
                      <span>I understand and want to proceed anyway.</span>
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <RiskVerdictBanner verdict={riskVerdict} acknowledged={riskAck} onAcknowledge={setRiskAck} pending={riskPending} />
            )}

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
                Verify with biometrics to proceed
              </button>
            )}


            {/* Hint: one-tap escape while the risk check is still running. */}
            {riskPending && simEnabled && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-dashed border-border bg-card">
                <p className="text-[11px] text-muted-foreground">Taking too long?</p>
                <button
                  type="button"
                  onClick={() => toggleSim(false)}
                  className="text-[11px] font-medium text-primary underline underline-offset-2 whitespace-nowrap"
                >
                  Turn off simulation
                </button>
              </div>
            )}

            {/* PRE-SIGN SIMULATION — predicted balance changes, decoded call, and
                KNOWN risk flags, dry-run against your own RPC before you confirm.
                Local-only; warns, never blocks; never claims "safe". */}
            {(isEvmFamily(selectedAsset) || isErc20) && (
              <TransactionPreview result={txSim.data} loading={txSim.isFetching && !txSim.data} error={txSim.error} />
            )}
            {/* BTC preview (H-1/M-2): the exact decoded tx + fee before signing. */}
            {isBtc && (
              <TransactionPreview result={btcSim.data} loading={btcSim.isFetching && !btcSim.data} error={btcSim.error} />
            )}
            {/* BTC risk gate (M-2): a high-severity decode flag (e.g. sends all inputs /
                no change) must be explicitly acknowledged before Confirm & Send. */}
            {btcRiskHigh && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/40 space-y-2">
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {(btcSim.data?.risks || []).find((r) => r.level === "high")?.detail || "This transaction has a high-severity warning."}
                </p>
                <label className="flex items-start gap-2 text-xs text-destructive cursor-pointer">
                  <input type="checkbox" checked={btcRiskAck} onChange={e => setBtcRiskAck(e.target.checked)} className="mt-0.5" />
                  I understand this warning and want to send anyway.
                </label>
              </div>
            )}

            {/* Decoded calldata for ERC-20 sends — show EXACTLY what will be
                signed before any signature (anti-blind-signing control). */}
            {isErc20 && tokenCalldata && (
              <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-2">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> What this transaction does
                </p>
                {tokenCalldata.kind === "transfer" && (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Action</span><span className="mono-value font-semibold">Send tokens</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Token</span><span className="font-semibold">{tokenCalldata.tokenSymbol}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Amount</span><span className="mono-value font-semibold">{tokenCalldata.amount} {tokenCalldata.tokenSymbol}</span></div>
                    <div className="flex justify-between gap-2 min-w-0"><span className="text-muted-foreground shrink-0">Recipient</span><span className="mono-value break-all">{tokenCalldata.to}</span></div>
                  </div>
                )}
                {tokenCalldata.kind === "approve" && (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Action</span><span className="mono-value font-semibold">Grant spending permission</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Token</span><span className="font-semibold">{tokenCalldata.tokenSymbol}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Permission</span><span className={`mono-value font-semibold ${tokenCalldata.unlimited ? "text-destructive" : ""}`}>{tokenCalldata.unlimited ? "Unlimited (this app can spend any amount)" : tokenCalldata.amount}</span></div>
                    <div className="flex justify-between gap-2 min-w-0"><span className="text-muted-foreground shrink-0">Spender</span><span className="mono-value break-all">{tokenCalldata.spender}</span></div>
                  </div>
                )}
                {tokenCalldata.kind === "unknown" && (
                  <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Unknown transaction — only confirm if you know what you're signing.</p>
                )}
                {/* Gas is always paid in the chain's native coin, even for tokens —
                    and that coin is NOT always ETH (Phase C). Read it per-chain. */}
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1 border-t border-border/60">
                  <Fuel className="h-3 w-3 shrink-0" /> Network fee is paid in {nativeSymbol} ({networkName}) — you need {nativeSymbol} to cover the network fee even when sending {tokenCalldata.tokenSymbol || selectedWallet?.currency}.
                </p>
              </div>
            )}

            {/* Unlimited-approval red warning + required extra confirmation. */}
            {tokenCalldata?.kind === "approve" && tokenCalldata.unlimited && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/40 space-y-2">
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {tokenCalldata.warning}
                </p>
                <label className="flex items-start gap-2 text-xs text-destructive cursor-pointer">
                  <input type="checkbox" checked={approvalAck} onChange={e => setApprovalAck(e.target.checked)} className="mt-0.5" />
                  I understand this grants UNLIMITED spending and I trust this contract.
                </label>
              </div>
            )}

            {/* Per-chain fee control. The EVM send path is EIP-1559; the chosen
                tier/custom fee is passed into signAndBroadcast/sendToken. BTC/SOL
                use an automatic fee this slice (no selector).
                I3 hardware gate (#972 round-2 P1a, codex): FeeSelector's
                react-query fires estimateEvmFeeTiers() → provider.getFeeData() on
                mount, with no deniability enabled clause. Under useTrezorMode +
                decoy/hidden/demo the Trezor address is the REAL hardware address,
                so that unguarded RPC leaks the real address to the fee provider.
                Skip the selector in that combination — the send-time gate above
                will refuse anyway, so a fee tier serves no purpose. */}
            {!isBtc && !isSolana && !(useTrezorMode && (isDeniabilityOrDemoActive() || DEMO)) ? (
              <FeeSelector
                chain="evm"
                networkKey={networkKey}
                symbol={nativeSymbol}
                decimals={activeNetwork?.decimals ?? 18}
                usdRate={USD_RATES[nativeSymbol] ?? USD_RATES[selectedWallet?.currency]}
                gasLimitHint={isErc20 ? 65000 : 21000}
                onChange={setSelectedFee}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Fuel className="h-3 w-3 shrink-0" /> Network fee is set automatically for {selectedWallet?.currency} ({networkName}).
              </p>
            )}
            {/* The fee's fiat estimate (and the spend-cap previews) convert via
                the static USD_RATES table, so disclose it's a reference rate. */}
            <ReferenceRateNote className="text-center" />

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
                    title={send2faMethod === SEND_2FA.BIOMETRIC ? "Authorise this send with your PIN + biometrics" : send2faMethod === SEND_2FA.PASSKEY ? "Authorise this send with your PIN + passkey" : "Authorise this send with your PIN + Action Password"}
                    onCancel={() => { setStep("form"); resetVerify(); }}
                    onLock={lock}
                    onSuccess={() => { twoFactorVerifiedRef.current = true; sendTx.mutate(); }}
                    verify={async ({ pin, password }) => {
                      if (send2faMethod === SEND_2FA.BIOMETRIC) {
                        // BIOMETRIC mode: the user is already unlocked (vault open = PIN proved).
                        // TwoFactorGate shows NO PIN field in this mode — the step-up is Face ID only.
                        // pinOk is treated as true (unlock = first-factor already satisfied).
                        // FAIL CLOSED (I4) — any cancel/no-match/error counts as NOT verified.
                        let bioOk = false;
                        try { bioOk = (await verifyBiometric2fa()) === true; } catch { bioOk = false; }
                        // BIOMETRIC is a possession factor (not the Action Password); the
                        // second factor here is the live biometric, so this leg is
                        // configured-by-construction (send2faMethod already resolved to
                        // BIOMETRIC). Keep the gate's third input honest at `true` only
                        // for this non-AP method.
                        return evaluateTwoFactor({ pinOk: true, passwordOk: bioOk, actionPasswordConfigured: true });
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
              const reauthRequired = !DEMO && isSendReauthRequired();
              if (!reauthRequired) {
                return (
                  <Button
                    className="w-full gap-2"
                    disabled={blockedByApproval || blockedByRisk || blockedByRaspBio || blockedByBtcRisk || sendTx.isPending}
                    onClick={() => {
                      // Re-check freshness at click time (isSendReauthRequired reads a ref, always
                      // current). If the window lapsed while idle on this screen, force a re-render so
                      // the block below switches to the step-up prompt instead of sending.
                      if (!DEMO && isSendReauthRequired()) { setReauthTick((t) => t + 1); return; }
                      sendTx.mutate();
                    }}
                  >
                    {sendTx.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                    Confirm &amp; Send
                  </Button>
                );
              }
              const authModel = getAuthModel();
              return (
                <div className="space-y-3">
                  <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-widest">
                    Re-enter your {authModel === "pin" ? "PIN" : "password"} to authorise
                  </p>
                  {reauthError && <p role="alert" className="text-xs text-center text-destructive">{reauthError}</p>}
                  {authModel === "pin" ? (
                    <PinPad
                      value={reauthValue}
                      onChange={setReauthValue}
                      onComplete={submitReauth}
                      disabled={reauthPending || sendTx.isPending || blockedByApproval || blockedByRisk || blockedByRaspBio || blockedByBtcRisk}
                      submitLabel="Authorise"
                    />
                  ) : (
                    <>
                      <PasswordInput
                        value={reauthValue}
                        onChange={(e) => setReauthValue(e.target.value)}
                        placeholder="Vault password"
                        aria-label="Vault password for send authorisation"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter" && reauthValue && !reauthPending) submitReauth(reauthValue); }}
                      />
                      <Button
                        className="w-full gap-2"
                        disabled={!reauthValue || reauthPending || sendTx.isPending || blockedByApproval || blockedByRisk || blockedByRaspBio || blockedByBtcRisk}
                        onClick={() => submitReauth(reauthValue)}
                      >
                        {reauthPending || sendTx.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                        Authorise &amp; Send
                      </Button>
                    </>
                  )}
                </div>
              );
            })()}

            <Button variant="ghost" className="w-full" onClick={() => { setStep("form"); resetVerify(); }}>Back</Button>
          </div>
        )}
      </div>
    </div>
  );
}