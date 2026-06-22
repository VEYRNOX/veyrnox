import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "ethers";
import { Clock, Zap, Flame, SlidersHorizontal, Fuel, AlertTriangle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { estimateEvmFeeTiers, buildEvmCustomFee } from "@/wallet-core/evm/fees";
import { estimateBtcFeeTiers } from "@/wallet-core/btc/fees";
import { estimateSolFeeTiers } from "@/wallet-core/sol/fees";

// Per-chain transaction-fee picker. These are GENUINELY different fee models and
// are rendered each in their own native units — never one chain's format forced
// onto another (no SOL fee shown as gwei, no BTC shown as gas-limit×price):
//   EVM → EIP-1559 (base fee + priority tip), slow/avg/fast + custom gwei.
//   BTC → sat/vByte fee rate (UTXO), slow/avg/fast.
//   SOL → base fee (lamports/sig) + OPTIONAL priority (µlamports/CU).
// Estimates come from the EXISTING wallet-core providers (see wallet-core/*/fees.js).
// The selected `fee` is emitted via onChange and flows straight into the send path.

const TIER_ICON = { slow: Clock, none: Clock, standard: Zap, fast: Flame };

function fmtNative(amountSmallestUnit, decimals, maxFrac = 8) {
  // formatUnits gives an exact decimal string; trim trailing zeros for display.
  const s = formatUnits(BigInt(amountSmallestUnit), decimals);
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

function fmtFiat(nativeFloat, usdRate) {
  if (usdRate == null || !Number.isFinite(nativeFloat)) return null;
  const v = nativeFloat * usdRate;
  if (!Number.isFinite(v)) return null;
  return v < 0.01 ? `<$0.01` : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// Normalise a tier (per chain) into a uniform display + the `fee` object the send
// path consumes. Keeping this in one place is what guarantees the number the user
// sees equals the fee that gets signed.
function describeTier(chain, tier, ctx) {
  if (chain === "evm") {
    const nativeFloat = Number(formatUnits(BigInt(tier.estFeeWei), ctx.decimals));
    return {
      nativeText: `${fmtNative(tier.estFeeWei, ctx.decimals)} ${ctx.symbol}`,
      fiatText: fmtFiat(nativeFloat, ctx.usdRate),
      sub: `${fmtNative(tier.maxFeePerGasWei, 9, 3)} Gwei max fee`,
      eta: tier.etaLabel,
      fee: {
        maxFeePerGasWei: tier.maxFeePerGasWei,
        maxPriorityFeePerGasWei: tier.maxPriorityFeePerGasWei,
        gasLimit: tier.gasLimit,
      },
    };
  }
  if (chain === "btc") {
    const nativeFloat = tier.estFeeSats / 1e8;
    return {
      nativeText: `${tier.feeRate} sat/vB`,
      fiatText: fmtFiat(nativeFloat, ctx.usdRate),
      sub: `≈ ${tier.estFeeSats.toLocaleString()} sat (typical tx)`,
      eta: tier.etaLabel,
      fee: { feeRate: tier.feeRate },
    };
  }
  // sol
  const totalLamports = Number(tier.totalLamports);
  const nativeFloat = totalLamports / 1e9;
  const priority = Number(tier.priorityMicroLamports);
  return {
    nativeText: `${totalLamports.toLocaleString()} lamports`,
    fiatText: fmtFiat(nativeFloat, ctx.usdRate),
    sub: priority > 0
      ? `base ${Number(tier.baseLamports).toLocaleString()} + priority ${priority.toLocaleString()} µlam/CU`
      : `base only (${Number(tier.baseLamports).toLocaleString()} lamports/sig)`,
    eta: tier.etaLabel,
    fee: { priorityMicroLamports: priority, computeUnitLimit: tier.computeUnitLimit },
  };
}

export default function FeeSelector({ chain, networkKey, symbol, decimals, usdRate, gasLimitHint, onChange }) {
  const [selectedId, setSelectedId] = useState(null);
  const [custom, setCustom] = useState({ maxBaseFeeGwei: "", priorityGwei: "", gasLimit: "" });

  const queryFn = useMemo(() => {
    if (chain === "evm") return () => estimateEvmFeeTiers(/** @type {any} */ ({ networkKey, gasLimit: gasLimitHint }));
    if (chain === "btc") return () => estimateBtcFeeTiers({ networkKey });
    return () => estimateSolFeeTiers({ networkKey });
  }, [chain, networkKey, gasLimitHint]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["fee-tiers", chain, networkKey, gasLimitHint],
    queryFn,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  const tiers = data?.tiers || [];
  const ctx = { symbol, decimals, usdRate };

  // Default to the middle tier ("Standard") once estimates arrive.
  useEffect(() => {
    if (!tiers.length || selectedId) return;
    const def = tiers.find((t) => t.id === "standard") || tiers[0];
    setSelectedId(def.id);
  }, [tiers, selectedId]);

  // Emit the current selection upward whenever it changes.
  useEffect(() => {
    if (!onChange) return;
    if (selectedId === "custom") {
      if (chain !== "evm") return;
      try {
        const fee = buildEvmCustomFee({
          maxBaseFeeGwei: custom.maxBaseFeeGwei || "0",
          priorityGwei: custom.priorityGwei || "0",
          gasLimit: custom.gasLimit || gasLimitHint || 21000,
          networkKey,
        });
        const nativeFloat = Number(formatUnits(BigInt(fee.estFeeWei), decimals));
        onChange({
          tierId: "custom",
          fee,
          nativeText: `${fmtNative(fee.estFeeWei, decimals)} ${symbol}`,
          fiatText: fmtFiat(nativeFloat, usdRate),
          etaLabel: "custom",
          valid: BigInt(fee.maxFeePerGasWei) > 0n,
        });
      } catch {
        onChange({ tierId: "custom", fee: null, valid: false });
      }
      return;
    }
    const tier = tiers.find((t) => t.id === selectedId);
    if (!tier) return;
    const d = describeTier(chain, tier, ctx);
    onChange({ tierId: tier.id, fee: d.fee, nativeText: d.nativeText, fiatText: d.fiatText, etaLabel: d.eta, valid: true });
  }, [selectedId, custom, tiers, chain, symbol, decimals, usdRate]);

  // Live custom-fee preview (EVM only).
  const customPreview = useMemo(() => {
    if (chain !== "evm" || selectedId !== "custom") return null;
    try {
      const fee = buildEvmCustomFee({
        maxBaseFeeGwei: custom.maxBaseFeeGwei || "0",
        priorityGwei: custom.priorityGwei || "0",
        gasLimit: custom.gasLimit || gasLimitHint || 21000,
        networkKey,
      });
      const nativeFloat = Number(formatUnits(BigInt(fee.estFeeWei), decimals));
      return { nativeText: `${fmtNative(fee.estFeeWei, decimals)} ${symbol}`, fiatText: fmtFiat(nativeFloat, usdRate) };
    } catch {
      return null;
    }
  }, [chain, selectedId, custom, gasLimitHint, decimals, symbol, usdRate]);

  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-1.5">
          <Fuel className="h-3 w-3" /> Network fee
        </p>
        {data?.tiers && (
          <span className="text-[10px] text-muted-foreground">
            {chain === "evm" && `base ${fmtNative((/** @type {any} */ (data)).baseFeePerGasWei, 9, 2)} Gwei`}
            {chain === "sol" && `base ${Number((/** @type {any} */ (data)).baseLamports).toLocaleString()} lamports/sig`}
            {chain === "btc" && "sat/vByte"}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading live fees from the network…
        </div>
      )}

      {isError && (
        <div className="flex items-start gap-2 text-xs text-caution">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Couldn't read live fees ({String(error?.message || "network error")}). The wallet will use a safe default fee.</span>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {tiers.map((t) => {
              const Icon = TIER_ICON[t.id] || Zap;
              const d = describeTier(chain, t, ctx);
              const active = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`p-2 rounded-lg border text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-xs font-semibold">{t.label}</span>
                  </div>
                  <p className="text-[11px] mono-value font-semibold truncate">{d.nativeText}</p>
                  {d.fiatText && <p className="text-[10px] text-muted-foreground">{d.fiatText}</p>}
                  <p className="text-[10px] text-muted-foreground">{d.eta}</p>
                </button>
              );
            })}
          </div>

          {/* Selected-tier detail line */}
          {selectedId && selectedId !== "custom" && (() => {
            const tier = tiers.find((t) => t.id === selectedId);
            if (!tier) return null;
            const d = describeTier(chain, tier, ctx);
            return <p className="text-[11px] text-muted-foreground">{d.sub}</p>;
          })()}

          {/* Custom (EVM EIP-1559 only — BTC/SOL presets cover their models). */}
          {chain === "evm" && (
            <div>
              <button
                type="button"
                onClick={() => setSelectedId("custom")}
                className={`w-full p-2 rounded-lg border text-left transition-colors flex items-center gap-1.5 ${selectedId === "custom" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}
              >
                <SlidersHorizontal className={`h-3.5 w-3.5 ${selectedId === "custom" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-xs font-semibold">Custom</span>
                {customPreview && <span className="text-[10px] text-muted-foreground ml-auto mono-value">{customPreview.nativeText}{customPreview.fiatText ? ` · ${customPreview.fiatText}` : ""}</span>}
              </button>
              {selectedId === "custom" && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <Label htmlFor="fee-custom-maxbase" className="text-[10px]">Max base (Gwei)</Label>
                    <Input
                      id="fee-custom-maxbase"
                      type="number" inputMode="decimal" className="mt-1 h-8 text-xs mono-value"
                      value={custom.maxBaseFeeGwei}
                      placeholder={data ? fmtNative(BigInt((/** @type {any} */ (data)).baseFeePerGasWei) * 2n, 9, 2) : "0"}
                      onChange={(e) => setCustom((c) => ({ ...c, maxBaseFeeGwei: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="fee-custom-priority" className="text-[10px]">Priority (Gwei)</Label>
                    <Input
                      id="fee-custom-priority"
                      type="number" inputMode="decimal" className="mt-1 h-8 text-xs mono-value"
                      value={custom.priorityGwei}
                      placeholder={data ? fmtNative((/** @type {any} */ (data)).suggestedTipWei, 9, 3) : "0"}
                      onChange={(e) => setCustom((c) => ({ ...c, priorityGwei: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="fee-custom-gaslimit" className="text-[10px]">Gas limit</Label>
                    <Input
                      id="fee-custom-gaslimit"
                      type="number" inputMode="numeric" className="mt-1 h-8 text-xs mono-value"
                      value={custom.gasLimit}
                      placeholder={String(gasLimitHint || (/** @type {any} */ (data))?.gasLimit || 21000)}
                      onChange={(e) => setCustom((c) => ({ ...c, gasLimit: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SOL priority disclosure — make the native model explicit. */}
          {chain === "sol" && (
            <p className="text-[10px] text-muted-foreground">
              Solana charges a fixed base fee per signature plus an OPTIONAL priority fee
              (compute-unit price) that only matters under congestion — not the EVM gas-limit×price model.
            </p>
          )}
        </>
      )}
    </div>
  );
}
