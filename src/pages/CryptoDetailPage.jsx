// @ts-nocheck
// src/pages/CryptoDetailPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownLeft, CreditCard, Eye, EyeOff, ShieldAlert, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import BackButton from "@/components/BackButton";
import { useBuyEnabled } from "@/lib/buy/useBuyEnabled";
import CoinLogo from "@/components/CoinLogo";
import CandlestickChart from "@/components/CandlestickChart";
import { useWallet } from "@/lib/WalletProvider";
import { useBasketPrices } from "@/hooks/useBasketPrices";
import { usePortfolio } from "@/lib/portfolioBalances";
import { resolveAssetRow, fmtIndeterminateAmount } from "@/lib/balanceDisplay";
import { TOP_CRYPTOS } from "@/lib/cryptos";
import { PERIODS } from "@/lib/chartPeriods";
import { openAdvisor, publishAdvisorContext } from "@/lib/advisorBridge";
import {
  buildAssetSpamIntel,
  readSpamTokenOverrides,
  setSpamTokenOverride,
} from "@/lib/spamTokenIntel";
import { evaluateSuspiciousToken } from "@/lib/suspiciousAssets";
import { getAsset, getAssetById, canSend } from "@/wallet-core/assets.js";
import { formatAssetId } from "@/wallet-core/assetId.js";

