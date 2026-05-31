import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Table2, Loader2, TrendingUp, TrendingDown, Award,
  ArrowLeftRight, AlertTriangle, CheckCircle2, DollarSign, BarChart2
} from "lucide-react";
import moment from "moment";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };

function historicalRate(currency, dateStr) {
  const base = USD_RATES[currency] || 1;
  if (["USDC", "USDT"].includes(currency)) return 1;
  const seed = new Date(dateStr).getTime() % 10000;
  return base * (0.8 + (seed / 10000) * 0.4);
}

const fmt = (n) => "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSigned = (n) => (n >= 0 ? "+" : "-") + fmt(n);

/**
 * FIFO cost basis engine.
 * Returns { gains[], costBasisMap: { [currency]: [{units, costPerUnit}] } }
 */
function computeFIFO(transactions, year) {
  const start = moment(`${year}-01-01`).startOf("day");
  const end   = moment(`${year}-12-31`).endOf("day");
  const inYear = (d) => moment(d).isBetween(start, end, null, "[]");

  // Sort ALL transactions by date so FIFO is correct across years
  const sorted = [...transactions].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  // FIFO queues: { [currency]: [{units, costPerUnit, date}] }
  const queues = {};
  const gains  = [];

  const ensureQueue = (c) => { if (!queues[c]) queues[c] = []; };

  for (const tx of sorted) {
    const currency = tx.currency;
    const amount   = tx.amount || 0;
    const rateAtTx = historicalRate(currency, tx.created_date);
    const usdValue = amount * rateAtTx;

    ensureQueue(currency);

    if (tx.type === "receive") {
      // Acquisition — push onto queue
      queues[currency].push({ units: amount, costPerUnit: rateAtTx, date: tx.created_date });
      if (inYear(tx.created_date)) {
        gains.push({
          date: tx.created_date,
          type: "Receipt",
          asset: currency,
          amount,
          proceeds: usdValue,
          costBasis: usdValue,
          gain: 0,
          term: "N/A",
          txHash: tx.tx_hash || "—",
          isRealized: false,
        });
      }
    } else if (tx.type === "send" || tx.type === "swap") {
      // Disposal — consume from FIFO queue
      let remaining = amount;
      let totalCostBasis = 0;
      while (remaining > 0 && queues[currency].length > 0) {
        const lot = queues[currency][0];
        const consumed = Math.min(lot.units, remaining);
        totalCostBasis += consumed * lot.costPerUnit;
        lot.units -= consumed;
        remaining -= consumed;
        if (lot.units <= 0) queues[currency].shift();
      }
      // If no history exists, assume cost basis = 80% of proceeds (conservative)
      if (totalCostBasis === 0) totalCostBasis = usdValue * 0.8;

      const gain = usdValue - totalCostBasis;
      const acquiredDate = queues[currency][0]?.date || tx.created_date;
      const holdMonths   = moment(tx.created_date).diff(moment(acquiredDate), "months");

      if (inYear(tx.created_date)) {
        gains.push({
          date: tx.created_date,
          type: tx.type === "swap" ? "Swap" : "Disposal",
          asset: currency,
          amount,
          proceeds: usdValue,
          costBasis: totalCostBasis,
          gain,
          term: holdMonths >= 12 ? "Long-term" : "Short-term",
          txHash: tx.tx_hash || "—",
          isRealized: true,
        });
      }
    }
  }

  return { gains, queues };
}

/**
 * Unrealized P&L from current wallet balances vs. remaining FIFO lots.
 */
