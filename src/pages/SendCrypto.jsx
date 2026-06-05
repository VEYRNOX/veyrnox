import { USD_RATES } from "@/lib/cryptos";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44, EMAIL_AVAILABLE } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, Fingerprint, Loader2, CheckCircle2, ScanLine, Mail, ShieldCheck, ShieldAlert, KeyRound, RefreshCw, AlertTriangle, ExternalLink, Lock, FileText, Fuel } from "lucide-react";
import QRScanner from "../components/QRScanner";
import FeeSelector from "@/components/FeeSelector";
import CoinLogo from "@/components/CoinLogo";
import TransactionPreview from "@/components/TransactionPreview";
import TransactionSimulationDemo from "@/components/TransactionSimulationDemo";
import { toast } from "sonner";
import { parseEther } from "ethers";
import { useWallet } from "@/lib/WalletProvider";
import { signAndBroadcast } from "@/wallet-core/evm/send";
import { getBalanceEth } from "@/wallet-core/evm/provider";
import { getAsset, canSend, canReceive, isEvmFamily } from "@/wallet-core/assets";
import { getNetworkInfo } from "@/wallet-core/evm/networks";
import { sendToken, buildTokenTransfer, getTokenBalance } from "@/wallet-core/evm/token-send";
import { describeErc20Call } from "@/wallet-core/evm/calldata";
import { simulateEvmTransaction } from "@/wallet-core/evm/simulate";
import { getToken } from "@/wallet-core/evm/tokens";
import { screenRecipient } from "@/wallet-core/evm/poison";
import { isValidAddressForCurrency } from "@/lib/addressValidation";
import { evaluateSendAgainstLimits } from "@/lib/txLimits";
import { DEMO, DEMO_POISON_ADDRESS } from "@/api/demoClient";

