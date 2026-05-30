import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, Printer, Download, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };
const STATUS_ICON = { completed: <CheckCircle2 className="h-4 w-4 text-green-500" />, failed: <XCircle className="h-4 w-4 text-destructive" />, pending: <Clock className="h-4 w-4 text-yellow-500" /> };

export default function TransactionReceipt() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const receiptRef = useRef(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 100),
  });

  const filtered = transactions.filter(tx =>
    !search || tx.id?.toLowerCase().includes(search.toLowerCase()) ||
    tx.recipient_address?.toLowerCase().includes(search.toLowerCase()) ||
    tx.currency?.toLowerCase().includes(search.toLowerCase())
  );

  const handlePrint = () => {
    const content = receiptRef.current?.innerHTML;
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Transaction Receipt</title><style>
      body { font-family: monospace; padding: 32px; max-width: 400px; margin: auto; }
      .divider { border-top: 1px dashed #ccc; margin: 12px 0; }
      .row { display: flex; justify-content: space-between; margin: 6px 0; font-size: 13px; }
      .label { color: #666; } .value { font-weight: 600; }
      h2 { text-align: center; margin-bottom: 20px; }
    </style></head><body>${content}</body></html>`);
    win.document.close();
    win.print();
  };

  const usdValue = selected ? (selected.amount || 0) * (USD_RATES[selected.currency] || 1) : 0;
  const fee = selected ? (selected.fee || 0) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Transaction Receipts</h1>
        <p className="text-sm text-muted-foreground">Generate printable receipts for any transaction</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by ID, address or currency..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* TX List */}
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {isLoading ? <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div> : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No transactions found</div>
          ) : filtered.map(tx => (
            <div key={tx.id} onClick={() => setSelected(tx)}
              className={`p-3 rounded-xl border cursor-pointer transition-colors ${selected?.id === tx.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/50"}`}>
              <div className="flex items-center gap-2">
                {STATUS_ICON[tx.status] || STATUS_ICON.completed}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold capitalize">{tx.type || "Transfer"}</span>
                    <span className="text-xs font-bold">{tx.amount} {tx.currency}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{tx.id}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(tx.created_date).toLocaleDateString("en-GB")}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Receipt Preview */}
        {selected && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold">Receipt Preview</p>
              <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5 text-xs">
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
            </div>
            <div ref={receiptRef} className="p-5 font-mono text-xs space-y-1">
              <h2 className="text-center font-bold text-base mb-4 not-italic" style={{ fontFamily: "sans-serif" }}>Veyrnox</h2>
              <div className="text-center text-muted-foreground mb-4">TRANSACTION RECEIPT</div>
              <div className="border-t border-dashed border-border my-3" />
              {[
                ["Receipt ID", selected.id?.slice(0, 12) + "..."],
                ["Date", new Date(selected.created_date).toLocaleString("en-GB")],
                ["Type", (selected.type || "Transfer").toUpperCase()],
                ["Asset", selected.currency],
                ["Amount", `${selected.amount} ${selected.currency}`],
                ["USD Value", `$${usdValue.toFixed(2)}`],
                ["Network Fee", fee > 0 ? `${fee} ${selected.currency}` : "—"],
                ["Status", (selected.status || "completed").toUpperCase()],
                ["To", selected.recipient_address ? selected.recipient_address.slice(0, 20) + "..." : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-bold">{v}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-border my-3" />
              <p className="text-center text-muted-foreground text-[10px]">Thank you for using Veyrnox</p>
              <p className="text-center text-muted-foreground text-[10px]">This is a digital transaction record</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}