function computeUnrealized(wallets, queues) {
  const rows = [];
  for (const wallet of wallets) {
    const c = wallet.currency;
    const balance = wallet.balance || 0;
    if (balance <= 0) continue;
    const currentPrice = USD_RATES[c] || 1;
    const currentValue = balance * currentPrice;

    // Average cost from remaining FIFO lots
    const lots = queues[c] || [];
    const totalLotUnits = lots.reduce((s, l) => s + l.units, 0);
    const totalLotCost  = lots.reduce((s, l) => s + l.units * l.costPerUnit, 0);
    const avgCost = totalLotUnits > 0 ? (totalLotCost / totalLotUnits) * balance : currentValue * 0.85;
    const unrealizedGain = currentValue - avgCost;
    const pctChange = avgCost > 0 ? (unrealizedGain / avgCost) * 100 : 0;

    rows.push({
      wallet: wallet.name,
      asset: c,
      balance,
      avgCostPerUnit: totalLotUnits > 0 ? totalLotCost / totalLotUnits : currentPrice * 0.85,
      costBasis: avgCost,
      currentValue,
      unrealizedGain,
      pctChange,
    });
  }
  return rows;
}

function computeTaxData(transactions, stakingPositions, wallets, year) {
  const { gains, queues } = computeFIFO(transactions, year);

  const realizedGains = gains.filter(g => g.isRealized);
  const stakingIncome = [];

  const start = moment(`${year}-01-01`).startOf("day");
  const end   = moment(`${year}-12-31`).endOf("day");
  const inYear = (d) => moment(d).isBetween(start, end, null, "[]");

  for (const pos of stakingPositions) {
    if (!inYear(pos.staked_at)) continue;
    const claimed = pos.rewards_claimed || 0;
    if (claimed <= 0) continue;
    const rate = historicalRate(pos.currency, pos.staked_at);
    stakingIncome.push({
      date: pos.staked_at,
      asset: pos.currency,
      validator: pos.validator_name,
      rewardAmount: claimed,
      usdValue: claimed * rate,
    });
  }

  const unrealized = computeUnrealized(wallets, queues);

  const totalGains        = realizedGains.filter(g => g.gain > 0).reduce((s, g) => s + g.gain, 0);
  const totalLosses       = realizedGains.filter(g => g.gain < 0).reduce((s, g) => s + Math.abs(g.gain), 0);
  const shortTermGains    = realizedGains.filter(g => g.term === "Short-term" && g.gain > 0).reduce((s, g) => s + g.gain, 0);
  const longTermGains     = realizedGains.filter(g => g.term === "Long-term"  && g.gain > 0).reduce((s, g) => s + g.gain, 0);
  const totalStakingIncome = stakingIncome.reduce((s, r) => s + r.usdValue, 0);
  const netGainLoss       = totalGains - totalLosses;
  const totalUnrealized   = unrealized.reduce((s, r) => s + r.unrealizedGain, 0);

  return {
    gains, realizedGains, stakingIncome, unrealized,
    totalGains, totalLosses, shortTermGains, longTermGains,
    totalStakingIncome, netGainLoss, totalUnrealized,
  };
}

