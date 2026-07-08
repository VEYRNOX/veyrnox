import { useState } from "react";
import { Fuel, Info } from "lucide-react";
import FeeSelector from "@/components/FeeSelector";
import { getNetworkInfo, ALLOW_MAINNET } from "@/wallet-core/evm/networks";
import { ALLOW_BTC_MAINNET } from "@/wallet-core/btc/networks";
import { ALLOW_SOL_MAINNET } from "@/wallet-core/sol/networks";

// Per-chain fee control. Each chain has a genuinely different fee model and is
// shown in its own native units (EIP-1559 gwei for EVM, sat/vByte for BTC,
// lamports + µlam/CU for SOL) — never one chain's format forced onto another.
// Estimates are LIVE from the existing wallet-core providers. The fee you choose
// here is the same model the Send screen applies into the actual signing path.
const CHAINS = [
  { id: "evm", label: "Ethereum", chain: "evm", networkKey: ALLOW_MAINNET ? "mainnet" : "sepolia",         symbol: "ETH", decimals: 18, usdRate: 3200, badge: ALLOW_MAINNET ? "Ethereum" : "Ethereum testnet" },
  { id: "btc", label: "Bitcoin",  chain: "btc", networkKey: ALLOW_BTC_MAINNET ? "mainnet" : "testnet",     symbol: "BTC", decimals: 8,  usdRate: 68000, badge: ALLOW_BTC_MAINNET ? "Bitcoin" : "Bitcoin testnet" },
  { id: "sol", label: "Solana",   chain: "sol", networkKey: ALLOW_SOL_MAINNET ? "mainnet" : "devnet",      symbol: "SOL", decimals: 9,  usdRate: 165,   badge: ALLOW_SOL_MAINNET ? "Solana" : "Solana testnet" },
];

const MODEL_NOTE = {
  evm: "The network charges a base fee. You can add a tip to go faster. Pick a speed or set a custom max base fee, priority, and transaction limit.",
  btc: "Bitcoin charges by transaction size, not a fixed amount. The miner fee = transaction size × rate, so the final amount is set by coin selection at send time using the rate you pick.",
  sol: "A fixed base fee per signature (~5,000 Solana fee units) plus an optional priority fee (processing unit price) that only matters under congestion. The fee shown is the total — not an estimate.",
};

export default function GasFeeControl() {
  const [active, setActive] = useState("evm");
  const [selected, setSelected] = useState({});

  const cfg = CHAINS.find((c) => c.id === active);
  const sel = selected[active];
  // Native symbol comes from the network registry for EVM (POL/AVAX/tBNB ≠ ETH).
  const evmInfo = cfg.chain === "evm" ? getNetworkInfo(cfg.networkKey) : null;
  const symbol = evmInfo?.symbol || cfg.symbol;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Fuel className="h-5 w-5 text-primary" /> Network Fee Control</h1>
        <p className="text-sm text-muted-foreground">See and control transaction fees per chain — each in its native model.</p>
      </div>

      {/* Chain selector */}
      <div className="grid grid-cols-3 gap-2">
        {CHAINS.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`p-3 rounded-xl border text-center transition-colors ${active === c.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}
          >
            <p className="text-sm font-semibold">{c.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{c.badge}</p>
          </button>
        ))}
      </div>

      {/* Per-chain model note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/40 border border-border">
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">{MODEL_NOTE[cfg.chain]}</p>
      </div>

      {/* Live per-chain fee picker (keyed so state resets cleanly per chain). */}
      <FeeSelector
        key={active}
        chain={cfg.chain}
        networkKey={cfg.networkKey}
        symbol={symbol}
        decimals={cfg.decimals}
        usdRate={cfg.usdRate}
        gasLimitHint={cfg.chain === "evm" ? 21000 : undefined}
        onChange={(s) => setSelected((prev) => ({ ...prev, [active]: s }))}
      />

      {/* Selected-fee summary */}
      {sel?.fee && (
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
          <p className="text-sm font-semibold">Selected fee</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Speed</p><p className="font-semibold capitalize">{sel.tierId}{sel.etaLabel ? ` · ${sel.etaLabel}` : ""}</p></div>
            <div><p className="text-muted-foreground text-xs">Estimated fee</p><p className="font-semibold font-mono">{sel.nativeText}</p></div>
            {sel.fiatText && <div><p className="text-muted-foreground text-xs">≈ Fiat</p><p className="font-bold text-lg">{sel.fiatText}</p></div>}
          </div>
          <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/60">
            On the Send screen this same selection is passed straight into the signing path, so the fee you choose is the fee that gets signed.
          </p>
        </div>
      )}
    </div>
  );
}
