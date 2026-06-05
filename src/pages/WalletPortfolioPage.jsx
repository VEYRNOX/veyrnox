// pages/WalletPortfolioPage.jsx — MULTI-WALLET + PORTFOLIOS view (real vault).
//
// Replaces the single-wallet/mock dashboard in the LOCAL/native build. Models:
//   • WALLET   = one BIP-39 seed deriving ALL chains (ETH/EVM, BTC, SOL).
//   • PORTFOLIO = a named group of wallets (one-portfolio-per-wallet partition;
//                 an always-present "Main" holds unassigned wallets).
// Shows the ACTIVE portfolio's wallets, each crypto's amount, and the portfolio's
// USD total (existing price feed). Also the explore-mode surface (no vault → honest
// $0 view-only + create/import CTA). Per-wallet backup tracking warns prominently
// about any seed not yet confirmed backed up (multi-seed fund-loss risk).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Wallet, Plus, Send, Download, ShieldAlert, Eye, EyeOff, Copy, Check,
  RefreshCw, MoreVertical, Pencil, Trash2, SlidersHorizontal, Star, FolderPlus,
  Folder, ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useWallet } from "@/lib/WalletProvider";
import { usePortfolio } from "@/lib/portfolioBalances";
import { ASSETS, getAsset } from "@/wallet-core/assets.js";
import { DEFAULT_ENABLED_ASSETS } from "@/lib/walletMeta";
import { MAIN_PORTFOLIO_ID } from "@/lib/portfolios";
import { formatFiat } from "@/components/FiatCurrencySelector";
import { USD_REFERENCE_NOTE } from "@/lib/cryptos";

const fmtAmount = (n) =>
  n === 0 ? "0" : n < 0.0001 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: 6 });

