import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { FileText, Table2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

// Raw CSV — date, type, asset, amount, fee, tx_hash only.
// No fabricated cost basis, no invented USD rates.
function downloadRawCSV(transactions) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Date", "Type", "Asset", "Amount", "Fee", "TxHash", "Status"].map(esc).join(","),
    ...transactions.map(tx =>
      [
        format(new Date(tx.created_date), "yyyy-MM-dd HH:mm:ss"),
        tx.type || "",
        tx.currency || "",
        tx.amount ?? "",
        tx.fee ?? "",
        tx.tx_hash || "",
        tx.status || "",
      ].map(esc).join(",")
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions_raw_${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const TAX_TOOLS = [
  { name: "Koinly", url: "https://koinly.io", note: "Supports CSV import · free tier available" },
  { name: "CoinTracker", url: "https://www.cointracker.io", note: "Supports CSV · integrates with major exchanges" },
  { name: "Crypto Tax Calculator", url: "https://cryptotaxcalculator.io", note: "FIFO / LIFO / HIFO support" },
  { name: "TokenTax", url: "https://tokentax.co", note: "Accountant-led platform" },
];

export default function TaxReport() {
  const [exported, setExported] = useState(false);

  const { data: transactions = [], isLoading, isError } = useQuery({
    queryKey: ["transactions-tax"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 1000),
  });

  const handleExport = () => {
    downloadRawCSV(transactions);
    setExported(true);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tax Export</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Export your raw transaction history for use with a dedicated tax tool</p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
        <div className="text-xs text-yellow-200 space-y-1">
          <p className="font-semibold">This app does not calculate taxes</p>
          <p>Computing accurate cost basis, capital gains, and staking income requires live historical prices that this app does not have. Fabricated figures could lead to incorrect filings — export your raw data and use a specialist tool instead.</p>
        </div>
      </div>

      {/* Export */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm font-semibold">Step 1 — Export raw transactions</p>
        <p className="text-xs text-muted-foreground">
          Downloads a CSV with {isLoading ? "…" : transactions.length} transactions: date, type, asset, amount, fee, tx hash. No invented prices or cost basis — exactly what your on-device records contain.
        </p>
        <Button onClick={handleExport} disabled={isLoading || isError} className="w-full gap-2">
          <Table2 className="h-4 w-4" />
          {isLoading ? "Loading…" : `Export ${transactions.length} transactions (CSV)`}
        </Button>
        {isError && <p className="text-xs text-destructive">Couldn't load your transactions to export. Please try again.</p>}
        {exported && <p className="text-xs text-green-400">✓ Downloaded — import this file into your tax tool below</p>}
      </div>

      {/* Tax tools */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm font-semibold">Step 2 — Import into a tax tool</p>
        <p className="text-xs text-muted-foreground">These tools fetch real historical prices and apply your jurisdiction's rules. No affiliation with <strong>VEYRNOX</strong>.</p>
        <div className="space-y-2">
          {TAX_TOOLS.map(t => (
            <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors group">
              <div>
                <p className="text-sm font-semibold group-hover:text-primary transition-colors">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.note}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </a>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-muted/30 border border-border p-3">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Tax law varies by country. Always consult a qualified tax professional before filing. This export is a convenience tool, not tax advice.
        </p>
      </div>
    </div>
  );
}
