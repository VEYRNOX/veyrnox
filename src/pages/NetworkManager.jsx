// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Wifi, Trash2, CheckCircle, Globe, TestTube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assertSafeRpcUrl, safeExplorerUrl } from "@/wallet-core/netUrl.js";
import CoinLogo from "@/components/CoinLogo";
import { useWallet } from "@/lib/WalletProvider";

const DEFAULTS = [
  { id: "d1", name: "Ethereum Mainnet", rpc_url: "https://mainnet.infura.io/v3/", chain_id: 1, symbol: "ETH", explorer_url: "https://etherscan.io", is_testnet: false, is_active: true, logo_color: "#627EEA" },
  { id: "d2", name: "BNB Smart Chain", rpc_url: "https://bsc-dataseed.binance.org/", chain_id: 56, symbol: "BNB", explorer_url: "https://bscscan.com", is_testnet: false, is_active: false, logo_color: "#F3BA2F" },
  { id: "d3", name: "Polygon", rpc_url: "https://polygon-rpc.com/", chain_id: 137, symbol: "MATIC", explorer_url: "https://polygonscan.com", is_testnet: false, is_active: false, logo_color: "#8247E5" },
  { id: "d4", name: "Arbitrum One", rpc_url: "https://arb1.arbitrum.io/rpc", chain_id: 42161, symbol: "ETH", explorer_url: "https://arbiscan.io", is_testnet: false, is_active: false, logo_color: "#28A0F0" },
  { id: "d5", name: "Optimism", rpc_url: "https://mainnet.optimism.io", chain_id: 10, symbol: "ETH", explorer_url: "https://optimistic.etherscan.io", is_testnet: false, is_active: false, logo_color: "#FF0420" },
  { id: "d6", name: "Avalanche C-Chain", rpc_url: "https://api.avax.network/ext/bc/C/rpc", chain_id: 43114, symbol: "AVAX", explorer_url: "https://snowtrace.io", is_testnet: false, is_active: false, logo_color: "#E84142" },
  { id: "d7", name: "Ethereum Sepolia", rpc_url: "https://rpc.sepolia.org", chain_id: 11155111, symbol: "SepoliaETH", explorer_url: "https://sepolia.etherscan.io", is_testnet: true, is_active: false, logo_color: "#627EEA" },
];

