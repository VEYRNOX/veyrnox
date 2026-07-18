// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";

const CURRENCIES = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];

const ADDRESS_PATTERNS = {
  BTC: /^(1|3|bc1|tb1|bcrt1)[a-zA-Z0-9]{25,62}$/, // mainnet + testnet/regtest bech32 (app is testnet-only)
  ETH: /^0x[0-9a-fA-F]{40}$/,
  SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  USDC: /^0x[0-9a-fA-F]{40}$/,
  USDT: /^0x[0-9a-fA-F]{40}$/,
};

export default function WhitelistManager() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [currency, setCurrency] = useState("ETH");
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState("");

  const { data: whitelist = [] } = useQuery({
    queryKey: ["whitelisted-addresses"],
    queryFn: () => base44.entities.WhitelistedAddress.list("-created_date"),
  });

  const addAddress = useMutation({
    mutationFn: (/** @type {any} */ data) => base44.entities.WhitelistedAddress.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whitelisted-addresses"] });
      setDialogOpen(false);
      resetForm();
      toast.success("Address added to whitelist");
    },
  });

  const removeAddress = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.WhitelistedAddress.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whitelisted-addresses"] });
      toast.success("Address removed from whitelist");
    },
  });

  const resetForm = () => {
    setLabel(""); setAddress(""); setCurrency("ETH"); setNote(""); setValidationError("");
  };

  const validateAndSubmit = () => {
    if (!label.trim()) { setValidationError("Label is required."); return; }
    if (!address.trim()) { setValidationError("Address is required."); return; }
    const pattern = ADDRESS_PATTERNS[currency];
    if (pattern && !pattern.test(address.trim())) {
      setValidationError(`Invalid ${currency} address format.`);
      return;
    }
    const duplicate = whitelist.find(w => w.address.toLowerCase() === address.trim().toLowerCase() && w.currency === currency);
    if (duplicate) { setValidationError("This address is already whitelisted."); return; }
    addAddress.mutate({ label: label.trim(), address: address.trim(), currency, note: note.trim() });
  };

  const grouped = CURRENCIES.reduce((acc, c) => {
    acc[c] = whitelist.filter(w => w.currency === c);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Whitelisted Withdrawal Addresses</h2>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add Address
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Save addresses you trust. When you send, you'll get a warning if the recipient isn't on this list.
      </p>

      {whitelist.length === 0 ? (
        <div className="text-center py-10 space-y-2 border border-dashed border-border rounded-xl">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No whitelisted addresses yet</p>
          <p className="text-xs text-muted-foreground">Add addresses you send to regularly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {CURRENCIES.filter(c => grouped[c].length > 0).map(c => (
            <div key={c} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{c}</p>
              {grouped[c].map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate">{item.address}</p>
                    {item.note && <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${item.label} from whitelist`}
                    className="shrink-0 ml-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeAddress.mutate(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Whitelisted Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label htmlFor="whitelist-label">Label</Label>
              <Input id="whitelist-label" value={label} onChange={e => { setLabel(e.target.value); setValidationError(""); }} placeholder="My Hardware Wallet" className="mt-1.5" />
            </div>
            <div>
              <Label id="whitelist-currency-label">Currency</Label>
              <Select value={currency} onValueChange={v => { setCurrency(v); setValidationError(""); }}>
                <SelectTrigger aria-labelledby="whitelist-currency-label" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="whitelist-address">Address</Label>
              <Input id="whitelist-address" value={address} onChange={e => { setAddress(e.target.value); setValidationError(""); }} placeholder="0x..." className="mt-1.5 font-mono text-sm" />
            </div>
            <div>
              <Label htmlFor="whitelist-note">Note (optional)</Label>
              <Input id="whitelist-note" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Cold storage" className="mt-1.5" />
            </div>
            {validationError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive">{validationError}</p>
              </div>
            )}
            <Button className="w-full" onClick={validateAndSubmit} disabled={addAddress.isPending}>
              <Plus className="h-4 w-4 mr-1.5" /> Add to Whitelist
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}