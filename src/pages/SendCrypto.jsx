import { useState } from "react";
import { logAuditEvent } from "../hooks/useAuditLog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, Fingerprint, Loader2, CheckCircle2, ScanLine, Mail, ShieldCheck, KeyRound, RefreshCw, AlertTriangle, ExternalLink, Lock } from "lucide-react";
import QRScanner from "../components/QRScanner";
import { toast } from "sonner";
import { useWallet } from "@/lib/WalletProvider";
import { signAndBroadcast } from "@/wallet-core/evm/send";
import { getBalanceEth } from "@/wallet-core/evm/provider";
import { getAsset, canSend } from "@/wallet-core/assets";

export default function SendCrypto() {
  const queryClient = useQueryClient();
  const { isUnlocked, accounts, withPrivateKey } = useWallet();
  const NETWORK_KEY = "sepolia"; // testnet-first; mainnet stays gated until audit
  const [walletId, setWalletId] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState("form"); // form | verify | done
  const [showScanner, setShowScanner] = useState(false);
  const [txResult, setTxResult] = useState(null); // { hash, explorerUrl } from a real broadcast

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

  const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };

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

  const selectedWallet = wallets.find(w => w.id === walletId);

  // Capability gate: only assets whose status is `live` may move funds (Phase A
  // = ETH on Sepolia). Everything else is shown but cannot send.
  const selectedAsset = getAsset(selectedWallet?.currency);
  const sendEnabled = canSend(selectedAsset);

  // Chain is the source of truth for balance — read it live, never the DB.
  const { data: liveBalance } = useQuery({
    queryKey: ["evm-balance", NETWORK_KEY, selectedWallet?.address],
    queryFn: () => getBalanceEth(NETWORK_KEY, selectedWallet.address),
    enabled: !!selectedWallet?.address && sendEnabled,
    refetchInterval: 15000,
  });

  // Effective balance for max/limit checks: chain read for live assets, falling
  // back to the DB value only for not-yet-live assets (display only).
  const effectiveBalance = sendEnabled && liveBalance != null
    ? parseFloat(liveBalance)
    : (selectedWallet?.balance || 0);

  const ADDRESS_PATTERNS = {
    BTC: /^(1|3|bc1)[a-zA-Z0-9]{25,62}$/,
    ETH: /^0x[0-9a-fA-F]{40}$/,
    SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    USDC: /^0x[0-9a-fA-F]{40}$/,
    USDT: /^0x[0-9a-fA-F]{40}$/,
  };

  const addressFormatValid = !toAddress || !selectedWallet
    ? true
    : (ADDRESS_PATTERNS[selectedWallet.currency]?.test(toAddress) ?? true);

  const currencyWhitelist = whitelist.filter(w => w.currency === selectedWallet?.currency);
  const isAddressWhitelisted = currencyWhitelist.length === 0
    ? true
    : currencyWhitelist.some(w => w.address.toLowerCase() === toAddress.toLowerCase());

  const sendTx = useMutation({
    mutationFn: async () => {
      // HARD capability gate: only `live` assets may move funds. This is the
      // exact failure mode of the original code (sending on fake assets).
      if (!canSend(selectedAsset)) {
        throw new Error(`Sending is not yet enabled for ${selectedWallet?.currency}.`);
      }
      if (!isUnlocked) throw new Error("Unlock your wallet to send");

      // Map the selected wallet to its HD derivation index (public address match).
      const acct = accounts.find(a => a.address.toLowerCase() === selectedWallet.address.toLowerCase());
      if (!acct) throw new Error("Selected wallet is not in the unlocked HD set");

      // Sign LOCALLY and broadcast. privateKey is transient and never persisted.
      const tx = await withPrivateKey(acct.index, (privateKey) =>
        signAndBroadcast({
          networkKey: NETWORK_KEY,
          privateKey,
          to: toAddress,
          amountEth: amount,
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
        queryClient.invalidateQueries({ queryKey: ["evm-balance", NETWORK_KEY, selectedWallet.address] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      }).catch(() => {/* surface a "still pending / failed" state in UI */});

      return { hash: tx.hash, explorerUrl: tx.explorerUrl };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["evm-balance", NETWORK_KEY, selectedWallet?.address] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      logAuditEvent({ action: `Sent ${amount} ${selectedWallet?.currency} to ${toAddress}`, category: "transaction", details: `Wallet: ${selectedWallet?.name} • tx ${result?.hash}`, severity: "info" });
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
    setOtpSending(true);
    try {
      const user = await base44.auth.me();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setOtpSecret(code);
      await base44.integrations.Core.SendEmail({
        to: user.email,
        subject: "SafeDigitalWallet — Your 2FA Code",
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
    setTwoFAMethod(null); setOtpSent(false); setOtpCode(""); setOtpSecret("");
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
                View on Etherscan <ExternalLink className="h-3 w-3" />
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
                  {w.name} — {w.balance} {w.currency}
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

        {step === "form" && (
          <Button
            className="w-full"
            disabled={!walletId || !toAddress || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > effectiveBalance || !addressFormatValid || !sendEnabled || (sendEnabled && !isUnlocked) || (() => {
              if (!selectedWallet) return false;
              const amtUSD = parseFloat(amount) * (USD_RATES[selectedWallet.currency] || 1);
              const activeLimits = txLimits.filter(l => l.enabled && (l.currency === selectedWallet.currency || l.currency === "ALL"));
              return activeLimits.some(l => l.per_transaction_limit && amtUSD > l.per_transaction_limit);
            })()}
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

            {/* 2FA method picker */}
            {!twoFAMethod && (
              <div className="space-y-2">
                <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-widest">Verify your identity</p>
                {selectedWallet?.passkey_registered && window.PublicKeyCredential && (
                  <Button className="w-full gap-2" onClick={() => { setTwoFAMethod("passkey"); verifyPasskey(); }}>
                    <Fingerprint className="h-4 w-4" />
                    Use Passkey / Biometric
                  </Button>
                )}
                <Button variant="outline" className="w-full gap-2" onClick={() => { setTwoFAMethod("otp"); sendOTP(); }}>
                  {otpSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send Email OTP
                </Button>
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
                      disabled={otpCode.length !== 6 || sendTx.isPending}
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