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

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Wallet, Plus, Send, Download, ShieldAlert, Eye, EyeOff, Copy, Check,
  RefreshCw, MoreVertical, Pencil, Trash2, SlidersHorizontal, Star, FolderPlus,
  Folder, ArrowRightLeft, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useWallet } from "@/lib/WalletProvider";
import { useActionGuard } from "@/components/security/useActionGuard";
import { usePortfolio, sumPortfolioTotal } from "@/lib/portfolioBalances";
import { ASSETS, getAsset } from "@/wallet-core/assets.js";
import { DEFAULT_ENABLED_ASSETS } from "@/lib/walletMeta";
import { MAIN_PORTFOLIO_ID } from "@/lib/portfolios";
import { formatFiat } from "@/components/FiatCurrencySelector";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import CoinLogo from "@/components/CoinLogo";
import QuickAccessGrid from "@/components/QuickAccessGrid";
import SpendingPatternsCard from "@/components/SpendingPatternsCard";
import { copySecret } from "@/lib/copySecret";

const fmtAmount = (n) =>
  n == null ? "—" // indeterminate: read failed (I4 fail-closed) — never shown as "0"
    : n === 0 ? "0"
    : n < 0.0001 ? n.toExponential(2)
    : n.toLocaleString(undefined, { maximumFractionDigits: 6 });

