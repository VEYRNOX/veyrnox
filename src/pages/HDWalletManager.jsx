import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wallet, Plus, Eye, EyeOff, Copy, Check, RefreshCw, Download, Shield, ChevronDown, ChevronRight, Key, KeyRound, Lock, Unlock, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CoinLogo from "@/components/CoinLogo";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/lib/WalletProvider";
import { isPasskeyGateError } from "@/lib/passkey";
import { checkVaultPasswordStrength } from "@/lib/passwordStrength";
import { isBiometricGateError } from "@/lib/biometric";
import { ASSETS, ASSET_STATUS, canSend, canReceive, isEvmFamily } from "@/wallet-core/assets";
import { getBalanceEth } from "@/wallet-core/evm/provider";
import { getNetworkInfo } from "@/wallet-core/evm/networks";
import { getTokenBalance } from "@/wallet-core/evm/token-send";

// Live on-chain balance for a receivable EVM-family asset, read from the asset's
// OWN chain (Phase C: each asset carries its testnet network key, e.g. MATIC ->
// polygonAmoy). Native coins read via getBalanceEth; ERC-20 tokens via the token
// contract's balanceOf. Chain is the source of truth — never a stored DB value.
// The balance is labelled with the chain's NATIVE gas symbol (POL/AVAX/tBNB, and
// ETH on Arbitrum/Optimism), never a hardcoded "ETH".
function AssetLiveBalance({ asset, address }) {
  const networkKey = asset.chain;
  const isErc20 = asset.family === "erc20";
  // Native coins display the chain's native symbol; tokens display their own.
  const unit = isErc20 ? asset.symbol : (getNetworkInfo(networkKey)?.symbol || asset.symbol);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["hd-evm-balance", networkKey, asset.symbol, address],
    queryFn: () => isErc20
      ? getTokenBalance({ networkKey, symbol: asset.symbol, owner: address })
      : getBalanceEth(networkKey, address),
    enabled: !!address,
    refetchInterval: 20000,
    retry: 1,
  });
  if (!address) return null;
  if (isLoading) return <span className="text-xs text-muted-foreground">…</span>;
  if (isError) return <span className="text-xs text-muted-foreground" title="Could not read balance from chain">—</span>;
  return <span className="text-xs font-semibold">{Number(data).toLocaleString(undefined, { maximumFractionDigits: 6 })} {unit}</span>;
}

// All EVM-family assets share one secp256k1 derivation (m/44'/60'/0'/0/0), so a
// single derived account backs ETH and every EVM token/chain. Non-EVM assets
// (BTC/SOL) are roadmap-only here and intentionally show NO fabricated address.
const HD_WALLET_ID = "evm-hd";

const ASSET_COLORS = {
  ETH: "#627EEA", USDC: "#2775CA", USDT: "#26A17B", MATIC: "#8247E5", ARB: "#28A0F0",
  OP: "#FF0420", AVAX: "#E84142", BNB: "#F3BA2F", BTC: "#F7931A", SOL: "#14F195",
};

const STATUS_BADGE = {
  [ASSET_STATUS.LIVE]: { label: "Live", className: "bg-success/15 text-success border-success/30" },
  [ASSET_STATUS.RECEIVE_ONLY]: { label: "Receive only", className: "bg-info/15 text-info border-info/30" },
  [ASSET_STATUS.COMING_SOON]: { label: "Coming soon", className: "bg-secondary text-muted-foreground border-border" },
};

function shortPath(index) {
  return `m/44'/60'/0'/0/${index ?? 0}`;
}