// Address-poisoning / look-alike warning. INFORMS, never blocks; never asserts an
// address is safe — only that it resembles one the user has used before and
// couldn't be verified. Renders nothing unless the local screen is suspicious.
function PoisonWarning({ screen }) {
  if (!screen?.suspicious) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/40">
      <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <div className="text-xs text-destructive space-y-1.5 min-w-0">
        <p className="font-semibold">Possible address-poisoning — check the FULL address</p>
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
            <p className="font-mono break-all">{m.address}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SendCrypto() {
  const queryClient = useQueryClient();
  const { isUnlocked, accounts, withPrivateKey } = useWallet();
  const [walletId, setWalletId] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState("form"); // form | verify | done
  const [showScanner, setShowScanner] = useState(false);
  const [txResult, setTxResult] = useState(null); // { hash, explorerUrl } from a real broadcast
  const [selectedFee, setSelectedFee] = useState(null); // user-chosen EIP-1559 fee (FeeSelector)

  // 2FA state
  const [otpCode, setOtpCode]         = useState("");
  const [otpSent, setOtpSent]         = useState(false);
  const [otpSecret, setOtpSecret]     = useState("");
  const [otpSending, setOtpSending]   = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState(null); // null | "passkey" | "otp"
  const [ensName, setEnsName] = useState("");
  const [ensResolving, setEnsResolving] = useState(false);
  const [ensResolved, setEnsResolved] = useState(null);

  const resolveENS = async (name) => {
    if (!name || (!name.endsWith(".eth") && !name.endsWith(".sol"))) return;
    setEnsResolving(true); setEnsResolved(null);
    try {
      if (name.endsWith(".eth")) {
        const res = await fetch(`https://api.ensideas.com/ens/resolve/${encodeURIComponent(name)}`);
        const data = await res.json();
        if (data.address) { setToAddress(data.address); setEnsResolved({ name, address: data.address }); }
        else toast.error("ENS name not found");
      } else if (name.endsWith(".sol")) {
        const res = await fetch(`https://sns-sdk-proxy.bonfida.workers.dev/resolve/${name.replace(".sol", "")}`);
        const data = await res.json();
        if (data.result) { setToAddress(data.result); setEnsResolved({ name, address: data.result }); }
        else toast.error("SNS name not found");
      }
    } catch { toast.error("Name resolution failed"); } finally { setEnsResolving(false); }
  };


  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const { data: whitelist = [] } = useQuery({
    queryKey: ["whitelisted-addresses"],
    queryFn: () => base44.entities.WhitelistedAddress.list(),
  });

  const { data: txLimits = [] } = useQuery({
    queryKey: ["tx-limits"],
    queryFn: () => base44.entities.TransactionLimit.list(),
  });

  // Sources for LOCAL address-poisoning screening: the addresses the user has
  // actually interacted with. All read client-side; nothing is sent anywhere.
  const { data: history = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 100),
  });
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

  const selectedWallet = wallets.find(w => w.id === walletId);

  // Capability gate: only assets whose status is `live` may move funds. ETH is
  // live (Phase A); ERC-20 tokens (Phase B) are receive_only until a testnet
  // transfer is verified, so they read balances but cannot yet send.
  const selectedAsset = getAsset(selectedWallet?.currency);
  const sendEnabled = canSend(selectedAsset);
  const isErc20 = selectedAsset?.family === "erc20";

  // Phase C: the active chain follows the selected asset — each EVM asset carries
  // its own (testnet) network key (e.g. MATIC -> polygonAmoy). The native gas
  // symbol and chain name come from the network registry, NEVER hardcoded "ETH";
  // Arbitrum/Optimism resolve to ETH because that genuinely is their gas token.
  const networkKey = (isEvmFamily(selectedAsset) && selectedAsset?.chain) || "sepolia";
  const activeNetwork = getNetworkInfo(networkKey);
  const nativeSymbol = activeNetwork?.symbol || "ETH";
  const networkName = activeNetwork?.name || networkKey;

  // Chain is the source of truth for balance — read it live, never the DB.
  // Native (ETH) reads via getBalanceEth; ERC-20 reads via the token contract's
  // balanceOf (with an on-chain decimals cross-check). Enabled whenever the asset
  // is at least receive-capable so balances show even before send is unlocked.
  const { data: liveBalance } = useQuery({
    queryKey: ["evm-balance", networkKey, selectedWallet?.address, selectedAsset?.symbol],
    queryFn: () => isErc20
      ? getTokenBalance({ networkKey: networkKey, symbol: selectedAsset.symbol, owner: selectedWallet.address })
      : getBalanceEth(networkKey, selectedWallet.address),
    enabled: !!selectedWallet?.address && canReceive(selectedAsset),
    refetchInterval: 15000,
  });

  // Decode EXACTLY what an ERC-20 send will sign, for display on the confirm
  // screen BEFORE any signature (the anti-blind-signing control). Transfers show
  // recipient/amount/token; an unlimited `approve` would surface a red warning.
  const tokenCalldata = useMemo(() => {
    if (!isErc20 || !toAddress || !amount || parseFloat(amount) <= 0) return null;
    try {
      const { data } = buildTokenTransfer({ networkKey: networkKey, symbol: selectedAsset.symbol, to: toAddress, amount });
      return describeErc20Call({ data, tokenSymbol: selectedAsset.symbol, decimals: getToken(networkKey, selectedAsset.symbol).decimals });
    } catch {
      return null; // unconfigured token / invalid input — UI shows nothing to decode
    }
  }, [isErc20, selectedAsset, toAddress, amount]);

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
  const effectiveBalance = sendEnabled && liveBalance != null
    ? parseFloat(liveBalance)
    : (selectedWallet?.balance || 0);

  const addressFormatValid = !toAddress || !selectedWallet
    ? true
    : isValidAddressForCurrency(toAddress, selectedWallet.currency);

  const currencyWhitelist = whitelist.filter(w => w.currency === selectedWallet?.currency);
  const isAddressWhitelisted = currencyWhitelist.length === 0
    ? true
    : currencyWhitelist.some(w => w.address.toLowerCase() === toAddress.toLowerCase());

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
      history,
      limits: txLimits,
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
  const txSim = useQuery({
    queryKey: ["tx-sim", networkKey, selectedWallet?.address, toAddress, amount, selectedAsset?.symbol, isErc20],
    queryFn: async () => {
      const from = selectedWallet.address;
      if (isErc20) {
        const t = getToken(networkKey, selectedAsset.symbol);
        const { data } = buildTokenTransfer({ networkKey, symbol: selectedAsset.symbol, to: toAddress, amount });
        return simulateEvmTransaction({
          networkKey, from, to: t.address, data, valueWei: 0n,
          nativeSymbol, tokenSymbol: selectedAsset.symbol, tokenDecimals: t.decimals,
          tokenBalance: liveBalance != null ? String(liveBalance) : null, knownAddresses,
          priorSends, knownCounterparties,
        });
      }
      return simulateEvmTransaction({
        networkKey, from, to: toAddress, valueWei: parseEther(String(amount)),
        nativeSymbol, knownAddresses, priorSends, knownCounterparties,
      });
    },
    enabled: step === "verify" && !DEMO && (isEvmFamily(selectedAsset) || isErc20)
      && !!selectedWallet?.address && !!toAddress && addressFormatValid && parseFloat(amount) > 0,
    retry: false,
    staleTime: 10000,
  });

  const sendTx = useMutation({
    mutationFn: async () => {
      // HARD capability gate: only `live` assets may move funds. This is the
      // exact failure mode of the original code (sending on fake assets).
      if (!canSend(selectedAsset)) {
        throw new Error(`Sending is not yet enabled for ${selectedWallet?.currency}.`);
      }
      if (!isUnlocked) throw new Error("Unlock your wallet to send");

      // HARD spend-limit gate (defense-in-depth). The Continue button is already
      // disabled on a breach, but re-evaluate at signing time so a per-tx OR
      // daily cap can never be bypassed by stale UI state. Re-computed here at
      // the moment of signing against the latest local history. See lib/txLimits.js.
      const limitGate = evaluateSendAgainstLimits({
        amount,
        currency: selectedWallet.currency,
        usdRates: USD_RATES,
        history,
        limits: txLimits,
        now: new Date(),
      });
      if (limitGate.blocked && !limitAck) {
        const daily = limitGate.reasons.find((r) => r.kind === "daily");
        throw new Error(
          daily
            ? `Daily spending limit reached: this send would put today's total over your $${daily.limitUSD.toLocaleString()} cap.`
            : `This send exceeds your per-transaction spending limit.`
        );
      }

      // Map the selected wallet to its HD derivation index (public address match).
      const acct = accounts.find(a => a.address.toLowerCase() === selectedWallet.address.toLowerCase());
      if (!acct) throw new Error("Selected wallet is not in the unlocked HD set");

      // Unlimited approvals must be explicitly acknowledged before signing.
      if (blockedByApproval) {
        throw new Error("Confirm the unlimited-approval warning before signing.");
      }

      // Sign LOCALLY and broadcast. privateKey is transient and never persisted.
      // Branch on the asset family: ERC-20 tokens go through the token contract's
      // transfer; native EVM coins (ETH) use the native value transfer.
      // The user-selected EIP-1559 fee (slow/avg/fast or custom) flows straight
      // into the signing call. When null (estimate unavailable) the send path
      // falls back to ethers' auto-filled fee — never blocks the send.
      const fee = selectedFee?.fee || undefined;
      const tx = await withPrivateKey(acct.index, (privateKey) =>
        isErc20
          ? sendToken({
              networkKey: networkKey,
              privateKey,
              symbol: selectedAsset.symbol,
              to: toAddress,
              amount,
              fee,
            })
          : signAndBroadcast({
              networkKey: networkKey,
              privateKey,
              to: toAddress,
              amountEth: amount,
              fee,
            })
      );

      // Record the REAL chain hash as 'pending'. Do NOT write balances — the
      // chain is the source of truth and is read live elsewhere.
      await base44.entities.Transaction.create({
        wallet_id: walletId,
        type: "send",
        amount: parseFloat(amount),
        currency: selectedWallet.currency,
        to_address: toAddress,
        from_address: selectedWallet.address,
        status: "pending",        // becomes confirmed after tx.wait()
        tx_hash: tx.hash,          // REAL chain hash
        explorer_url: tx.explorerUrl,
        note,
      });

      // Confirm in the background, then refresh balance + history from chain.
      tx.wait(1).then(() => {
        queryClient.invalidateQueries({ queryKey: ["evm-balance", networkKey, selectedWallet.address] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      }).catch(() => {/* surface a "still pending / failed" state in UI */});

      return { hash: tx.hash, explorerUrl: tx.explorerUrl };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["evm-balance", networkKey, selectedWallet?.address] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setTxResult(result);
      setStep("done");
    },
    onError: (err) => {
      toast.error(err?.message || "Send failed");
    },
  });

  const verifyPasskey = async () => {
    setPasskeyPending(true);
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          timeout: 60000,
          userVerification: "required",
          rpId: window.location.hostname,
        },
      });
      sendTx.mutate();
    } catch (e) {
      if (e.name !== "NotAllowedError") toast.error("Passkey verification failed. Try email OTP instead.");
    } finally {
      setPasskeyPending(false);
    }
  };

  const sendOTP = async () => {
    // Email delivery needs a backend mail sender the local build doesn't ship.
    if (!EMAIL_AVAILABLE) return;
    setOtpSending(true);
    try {
      const user = await base44.auth.me();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setOtpSecret(code);
      await base44.integrations.Core.SendEmail({
        to: user.email,
        subject: "Veyrnox — Your 2FA Code",
        body: `Your one-time verification code is: ${code}\n\nYou are authorising a send of ${amount} ${selectedWallet?.currency} to ${toAddress}.\n\nThis code expires in 10 minutes. If you didn't request this, ignore this email.`,
      });
      setOtpSent(true);
      toast.success("OTP sent to your email");
    } catch {
      toast.error("Failed to send OTP");
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOTP = () => {
    if (otpCode.trim() !== otpSecret) {
      toast.error("Incorrect code. Please try again.");
      setOtpCode("");
      return;
    }
    sendTx.mutate();
  };

  const resetVerify = () => {
    setTwoFAMethod(null); setOtpSent(false); setOtpCode(""); setOtpSecret(""); setApprovalAck(false);
  };

  if (step === "done") {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Transaction Broadcast</h2>
        <p className="text-sm text-muted-foreground">
          {amount} {selectedWallet?.currency} signed locally and sent to the network
        </p>
        {txResult?.hash && (
          <div className="p-3 rounded-lg bg-secondary/30 border border-border text-left space-y-2">
            <p className="text-xs text-muted-foreground">Transaction hash</p>
            <p className="text-xs font-mono break-all">{txResult.hash}</p>
            {txResult.explorerUrl && (
              <a href={txResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                View on block explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <p className="text-[11px] text-muted-foreground">Pending until confirmed on-chain. Balance updates from the chain, not a stored value.</p>
          </div>
        )}
        <Button variant="outline" onClick={() => { setStep("form"); setAmount(""); setToAddress(""); setNote(""); setTxResult(null); }}>
          Send Another
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Send Crypto</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Transfer funds securely</p>
      </div>

      <div className="space-y-4 p-5 rounded-xl border border-border bg-card">
        <div>
          <Label>From Wallet</Label>
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select wallet" /></SelectTrigger>
            <SelectContent>
              {wallets.map(w => (
                <SelectItem key={w.id} value={w.id}>
                  <div className="flex items-center gap-2">
                    <CoinLogo symbol={w.currency} size={20} />
                    <span>{w.name} — {w.balance} {w.currency}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Recipient Address or ENS/SNS Name</Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              value={ensName || toAddress}
              onChange={e => { const v = e.target.value; if (v.endsWith(".eth") || v.endsWith(".sol")) { setEnsName(v); setToAddress(""); setEnsResolved(null); } else { setEnsName(""); setToAddress(v); setEnsResolved(null); } }}
              onBlur={e => resolveENS(e.target.value)}
              placeholder="0x... or vitalik.eth or wallet.sol"
              className={`font-mono text-sm ${!addressFormatValid ? 'border-destructive' : ''}`}
            />
            {ensResolving && <Loader2 className="h-4 w-4 animate-spin self-center shrink-0 text-muted-foreground" />}
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setShowScanner(true)}>
              <ScanLine className="h-4 w-4" />
            </Button>
          </div>
          {ensResolved && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-green-400">
              <CheckCircle2 className="h-3 w-3" /> {ensResolved.name} → <span className="font-mono truncate">{ensResolved.address}</span>
            </div>
          )}
        </div>

        {toAddress && !addressFormatValid && (
          <p className="text-xs text-destructive flex items-center gap-1.5 -mt-2">
            <AlertTriangle className="h-3 w-3" /> Invalid {selectedWallet?.currency} address format
          </p>
        )}
        {toAddress && addressFormatValid && !isAddressWhitelisted && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 -mt-2">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">This address is not on your whitelist. Double-check before proceeding. You can add trusted addresses in Settings.</p>
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
              <p>Recipients are screened <span className="font-medium">locally</span> for look-alike / address-poisoning against your own history — nothing leaves your device.</p>
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
        {/* DEMO: the pre-sign Transaction Simulation preview. The real preview
            appears at the verify step against a live RPC; in demo (no live RPC,
            sends gated) this shows the same preview for representative samples on
            every chain, including the high-risk patterns it flags. */}
        {DEMO && step === "form" && <TransactionSimulationDemo />}

        {showScanner && (
          <QRScanner
            onScan={(value) => { setToAddress(value); setShowScanner(false); }}
            onClose={() => setShowScanner(false)}
          />
        )}
        <div>
          <Label>Amount</Label>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-1.5" />
          {selectedWallet && (
            <p className="text-xs text-muted-foreground mt-1">
              {sendEnabled
                ? <>Balance: {liveBalance != null ? `${liveBalance} ${selectedWallet.currency}` : "reading from chain…"} <span className="text-[10px]">(on-chain)</span></>
                : <>Balance: {selectedWallet.balance} {selectedWallet.currency}</>}
            </p>
          )}
        </div>

        {selectedWallet && !sendEnabled && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">Sending is not yet enabled for {selectedWallet.currency}. Only ETH (Sepolia testnet) is live in this build; other assets are receive/roadmap only until their crypto path is verified.</p>
          </div>
        )}
        {selectedWallet && sendEnabled && !isUnlocked && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <Lock className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">Your wallet is locked. Unlock it in the HD Wallet Manager to sign and send.</p>
          </div>
        )}
        <div>
          <Label>Note (optional)</Label>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="What's this for?" className="mt-1.5" />
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
                    ? `This send (~$${Math.round(limitEval.amountUSD).toLocaleString()}) exceeds your ${r.currency === "ALL" ? "" : r.currency + " "}per-transaction cap of $${r.limitUSD.toLocaleString()}.`
                    : `You've already sent ~$${Math.round(r.spentTodayUSD).toLocaleString()} today; this send (~$${Math.round(limitEval.amountUSD).toLocaleString()}) would reach ~$${Math.round(r.projectedUSD).toLocaleString()}, over your ${r.currency === "ALL" ? "" : r.currency + " "}daily cap of $${r.limitUSD.toLocaleString()}.`}
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

        {step === "form" && (
          <Button
            className="w-full"
            disabled={!walletId || !toAddress || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > effectiveBalance || !addressFormatValid || !sendEnabled || (sendEnabled && !isUnlocked) || (limitEval.blocked && !limitAck)}
            onClick={() => setStep("verify")}
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
              <p className="text-lg font-bold">{amount} {selectedWallet?.currency}</p>
              <p className="text-xs text-muted-foreground font-mono mt-1 truncate">{toAddress}</p>
            </div>

            {/* Address-poisoning warning repeated at the point of signing. */}
            <PoisonWarning screen={poisonScreen} />

            {/* PRE-SIGN SIMULATION — predicted balance changes, decoded call, and
                KNOWN risk flags, dry-run against your own RPC before you confirm.
                Local-only; warns, never blocks; never claims "safe". */}
            {(isEvmFamily(selectedAsset) || isErc20) && (
              <TransactionPreview result={txSim.data} loading={txSim.isFetching && !txSim.data} error={txSim.error} />
            )}

            {/* Decoded calldata for ERC-20 sends — show EXACTLY what will be
                signed before any signature (anti-blind-signing control). */}
            {isErc20 && tokenCalldata && (
              <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-2">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> Decoded contract call
                </p>
                {tokenCalldata.kind === "transfer" && (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Method</span><span className="font-mono font-semibold">transfer</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Token</span><span className="font-semibold">{tokenCalldata.tokenSymbol}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Amount</span><span className="font-mono font-semibold">{tokenCalldata.amount} {tokenCalldata.tokenSymbol}</span></div>
                    <div className="flex justify-between gap-2 min-w-0"><span className="text-muted-foreground shrink-0">Recipient</span><span className="font-mono truncate">{tokenCalldata.to}</span></div>
                  </div>
                )}
                {tokenCalldata.kind === "approve" && (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Method</span><span className="font-mono font-semibold">approve</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Token</span><span className="font-semibold">{tokenCalldata.tokenSymbol}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Allowance</span><span className={`font-mono font-semibold ${tokenCalldata.unlimited ? "text-destructive" : ""}`}>{tokenCalldata.amount}</span></div>
                    <div className="flex justify-between gap-2 min-w-0"><span className="text-muted-foreground shrink-0">Spender</span><span className="font-mono truncate">{tokenCalldata.spender}</span></div>
                  </div>
                )}
                {tokenCalldata.kind === "unknown" && (
                  <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Unrecognised calldata — do not sign unless you know exactly what this does.</p>
                )}
                {/* Gas is always paid in the chain's native coin, even for tokens —
                    and that coin is NOT always ETH (Phase C). Read it per-chain. */}
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1 border-t border-border/60">
                  <Fuel className="h-3 w-3 shrink-0" /> Network fee is paid in {nativeSymbol} ({networkName}) — you need {nativeSymbol} for gas even when sending {tokenCalldata.tokenSymbol || selectedWallet?.currency}.
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

            {/* Per-chain fee control. The live send path is EVM (EIP-1559); the
                chosen tier/custom fee is passed into signAndBroadcast/sendToken. */}
            <FeeSelector
              chain="evm"
              networkKey={networkKey}
              symbol={nativeSymbol}
              decimals={activeNetwork?.decimals ?? 18}
              usdRate={USD_RATES[nativeSymbol] ?? USD_RATES[selectedWallet?.currency]}
              gasLimitHint={isErc20 ? 65000 : 21000}
              onChange={setSelectedFee}
            />
            {/* The fee's fiat estimate (and the spend-cap previews) convert via
                the static USD_RATES table, so disclose it's a reference rate. */}
            <ReferenceRateNote className="text-center" />

            {/* 2FA method picker */}
            {!twoFAMethod && (
              <div className="space-y-2">
                <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-widest">Verify your identity</p>
                {selectedWallet?.passkey_registered && window.PublicKeyCredential && (
                  <Button className="w-full gap-2" disabled={blockedByApproval} onClick={() => { setTwoFAMethod("passkey"); verifyPasskey(); }}>
                    <Fingerprint className="h-4 w-4" />
                    Use Passkey / Biometric
                  </Button>
                )}
                <Button variant="outline" className="w-full gap-2" disabled={!EMAIL_AVAILABLE || blockedByApproval} onClick={() => { setTwoFAMethod("otp"); sendOTP(); }}>
                  {otpSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {EMAIL_AVAILABLE ? "Send Email OTP" : "Email OTP unavailable offline"}
                </Button>
                {!EMAIL_AVAILABLE && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Email OTP needs a mail server, which this local build doesn't include.
                    {selectedWallet?.passkey_registered ? " Use passkey verification instead." : " Register a passkey for this wallet to authorise sends on this device."}
                  </p>
                )}
              </div>
            )}

            {/* Passkey in progress */}
            {twoFAMethod === "passkey" && (
              <div className="space-y-3 text-center">
                {passkeyPending ? (
                  <div className="py-4 space-y-2">
                    <Fingerprint className="h-10 w-10 text-primary mx-auto animate-pulse" />
                    <p className="text-sm text-muted-foreground">Follow the prompt on your device…</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button className="w-full gap-2" onClick={verifyPasskey} disabled={passkeyPending || sendTx.isPending}>
                      <Fingerprint className="h-4 w-4" /> Retry Passkey
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full" onClick={resetVerify}>Try another method</Button>
                  </div>
                )}
              </div>
            )}

            {/* OTP flow */}
            {twoFAMethod === "otp" && (
              <div className="space-y-3">
                {!otpSent ? (
                  <div className="text-center py-3">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                    <p className="text-xs text-muted-foreground mt-2">Sending code…</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <ShieldCheck className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-green-300">A 6-digit code was sent to your registered email. Enter it below to authorise this transaction.</p>
                    </div>
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="000000"
                        className="w-full text-center text-2xl font-mono tracking-[0.5em] h-14 rounded-lg border border-input bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                    </div>
                    <Button
                      className="w-full gap-2"
                      disabled={otpCode.length !== 6 || sendTx.isPending || blockedByApproval}
                      onClick={verifyOTP}
                    >
                      {sendTx.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <KeyRound className="h-4 w-4" />}
                      Verify &amp; Send
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => { setOtpSent(false); setOtpCode(""); sendOTP(); }}>
                      <RefreshCw className="h-3.5 w-3.5" /> Resend Code
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full" onClick={resetVerify}>Try another method</Button>
                  </>
                )}
              </div>
            )}

            <Button variant="ghost" className="w-full" onClick={() => { setStep("form"); resetVerify(); }}>Back</Button>
          </div>
        )}
      </div>
    </div>
  );
}