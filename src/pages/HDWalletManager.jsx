import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wallet, Plus, Eye, EyeOff, Copy, Check, RefreshCw, Download, Shield, ChevronDown, ChevronRight, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NETWORKS = [
  { id: "ethereum", name: "Ethereum", symbol: "ETH", path: "m/44'/60'/0'/0", color: "#627EEA" },
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC", path: "m/44'/0'/0'/0", color: "#F97316" },
  { id: "solana", name: "Solana", symbol: "SOL", path: "m/44'/501'/0'/0'", color: "#14B8A6" },
  { id: "cosmos", name: "Cosmos", symbol: "ATOM", path: "m/44'/118'/0'/0", color: "#8B5CF6" },
  { id: "tron", name: "TRON", symbol: "TRX", path: "m/44'/195'/0'/0", color: "#EF4444" },
  { id: "bnb", name: "BNB Chain", symbol: "BNB", path: "m/44'/60'/0'/0", color: "#F3BA2F" },
];

const BIP39_WORDS = ["abandon","ability","able","about","above","absent","absorb","abstract","absurd","abuse","access","accident","account","accuse","achieve","acid","acoustic","acquire","across","act","action","actor","actress","actual","adapt","add","addict","address","adjust","admit","adult","advance","advice","aerobic","afford","afraid","again","age","agent","agree","ahead","aim","air","airport","aisle","alarm","album","alcohol","alert","alien","all","alley","allow","almost","alone","alpha","already","also","alter","always","amateur","amazing","among","amount","amused","analyst","anchor","ancient","anger","angle","angry","animal","ankle","announce","annual","another","answer","antenna","antique","anxiety","any","apart","apology","appear","apple","approve","april","arch","arctic","area","arena","argue","arm","armed","armor","army","around","arrange","arrest","arrive","arrow","art","artist","artwork","ask","aspect","assault","asset","assist","assume","asthma","athlete","atom","attack","attend","attitude","attract","auction","audit","august","aunt","author","auto","autumn","average","avocado","avoid","awake","aware","away","awesome","awful","awkward"];

function generateMnemonic(words = 12) {
  return Array.from({ length: words }, () => BIP39_WORDS[Math.floor(Math.random() * BIP39_WORDS.length)]).join(" ");
}

function deriveAddress(network, index) {
  const seed = `${network.id}-${index}`;
  const hash = Array.from(seed).reduce((a, c) => a * 31 + c.charCodeAt(0), 0).toString(16);
  const pad = hash.padStart(40, "0").slice(0, 40);
  if (network.id === "bitcoin") return `bc1q${pad.slice(0, 38)}`;
  if (network.id === "solana") return pad.toUpperCase().slice(0, 44) + "So1";
  if (network.id === "tron") return `T${pad.slice(0, 41)}`;
  if (network.id === "cosmos") return `cosmos1${pad.slice(0, 38)}`;
  return `0x${pad}`;
}