// Seed reveal grid (shared by the create-backup step and the "back up" action).
function SeedGrid({ mnemonic }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const words = (mnemonic || "").split(" ");
  return (
    <div className="p-3 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold">Recovery Phrase</p>
        <div className="flex gap-2">
          <button onClick={() => setShow((s) => !s)} className="p-1.5 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button onClick={() => { navigator.clipboard?.writeText(mnemonic); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-1.5 text-muted-foreground hover:text-foreground">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {show ? (
        <div className="grid grid-cols-3 gap-2">
          {words.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-xs">
              <span className="text-muted-foreground w-4 text-right">{i + 1}.</span>
              <span className="font-mono font-semibold">{w}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-20 flex items-center justify-center"><p className="text-sm text-muted-foreground">Tap the eye icon to reveal</p></div>
      )}
    </div>
  );
}

// Stand-alone seed backup dialog used by the "Back up Wallet N" action on existing
// wallets (the session already holds the seed in memory; no password needed).
function BackupDialog({ walletName, mnemonic, onClose, onConfirm }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Back up “{walletName}”</DialogTitle></DialogHeader>
        <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive">
          Anyone with this phrase has full access to THIS wallet’s funds, and it is the only way to recover it.
        </div>
        <SeedGrid mnemonic={mnemonic} />
        <DialogFooter>
          <Button className="w-full gap-2" onClick={onConfirm}><Check className="h-4 w-4" /> I’ve written it down — mark backed up</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Asset multi-select chips (used at create/import to pick which assets to show).
function AssetPicker({ selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ASSETS.map((a) => {
        const on = selected.includes(a.symbol);
        return (
          <button key={a.symbol} type="button" onClick={() => onToggle(a.symbol)}
            className={`text-xs px-2 py-1 rounded-md border ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
            {a.symbol}
          </button>
        );
      })}
    </div>
  );
}

// ── Add a wallet: create-new (mandatory backup) OR import-seed. SINGLE Dialog
// whose CONTENT swaps between form → seed-backup, so the backup step is never
// dismissed by a parent Dialog unmount. ──────────────────────────────────────
function AddWalletDialog({ onClose }) {
  const { addWallet, importAdditionalWallet, confirmWalletBackup } = useWallet();
  const [mode, setMode] = useState("create"); // 'create' | 'import'
  const [name, setName] = useState("");
  const [assets, setAssets] = useState([...DEFAULT_ENABLED_ASSETS]);
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null); // { walletId, mnemonic } → backup step

  const toggleAsset = (s) => setAssets((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);

  const doCreate = async () => {
    setError(""); setBusy(true);
    try {
      const res = await addWallet(password, { name: name.trim(), enabledAssets: assets });
      setCreated(res); // swap to backup step (same Dialog)
    } catch (e) { setError(e?.message || "Could not add wallet"); }
    finally { setBusy(false); }
  };
  const doImport = async () => {
    setError(""); setBusy(true);
    try {
      await importAdditionalWallet(password, phrase, { name: name.trim(), enabledAssets: assets });
      toast.success("Wallet imported — all chains derived.");
      onClose();
    } catch (e) { setError(e?.message || "Could not import wallet"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { if (created) confirmWalletBackup(created.walletId); onClose(); } }}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader><DialogTitle>Back up “{name.trim() || "your new wallet"}”</DialogTitle></DialogHeader>
            <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive">
              This wallet has its OWN recovery phrase — back it up separately. It’s the only way to recover this wallet.
            </div>
            <SeedGrid mnemonic={created.mnemonic} />
            <DialogFooter>
              <Button className="w-full gap-2" onClick={() => { confirmWalletBackup(created.walletId); toast.success("Wallet added and backed up."); onClose(); }}>
                <Check className="h-4 w-4" /> I’ve backed it up — done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader><DialogTitle>Add a wallet</DialogTitle></DialogHeader>
            <div className="flex gap-2 p-1 rounded-lg bg-secondary text-xs">
              <button className={`flex-1 py-1.5 rounded-md ${mode === "create" ? "bg-card font-medium" : "text-muted-foreground"}`} onClick={() => setMode("create")}>Create new</button>
              <button className={`flex-1 py-1.5 rounded-md ${mode === "import" ? "bg-card font-medium" : "text-muted-foreground"}`} onClick={() => setMode("import")}>Import seed</button>
            </div>
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground">
                {mode === "create"
                  ? "Generates a NEW seed that derives ALL chains (ETH/EVM, BTC, SOL). You’ll back it up before it’s active."
                  : "Paste an existing 12/24-word seed — all chains are derived automatically (a seed isn’t chain-specific)."}
              </p>
              {mode === "import" && (
                <div>
                  <Label>Recovery phrase</Label>
                  <textarea value={phrase} onChange={(e) => setPhrase(e.target.value)} rows={3} placeholder="word1 word2 ... word12"
                    className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              )}
              <div>
                <Label>Wallet name</Label>
                <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Savings" maxLength={40} />
              </div>
              <div>
                <Label>Assets to show</Label>
                <p className="text-[11px] text-muted-foreground mb-1.5">Display choice only — the seed holds every chain regardless.</p>
                <AssetPicker selected={assets} onToggle={toggleAsset} />
              </div>
              <div>
                <Label>Vault password</Label>
                <Input type="password" className="mt-1.5" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Confirm it’s you to change your vault" />
                <p className="text-xs text-muted-foreground mt-1">Re-entered to authorise a change to your seed vault. Never kept in memory.</p>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button className="w-full gap-2" disabled={busy || !password || (mode === "import" && !phrase.trim())} onClick={mode === "create" ? doCreate : doImport}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {mode === "create" ? "Create & back up" : "Import wallet"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManageAssetsDialog({ wallet, onClose }) {
  const { toggleWalletAsset } = useWallet();
  const enabled = new Set(wallet.enabledAssets || []);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assets for “{wallet.name}”</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Choose which assets show for this wallet. Hidden ones stay out of the way until added.</p>
        <div className="space-y-1.5 pt-1 max-h-80 overflow-y-auto">
          {ASSETS.map((a) => (
            <label key={a.symbol} className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-card cursor-pointer">
              <span className="flex items-center gap-2 text-sm"><span className="font-semibold">{a.symbol}</span><span className="text-xs text-muted-foreground">{a.name}</span></span>
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={enabled.has(a.symbol)} onChange={() => toggleWalletAsset(wallet.id, a.symbol)} />
            </label>
          ))}
        </div>
        <DialogFooter><Button className="w-full" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ wallet, onClose }) {
  const { renameWallet } = useWallet();
  const [name, setName] = useState(wallet?.name || "");
  const save = () => { if (name.trim()) { renameWallet(wallet.id, name.trim()); onClose(); } };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename wallet</DialogTitle></DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <DialogFooter><Button className="w-full" disabled={!name.trim()} onClick={save}>Save name</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ wallet, canRemove, onClose }) {
  const { removeWallet } = useWallet();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const doRemove = async () => {
    setError(""); setBusy(true);
    try { await removeWallet(password, wallet.id); toast.success("Wallet removed from this device."); onClose(); }
    catch (e) { setError(e?.message || "Could not remove wallet"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Remove “{wallet.name}”?</DialogTitle></DialogHeader>
        {!canRemove ? (
          <p className="text-sm text-muted-foreground">This is your only wallet — it can’t be removed. Use Panic Wipe in Security to erase everything.</p>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive">
              Removes this wallet’s seed from this device. {wallet.backedUp ? "You can restore it from its recovery phrase." : "⚠️ NOT backed up — without its phrase it is gone forever."}
            </div>
            <div><Label>Vault password</Label><Input type="password" className="mt-1.5" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
        {canRemove && (
          <DialogFooter>
            <Button variant="destructive" className="w-full gap-2" disabled={busy || !password} onClick={doRemove}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove wallet
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Move a wallet to another portfolio (one-portfolio-per-wallet).
function MovePortfolioDialog({ wallet, portfolios, currentId, onClose }) {
  const { assignWalletToPortfolio } = useWallet();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Move “{wallet.name}” to…</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          {portfolios.map((p) => (
            <button key={p.id} onClick={() => { assignWalletToPortfolio(wallet.id, p.id); toast.success(`Moved to ${p.name}.`); onClose(); }}
              className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border ${p.id === currentId ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary"}`}>
              <span className="flex items-center gap-2 text-sm"><Folder className="h-4 w-4 text-muted-foreground" /> {p.name}</span>
              {p.id === currentId && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Create / rename / delete portfolios.
function ManagePortfoliosDialog({ portfolios, onClose }) {
  const { createPortfolio, renamePortfolio, deletePortfolio } = useWallet();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Portfolios</DialogTitle></DialogHeader>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {portfolios.map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-card">
              <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
              {editId === p.id ? (
                <Input className="h-8" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && editName.trim()) { renamePortfolio(p.id, editName.trim()); setEditId(null); } }} />
              ) : (
                <span className="text-sm flex-1">{p.name}{p.id === MAIN_PORTFOLIO_ID && <span className="text-[10px] text-muted-foreground ml-1">(default)</span>}</span>
              )}
              {editId === p.id ? (
                <button className="p-1 text-primary" onClick={() => { if (editName.trim()) renamePortfolio(p.id, editName.trim()); setEditId(null); }}><Check className="h-4 w-4" /></button>
              ) : (
                <button className="p-1 text-muted-foreground hover:text-foreground" onClick={() => { setEditId(p.id); setEditName(p.name); }}><Pencil className="h-3.5 w-3.5" /></button>
              )}
              {p.id !== MAIN_PORTFOLIO_ID && (
                <button className="p-1 text-destructive" onClick={() => deletePortfolio(p.id)}><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New portfolio name"
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) { createPortfolio(newName.trim()); setNewName(""); } }} />
          <Button className="gap-1.5 shrink-0" disabled={!newName.trim()} onClick={() => { createPortfolio(newName.trim()); setNewName(""); }}>
            <FolderPlus className="h-4 w-4" /> Add
          </Button>
        </div>
        <DialogFooter><Button variant="outline" className="w-full" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WalletPortfolioPage() {
  const navigate = useNavigate();
  const {
    isUnlocked, requireWallet,
    wallets, activeWalletId, switchWallet, walletAddresses,
    revealWalletMnemonic, confirmWalletBackup, isDecoy, isHidden,
    portfolios, activePortfolioId, setActivePortfolio, walletPortfolioMap,
  } = useWallet();

  const [addOpen, setAddOpen] = useState(false);
  const [manageWallet, setManageWallet] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [backupTarget, setBackupTarget] = useState(null);
  const [pfManageOpen, setPfManageOpen] = useState(false);

  const { data: portfolio } = usePortfolio(wallets, walletAddresses);
  const byWallet = portfolio?.byWallet || {};

  const canManage = isUnlocked && !isDecoy && !isHidden;
  const unbacked = canManage ? wallets.filter((w) => !w.backedUp) : [];

  // ── Explore / no-wallet empty state ──
  if (!isUnlocked) {
    return (
      <div className="max-w-lg mx-auto space-y-5 pt-6">
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Portfolio Value</p>
          <p className="text-4xl font-bold">{formatFiat(0, "USD")}</p>
          <p className="text-xs text-muted-foreground">You’re exploring — view only. No wallet yet.</p>
        </div>
        <div className="p-6 rounded-2xl border border-dashed border-border bg-card text-center space-y-4">
          <Wallet className="h-8 w-8 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Look around freely. When you’re ready, create a new self-custody wallet or import an existing seed — keys are generated and encrypted on this device.</p>
          <Button className="w-full gap-2" onClick={() => requireWallet()}><Plus className="h-4 w-4" /> Create or import a wallet</Button>
        </div>
        <div className="grid grid-cols-3 gap-2 opacity-60 pointer-events-none select-none">
          {["ETH", "BTC", "SOL"].map((s) => (
            <div key={s} className="p-3 rounded-xl border border-border bg-card text-center"><p className="text-sm font-semibold">{s}</p><p className="text-xs text-muted-foreground">0.00</p></div>
          ))}
        </div>
      </div>
    );
  }

  // Wallets in the ACTIVE portfolio, and that portfolio's USD total.
  const inActive = (w) => (walletPortfolioMap[w.id] || MAIN_PORTFOLIO_ID) === activePortfolioId;
  const pfWallets = wallets.filter(inActive);
  const pfTotal = pfWallets.reduce((sum, w) => sum + (byWallet[w.id]?.total ?? 0), 0);
  const activePortfolioName = portfolios.find((p) => p.id === activePortfolioId)?.name || "Main";
  const activeWallet = wallets.find((w) => w.id === activeWalletId);
  const activeInThisPortfolio = activeWallet && inActive(activeWallet);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Portfolio switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
        {portfolios.map((p) => (
          <button key={p.id} onClick={() => setActivePortfolio(p.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${p.id === activePortfolioId ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
            <Folder className="h-3 w-3" /> {p.name}
          </button>
        ))}
        {canManage && (
          <button onClick={() => setPfManageOpen(true)} className="shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:bg-secondary">
            <FolderPlus className="h-3.5 w-3.5" /> Portfolios
          </button>
        )}
      </div>

      {/* Active-portfolio total */}
      <div className="text-center py-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{activePortfolioName} · Total Value</p>
        <p className="text-4xl font-bold">{formatFiat(pfTotal, "USD")}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{USD_REFERENCE_NOTE}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {pfWallets.length} wallet{pfWallets.length === 1 ? "" : "s"} in this portfolio
          {isDecoy ? " · decoy session" : isHidden ? " · hidden session" : ""}
        </p>
      </div>

      {/* Global unbacked-wallet warning (fund-loss risk spans all portfolios) */}
      {unbacked.length > 0 && (
        <div className="p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 space-y-2">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              <b>{unbacked.length} wallet{unbacked.length === 1 ? "" : "s"} not backed up.</b> Each wallet has its own recovery phrase — without it, that wallet’s funds are unrecoverable. Back up now.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unbacked.map((w) => (
              <button key={w.id} onClick={() => setBackupTarget({ id: w.id, name: w.name, mnemonic: revealWalletMnemonic(w.id) })}
                className="text-[11px] px-2 py-1 rounded-md bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-500/30">
                Back up “{w.name}”
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" className="flex-col h-16 gap-1" onClick={() => navigate("/send")}><Send className="h-5 w-5" /><span className="text-xs">Send</span></Button>
        <Button variant="secondary" className="flex-col h-16 gap-1" onClick={() => navigate("/receive")}><Download className="h-5 w-5" /><span className="text-xs">Receive</span></Button>
        <Button variant="secondary" className="flex-col h-16 gap-1" disabled={!canManage} onClick={() => setAddOpen(true)}><Plus className="h-5 w-5" /><span className="text-xs">Add wallet</span></Button>
      </div>
      {activeWallet && (
        <p className="text-[11px] text-center text-muted-foreground">
          Send/Receive use <b>{activeWallet.name}</b>{!activeInThisPortfolio ? " (in another portfolio)" : ""}. Tap a wallet below to switch.
        </p>
      )}

      {/* Per-wallet breakdown (active portfolio only) */}
      {pfWallets.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No wallets in “{activePortfolioName}”. Add a wallet, or move one here from its menu.
        </div>
      ) : pfWallets.map((w) => {
        const data = byWallet[w.id] || { assets: [], total: 0 };
        const isActive = w.id === activeWalletId;
        return (
          <div key={w.id} className="rounded-2xl border border-border bg-card overflow-hidden">
            <button onClick={() => switchWallet(w.id)} className="w-full text-left flex items-center justify-between gap-2 px-4 py-3 border-b border-border hover:bg-secondary/40">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {isActive && <Star className="h-3 w-3 text-primary fill-primary shrink-0" />}
                  <p className="text-sm font-semibold truncate">{w.name}</p>
                  {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">Active</span>}
                  {w.backedUp
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">Backed up</span>
                    : <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500">Back up</span>}
                </div>
                <p className="text-xs text-muted-foreground">{formatFiat(data.total, "USD")}</p>
              </div>
              {canManage && (
                <span className="relative" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === w.id ? null : w.id); }}>
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  {menuFor === w.id && (
                    <div className="absolute right-0 top-6 z-20 w-48 rounded-xl border border-border bg-popover shadow-lg py-1 text-sm">
                      <button className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-2" onClick={() => { setMenuFor(null); setManageWallet(w); }}><SlidersHorizontal className="h-3.5 w-3.5" /> Manage assets</button>
                      <button className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-2" onClick={() => { setMenuFor(null); setRenameTarget(w); }}><Pencil className="h-3.5 w-3.5" /> Rename</button>
                      <button className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-2" onClick={() => { setMenuFor(null); setMoveTarget(w); }}><ArrowRightLeft className="h-3.5 w-3.5" /> Move to portfolio</button>
                      {!w.backedUp && <button className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-2" onClick={() => { setMenuFor(null); setBackupTarget({ id: w.id, name: w.name, mnemonic: revealWalletMnemonic(w.id) }); }}><ShieldAlert className="h-3.5 w-3.5" /> Back up</button>}
                      <button className="w-full text-left px-3 py-2 hover:bg-secondary text-destructive flex items-center gap-2" onClick={() => { setMenuFor(null); setRemoveTarget(w); }}><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                    </div>
                  )}
                </span>
              )}
            </button>
            <div className="divide-y divide-border">
              {(w.enabledAssets || []).length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground text-center">No assets shown. Use “Manage assets”.</p>
              ) : (w.enabledAssets || []).map((symbol) => {
                const a = getAsset(symbol);
                const row = data.assets.find((x) => x.symbol === symbol) || { amount: 0, usd: 0 };
                return (
                  <div key={symbol} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2"><span className="text-sm font-medium">{symbol}</span><span className="text-xs text-muted-foreground">{a?.name}</span></div>
                    <div className="text-right"><p className="text-sm font-mono">{fmtAmount(row.amount)}</p><p className="text-[10px] text-muted-foreground">{formatFiat(row.usd, "USD")}</p></div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {addOpen && <AddWalletDialog onClose={() => setAddOpen(false)} />}
      {manageWallet && <ManageAssetsDialog wallet={manageWallet} onClose={() => setManageWallet(null)} />}
      {renameTarget && <RenameDialog wallet={renameTarget} onClose={() => setRenameTarget(null)} />}
      {removeTarget && <RemoveDialog wallet={removeTarget} canRemove={wallets.length > 1} onClose={() => setRemoveTarget(null)} />}
      {moveTarget && <MovePortfolioDialog wallet={moveTarget} portfolios={portfolios} currentId={walletPortfolioMap[moveTarget.id] || MAIN_PORTFOLIO_ID} onClose={() => setMoveTarget(null)} />}
      {pfManageOpen && <ManagePortfoliosDialog portfolios={portfolios} onClose={() => setPfManageOpen(false)} />}
      {backupTarget && (
        <BackupDialog walletName={backupTarget.name} mnemonic={backupTarget.mnemonic}
          onClose={() => setBackupTarget(null)}
          onConfirm={() => { confirmWalletBackup(backupTarget.id); toast.success(`“${backupTarget.name}” marked backed up.`); setBackupTarget(null); }} />
      )}
    </div>
  );
}