export default function NetworkManager() {
  const qc = useQueryClient();
  const { isDecoy, isHidden } = useWallet();
  const deniable = isDecoy || isHidden;
  const [open, setOpen] = useState(false);
  const [showTestnets, setShowTestnets] = useState(false);
  const [form, setForm] = useState({ name: "", rpc_url: "", chain_id: "", symbol: "", explorer_url: "", is_testnet: false, logo_color: "#627EEA" });
  const [urlError, setUrlError] = useState(null);

  // Codex P2 2026-08-15: NetworkConfig lives in the shared Base44 local
  // entity DB (same K-2 class as AddressBook / PersonalWatchlist). A
  // decoy/hidden session could BOTH read the real user's custom RPC
  // overrides AND mutate them (add an attacker-controlled endpoint that
  // the primary session then routes signing traffic through — full
  // I2/I5 escalation). Two-chokepoint gate: query enabled on !deniable
  // AND local blank of the derived `dbNetworks` array, AND each
  // mutationFn throws DENIABILITY_BLOCKED before touching the store.
  // Same shape as AddressBook / WatchlistWidget fixes in this wave.
  const { data: dbNetworksRaw = [] } = useQuery({
    queryKey: ["networks"],
    queryFn: () => base44.entities.NetworkConfig.list(),
    enabled: !deniable,
  });
  const dbNetworks = deniable ? [] : dbNetworksRaw;
  const networks = dbNetworks.length > 0 ? dbNetworks : DEFAULTS;

  const denyInDeniable = () => {
    throw Object.assign(new Error('Network Manager is not available in this session'), { code: 'DENIABILITY_BLOCKED' });
  };

  const activate = useMutation({
    mutationFn: async (id) => {
      if (deniable) denyInDeniable();
      if (dbNetworks.length === 0) return;
      await Promise.all(networks.map(n => base44.entities.NetworkConfig.update(n.id, { is_active: n.id === id })));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networks"] }),
  });

  const create = useMutation({
    mutationFn: (/** @type {any} */ d) => {
      if (deniable) denyInDeniable();
      return base44.entities.NetworkConfig.create({ ...d, chain_id: parseInt(d.chain_id) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["networks"] }); setOpen(false); setForm({ name: "", rpc_url: "", chain_id: "", symbol: "", explorer_url: "", is_testnet: false, logo_color: "#627EEA" }); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => {
      if (deniable) denyInDeniable();
      return base44.entities.NetworkConfig.delete(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networks"] }),
  });

  const active = networks.find(n => n.is_active);
  const visible = networks.filter(n => showTestnets || !n.is_testnet);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Network Manager</h1>
          <p className="text-sm text-muted-foreground">Switch networks or add a custom network</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={deniable} className="gap-2"><Plus className="h-4 w-4" /> Add Network</Button>
      </div>

      {active && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex items-center gap-3">
          <CoinLogo symbol={active.symbol} size={40} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{active.name}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>Network ID: {active.chain_id}</span>
              <span className="font-mono truncate max-w-[200px]">{active.rpc_url}</span>
            </div>
          </div>
          <div className="ms-auto flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5 text-xs text-success font-semibold">
              <Wifi className="h-3.5 w-3.5" /> Selected
            </div>
            <p className="text-[10px] text-muted-foreground">selected network — not a live connection test</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">All Networks ({visible.length})</p>
        <div className="flex items-center gap-2 text-xs">
          <TestTube className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Show test networks</span>
          <Switch checked={showTestnets} onCheckedChange={setShowTestnets} />
        </div>
      </div>

      <div className="space-y-2">
        {visible.map(n => (
          <div key={n.id} className={`p-4 rounded-xl border bg-card flex items-center gap-3 ${n.is_active ? "border-primary/30" : "border-border"}`}>
            <CoinLogo symbol={n.symbol} size={36} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-medium truncate">{n.name}</p>
                {n.is_testnet && <span className="text-[9px] px-1.5 py-0.5 rounded bg-caution/10 text-caution font-semibold">Test Network</span>}
                {n.is_active && <CheckCircle className="h-3.5 w-3.5 text-success" />}
              </div>
              <p className="text-xs text-muted-foreground">Network {n.chain_id} · {n.symbol}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!n.is_active && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => activate.mutate(n.id)}>Switch</Button>
              )}
              {safeExplorerUrl(n.explorer_url) && (
                <a href={safeExplorerUrl(n.explorer_url)} target="_blank" rel="noreferrer" aria-label="Open block explorer" className="p-1.5 text-muted-foreground hover:text-foreground"><Globe className="h-3.5 w-3.5" /></a>
              )}
              {dbNetworks.length > 0 && (
                <button onClick={() => remove.mutate(n.id)} aria-label="Remove network" className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Custom Network</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label htmlFor="network-name">Network Name</Label><Input id="network-name" className="mt-1.5" placeholder="My Custom Chain" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label htmlFor="network-url">Network URL</Label><Input id="network-url" className="mt-1.5 font-mono text-xs" placeholder="https://rpc.example.com" value={form.rpc_url} onChange={e => setForm(f => ({ ...f, rpc_url: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="network-chain-id">Network ID</Label><Input id="network-chain-id" type="number" className="mt-1.5" placeholder="1" value={form.chain_id} onChange={e => setForm(f => ({ ...f, chain_id: e.target.value }))} /></div>
              <div><Label htmlFor="network-symbol">Native Symbol</Label><Input id="network-symbol" className="mt-1.5" placeholder="ETH" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} /></div>
            </div>
            <div><Label htmlFor="network-explorer-url">Block Explorer URL (optional)</Label><Input id="network-explorer-url" className="mt-1.5 font-mono text-xs" placeholder="https://etherscan.io" value={form.explorer_url} onChange={e => setForm(f => ({ ...f, explorer_url: e.target.value }))} /></div>
            <div className="flex items-center justify-between p-3 rounded-xl border border-border">
              <Label>This is a test network</Label>
              <Switch checked={form.is_testnet} onCheckedChange={v => setForm(f => ({ ...f, is_testnet: v }))} />
            </div>
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
            <Button className="w-full" disabled={!form.name || !form.rpc_url || !form.chain_id || create.isPending} onClick={() => {
              try { assertSafeRpcUrl(form.rpc_url); } catch (e) { setUrlError(e.message); return; }
              if (form.explorer_url?.trim() && !safeExplorerUrl(form.explorer_url)) {
                setUrlError("Block Explorer URL must be https:// (javascript:, data:, file: are blocked).");
                return;
              }
              setUrlError(null);
              create.mutate(form);
            }}>Add Network</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}