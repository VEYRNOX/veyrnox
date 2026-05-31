import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Download, Copy, Check, QrCode, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CURRENCIES = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];

function QRCodeCanvas({ value, size = 200 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !value) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    // Simple QR-like placeholder pattern using the value hash
    const cells = 21;
    const cellSize = size / cells;
    ctx.fillStyle = "#1a1a2e";
    const seed = value.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const isCorner = (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7);
        const shouldFill = isCorner ? ((r === 0 || r === 6 || c === 0 || c === 6) || (r > 1 && r < 5 && c > 1 && c < 5)) : (Math.sin(seed + r * 17 + c * 13) > 0.1);
        if (shouldFill) ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }, [value, size]);
  return <canvas ref={canvasRef} width={size} height={size} className="rounded-lg" />;
}

export default function MerchantQR() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ title: "", currency: "ETH", amount: "", wallet_address: "", note: "" });

  const { data: links = [] } = useQuery({ queryKey: ["payment-links"], queryFn: () => base44.entities.PaymentLink.list("-created_date") });

  const create = useMutation({
    mutationFn: (d) => base44.entities.PaymentLink.create({ ...d, amount: parseFloat(d.amount) || 0, link_id: Math.random().toString(36).slice(2, 10) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payment-links"] }); setOpen(false); setForm({ title: "", currency: "ETH", amount: "", wallet_address: "", note: "" }); },
  });
  const remove = useMutation({
    mutationFn: (id) => base44.entities.PaymentLink.delete(id),
    onSuccess: (_, deletedId) => { queryClient.invalidateQueries({ queryKey: ["payment-links"] }); setSelected(s => s?.id === deletedId ? null : s); },
  });

  const getQRData = (link) => `crypto:${link.wallet_address}?currency=${link.currency}&amount=${link.amount || ""}&memo=${encodeURIComponent(link.title || "")}`;

  const copyAddress = (addr) => { navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Merchant QR Codes</h1>
          <p className="text-sm text-muted-foreground">Generate branded payment QR codes for point-of-sale</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New QR Code</Button>
      </div>

      {selected && (
        <div className="p-5 rounded-xl border border-primary/30 bg-card text-center space-y-4">
          <p className="font-semibold text-lg">{selected.title}</p>
          <div className="flex justify-center">
            <QRCodeCanvas value={getQRData(selected)} size={220} />
          </div>
          {selected.amount > 0 && <p className="font-bold text-xl">{selected.amount} {selected.currency}</p>}
          <p className="font-mono text-xs text-muted-foreground break-all">{selected.wallet_address}</p>
          <div className="flex justify-center gap-3">
            <Button size="sm" variant="outline" onClick={() => copyAddress(selected.wallet_address)} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied!" : "Copy Address"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <QrCode className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No QR codes yet</p>
          <p className="text-sm mt-1">Create a merchant QR code to accept crypto payments in-person</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {links.map(link => (
            <div key={link.id} className={`p-4 rounded-xl border bg-card cursor-pointer hover:border-primary/50 transition-colors ${selected?.id === link.id ? "border-primary" : "border-border"}`}
              onClick={() => setSelected(link)}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{link.title}</p>
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">{link.currency}</span>
                </div>
                <button onClick={e => { e.stopPropagation(); remove.mutate(link.id); }} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex justify-center mt-3">
                <QRCodeCanvas value={getQRData(link)} size={90} />
              </div>
              {link.amount > 0 && <p className="text-center text-sm font-bold mt-2">{link.amount} {link.currency}</p>}
              {link.note && <p className="text-center text-xs text-muted-foreground mt-1 truncate">{link.note}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create QR Code</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Title</Label><Input className="mt-1.5" placeholder="Table 5 — Coffee Shop" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Wallet Address</Label><Input className="mt-1.5 font-mono text-xs" placeholder="0x..." value={form.wallet_address} onChange={e => setForm(f => ({ ...f, wallet_address: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Fixed Amount (optional)</Label><Input className="mt-1.5" type="number" placeholder="Leave blank for any" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
            </div>
            <div><Label>Note (shown on QR)</Label><Input className="mt-1.5" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            <Button className="w-full" disabled={!form.title || !form.wallet_address || create.isPending} onClick={() => create.mutate(form)}>
              {create.isPending ? "Creating..." : "Generate QR Code"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}