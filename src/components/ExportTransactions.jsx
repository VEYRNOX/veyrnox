import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown, FileText, Table2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { USD_RATES } from "@/lib/cryptos";

function buildRows(transactions) {
  return transactions.map(tx => ({
    date: format(new Date(tx.created_date), "yyyy-MM-dd HH:mm"),
    type: tx.type,
    asset: tx.currency,
    amount: tx.amount ?? 0,
    usd_value: ((tx.amount ?? 0) * (USD_RATES[tx.currency] || 1)).toFixed(2),
    status: tx.status,
    to_address: tx.to_address || "",
    from_address: tx.from_address || "",
    tx_hash: tx.tx_hash || "",
    note: tx.note || "",
  }));
}

function downloadCSV(rows) {
  const headers = ["Date", "Type", "Asset", "Amount", "USD Value", "Status", "To Address", "From Address", "Tx Hash", "Note"];
  const lines = [
    headers.join(","),
    ...rows.map(r =>
      [r.date, r.type, r.asset, r.amount, r.usd_value, r.status, r.to_address, r.from_address, r.tx_hash, `"${r.note}"`].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions_${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPDF(rows) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape" });

  // Header
  doc.setFontSize(16);
  doc.setTextColor(40, 40, 40);
  doc.text("Transaction History", 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy 'at' HH:mm")}  |  ${rows.length} transactions`, 14, 23);

  // Table headers
  const cols = ["Date", "Type", "Asset", "Amount", "USD Value", "Status", "Note"];
  const colX = [14, 52, 78, 96, 118, 143, 165];
  const colWidths = [36, 24, 16, 20, 23, 22, 50];

  doc.setFillColor(245, 245, 245);
  doc.rect(14, 27, 270, 7, "F");
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  cols.forEach((h, i) => doc.text(h, colX[i], 32.5));

  // Rows
  let y = 40;
  rows.forEach((r, idx) => {
    if (y > 190) {
      doc.addPage();
      y = 20;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(252, 252, 252);
      doc.rect(14, y - 4, 270, 7, "F");
    }

    const typeColor = r.type === "send" ? [220, 50, 50] : r.type === "receive" ? [34, 160, 90] : [100, 100, 200];
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);

    const truncate = (s, max) => s.length > max ? s.slice(0, max - 1) + "…" : s;

    doc.text(r.date, colX[0], y);
    doc.setTextColor(...(/** @type {[number, number, number]} */ (typeColor)));
    doc.text(r.type.toUpperCase(), colX[1], y);
    doc.setTextColor(80, 80, 80);
    doc.text(r.asset, colX[2], y);
    doc.text(String(r.amount), colX[3], y);
    doc.text("$" + r.usd_value, colX[4], y);
    doc.text(r.status, colX[5], y);
    doc.text(truncate(r.note, 28), colX[6], y);
    y += 7;
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text("SafeCrypto Wallet — Confidential", 14, doc.internal.pageSize.height - 6);

  doc.save(`transactions_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}

export default function ExportTransactions({ transactions: propTransactions }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(null);

  const { data: fetchedTransactions = [], isLoading } = useQuery({
    queryKey: ["transactions-export"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 1000),
    enabled: open && !propTransactions,
  });

  const transactions = propTransactions ?? fetchedTransactions;

  const rows = buildRows(transactions);

  const handleExport = async (format) => {
    setExporting(format);
    if (format === "csv") downloadCSV(rows);
    else await downloadPDF(rows);
    setExporting(null);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <FileDown className="h-3.5 w-3.5" /> Export
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export Transactions</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Export <span className="font-semibold text-foreground">{rows.length}</span> {propTransactions ? "filtered" : ""} transactions including asset, date, amount, and USD valuation.
                </p>

                {/* Preview table */}
                {rows.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-secondary">
                        <tr>
                          {["Date", "Asset", "Amount", "USD Value", "Status"].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 5).map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-secondary/30"}>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.date.split(" ")[0]}</td>
                            <td className="px-2 py-1.5 font-semibold">{r.asset}</td>
                            <td className="px-2 py-1.5 font-mono">{r.amount}</td>
                            <td className="px-2 py-1.5 font-mono">${r.usd_value}</td>
                            <td className="px-2 py-1.5">
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                r.status === "confirmed" ? "bg-green-500/15 text-green-400"
                                : r.status === "pending" ? "bg-yellow-500/15 text-yellow-400"
                                : "bg-destructive/15 text-destructive"
                              }`}>{r.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 5 && (
                      <p className="text-[10px] text-muted-foreground text-center py-1.5 border-t border-border">
                        +{rows.length - 5} more rows
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => handleExport("csv")}
                    disabled={!!exporting || rows.length === 0}
                  >
                    {exporting === "csv"
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Table2 className="h-4 w-4" />}
                    CSV
                  </Button>
                  <Button
                    className="gap-2"
                    onClick={() => handleExport("pdf")}
                    disabled={!!exporting || rows.length === 0}
                  >
                    {exporting === "pdf"
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <FileText className="h-4 w-4" />}
                    PDF Report
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}