const MOCK_WALLETS = [
  { id: "hw1", name: "Main Wallet", derivation_index: 0, network: "ethereum", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", balance: 2.541, currency: "ETH", hd_wallet_id: "seed1" },
  { id: "hw2", name: "Trading Wallet", derivation_index: 1, network: "ethereum", address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", balance: 0.85, currency: "ETH", hd_wallet_id: "seed1" },
  { id: "hw3", name: "BTC Cold Storage", derivation_index: 0, network: "bitcoin", address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", balance: 0.12, currency: "BTC", hd_wallet_id: "seed1" },
];

export default function HDWalletManager() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("wallets");
  const [showSeed, setShowSeed] = useState(false);
  const [generatedSeed, setGeneratedSeed] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [importNetwork, setImportNetwork] = useState("ethereum");
  const [importCount, setImportCount] = useState(3);
  const [copied, setCopied] = useState(false);
  const [newWalletOpen, setNewWalletOpen] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", network: "ethereum", derivation_index: 0 });
  const [expandedId, setExpandedId] = useState(null);

  const { data: wallets = [] } = useQuery({ queryKey: ["hd-wallets"], queryFn: () => base44.entities.Wallet.filter({ hd_wallet_id: { $exists: true } }) });
  const displayed = wallets.length > 0 ? wallets : MOCK_WALLETS;

  const create = useMutation({
    mutationFn: (d) => {
      const net = NETWORKS.find(n => n.id === d.network);
      const addr = deriveAddress(net, d.derivation_index);
      return base44.entities.Wallet.create({ ...d, address: addr, balance: 0, currency: net.symbol, hd_wallet_id: "seed1" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hd-wallets"] }); setNewWalletOpen(false); },
  });

  const copy = (text) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const newSeed = () => { setGeneratedSeed(generateMnemonic(12)); setShowSeed(false); };

  const importedAddresses = Array.from({ length: importCount }, (_, i) => {
    const net = NETWORKS.find(n => n.id === importNetwork);
    return { index: i, path: `${net.path}/${i}`, address: deriveAddress(net, i) };
  });

  const USD = { ETH: 3200, BTC: 68000, SOL: 167, ATOM: 9.5, TRX: 0.12, BNB: 412 };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Key className="h-5 w-5 text-primary" /> HD Wallet Manager</h1>
          <p className="text-sm text-muted-foreground">BIP-44 multi-wallet derivation from one seed phrase</p>
        </div>
        <Button onClick={() => setNewWalletOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Derive Wallet</Button>
      </div>

      <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
        {[["wallets","My Wallets"],["import","Import Seed"],["generate","Generate New"]].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {tab === "wallets" && (
        <div className="space-y-3">
          {displayed.map(w => {
            const net = NETWORKS.find(n => n.id === w.network) || NETWORKS[0];
            const usd = (w.balance || 0) * (USD[w.currency] || 1);
            const exp = expandedId === w.id;
            return (
              <div key={w.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <button onClick={() => setExpandedId(exp ? null : w.id)} className="w-full p-4 flex items-center gap-3 text-left">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: net.color }}>{net.symbol.slice(0,2)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{w.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{w.address}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm">{w.balance} {w.currency}</p>
                    <p className="text-xs text-muted-foreground">${usd.toFixed(2)}</p>
                  </div>
                  {exp ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                {exp && (
                  <div className="border-t border-border px-4 py-3 bg-secondary/20 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-muted-foreground">Network</p><p className="font-semibold">{net.name}</p></div>
                      <div><p className="text-muted-foreground">Path</p><p className="font-semibold font-mono">{net.path}/{w.derivation_index ?? 0}</p></div>
                      <div className="col-span-2"><p className="text-muted-foreground mb-0.5">Full Address</p>
                        <div className="flex items-center gap-2">
                          <p className="font-mono break-all">{w.address}</p>
                          <button onClick={() => copy(w.address)} className="shrink-0">{copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}</button>
                        </div>
                      </div>
                    </div>
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
            Never share your seed phrase. Enter it only in trusted, offline environments. This app simulates derivation — never submits your phrase to a server.
          </div>
          <div>
            <Label>12 or 24-word BIP-39 Mnemonic Phrase</Label>
            <textarea value={importPhrase} onChange={e => setImportPhrase(e.target.value)} rows={3} placeholder="word1 word2 word3 ... word12" className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Network</Label>
              <Select value={importNetwork} onValueChange={setImportNetwork}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{NETWORKS.map(n => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Derive Accounts</Label>
              <Select value={String(importCount)} onValueChange={v => setImportCount(parseInt(v))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,3,5,10].map(n => <SelectItem key={n} value={String(n)}>{n} account{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {importPhrase.trim() && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Derived Accounts ({NETWORKS.find(n => n.id === importNetwork)?.path})</p>
              {importedAddresses.map(a => (
                <div key={a.index} className="p-3 rounded-xl border border-border bg-card flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">Account {a.index}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{a.path}</p>
                    <p className="text-xs font-mono mt-0.5">{a.address}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0">Import</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "generate" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive">
            Write down your seed phrase and store it offline. Anyone with this phrase has full access to your wallets.
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={newSeed}><RefreshCw className="h-4 w-4" /> Generate New 12-Word Phrase</Button>
          {generatedSeed && (
            <>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold">Your Seed Phrase</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowSeed(s => !s)} className="p-1.5 text-muted-foreground hover:text-foreground">{showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    <button onClick={() => copy(generatedSeed)} className="p-1.5 text-muted-foreground hover:text-foreground">{copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}</button>
                  </div>
                </div>
                {showSeed ? (
                  <div className="grid grid-cols-3 gap-2">
                    {generatedSeed.split(" ").map((w, i) => (
                      <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-xs">
                        <span className="text-muted-foreground w-4 text-right">{i+1}.</span>
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
                <span>After writing down your phrase, tap Derive Wallets to generate accounts across networks.</span>
              </div>
              <Button className="w-full gap-2"><Download className="h-4 w-4" /> Derive Wallets From This Phrase</Button>
            </>
          )}
        </div>
      )}

      <Dialog open={newWalletOpen} onOpenChange={setNewWalletOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Derive New Wallet</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Wallet Name</Label><Input className="mt-1.5" placeholder="e.g. Trading Wallet #2" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Network</Label>
              <Select value={newForm.network} onValueChange={v => setNewForm(f => ({ ...f, network: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{NETWORKS.map(n => <SelectItem key={n.id} value={n.id}>{n.name} ({n.symbol})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Derivation Index</Label>
              <Input type="number" min="0" className="mt-1.5 font-mono" value={newForm.derivation_index} onChange={e => setNewForm(f => ({ ...f, derivation_index: parseInt(e.target.value) || 0 }))} />
              <p className="text-xs text-muted-foreground mt-1">Path: {NETWORKS.find(n => n.id === newForm.network)?.path}/{newForm.derivation_index}</p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground">
              Derived address: <span className="font-mono">{deriveAddress(NETWORKS.find(n => n.id === newForm.network) || NETWORKS[0], newForm.derivation_index)}</span>
            </div>
            <Button className="w-full" disabled={!newForm.name || create.isPending} onClick={() => create.mutate(newForm)}>Derive and Add Wallet</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}