// "12:04" local time for the live-price freshness stamp.
const fmtPriceTime = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");

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
          <button onClick={() => setShow((s) => !s)} aria-label={show ? "Hide recovery phrase" : "Show recovery phrase"} className="flex items-center justify-center min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button onClick={async () => { await copySecret(mnemonic); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copy recovery phrase" className="flex items-center justify-center min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground">
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {show ? (
        <div className="grid grid-cols-3 gap-2">
          {words.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-xs">
              <span className="text-muted-foreground w-4 text-right">{i + 1}.</span>
              <span className="mono-value font-semibold">{w}</span>
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
                  <textarea value={phrase} onChange={(e) => setPhrase(e.target.value)} rows={3} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="word1 word2 ... word12"
                    className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm mono-value resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
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
                <button className="p-1 text-primary" aria-label="Save portfolio name" onClick={() => { if (editName.trim()) renamePortfolio(p.id, editName.trim()); setEditId(null); }}><Check className="h-4 w-4" /></button>
              ) : (
                <button className="p-1 text-muted-foreground hover:text-foreground" aria-label={`Rename ${p.name}`} onClick={() => { setEditId(p.id); setEditName(p.name); }}><Pencil className="h-3.5 w-3.5" /></button>
              )}
              {p.id !== MAIN_PORTFOLIO_ID && (
                <button className="p-1 text-destructive" aria-label={`Delete ${p.name}`} onClick={() => deletePortfolio(p.id)}><Trash2 className="h-3.5 w-3.5" /></button>
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
  // 2FA: gate the seed reveal behind the PIN + Action Password when one is configured.
  const { requireTwoFactor, gateModal } = useActionGuard();

  const [addOpen, setAddOpen] = useState(false);
  const [manageWallet, setManageWallet] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [backupTarget, setBackupTarget] = useState(null);
  const [pfManageOpen, setPfManageOpen] = useState(false);
  // Zero-state: when the active portfolio is genuinely $0, the per-wallet asset
  // rows are collapsed behind a calm "Wallet ready" panel. This toggle reveals
  // the real (all-zero) rows on demand — nothing is hidden dishonestly.
  const [showZeroAssets, setShowZeroAssets] = useState(false);

  // The I3 set-seal is UPSTREAM of this call: `wallets`/`walletAddresses` are
  // only the seeds THIS unlock decrypted (decoy unlock → decoy seeds, real →
  // real). So "across ALL wallets" is already scoped to the unlocked set — the
  // provider never decrypted another set, and usePortfolio cannot reach one.
  const { data: portfolio, isLoading: portfolioLoading, priceBasis, pricesUpdatedAt, refetchPrices } = usePortfolio(wallets, walletAddresses);
  const byWallet = /** @type {any} */ (portfolio?.byWallet || {});

  const canManage = isUnlocked && !isDecoy && !isHidden;

  // Receive detection: on each poll, compare per-wallet USD total against the previous
  // value. A positive delta of >$0.001 (rounding noise floor) fires a notification.
  // Guard: canManage — fake/decoy balances must never emit (I3, no-fake-security).
  // Skip indeterminate reads. First poll sets the baseline only.
  const prevTotalsRef = useRef(/** @type {Record<string, number>} */ ({}));
  useEffect(() => {
    if (!canManage) return;
    if (!portfolio?.byWallet) return;
    const ts = Date.now();
    for (const [walletId, walletData] of Object.entries(portfolio.byWallet)) {
      const curr = walletData?.total;
      if (typeof curr !== 'number' || walletData?.indeterminate) continue;
      const prev = prevTotalsRef.current[walletId];
      if (typeof prev === 'number' && curr > prev + 0.001) {
        // Duplicate removed: useReceiveDetector (Layout.jsx) is the canonical
        // receive-notification source. Emitting here produced two toasts with
        // different amount strings (USD delta vs native-unit delta) for one receive.
      }
      prevTotalsRef.current[walletId] = curr;
    }
  }, [portfolio, canManage]);
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
  // pfIncomplete = at least one constituent balance read FAILED, so pfTotal sums
  // only what was readable and is understated. We surface that rather than fold
  // failure into a confident number (I4 fail-closed). Identical in decoy/real.
  const { total: pfTotal, indeterminate: pfIncomplete } = sumPortfolioTotal(pfWallets, byWallet);
  const activePortfolioName = portfolios.find((p) => p.id === activePortfolioId)?.name || "Main";
  const activeWallet = wallets.find((w) => w.id === activeWalletId);
  const activeInThisPortfolio = activeWallet && inActive(activeWallet);

  // Genuine $0 zero-state: the portfolio has wallet(s) but no value anywhere, and
  // balances have finished loading (so we don't flash this over a pending fetch).
  // Testnet balances are commonly 0, so this is the expected fresh-wallet view.
  // Fail-closed: a $0 total that is actually INCOMPLETE (a read failed) must NOT
  // claim "no balance yet" — we can't assert emptiness we couldn't confirm.
  const isZeroState = !portfolioLoading && pfWallets.length > 0 && pfTotal === 0 && !pfIncomplete;

  // Per-wallet cards (active portfolio). Built once so the same markup serves both
  // the funded view and the expanded zero-state — no duplication.
  const walletCards = pfWallets.map((w) => {
    const data = byWallet[w.id] || { assets: [], total: 0 };
    const isActive = w.id === activeWalletId;
    return (
      <div key={w.id} className="rounded-2xl border border-border bg-card overflow-hidden">
        <button onClick={() => switchWallet(w.id)} className="w-full text-left flex items-center justify-between gap-2 px-4 py-3 border-b border-border hover:bg-secondary/40 active:bg-secondary/60 transition-colors">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isActive && <Star className="h-3 w-3 text-primary fill-primary shrink-0" />}
              <p className="text-sm font-semibold truncate">{w.name}</p>
              {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">Active</span>}
              {w.backedUp
                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success">Backed up</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded bg-caution/15 text-caution">Back up</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatFiat(data.total, "USD")}
              {data.indeterminate && <span className="text-caution"> · partial</span>}
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              aria-label={`Options for ${w.name}`}
              aria-haspopup="menu"
              aria-expanded={menuFor === w.id}
              onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === w.id ? null : w.id); }}
              className="relative flex items-center justify-center min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4" />
              {menuFor === w.id && (
                <div className="absolute right-0 top-6 z-20 w-48 rounded-xl border border-border bg-popover shadow-lg py-1 text-sm">
                  <button className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-2" onClick={() => { setMenuFor(null); setManageWallet(w); }}><SlidersHorizontal className="h-3.5 w-3.5" /> Manage assets</button>
                  <button className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-2" onClick={() => { setMenuFor(null); setRenameTarget(w); }}><Pencil className="h-3.5 w-3.5" /> Rename</button>
                  <button className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-2" onClick={() => { setMenuFor(null); setMoveTarget(w); }}><ArrowRightLeft className="h-3.5 w-3.5" /> Move to portfolio</button>
                  {!w.backedUp && <button className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-2" onClick={() => { setMenuFor(null); requireTwoFactor(() => setBackupTarget({ id: w.id, name: w.name, mnemonic: revealWalletMnemonic(w.id, { callerGated: true }) }), { title: "Reveal your recovery phrase" }); }}><ShieldAlert className="h-3.5 w-3.5" /> Back up</button>}
                  <button className="w-full text-left px-3 py-2 hover:bg-secondary text-destructive flex items-center gap-2" onClick={() => { setMenuFor(null); setRemoveTarget(w); }}><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                </div>
              )}
            </button>
          )}
        </button>
        <div className="divide-y divide-border">
          {(w.enabledAssets || []).length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground text-center">No assets shown. Use “Manage assets”.</p>
          ) : (w.enabledAssets || []).map((symbol) => {
            const a = getAsset(symbol);
            const row = data.assets.find((x) => x.symbol === symbol) || { amount: 0, usd: 0 };
            return (
              <div key={symbol} className="flex items-center gap-3 px-4 py-2.5">
                <CoinLogo symbol={symbol} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{symbol}</p>
                  <p className="text-xs text-muted-foreground truncate">{a?.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-sm font-mono flex items-center justify-end gap-1"
                    title={row.indeterminate ? "Balance couldn't be loaded" : undefined}
                  >
                    {fmtAmount(row.amount)}
                    {row.indeterminate && (
                      <span
                        aria-label="Balance couldn't be loaded"
                        className="text-amber-400 opacity-70 text-xs leading-none"
                      >
                        ⚠
                      </span>
                    )}
                  </p>
                  {/* indeterminate read → "—", not a misleading $0.00 */}
                  <p className="text-[10px] text-muted-foreground">{row.indeterminate ? "—" : formatFiat(row.usd, "USD")}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

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
        {/* I4 fail-closed: when a balance read failed, the total is incomplete —
            say so rather than presenting a silently-understated figure as fact.
            Same copy in decoy and real sessions (no isDecoy branch). */}
        {pfIncomplete && (
          <p className="text-xs text-caution mt-1">
            Some balances couldn’t be loaded — this total may be incomplete.
          </p>
        )}
        <div className="mt-1 flex justify-center">
          {priceBasis === "live" ? (
            <button
              type="button"
              onClick={() => refetchPrices?.()}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              title="Refresh live prices"
            >
              <RefreshCw className="h-3 w-3" />
              {"Live"}{pricesUpdatedAt ? " · " + fmtPriceTime(pricesUpdatedAt) : ""}
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground">Approximate</span>
          )}
        </div>
        <ReferenceRateNote />
        {/* DENIABILITY (CLAUDE.md "never show wallet count/list" · I3 / KEK spec §5):
            a wallet-COUNT line is a cardinality tell — it reveals how many wallets
            the active context holds, and a coercer comparing counts across unlocks
            can infer a real set exists elsewhere, defeating the terminus property.
            The count carried no user-facing function (the wallet list below already
            shows what is here), so it is removed outright. isDecoy/isHidden stay
            internal flags that gate mutations (add/remove wallet), never a visible
            badge or count. */}
      </div>

      {/* Global unbacked-wallet warning (fund-loss risk spans all portfolios) */}
      {unbacked.length > 0 && (
        <div className="p-3 rounded-xl border border-caution/40 bg-caution/10 space-y-2">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-caution">
              <b>{unbacked.length} wallet{unbacked.length === 1 ? "" : "s"} not backed up.</b> Each wallet has its own recovery phrase — without it, that wallet’s funds are unrecoverable. Back up now.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unbacked.map((w) => (
              <button key={w.id} onClick={() => requireTwoFactor(() => setBackupTarget({ id: w.id, name: w.name, mnemonic: revealWalletMnemonic(w.id, { callerGated: true }) }), { title: "Reveal your recovery phrase" })}
                className="text-[11px] px-2 py-1 rounded-md bg-caution/20 text-caution hover:bg-caution/30">
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
      ) : isZeroState ? (
        <div className="space-y-3">
          {/* Calm "ready to fund" affordance instead of a wall of all-zero rows.
              The claim below is precise: keys never leave the device (I1). The
              address itself IS shared with public RPC/explorer nodes to read
              balances, so we deliberately do NOT claim the address is device-only. */}
          <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Download className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold">Your wallet is ready</p>
              <p className="text-sm text-muted-foreground">
                This portfolio has no balance yet. Receive crypto to fund it — your keys never leave this device.
              </p>
            </div>
            <Button className="w-full gap-2" onClick={() => navigate("/receive")}>
              <Download className="h-4 w-4" /> Receive
            </Button>
          </div>
          {/* Asset-scoped disclosure (no count → cannot be misread as a wallet
              count). Reveals the real, all-zero rows on demand. */}
          <button
            onClick={() => setShowZeroAssets((s) => !s)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            {showZeroAssets ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showZeroAssets ? "Hide assets" : "Show all assets"}
          </button>
          {showZeroAssets && <div className="space-y-4">{walletCards}</div>}
        </div>
      ) : (
        walletCards
      )}

      {/* Spending patterns — outflow over time, per-asset native units. Reads the
          active wallet's send history ON DEMAND only (collapsed until tapped), so
          it adds no background indexer disclosure. Identical in decoy and real. */}
      <SpendingPatternsCard />

      {/* Quick access to genuinely BUILT features (see QuickAccessGrid). */}
      <QuickAccessGrid />

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
      {/* PIN + Action Password 2FA gate (seed reveal) — no-op until one is configured */}
      {gateModal}
    </div>
  );
}
