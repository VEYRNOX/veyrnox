import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { FileText, Plus, Send, Trash2, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { safeFormat } from "@/lib/safeDate";
import { isValidAddressForCurrency } from "@/lib/addressValidation";

const STATUS_COLORS = { draft: "secondary", sent: "default", paid: "outline", overdue: "destructive" };

export default function InvoiceGenerator() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    client_name: "", client_email: "", description: "", currency: "USDC",
    total_amount: "", wallet_address: "", due_date: "", note: "",
    invoice_number: `INV-${Date.now().toString().slice(-6)}`,
  });

  const { data: invoices = [], isLoading, isError } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list("-created_date"),
  });

  const create = useMutation({
    mutationFn: (/** @type {any} */ d) => {
      const amount = parseFloat(d.total_amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");
      const addr = (d.wallet_address || "").trim();
      // Validate address: use currency-aware check when possible, else require non-empty + plausible length
      const addrOk = isValidAddressForCurrency(addr, d.currency) ||
        (addr.length >= 25 && addr.length <= 128);
      if (!addrOk) throw new Error("Wallet address does not look valid for the selected currency");
      return base44.entities.Invoice.create({ ...d, wallet_address: addr, total_amount: amount, status: "draft" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); setOpen(false); },
  });

  const updateStatus = useMutation({
    mutationFn: (/** @type {any} */ vars) => base44.entities.Invoice.update(vars.id, { status: vars.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.Invoice.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  function copyPaymentLink(inv) {
    const link = `Pay ${inv.total_amount} ${inv.currency} to ${inv.wallet_address} (Invoice ${inv.invoice_number})`;
    navigator.clipboard.writeText(link);
    setCopied(inv.id);
    setTimeout(() => setCopied(null), 2000);
  }

  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total_amount, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Invoice Generator</h1>
          <p className="text-sm text-muted-foreground">{invoices.length} invoices · ${totalPaid.toLocaleString()} received</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Invoice</Button>
      </div>

      {/* Invoice List */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
      ) : isError ? (
        <div className="text-center py-12 text-sm text-destructive">Couldn't load invoices. Please try again.</div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📄</p>
          <p className="text-muted-foreground text-sm mb-4">Create professional crypto invoices</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Create Invoice</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => (
            <div key={inv.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{inv.client_name}</p>
                    <Badge variant={STATUS_COLORS[inv.status] || "secondary"}>{inv.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{inv.invoice_number} · Due {inv.due_date ? safeFormat(inv.due_date, "MMM d, yyyy", "No deadline") : "No deadline"}</p>
                </div>
                <p className="text-lg font-bold">{inv.total_amount} {inv.currency}</p>
              </div>

              {inv.description && <p className="text-xs text-muted-foreground mb-3">{inv.description}</p>}

              <div className="flex flex-wrap gap-2">
                {inv.status === "draft" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: inv.id, status: "sent" })}>
                    <Send className="h-3 w-3 mr-1" /> Mark Sent
                  </Button>
                )}
                {inv.status === "sent" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: inv.id, status: "paid" })}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Paid
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copyPaymentLink(inv)}>
                  {copied === inv.id ? <><CheckCircle2 className="h-3 w-3 mr-1 text-success" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy Payment Link</>}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPreview(inv)}>
                  <FileText className="h-3 w-3 mr-1" /> Preview
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => remove.mutate(inv.id)} aria-label="Delete invoice">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inv-number">Invoice Number</Label>
                <Input id="inv-number" value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="inv-due-date">Due Date</Label>
                <Input id="inv-due-date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} type="date" className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label htmlFor="inv-client-name">Client Name</Label>
              <Input id="inv-client-name" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Acme Corp" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="inv-client-email">Client Email</Label>
              <Input id="inv-client-email" value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} placeholder="client@example.com" type="email" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="inv-description">Description / Services</Label>
              <Input id="inv-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Web development services..." className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inv-amount">Amount</Label>
                <Input id="inv-amount" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="500" type="number" className="mt-1.5" />
              </div>
              <div>
                <Label id="inv-currency-label">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5" aria-labelledby="inv-currency-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="inv-wallet-address">Your Wallet Address</Label>
              <Input id="inv-wallet-address" value={form.wallet_address} onChange={e => setForm(f => ({ ...f, wallet_address: e.target.value }))} placeholder="0x..." className="mt-1.5 font-mono text-xs" />
            </div>
            <div>
              <Label htmlFor="inv-note">Notes (optional)</Label>
              <Input id="inv-note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Payment terms, late fees..." className="mt-1.5" />
            </div>
            <Button className="w-full" disabled={!form.client_name || !form.total_amount || !form.wallet_address || create.isPending}
              onClick={() => create.mutate(form)}>
              {create.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invoice Preview</DialogTitle></DialogHeader>
          {preview && (
            <div className="bg-white text-gray-900 rounded-xl p-6 text-sm">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-xl font-bold text-gray-900">INVOICE</p>
                  <p className="text-gray-500">{preview.invoice_number}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">VEYRNOX</p>
                  <p className="text-gray-500 text-xs">Crypto Payments</p>
                </div>
              </div>
              <div className="mb-4">
                <p className="text-gray-500 text-xs uppercase mb-1">Bill To</p>
                <p className="font-semibold">{preview.client_name}</p>
                {preview.client_email && <p className="text-gray-500 text-xs">{preview.client_email}</p>}
              </div>
              <div className="border-t border-gray-200 pt-4 mb-4">
                <div className="flex justify-between py-2">
                  <p>{preview.description || "Services"}</p>
                  <p className="font-semibold">{preview.total_amount} {preview.currency}</p>
                </div>
              </div>
              <div className="border-t-2 border-gray-900 pt-3 flex justify-between">
                <p className="font-bold">Total Due</p>
                <p className="font-bold text-lg">{preview.total_amount} {preview.currency}</p>
              </div>
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Pay to wallet:</p>
                <p className="font-mono text-xs break-all">{preview.wallet_address}</p>
              </div>
              {preview.note && <p className="mt-3 text-xs text-gray-400">{preview.note}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}