// ─── CSV export (Koinly-compatible format) ────────────────────────────────────
function downloadCSV(data, year) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const rows = [];

  // Section 1: Transactions (Koinly columns)
  rows.push([
    "Date", "Sent Amount", "Sent Currency",
    "Received Amount", "Received Currency",
    "Fee Amount", "Fee Currency",
    "Net Worth Amount", "Net Worth Currency",
    "Description", "TxHash", "Type", "Term", "Gain/Loss (USD)", "Cost Basis (USD)"
  ].map(esc).join(","));

  for (const g of data.gains) {
    const isSend  = g.type === "Disposal";
    const isSwap  = g.type === "Swap";
    const isRecv  = g.type === "Receipt";
    rows.push([
      moment(g.date).format("YYYY-MM-DD HH:mm:ss"),
      isSend || isSwap ? g.amount : "",
      isSend || isSwap ? g.asset  : "",
      isRecv ? g.amount : "",
      isRecv ? g.asset  : "",
      "",  // fee
      "",  // fee currency
      g.proceeds.toFixed(2),
      "USD",
      g.type,
      g.txHash,
      g.type,
      g.term,
      g.gain.toFixed(2),
      g.costBasis.toFixed(2),
    ].map(esc).join(","));
  }

  rows.push([]);

  // Section 2: Staking Income
  rows.push(["--- STAKING INCOME ---"]);
  rows.push(["Date", "Asset", "Validator", "Reward Amount", "USD Value (Ordinary Income)"].map(esc).join(","));
  for (const r of data.stakingIncome) {
    rows.push([
      moment(r.date).format("YYYY-MM-DD"),
      r.asset, r.validator,
      r.rewardAmount.toFixed(6),
      r.usdValue.toFixed(2),
    ].map(esc).join(","));
  }

  rows.push([]);

  // Section 3: Unrealized P&L
  rows.push(["--- UNREALIZED P&L (current holdings) ---"]);
  rows.push(["Wallet", "Asset", "Balance", "Avg Cost/Unit (USD)", "Total Cost Basis (USD)", "Current Value (USD)", "Unrealized Gain/Loss (USD)", "% Change"].map(esc).join(","));
  for (const u of data.unrealized) {
    rows.push([
      u.wallet, u.asset,
      u.balance,
      u.avgCostPerUnit.toFixed(2),
      u.costBasis.toFixed(2),
      u.currentValue.toFixed(2),
      u.unrealizedGain.toFixed(2),
      u.pctChange.toFixed(2) + "%",
    ].map(esc).join(","));
  }

  rows.push([]);

  // Section 4: Summary
  rows.push(["--- SUMMARY ---"]);
  rows.push(["Metric", "Value (USD)"].map(esc).join(","));
  [
    ["Realized Net Gain/Loss", data.netGainLoss.toFixed(2)],
    ["Total Realized Gains",   data.totalGains.toFixed(2)],
    ["Total Realized Losses",  data.totalLosses.toFixed(2)],
    ["Short-term Capital Gains", data.shortTermGains.toFixed(2)],
    ["Long-term Capital Gains",  data.longTermGains.toFixed(2)],
    ["Staking Ordinary Income",  data.totalStakingIncome.toFixed(2)],
    ["Total Unrealized Gain/Loss", data.totalUnrealized.toFixed(2)],
  ].forEach(([k, v]) => rows.push([esc(k), esc(v)].join(",")));

  const csv = rows.map(r => Array.isArray(r) ? r.join("") : r).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `tax_report_${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPDF(data, year) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape" });
  const W   = doc.internal.pageSize.width;
  const addPage = () => { doc.addPage(); return 20; };

  doc.setFillColor(30, 30, 40);
  doc.rect(0, 0, W, 40, "F");
  doc.setFontSize(20); doc.setTextColor(255, 255, 255);
  doc.text("Tax Report " + year, 14, 18);
  doc.setFontSize(9); doc.setTextColor(180, 180, 180);
  doc.text("SafeCrypto Wallet  |  Generated: " + moment().format("MMMM D, YYYY"), 14, 27);
  doc.text("FIFO cost basis method. For informational purposes — consult a tax professional.", 14, 34);

  let y = 52;
  const summaryItems = [
    { label: "Net Gain / Loss",   value: fmtSigned(data.netGainLoss),       color: data.netGainLoss  >= 0 ? [34,197,94] : [239,68,68] },
    { label: "Total Gains",       value: fmt(data.totalGains),               color: [34, 197, 94] },
    { label: "Total Losses",      value: fmt(data.totalLosses),              color: [239, 68, 68] },
    { label: "Short-term Gains",  value: fmt(data.shortTermGains),           color: [100, 100, 200] },
    { label: "Long-term Gains",   value: fmt(data.longTermGains),            color: [100, 160, 240] },
    { label: "Unrealized P&L",    value: fmtSigned(data.totalUnrealized),    color: data.totalUnrealized >= 0 ? [34,197,94] : [239,68,68] },
  ];
  const boxW = (W - 28 - 10) / 3;
  summaryItems.forEach((item, idx) => {
    const col = idx % 3, row = Math.floor(idx / 3);
    const bx = 14 + col * (boxW + 5), by = y + row * 22;
    doc.setFillColor(245, 245, 247);
    doc.roundedRect(bx, by, boxW, 18, 2, 2, "F");
    doc.setFontSize(7.5); doc.setTextColor(100, 100, 100); doc.text(item.label, bx + 4, by + 7);
    doc.setFontSize(10);  doc.setTextColor(...item.color);  doc.text(item.value, bx + 4, by + 14);
  });
  y += 50;

  // Realized gains table
  if (data.realizedGains.length > 0) {
    doc.setFontSize(11); doc.setTextColor(40, 40, 40); doc.text("Realized Gains & Losses (FIFO)", 14, y); y += 6;
    doc.setFillColor(50, 50, 60); doc.rect(14, y, W - 28, 7, "F");
    const hdrs = ["Date", "Type", "Asset", "Amount", "Proceeds", "Cost Basis", "Gain/Loss", "Term"];
    const cxG  = [14, 40, 64, 80, 100, 125, 152, 178];
    doc.setFontSize(7.5); doc.setTextColor(220, 220, 220);
    hdrs.forEach((h, i) => doc.text(h, cxG[i] + 1, y + 5)); y += 9;
    data.realizedGains.forEach((g, idx) => {
      if (y > 190) y = addPage();
      if (idx % 2 === 0) { doc.setFillColor(250, 250, 252); doc.rect(14, y - 3, W - 28, 7, "F"); }
      doc.setFontSize(7); doc.setTextColor(60, 60, 60);
      doc.text(moment(g.date).format("MM/DD/YY"), cxG[0], y);
      doc.text(g.type, cxG[1], y);
      doc.text(g.asset, cxG[2], y);
      doc.text(String(g.amount), cxG[3], y);
      doc.text("$" + g.proceeds.toFixed(0), cxG[4], y);
      doc.text("$" + g.costBasis.toFixed(0), cxG[5], y);
      doc.setTextColor(...(g.gain >= 0 ? [34,140,90] : [200,50,50]));
      doc.text((g.gain >= 0 ? "+" : "") + "$" + g.gain.toFixed(0), cxG[6], y);
      doc.setTextColor(60, 60, 60); doc.text(g.term, cxG[7], y); y += 7;
    });
    y += 4;
  }

  // Unrealized P&L table
  if (data.unrealized.length > 0) {
    if (y > 160) y = addPage();
    doc.setFontSize(11); doc.setTextColor(40, 40, 40); doc.text("Unrealized P&L", 14, y); y += 6;
    doc.setFillColor(50, 50, 60); doc.rect(14, y, W - 28, 7, "F");
    const hdrs2 = ["Wallet", "Asset", "Balance", "Avg Cost/Unit", "Cost Basis", "Mkt Value", "Unrealized G/L", "% Change"];
    const cxU   = [14, 55, 75, 95, 125, 155, 180, 220];
    doc.setFontSize(7.5); doc.setTextColor(220, 220, 220);
    hdrs2.forEach((h, i) => doc.text(h, cxU[i] + 1, y + 5)); y += 9;
    data.unrealized.forEach((u, idx) => {
      if (y > 190) y = addPage();
      if (idx % 2 === 0) { doc.setFillColor(245, 250, 255); doc.rect(14, y - 3, W - 28, 7, "F"); }
      doc.setFontSize(7); doc.setTextColor(60, 60, 60);
      doc.text(u.wallet.slice(0, 15), cxU[0], y);
      doc.text(u.asset, cxU[1], y);
      doc.text(String(u.balance), cxU[2], y);
      doc.text("$" + u.avgCostPerUnit.toFixed(2), cxU[3], y);
      doc.text("$" + u.costBasis.toFixed(0), cxU[4], y);
      doc.text("$" + u.currentValue.toFixed(0), cxU[5], y);
      doc.setTextColor(...(u.unrealizedGain >= 0 ? [34,140,90] : [200,50,50]));
      doc.text((u.unrealizedGain >= 0 ? "+" : "") + "$" + u.unrealizedGain.toFixed(0), cxU[6], y);
      doc.text((u.pctChange >= 0 ? "+" : "") + u.pctChange.toFixed(1) + "%", cxU[7], y); y += 7;
    });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(160, 160, 160);
    doc.text(`Page ${i} of ${pageCount}  |  SafeCrypto Wallet — FIFO Tax Report ${year}`, 14, doc.internal.pageSize.height - 6);
  }
  doc.save(`tax_report_${year}.pdf`);
}

export default function TaxReport() {
  const currentYear = new Date().getFullYear();
  const [year, setYear]       = useState(String(currentYear - 1));
  const [exporting, setExporting] = useState(null);
  const [showUnrealized, setShowUnrealized] = useState(false);

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ["transactions-tax"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 1000),
  });
  const { data: stakingPositions = [], isLoading: loadingStaking } = useQuery({
    queryKey: ["staking-tax"],
    queryFn: () => base44.entities.StakingPosition.list(),
  });
  const { data: wallets = [], isLoading: loadingWallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const isLoading = loadingTx || loadingStaking || loadingWallets;

  const taxData = useMemo(
    () => computeTaxData(transactions, stakingPositions, wallets, parseInt(year)),
    [transactions, stakingPositions, wallets, year]
  );

  const handleExport = async (format) => {
    setExporting(format);
    if (format === "csv") downloadCSV(taxData, year);
    else await downloadPDF(taxData, year);
    setExporting(null);
  };

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - 1 - i));

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tax Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">FIFO realized &amp; unrealized P&amp;L</p>
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3">
        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-200">
          Uses FIFO cost basis method with simulated historical prices. For informational purposes only — consult a qualified tax professional before filing.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Primary summary row */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-2xl border bg-card p-4 space-y-1 ${taxData.netGainLoss >= 0 ? "border-green-500/30" : "border-destructive/30"}`}>
              <p className="text-xs text-muted-foreground">Realized Net Gain / Loss</p>
              <p className={`text-2xl font-bold ${taxData.netGainLoss >= 0 ? "text-green-400" : "text-destructive"}`}>
                {fmtSigned(taxData.netGainLoss)}
              </p>
              <p className="text-[10px] text-muted-foreground">FIFO · {taxData.realizedGains.length} taxable events</p>
            </div>
            <div className={`rounded-2xl border bg-card p-4 space-y-1 ${taxData.totalUnrealized >= 0 ? "border-blue-500/30" : "border-destructive/30"}`}>
              <p className="text-xs text-muted-foreground">Unrealized P&amp;L</p>
              <p className={`text-2xl font-bold ${taxData.totalUnrealized >= 0 ? "text-blue-400" : "text-destructive"}`}>
                {fmtSigned(taxData.totalUnrealized)}
              </p>
              <p className="text-[10px] text-muted-foreground">Current holdings vs avg cost</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Total Gains",   value: fmt(taxData.totalGains),      color: "text-green-400",     icon: <TrendingUp  className="h-3.5 w-3.5" /> },
              { label: "Total Losses",  value: fmt(taxData.totalLosses),     color: "text-destructive",   icon: <TrendingDown className="h-3.5 w-3.5" /> },
              { label: "Short-term",    value: fmt(taxData.shortTermGains),  color: "text-blue-400",      icon: <ArrowLeftRight className="h-3.5 w-3.5" /> },
              { label: "Staking Income",value: fmt(taxData.totalStakingIncome), color: "text-orange-400", icon: <Award className="h-3.5 w-3.5" /> },
            ].map(item => (
              <div key={item.label} className="rounded-xl border border-border bg-card p-3 space-y-1 text-center">
                <div className={`flex justify-center ${item.color}`}>{item.icon}</div>
                <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Realized gains table */}
          {taxData.realizedGains.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Realized Events ({taxData.realizedGains.length})</p>
                <span className="ml-auto text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">FIFO cost basis</span>
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {taxData.realizedGains.map((g, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                        g.type === "Disposal" ? "bg-destructive/10" : "bg-blue-500/10"
                      }`}>
                        {g.type === "Disposal"
                          ? <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                          : <ArrowLeftRight className="h-3.5 w-3.5 text-blue-400" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{g.type} · {g.asset}</p>
                        <p className="text-[10px] text-muted-foreground">{moment(g.date).format("MMM D, YYYY")} · {g.term}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold ${g.gain >= 0 ? "text-green-400" : "text-destructive"}`}>
                        {g.gain >= 0 ? "+" : ""}{fmt(g.gain)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Basis: {fmt(g.costBasis)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unrealized P&L table */}
          {taxData.unrealized.length > 0 && (
            <div className="rounded-2xl border border-blue-500/20 bg-card overflow-hidden">
              <button
                className="w-full px-4 py-3 border-b border-border flex items-center gap-2 hover:bg-secondary/30 transition-colors"
                onClick={() => setShowUnrealized(s => !s)}
              >
                <BarChart2 className="h-4 w-4 text-blue-400" />
                <p className="text-sm font-semibold">Unrealized P&amp;L by Holding</p>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${taxData.totalUnrealized >= 0 ? "bg-blue-500/10 text-blue-400" : "bg-destructive/10 text-destructive"}`}>
                  {fmtSigned(taxData.totalUnrealized)}
                </span>
                <span className="text-xs text-muted-foreground">{showUnrealized ? "▲" : "▼"}</span>
              </button>
              {showUnrealized && (
                <div className="divide-y divide-border">
                  {taxData.unrealized.map((u, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-xs font-semibold">{u.asset} · {u.wallet}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {u.balance} units · avg cost {fmt(u.avgCostPerUnit)}/unit
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-bold ${u.unrealizedGain >= 0 ? "text-blue-400" : "text-destructive"}`}>
                          {u.unrealizedGain >= 0 ? "+" : ""}{fmt(u.unrealizedGain)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {u.pctChange >= 0 ? "+" : ""}{u.pctChange.toFixed(1)}% · mkt {fmt(u.currentValue)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Staking income */}
          {taxData.stakingIncome.length > 0 && (
            <div className="rounded-2xl border border-orange-500/20 bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Award className="h-4 w-4 text-orange-400" />
                <p className="text-sm font-semibold">Staking Income ({taxData.stakingIncome.length})</p>
              </div>
              <div className="divide-y divide-border">
                {taxData.stakingIncome.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-xs font-semibold">{r.validator}</p>
                      <p className="text-[10px] text-muted-foreground">{r.asset} · {moment(r.date).format("MMM D, YYYY")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-orange-400">{fmt(r.usdValue)}</p>
                      <p className="text-[10px] text-muted-foreground">{r.rewardAmount.toFixed(6)} {r.asset}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {taxData.realizedGains.length === 0 && taxData.stakingIncome.length === 0 && taxData.unrealized.length === 0 && (
            <div className="text-center py-16 space-y-2">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">No taxable events in {year}</p>
              <p className="text-xs text-muted-foreground">No transactions or staking activity found for this year.</p>
            </div>
          )}

          {/* Export */}
          <div className="grid grid-cols-2 gap-3 pb-4">
            <Button variant="outline" className="gap-2" onClick={() => handleExport("csv")} disabled={!!exporting}>
              {exporting === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />}
              Export CSV
            </Button>
            <Button className="gap-2" onClick={() => handleExport("pdf")} disabled={!!exporting}>
              {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download PDF
            </Button>
          </div>
        </>
      )}
    </div>
  );
}