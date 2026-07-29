// @ts-nocheck
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { base44 } from "@/api/base44Client";
import { Search, Printer, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const STATUS_ICON = { completed: <CheckCircle2 className="h-4 w-4 text-success" />, failed: <XCircle className="h-4 w-4 text-destructive" />, pending: <Clock className="h-4 w-4 text-caution" /> };

export default function TransactionReceipt() {
  const { t } = useTranslation("wallet");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const { data: transactions = [], isLoading, isError } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 100),
  });

  const filtered = transactions.filter(tx =>
    !search || tx.id?.toLowerCase().includes(search.toLowerCase()) ||
    tx.to_address?.toLowerCase().includes(search.toLowerCase()) ||
    tx.currency?.toLowerCase().includes(search.toLowerCase())
  );

  const fee = selected ? (selected.fee || 0) : 0;

  const handlePrint = () => {
    if (!selected) return;
    const win = window.open("", "_blank");
    // Build the print window from DOM nodes using textContent only — never
    // innerHTML or document.write with user-derived strings (VULN-3 fix: a
    // crafted token name or recipient label could inject script via the old path).
    const doc = win.document;
    doc.open();
    doc.write(`<html><head><title>${t("tx.receipt.print_window_title")}</title><style>
      body { font-family: monospace; padding: 32px; max-width: 400px; margin: auto; }
      .divider { border-top: 1px dashed #ccc; margin: 12px 0; }
      .row { display: flex; justify-content: space-between; margin: 6px 0; font-size: 13px; }
      .label { color: #666; } .value { font-weight: 600; }
      h2 { text-align: center; margin-bottom: 20px; }
    </style></head><body></body></html>`);
    doc.close();

    const rows = [
      [t("tx.receipt.field_receipt_id"), (selected.id?.slice(0, 12) ?? "") + "..."],
      [t("tx.receipt.field_date"), new Date(selected.created_date).toLocaleString(undefined)],
      [t("tx.receipt.field_type"), (selected.type || t("tx.receipt.default_type")).toUpperCase()],
      [t("tx.receipt.field_asset"), selected.currency ?? ""],
      [t("tx.receipt.field_amount"), `${selected.amount ?? ""} ${selected.currency ?? ""}`],
      [t("tx.receipt.field_network_fee"), fee > 0 ? `${fee} ${selected.currency}` : "—"],
      [t("tx.receipt.field_status"), (selected.status || t("tx.receipt.default_status")).toUpperCase()],
      [t("tx.receipt.field_to"), selected.to_address ? selected.to_address.slice(0, 20) + "..." : "—"],
    ];

    const h2 = doc.createElement("h2");
    h2.textContent = t("tx.receipt.brand");
    doc.body.appendChild(h2);

    const sub = doc.createElement("p");
    sub.style.cssText = "text-align:center;color:#666;margin-bottom:16px;";
    sub.textContent = t("tx.receipt.doc_title");
    doc.body.appendChild(sub);

    const div1 = doc.createElement("div"); div1.className = "divider"; doc.body.appendChild(div1);

    rows.forEach(([label, value]) => {
      const row = doc.createElement("div"); row.className = "row";
      const l = doc.createElement("span"); l.className = "label"; l.textContent = label;
      const v = doc.createElement("span"); v.className = "value"; v.textContent = value;
      row.appendChild(l); row.appendChild(v);
      doc.body.appendChild(row);
    });

    const div2 = doc.createElement("div"); div2.className = "divider"; doc.body.appendChild(div2);

    [t("tx.receipt.thank_you", { brand: t("tx.receipt.brand") }), t("tx.receipt.digital_record")].forEach(line => {
      const p = doc.createElement("p");
      p.style.cssText = "text-align:center;color:#666;font-size:10px;";
      p.textContent = line;
      doc.body.appendChild(p);
    });

    win.print();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("tx.receipt.heading")}</h1>
        <p className="text-sm text-muted-foreground">{t("tx.receipt.subhead")}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("tx.receipt.search_placeholder")} className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* TX List */}
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1" tabIndex={0}>
          {isLoading ? <div className="text-center py-8 text-muted-foreground text-sm">{t("tx.receipt.loading")}</div> : isError ? (
            <div className="text-center py-8 text-destructive text-sm">{t("tx.receipt.error")}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">{t("tx.receipt.empty")}</div>
          ) : filtered.map(tx => (
            <div key={tx.id} onClick={() => setSelected(tx)}
              className={`p-3 rounded-xl border cursor-pointer transition-colors ${selected?.id === tx.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/50"}`}>
              <div className="flex items-center gap-2">
                {STATUS_ICON[tx.status] || STATUS_ICON.completed}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold capitalize">{tx.type || t("tx.receipt.default_type")}</span>
                    <span className="text-xs font-bold">{tx.amount} {tx.currency}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{tx.id}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(tx.created_date).toLocaleDateString(undefined)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Receipt Preview */}
        {selected && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold">{t("tx.receipt.preview_title")}</p>
              <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5 text-xs">
                <Printer className="h-3.5 w-3.5" /> {t("tx.receipt.print")}
              </Button>
            </div>
            <div className="p-5 font-mono text-xs space-y-1">
              <h2 className="text-center font-bold text-base mb-4 not-italic" style={{ fontFamily: "sans-serif" }}>{t("tx.receipt.brand")}</h2>
              <div className="text-center text-muted-foreground mb-4">{t("tx.receipt.doc_title")}</div>
              <div className="border-t border-dashed border-border my-3" />
              {[
                [t("tx.receipt.field_receipt_id"), selected.id?.slice(0, 12) + "..."],
                [t("tx.receipt.field_date"), new Date(selected.created_date).toLocaleString(undefined)],
                [t("tx.receipt.field_type"), (selected.type || t("tx.receipt.default_type")).toUpperCase()],
                [t("tx.receipt.field_asset"), selected.currency],
                [t("tx.receipt.field_amount"), `${selected.amount} ${selected.currency}`],
                [t("tx.receipt.field_network_fee"), fee > 0 ? `${fee} ${selected.currency}` : "—"],
                [t("tx.receipt.field_status"), (selected.status || t("tx.receipt.default_status")).toUpperCase()],
                [t("tx.receipt.field_to"), selected.to_address ? selected.to_address.slice(0, 20) + "..." : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-bold">{v}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-border my-3" />
              <p className="text-center text-muted-foreground text-[10px]">{t("tx.receipt.thank_you_prefix")} <strong>{t("tx.receipt.brand")}</strong></p>
              <p className="text-center text-muted-foreground text-[10px]">{t("tx.receipt.digital_record")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}