import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wallet, Plus, Eye, EyeOff, Copy, Check, RefreshCw, Download, Shield, ChevronDown, ChevronRight, Key, Lock, Unlock, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/lib/WalletProvider";
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
  [ASSET_STATUS.LIVE]: { label: "Live", className: "bg-green-500/15 text-green-400 border-green-500/30" },
  [ASSET_STATUS.RECEIVE_ONLY]: { label: "Receive only", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
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
    mutationFn: async (accts) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked, accounts, hdWallets]);

  const copy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); };

  const handleGenerate = async () => {
    setError("");
    if (genPassword.length < 8) { setError("Choose a vault password of at least 8 characters."); return; }
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
    if (importPassword.length < 8) { setError("Choose a vault password of at least 8 characters."); return; }
    setBusy(true);
    try {
      await importWallet(importPhrase.trim(), importPassword); // validates BIP-39 checksum
      setImportPhrase("");
      setImportPassword("");
      setTab("wallets");
    } catch (e) { setError(e?.message || "Failed to import wallet"); }
    finally { setBusy(false); }
  };

  const handleUnlock = async () => {
    setError("");
    setBusy(true);
    try {
      await unlock(unlockPassword);
      setUnlockPassword("");
    } catch (e) { setError(e?.message || "Unlock failed"); }
    finally { setBusy(false); }
  };

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
          <h1 className="text-xl font-bold flex items-center gap-2"><Key className="h-5 w-5 text-primary" /> HD Wallet Manager</h1>
          <p className="text-sm text-muted-foreground">BIP-39 / BIP-44 self-custody derivation from one seed phrase</p>
        </div>
        <div className="flex items-center gap-2">
          {isUnlocked && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={lock}><Lock className="h-3.5 w-3.5" /> Lock</Button>
          )}
          <Button onClick={() => setDeriveOpen(true)} disabled={!isUnlocked} className="gap-2"><Plus className="h-4 w-4" /> Derive Accounts</Button>
        </div>
      </div>

      {/* Lock-state banner */}
      <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${isUnlocked ? "bg-green-500/10 border-green-500/20 text-green-300" : "bg-secondary/40 border-border text-muted-foreground"}`}>
        {isUnlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {isUnlocked
          ? "Vault unlocked. Keys live in memory only and auto-lock after inactivity."
          : vaultExists ? "Vault locked. Unlock below to view your derived accounts." : "No wallet on this device yet. Generate or import a seed to begin."}
      </div>

      <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
        {[["wallets","My Wallets"],["import","Import Seed"],["generate","Generate New"]].map(([t, l]) => (
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
              <Label>Vault Password</Label>
              <Input type="password" value={unlockPassword} onChange={e => setUnlockPassword(e.target.value)} placeholder="Enter your vault password" onKeyDown={e => { if (e.key === "Enter") handleUnlock(); }} />
              <Button className="w-full gap-2" disabled={!unlockPassword || busy} onClick={handleUnlock}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />} Unlock
              </Button>
            </div>
          )}

          {/* Locked + no vault -> prompt to create/import */}
          {!isUnlocked && !vaultExists && (
            <div className="p-6 rounded-xl border border-dashed border-border bg-card text-center space-y-3">
              <Wallet className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Create a new wallet or import an existing seed phrase to derive your accounts.</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setTab("generate")}>Generate New</Button>
                <Button variant="outline" onClick={() => setTab("import")}>Import Seed</Button>
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
              <span>One address serves <span className="font-medium text-foreground">all EVM chains</span> (Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB). Balances are read live from each chain; the gas token differs per chain (e.g. POL on Polygon, AVAX on Avalanche, ETH on Arbitrum/Optimism).</span>
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
                    <p className="text-sm font-semibold">EVM Account</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{shortPath(accounts[0]?.index)}</p>
                  </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/15 text-green-400 border-green-500/30 shrink-0">Active</span>
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
                    {copied === "evm-account" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
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
            const dim = asset.status === ASSET_STATUS.COMING_SOON;
            return (
              <div key={asset.symbol} className={`rounded-xl border border-border bg-card overflow-hidden ${dim ? "opacity-60" : ""}`}>
                <button onClick={() => setExpandedSymbol(exp ? null : asset.symbol)} className="w-full p-4 flex items-center gap-3 text-left" title={dim ? "Not yet available." : undefined}>
                  <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: ASSET_COLORS[asset.symbol] || "#64748b" }}>{asset.symbol.slice(0, 2)}</div>
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
                        <div><p className="text-muted-foreground">Gas token</p><p className="font-semibold">{getNetworkInfo(asset.chain).symbol}</p></div>
                      )}
                      {address && (
                        <>
                          <div className="col-span-2"><p className="text-muted-foreground">Path</p><p className="font-semibold font-mono">{shortPath(accounts[0]?.index)}</p></div>
                          <div className="col-span-2">
                            <p className="text-muted-foreground mb-0.5">Address (public)</p>
                            <div className="flex items-center gap-2">
                              <p className="font-mono break-all">{address}</p>
                              <button onClick={() => copy(address, asset.symbol)} className="shrink-0">{copied === asset.symbol ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}</button>
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
          <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-500">
            Never share your seed phrase. It is validated and encrypted locally with your password — it is never sent to a server. Keys never leave this device.
          </div>
          <div>
            <Label>12 or 24-word BIP-39 Mnemonic Phrase</Label>
            <textarea value={importPhrase} onChange={e => setImportPhrase(e.target.value)} rows={3} placeholder="word1 word2 word3 ... word12" className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <Label>Vault Password</Label>
            <Input type="password" className="mt-1.5" value={importPassword} onChange={e => setImportPassword(e.target.value)} placeholder="Encrypts your seed on this device" />
            <p className="text-xs text-muted-foreground mt-1">Used to encrypt the vault (Argon2id + AES-256-GCM). Minimum 8 characters.</p>
          </div>
          <Button className="w-full gap-2" disabled={!importPhrase.trim() || !importPassword || busy} onClick={handleImport}>
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Validate &amp; Import
          </Button>
        </div>
      )}

      {tab === "generate" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive">
            Write down your seed phrase and store it offline. Anyone with this phrase has full access to your wallets. It is shown ONCE and never stored.
          </div>
          {!generatedSeed ? (
            <div className="space-y-3">
              <div>
                <Label>Vault Password</Label>
                <Input type="password" className="mt-1.5" value={genPassword} onChange={e => setGenPassword(e.target.value)} placeholder="Encrypts your new seed on this device" />
                <p className="text-xs text-muted-foreground mt-1">Used to encrypt the vault (Argon2id + AES-256-GCM). Minimum 8 characters.</p>
              </div>
              <Button variant="outline" className="w-full gap-2" disabled={busy} onClick={handleGenerate}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Generate New 12-Word Phrase
              </Button>
            </div>
          ) : (
            <>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold">Your Seed Phrase (shown once)</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowSeed(s => !s)} className="p-1.5 text-muted-foreground hover:text-foreground">{showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    <button onClick={() => copy(generatedSeed, "seed")} className="p-1.5 text-muted-foreground hover:text-foreground">{copied === "seed" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}</button>
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
                    <p className="text-sm text-muted-foreground">Tap the eye icon to reveal your seed phrase</p>
                  </div>
                )}
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground flex items-start gap-2">
                <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Your wallet is unlocked and your first EVM account is derived. After backing up your phrase, open My Wallets to view your accounts.</span>
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
          <DialogHeader><DialogTitle>Derive EVM Accounts</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">Derive additional accounts from your unlocked seed along the standard Ethereum path. Only public addresses are stored.</p>
            <div>
              <Label>Number of accounts</Label>
              <Select value={String(deriveCount)} onValueChange={v => setDeriveCount(parseInt(v))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 3, 5, 10].map(n => <SelectItem key={n} value={String(n)}>{n} account{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{shortPath(0)} … {shortPath(deriveCount - 1)}</p>
            </div>
            <Button className="w-full" disabled={!isUnlocked || busy} onClick={handleDerive}>Derive &amp; Save Public Addresses</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
