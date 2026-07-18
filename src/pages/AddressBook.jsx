// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Star, Trash2, Copy, Check, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { isValidAddressForCurrency, addressKindLabel } from "@/lib/addressValidation";
import PageState from "@/components/PageState";

const CURRENCIES = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];
const EMOJIS = ["👤", "🏢", "💼", "🏦", "👨‍👩‍👧", "🤝", "🌍", "⚡"];

export default function AddressBook() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", currency: "ETH", network: "Ethereum", emoji: "👤", note: "", is_trusted: false });

  const { data: contacts = [], isLoading, isError } = useQuery({
    queryKey: ["address-book"],
    queryFn: () => base44.entities.AddressBook.list("-created_date"),
  });

  const create = useMutation({
    mutationFn: (/** @type {any} */ data) => base44.entities.AddressBook.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["address-book"] }); setOpen(false); setForm({ name: "", address: "", currency: "ETH", network: "Ethereum", emoji: "👤", note: "", is_trusted: false }); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.AddressBook.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["address-book"] }),
  });

  const toggleTrust = useMutation({
    mutationFn: (/** @type {any} */ vars) => base44.entities.AddressBook.update(vars.id, { is_trusted: vars.is_trusted }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["address-book"] }),
  });

  const copy = (address, id) => {
    navigator.clipboard.writeText(address);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // Validate the recipient address against the selected chain before it can be
  // saved — garbage addresses otherwise persist and feed the Send recipient list.
  // Reuses the same validators the Send flow uses (see lib/addressValidation).
  const trimmedAddress = form.address.trim();
  const addressValid = isValidAddressForCurrency(trimmedAddress, form.currency, form.network);
  const showAddressError = trimmedAddress.length > 0 && !addressValid;
  const canSave = !!form.name && !!trimmedAddress && addressValid && !create.isPending;

  const filtered = contacts.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.address?.toLowerCase().includes(search.toLowerCase()) ||
    c.currency?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Address Book</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} saved contacts</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Contact</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search contacts..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <PageState
        loading={isLoading}
        loadingLabel="Loading contacts…"
        error={isError}
        errorLabel="Couldn’t load contacts — they may not all be shown."
        empty={filtered.length === 0}
        renderEmpty={() => (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-medium">{search ? "No contacts found" : "No contacts yet"}</p>
            <p className="text-sm mt-1">Save wallet addresses for quick access when sending</p>
          </div>
        )}
      >
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors">
              <div className="h-11 w-11 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0">{c.emoji || "👤"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{c.name}</p>
                  {c.is_trusted && <Shield className="h-3.5 w-3.5 text-success" />}
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">{c.currency}</span>
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate">{c.address}</p>
                {c.note && <p className="text-xs text-muted-foreground mt-0.5">{c.note}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => copy(c.address, c.id)} aria-label="Copy address" className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  {copied === c.id ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
                <button onClick={() => toggleTrust.mutate({ id: c.id, is_trusted: !c.is_trusted })}
                  aria-label={c.is_trusted ? "Remove trusted mark" : "Mark as trusted"}
                  className={`p-2 rounded-lg transition-colors ${c.is_trusted ? "text-caution" : "text-muted-foreground hover:text-caution"}`}>
                  <Star className="h-4 w-4" fill={c.is_trusted ? "currentColor" : "none"} />
                </button>
                <button onClick={() => remove.mutate(c.id)} aria-label="Delete contact" className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </PageState>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex gap-3">
              <div>
                <Label className="text-xs">Avatar</Label>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {EMOJIS.map(e => (
                    <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))}
                      className={`h-9 w-9 rounded-lg text-xl transition-colors ${form.emoji === e ? "bg-primary/20 ring-2 ring-primary" : "bg-secondary hover:bg-secondary/80"}`}>{e}</button>
                  ))}
                </div>
              </div>
            </div>
            <div><Label htmlFor="contact-name">Name</Label><Input id="contact-name" className="mt-1.5" placeholder="Alice's ETH Wallet" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div>
              <Label htmlFor="contact-address">Wallet Address</Label>
              <Input
                id="contact-address"
                className={`mt-1.5 font-mono text-xs ${showAddressError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                placeholder="0x..."
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                aria-invalid={showAddressError}
              />
              {showAddressError && (
                <p className="text-xs text-destructive mt-1.5">
                  Not a valid {form.currency} address on {form.network} — expected {addressKindLabel(form.currency, form.network)}.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label id="contact-currency-label">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger aria-labelledby="contact-currency-label" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label id="contact-network-label">Network</Label>
                <Select value={form.network} onValueChange={v => setForm(f => ({ ...f, network: v }))}>
                  <SelectTrigger aria-labelledby="contact-network-label" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Ethereum", "Bitcoin", "Solana", "Polygon", "BSC"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label htmlFor="contact-note">Note (optional)</Label><Input id="contact-note" className="mt-1.5" placeholder="e.g. Business partner" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_trusted} onCheckedChange={v => setForm(f => ({ ...f, is_trusted: v }))} />
              <Label>Mark as Trusted</Label>
            </div>
            <Button className="w-full" disabled={!canSave} onClick={() => { if (!canSave) return; setOpen(false); setForm({ name: "", address: "", currency: "ETH", network: "Ethereum", emoji: "👤", note: "", is_trusted: false }); create.mutate({ ...form, address: trimmedAddress }); }}>
              {create.isPending ? "Saving..." : "Save Contact"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}