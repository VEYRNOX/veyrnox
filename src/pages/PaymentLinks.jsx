import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link2, Plus, Copy, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const CURRENCIES = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];
const STATUS_STYLES = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  paid: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  expired: "bg-secondary text-muted-foreground border-border",
};

function generateLinkId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export default function PaymentLinks() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", currency: "USDC", amount: "", wallet_address: "", note: "" });
  const [copied, setCopied] = useState(null);

  const { data: links = [] } = useQuery({ queryKey: ["payment-links"], queryFn: () => base44.entities.PaymentLink.list("-created_date") });

  const create = useMutation({
    mutationFn: () => base44.entities.PaymentLink.create({ ...form, amount: Number(form.amount), link_id: generateLinkId(), status: "active" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payment-links"] }); setShowCreate(false); setForm({ title: "", currency: "USDC", amount: "", wallet_address: "", note: "" }); toast.success("Payment link created"); },
  });

  const markPaid = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.PaymentLink.update(id, { status: "paid" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payment-links"] }); toast.success("Marked as paid"); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.PaymentLink.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payment-links"] }),
  });

  const copyLink = (link) => {
    const url = `${window.location.origin}/pay/${link.link_id}?to=${link.wallet_address}&amount=${link.amount}&currency=${link.currency}`;
    navigator.clipboard.writeText(url);
    setCopied(link.id);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Link copied!");
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Link2 className="h-6 w-6 text-primary" /> Payment Links</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Generate shareable crypto payment request links</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Create Link</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Total Links", value: links.length }, { label: "Active", value: links.filter(l=>l.status==="active").length }, { label: "Paid", value: links.filter(l=>l.status==="paid").length }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <p className="text-xl font-bold text-primary">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {links.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl">
          <Link2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground mb-3">No payment links yet</p>
          <Button onClick={() => setShowCreate(true)}>Create Your First Link</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map(link => (
            <div key={link.id} className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{link.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{link.amount ? `${link.amount} ${link.currency}` : `Any amount · ${link.currency}`}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLES[link.status]}`}>{link.status}</span>
              </div>
              {link.note && <p className="text-xs text-muted-foreground italic">"{link.note}"</p>}
              <div className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded truncate">
                {window.location.origin}/pay/{link.link_id}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => copyLink(link)}>
                  {copied === link.id ? <CheckCircle2 className="h-3 w-3 mr-1 text-green-400" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copied === link.id ? "Copied!" : "Copy Link"}
                </Button>
                {link.status === "active" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markPaid.mutate(link.id)}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => remove.mutate(link.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Created {moment(link.created_date).fromNow()} · Used {link.times_used || 0}×</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Payment Link</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Invoice #42" className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Amount (optional)</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
            </div>
            <div><Label>Your Wallet Address</Label><Input value={form.wallet_address} onChange={e => setForm(f => ({ ...f, wallet_address: e.target.value }))} placeholder="0x..." className="mt-1.5 font-mono text-xs" /></div>
            <div><Label>Note / Memo (optional)</Label><Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="What is this payment for?" className="mt-1.5" /></div>
            <Button className="w-full" onClick={() => create.mutate()} disabled={!form.title || !form.wallet_address || create.isPending}>Generate Link</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}