export default function CryptoDetailPage() {
  const { t } = useTranslation("wallet");
  const { symbol, chain } = useParams();
  const navigate = useNavigate();
  // Phase 1b dual-route: /asset/:symbol/:chain resolves the exact (symbol,
  // chain) row; the legacy /asset/:symbol resolves first-match (mainnet,
  // same as every other symbol-only caller) and normalises the URL below.
  const resolvedAsset = chain ? getAssetById(formatAssetId({ symbol, chain })) : getAsset(symbol);
  useEffect(() => {
    if (!chain && resolvedAsset) {
      navigate(`/asset/${resolvedAsset.symbol}/${resolvedAsset.chain}`, { replace: true });
    }
  }, [chain, resolvedAsset, navigate]);
  const buyEnabled = useBuyEnabled();
  const [period, setPeriod] = useState("1D");
  const [spamOverrides, setSpamOverrides] = useState(() => readSpamTokenOverrides());
  const { isUnlocked, wallets, walletAddresses, activeWalletId } = useWallet();
  const { changeFor } = useBasketPrices();
  const { data: portfolio } = usePortfolio(wallets, walletAddresses);
  const { data: tokenRows = [] } = useQuery({
    queryKey: ["wallet-tokens"],
    queryFn: () => base44.entities.WalletToken.list(),
    enabled: isUnlocked,
  });

  const asset = TOP_CRYPTOS.find((c) => c.symbol === symbol);
  const assetSpamIntel = useMemo(
    () => buildAssetSpamIntel(tokenRows, symbol, spamOverrides),
    [tokenRows, symbol, spamOverrides]
  );
  const suspiciousAssetTokens = useMemo(
    () => assetSpamIntel.tokens.map(evaluateSuspiciousToken).filter((token) => token.suspicious),
    [assetSpamIntel.tokens]
  );

  useEffect(() => {
    publishAdvisorContext({
      asset_symbol: symbol || null,
      asset_name: asset?.name || null,
      suspicious_token_count: suspiciousAssetTokens.length,
      visible_suspicious_token_count: suspiciousAssetTokens.filter((token) => !token.hidden).length,
      hidden_suspicious_token_count: suspiciousAssetTokens.filter((token) => token.hidden).length,
      risky_contract_token_count: suspiciousAssetTokens.filter((token) => token.contract.score > 0).length,
      suspicious_tokens: suspiciousAssetTokens.map((token) => ({
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        hidden: token.hidden,
        reasons: token.reasons.map((reason) => reason.text),
        acquired_via: token.acquired_via || null,
        verified: !!token.verified,
        contract_unknowns: token.contract.unknowns,
      })),
    });
    return () => publishAdvisorContext(null);
  }, [asset?.name, suspiciousAssetTokens, symbol]);

  if (!asset) {
    return (
      <div className="max-w-lg mx-auto space-y-4 pt-4">
        <BackButton />
        <p className="text-sm text-muted-foreground text-center pt-8">Asset not found: {symbol}</p>
      </div>
    );
  }

  const change = changeFor(symbol);
  const isUp = change == null ? null : change >= 0;
  const handleSpamOverride = (tokenId, mode) => {
    setSpamTokenOverride(tokenId, mode);
    setSpamOverrides(readSpamTokenOverrides());
  };
  const askAdvisorAboutSpam = () => {
    openAdvisor({
      question: `Why is ${symbol} showing suspicious token warnings, and what should I do next?`,
      context: {
        asset_symbol: symbol,
        asset_name: asset.name,
        suspicious_tokens: suspiciousAssetTokens.map((token) => ({
          symbol: token.symbol,
          name: token.name,
          reasons: token.reasons.map((reason) => reason.text),
          hidden: token.hidden,
          acquired_via: token.acquired_via || null,
          contract_unknowns: token.contract.unknowns,
        })),
      },
    });
  };

  return (
    <div className="max-w-lg mx-auto space-y-5 pt-1">
      {/* Back */}
      <BackButton />

      {/* Header */}
      <div className="flex items-center gap-3">
        <CoinLogo symbol={symbol} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{asset.name}</h1>
            <span className="text-sm text-muted-foreground font-mono">{symbol}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-lg font-semibold mono-value">
              ${asset.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            {isUp != null && (
              <span className={`text-xs font-mono ${isUp ? "text-success" : "text-destructive"}`}>
                {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Balance strip — shown when unlocked */}
      {isUnlocked && (() => {
        const activeWallet = wallets?.find((w) => w.id === activeWalletId) ?? wallets?.[0];
        const assets = activeWallet ? (portfolio?.byWallet?.[activeWallet.id]?.assets ?? []) : [];
        // Prefer the resolved (symbol, chain) composite id so a per-chain row
        // (e.g. USDC on Polygon) reads its OWN balance, not the first symbol
        // match's (resolveAssetRow falls back to a bare symbol match when the
        // id isn't found, e.g. for the XRP/DOGE/ADA/TRX display-only rows).
        const row = resolveAssetRow(assets, resolvedAsset?.id || symbol);
        const nativeFmt = fmtIndeterminateAmount(row.amount);
        const usdFmt = row.usd != null ? `$${row.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : null;
        return (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card">
            <div>
              <p className="text-xs text-muted-foreground">Your balance</p>
              <p className="text-sm mono-value mt-0.5">{nativeFmt} {nativeFmt !== "—" ? symbol : ""}</p>
            </div>
            {usdFmt && <p className="text-sm mono-value text-muted-foreground">{usdFmt}</p>}
          </div>
        );
      })()}

      {suspiciousAssetTokens.length > 0 && (
        <div className="rounded-2xl border border-caution/30 bg-caution/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-caution shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Suspicious {symbol} token {suspiciousAssetTokens.length > 1 ? "copies" : "copy"} detected
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This warning is local screening, not a contract audit. It combines metadata lures with contract-level cautions only when the app actually has those fields.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {suspiciousAssetTokens.map((token) => (
              <div key={token.id} className="rounded-xl border border-border bg-card/70 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{token.name || token.symbol}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {token.acquired_via === "airdrop" ? "Unsolicited airdrop" : "Unverified token metadata"}
                      {token.contract.score > 0 ? " · contract cautions present" : ""}
                      {token.hidden ? " · hidden from spam views" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSpamOverride(token.id, token.hidden ? "show" : "hide")}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-border hover:bg-secondary"
                  >
                    {token.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {token.hidden ? "Show" : "Hide"}
                  </button>
                </div>
                <ul className="space-y-1">
                  {token.reasons.map((reason) => (
                    <li key={reason.kind + reason.text} className={`text-xs ${reason.severity === 'high' ? 'text-destructive' : 'text-caution'}`}>
                      {reason.text}
                    </li>
                  ))}
                </ul>
                {token.contract.unknowns.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Unknown here: {token.contract.unknowns.join(', ')}.
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1 gap-2" onClick={() => navigate("/trust-score")}>
              <ShieldAlert className="h-4 w-4" />
              Review Spam Filter
            </Button>
            <Button type="button" variant="secondary" className="flex-1 gap-2" onClick={() => navigate("/suspicious-assets")}>
              <ShieldAlert className="h-4 w-4" />
              Suspicious Queue
            </Button>
            <Button type="button" className="flex-1 gap-2" onClick={askAdvisorAboutSpam}>
              <Sparkles className="h-4 w-4" />
              Ask AI Advisor
            </Button>
          </div>
        </div>
      )}

      {/* Period tabs */}
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              period === p
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      <CandlestickChart symbol={symbol} period={period} />

      {/* Actions — Buy sits alongside Send when the ship gate is on.
          All three labels go through nav.tab_* , which every one of the 44
          locales already defines. Adding an untranslated "Buy" here would have
          left this row half-English in the 5 locales whose MT-pending banner
          #1507 just removed, so the neighbours were converted at the same time
          rather than matching the old hardcoded convention. */}
      <div className={`grid gap-3 pt-1 ${buyEnabled ? "grid-cols-3" : "grid-cols-2"}`}>
        {/* receive_only rows (Phase 1b per-chain expansion) hard-disable Send
            here — canSend() is the same gate SendCrypto.jsx itself enforces,
            checked again at this earlier chokepoint so the button never even
            invites a dead-end tap (I4 fail-closed). */}
        <Button
          className="h-14 gap-2 text-base"
          disabled={!canSend(resolvedAsset)}
          title={!canSend(resolvedAsset) ? "Receive only — sending isn't verified for this asset yet" : undefined}
          onClick={() => navigate(`/send?asset=${symbol}`)}
        >
          <ArrowUpRight className="h-5 w-5" />
          {t("nav.tab_send")}
        </Button>
        {buyEnabled && (
          <Button
            variant="secondary"
            className="h-14 gap-2 text-base"
            onClick={() => navigate(`/buy`)}
          >
            <CreditCard className="h-5 w-5" />
            {t("nav.tab_buy")}
          </Button>
        )}
        <Button
          variant="secondary"
          className="h-14 gap-2 text-base"
          onClick={() => navigate(`/receive?asset=${symbol}`)}
        >
          <ArrowDownLeft className="h-5 w-5" />
          {t("nav.tab_receive")}
        </Button>
      </div>
    </div>
  );
}