export default function HDWalletManager() {
  const qc = useQueryClient();
  const { isUnlocked, accounts, createWallet, importWallet, unlock, lock, hasVault, deriveAccounts } = useWallet();

  const [tab, setTab] = useState("wallets");
  const [showSeed, setShowSeed] = useState(false);
  const [generatedSeed, setGeneratedSeed] = useState("");
  const [genPassword, setGenPassword] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  // SAST M-3 ESCAPE HATCH: null until the passkey gate has actually FAILED on an
  // unlock attempt; then { reason: 'cancelled'|'error' } so we can offer a
  // deliberate, signposted password-only unlock for a broken/deleted passkey.
  // Surfaced ONLY after a real failure — never a default-visible "skip" button.
  const [passkeyFailed, setPasskeyFailed] = useState(null);
  // Biometric escape hatch (dual of passkeyFailed) — see WalletEntry / unlock().
  const [biometricFailed, setBiometricFailed] = useState(false);
  const [copied, setCopied] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [vaultExists, setVaultExists] = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState(null);
  const [deriveOpen, setDeriveOpen] = useState(false);
  const [deriveCount, setDeriveCount] = useState(3);

  // Whether an encrypted vault already lives on this device (drives unlock UI).
  useEffect(() => {
    let active = true;
    hasVault().then(v => { if (active) setVaultExists(v); }).catch(() => {});
    return () => { active = false; };
  }, [hasVault, isUnlocked]);

  // The base44 store holds ONLY public labels + addresses (never keys). It acts
  // as a cache so other pages (e.g. Send) can resolve a derived address.
  const { data: hdWallets = [] } = useQuery({
    queryKey: ["hd-wallets"],
    queryFn: () => base44.entities.Wallet.filter({ hd_wallet_id: HD_WALLET_ID }),
  });

  // Persist any derived public addresses that aren't cached yet. Public only.
  const persistAccounts = useMutation({
    mutationFn: async (/** @type {any} */ accts) => {
      const existing = new Set((hdWallets || []).map(w => (w.address || "").toLowerCase()));
      for (const a of accts) {
        if (existing.has(a.address.toLowerCase())) continue;
        await base44.entities.Wallet.create({
          name: a.index === 0 ? "EVM Account" : `EVM Account ${a.index}`,
          network: "ethereum",
          derivation_index: a.index,
          address: a.address,   // PUBLIC address only
          balance: 0,           // cache placeholder; chain is the source of truth
          currency: "ETH",
          hd_wallet_id: HD_WALLET_ID,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hd-wallets"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });

  // Auto-sync derived public addresses into the cache once unlocked.
  useEffect(() => {
    if (!isUnlocked || !accounts.length) return;
    const existing = new Set((hdWallets || []).map(w => (w.address || "").toLowerCase()));
    const missing = accounts.filter(a => !existing.has(a.address.toLowerCase()));
    if (missing.length && !persistAccounts.isPending) persistAccounts.mutate(accounts);
     
  }, [isUnlocked, accounts, hdWallets]);

  const copy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); };

  const handleGenerate = async () => {
    setError("");
    const pw = checkVaultPasswordStrength(genPassword);
    if (!pw.ok) { setError(pw.reason); return; }
    setBusy(true);
    try {
      const seed = await createWallet(genPassword); // returns the mnemonic ONCE for backup
      setGeneratedSeed(seed);
      setShowSeed(false);
      setGenPassword("");
    } catch (e) { setError(e?.message || "Failed to create wallet"); }
    finally { setBusy(false); }
  };

  const handleImport = async () => {
    setError("");
    const pw = checkVaultPasswordStrength(importPassword);
    if (!pw.ok) { setError(pw.reason); return; }
    setBusy(true);
    try {
      await importWallet(importPhrase.trim(), importPassword); // validates BIP-39 checksum
      setImportPhrase("");
      setImportPassword("");
      setTab("wallets");
    } catch (e) { setError(e?.message || "Failed to import wallet"); }
    finally { setBusy(false); }
  };

  // Unlock the vault. `skipPasskey` is the SAST M-3 escape hatch: only ever set
  // by the explicit "Unlock with password only" button below, which we surface
  // ONLY after the passkey gate has actually failed. The password is still
  // required either way — the escape hatch never weakens the vault, it only
  // refuses to let a broken/deleted passkey strand the user (see lib/passkey.js).
  const runUnlock = async (opts = {}) => {
    setError("");
    setBusy(true);
    try {
      const res = await unlock(unlockPassword, opts);
      setUnlockPassword("");
      setPasskeyFailed(null);
      setBiometricFailed(false);
      // SIGNAL (M-1/M-2): don't silently drop the configured second factor.
      if (res?.passkeySkipped === "unavailable") {
        toast.warning("Passkey unavailable on this device — unlocked with your password only.");
      } else if (res?.passkeySkipped === "escape-hatch") {
        toast.warning("Unlocked with password only. Re-register your passkey in Security settings to restore the second factor.");
      }
      if (res?.biometricSkipped === "escape-hatch") {
        toast.warning("Unlocked with your vault password. Re-enable biometric unlock in Security settings when it's working again.");
      }
    } catch (e) {
      // A failed passkey gate (cancel OR a broken/deleted credential) fails
      // CLOSED — the vault stays locked. We then reveal the escape hatch so a
      // genuinely-broken passkey can't permanently lock the user out, while a
      // plain cancel of a working passkey still just stays locked until the user
      // retries or deliberately chooses the password-only path.
      if (isPasskeyGateError(e)) {
        setPasskeyFailed({ reason: e.reason });
        setError(
          e.reason === "cancelled"
            ? "Passkey cancelled or unavailable. Try again, or unlock with your password if your passkey was removed from this device."
            : "Your passkey couldn't be used (it may have been removed from this device). Unlock with your password below."
        );
      } else if (isBiometricGateError(e)) {
        setBiometricFailed(true);
        setError("Biometric authentication failed or was cancelled. Unlock with your vault password below.");
      } else {
        setError(e?.message || "Unlock failed");
      }
    } finally { setBusy(false); }
  };

  const handleUnlock = () => runUnlock();
  const handleUnlockPasswordOnly = () => runUnlock({ skipPasskey: true });
  const handleUnlockBiometricSkip = () => runUnlock({ skipBiometric: true });

  const handleDerive = async () => {
    setBusy(true);
    try {
      const list = deriveAccounts(deriveCount); // public accounts 0..count-1
      persistAccounts.mutate(list);
      setDeriveOpen(false);
    } catch (e) { setError(e?.message || "Derivation failed"); }
    finally { setBusy(false); }
  };

  const evmAddress = accounts[0]?.address || null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Key className="h-5 w-5 text-primary" /> Wallet Manager</h1>
          <p className="text-sm text-muted-foreground">One recovery phrase generates all your wallet addresses</p>
        </div>
        <div className="flex items-center gap-2">
          {isUnlocked && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={lock}><Lock className="h-3.5 w-3.5" /> Lock</Button>
          )}
          <Button onClick={() => setDeriveOpen(true)} disabled={!isUnlocked} className="gap-2"><Plus className="h-4 w-4" /> Derive Accounts</Button>
        </div>
      </div>

      {/* Lock-state banner */}
      <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${isUnlocked ? "bg-success/10 border-success/20 text-success" : "bg-secondary/40 border-border text-muted-foreground"}`}>
        {isUnlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {isUnlocked
          ? "Vault unlocked. Keys live in memory only and auto-lock after inactivity."
          : vaultExists ? "Vault locked. Unlock below to view your derived accounts." : "No wallet on this device yet. Generate or import a recovery phrase to begin."}
      </div>

      <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
        {[["wallets","My Wallets"],["import","Import Recovery Phrase"],["generate","Generate New"]].map(([t, l]) => (
          <button key={t} onClick={() => { setTab(t); setError(""); }} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {tab === "wallets" && (
        <div className="space-y-3">
          {/* Locked + vault present -> unlock form */}
          {!isUnlocked && vaultExists && (
            <div className="p-4 rounded-xl border border-border bg-card space-y-3">
              <Label htmlFor="hd-unlock-password">Vault Password</Label>
              <Input id="hd-unlock-password" type="password" value={unlockPassword} onChange={e => setUnlockPassword(e.target.value)} placeholder="Enter your vault password" onKeyDown={e => { if (e.key === "Enter") handleUnlock(); }} />
              <Button className="w-full gap-2" disabled={!unlockPassword || busy} onClick={handleUnlock}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />} Unlock
              </Button>

              {/* SAST M-3 ESCAPE HATCH. Shown ONLY after the passkey gate has
                  actually FAILED on an attempt — never on the pristine form, so
                  it is not a default-visible "skip the 2nd factor" button. It
                  still requires the correct vault password (the real control;
                  the passkey is a presence-only convenience factor), so it is no
                  weaker than the app's baseline custody — it simply refuses to
                  let a deleted/unavailable passkey strand a user from funds they
                  can still unlock with their password. */}
              {passkeyFailed && (
                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Can't use your passkey? If it was removed from this device or your
                    authenticator is unavailable, unlock with your vault password alone.
                    Your password still protects the wallet.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    disabled={!unlockPassword || busy}
                    onClick={handleUnlockPasswordOnly}
                  >
                    <KeyRound className="h-4 w-4" /> Unlock with password only
                  </Button>
                </div>
              )}

              {/* Biometric escape hatch — surfaced ONLY after the biometric gate
                  has actually failed. Still requires the vault password, so it is
                  no weaker than the baseline custody. */}
              {biometricFailed && (
                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Biometric / Face ID didn't work? Unlock with your vault password
                    alone — your password is the real key and always works.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    disabled={!unlockPassword || busy}
                    onClick={handleUnlockBiometricSkip}
                  >
                    <KeyRound className="h-4 w-4" /> Unlock with password only
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Locked + no vault -> prompt to create/import */}
          {!isUnlocked && !vaultExists && (
            <div className="p-6 rounded-xl border border-dashed border-border bg-card text-center space-y-3">
              <Wallet className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Create a new wallet or import an existing recovery phrase to derive your accounts.</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setTab("generate")}>Generate New</Button>
                <Button variant="outline" onClick={() => setTab("import")}>Import Recovery Phrase</Button>
              </div>
            </div>
          )}

          {/* One address, every EVM chain (Phase C UX guard). The same
              secp256k1 / m/44'/60' address serves Ethereum and all five new EVM
              chains, so funds are not "missing" when the same address shows
              across them — balances are simply read per-chain. */}
          {isUnlocked && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
              <Key className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>One address works across <span className="font-medium text-foreground">Ethereum, Polygon, Arbitrum, and more</span> (Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB). Balances are read live from each network; each network has its own fee currency (e.g. POL on Polygon, AVAX on Avalanche, ETH on Arbitrum/Optimism).</span>
            </div>
          )}

          {/* Derived EVM account address — shown prominently at the top of the
              unlocked wallet list so the user can see/copy it without expanding an
              asset. Display-only: the 0x address comes straight from the public
              accounts[0] derived by useWallet(); no keys are read or stored here. */}
          {isUnlocked && evmAddress && (
            <div className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Wallet className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Ethereum-compatible Account</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      <span className="not-italic" style={{fontFamily:"inherit"}}>Technical path: </span>{shortPath(accounts[0]?.index)}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-success/15 text-success border-success/30 shrink-0">Active</span>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Account address (public)</p>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border">
                  <p className="flex-1 font-mono text-xs break-all">{evmAddress}</p>
                  <button
                    onClick={() => copy(evmAddress, "evm-account")}
                    className="shrink-0 p-1.5 rounded hover:bg-secondary transition-colors"
                    title="Copy account address"
                    aria-label="Copy account address"
                  >
                    {copied === "evm-account" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Unlocked -> the 10 assets, status-gated */}
          {isUnlocked && ASSETS.map(asset => {
            const receivable = canReceive(asset);
            const sendable = canSend(asset);
            const address = receivable && isEvmFamily(asset) ? evmAddress : null;
            const badge = STATUS_BADGE[asset.status];
            const exp = expandedSymbol === asset.symbol;
            const dim = /** @type {any} */ (asset.status) === ASSET_STATUS.COMING_SOON;
            return (
              <div key={asset.symbol} className={`rounded-xl border border-border bg-card overflow-hidden ${dim ? "opacity-60" : ""}`}>
                <button onClick={() => setExpandedSymbol(exp ? null : asset.symbol)} className="w-full p-4 flex items-center gap-3 text-left" title={dim ? "Not yet available." : undefined}>
                  <CoinLogo symbol={asset.symbol} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{asset.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.className}`}>{badge.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">{address || (dim ? "Address available once live" : "—")}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    {address
                      ? <AssetLiveBalance asset={asset} address={address} />
                      : <span className="text-xs font-semibold text-muted-foreground">{asset.symbol}</span>}
                    {exp ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {exp && (
                  <div className="border-t border-border px-4 py-3 bg-secondary/20 space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-muted-foreground">Chain</p><p className="font-semibold">{getNetworkInfo(asset.chain)?.name || asset.chain}</p></div>
                      <div><p className="text-muted-foreground">Family</p><p className="font-semibold uppercase">{asset.family}</p></div>
                      {isEvmFamily(asset) && getNetworkInfo(asset.chain) && (
                        <div><p className="text-muted-foreground">Fee currency</p><p className="font-semibold">{getNetworkInfo(asset.chain).symbol}</p></div>
                      )}
                      {address && (
                        <>
                          <div className="col-span-2"><p className="text-muted-foreground">Technical path (for advanced users)</p><p className="font-semibold font-mono">{shortPath(accounts[0]?.index)}</p></div>
                          <div className="col-span-2">
                            <p className="text-muted-foreground mb-0.5">Address (public)</p>
                            <div className="flex items-center gap-2">
                              <p className="font-mono break-all">{address}</p>
                              <button onClick={() => copy(address, asset.symbol)} className="shrink-0" aria-label={`Copy ${asset.symbol} address`}>{copied === asset.symbol ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}</button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={!receivable}><ArrowDownLeft className="h-3.5 w-3.5" /> Receive</Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        disabled={!sendable}
                        title={sendable ? undefined : `Sending not yet enabled for ${asset.symbol}.`}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" /> Send
                      </Button>
                    </div>
                    {!sendable && (
                      <p className="text-[11px] text-muted-foreground">
                        {dim ? "This asset is on the roadmap — no address is derived and funds cannot move until its crypto path is verified." : `Sending not yet enabled for ${asset.symbol}.`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "import" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-caution/30 bg-caution/5 text-xs text-caution">
            Never share your recovery phrase. It is validated and encrypted locally with your password — it is never sent to a server. Keys never leave this device.
          </div>
          <div>
            <Label htmlFor="hd-import-phrase">12 or 24-word recovery phrase</Label>
            <textarea id="hd-import-phrase" value={importPhrase} onChange={e => setImportPhrase(e.target.value)} rows={3} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="word1 word2 word3 ... word12" className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <Label htmlFor="hd-import-password">Vault Password</Label>
            <Input id="hd-import-password" type="password" className="mt-1.5" value={importPassword} onChange={e => setImportPassword(e.target.value)} placeholder="Encrypts your recovery phrase on this device" />
            <p className="text-xs text-muted-foreground mt-1">Used to encrypt the vault with strong on-device encryption. Minimum 12 characters.</p>
          </div>
          <Button className="w-full gap-2" disabled={!importPhrase.trim() || !importPassword || busy} onClick={handleImport}>
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Validate &amp; Import
          </Button>
        </div>
      )}

      {tab === "generate" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive">
            Write down your recovery phrase and store it offline. Anyone with this phrase has full access to your wallets. It is shown ONCE and never stored.
          </div>
          {!generatedSeed ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="hd-gen-password">Vault Password</Label>
                <Input id="hd-gen-password" type="password" className="mt-1.5" value={genPassword} onChange={e => setGenPassword(e.target.value)} placeholder="Encrypts your new recovery phrase on this device" />
                <p className="text-xs text-muted-foreground mt-1">Used to encrypt the vault with strong on-device encryption. Minimum 12 characters.</p>
              </div>
              <Button variant="outline" className="w-full gap-2" disabled={busy} onClick={handleGenerate}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Create a new recovery phrase
              </Button>
            </div>
          ) : (
            <>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold">Your Recovery Phrase (shown once)</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowSeed(s => !s)} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label={showSeed ? "Hide recovery phrase" : "Show recovery phrase"}>{showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    <button onClick={() => copy(generatedSeed, "seed")} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="Copy recovery phrase">{copied === "seed" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}</button>
                  </div>
                </div>
                {showSeed ? (
                  <div className="grid grid-cols-3 gap-2">
                    {generatedSeed.split(" ").map((w, i) => (
                      <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-xs">
                        <span className="text-muted-foreground w-4 text-right">{i + 1}.</span>
                        <span className="font-mono font-semibold">{w}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-20 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Tap the eye icon to reveal your recovery phrase</p>
                  </div>
                )}
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground flex items-start gap-2">
                <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Your wallet is unlocked and your first account is ready. After backing up your recovery phrase, open My Wallets to view your accounts.</span>
              </div>
              <Button className="w-full gap-2" onClick={() => { setGeneratedSeed(""); setShowSeed(false); setTab("wallets"); }}>
                <Check className="h-4 w-4" /> I've backed it up — View My Wallets
              </Button>
            </>
          )}
        </div>
      )}

      <Dialog open={deriveOpen} onOpenChange={setDeriveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Derive Accounts</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">Derive additional accounts from your unlocked recovery phrase along the standard Ethereum path. Only public addresses are stored.</p>
            <div>
              <Label id="hd-derive-count-label">Number of accounts</Label>
              <Select value={String(deriveCount)} onValueChange={v => setDeriveCount(parseInt(v))}>
                <SelectTrigger className="mt-1.5" aria-labelledby="hd-derive-count-label"><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 3, 5, 10].map(n => <SelectItem key={n} value={String(n)}>{n} account{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1"><span className="font-sans">Technical path: </span><span className="font-mono">{shortPath(0)} … {shortPath(deriveCount - 1)}</span></p>
            </div>
            <Button className="w-full" disabled={!isUnlocked || busy} onClick={handleDerive}>Derive &amp; Save Public Addresses</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
