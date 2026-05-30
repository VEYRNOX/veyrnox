import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Globe, CheckCircle, XCircle, Trash2, Play, Zap, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TRIGGER_LABELS = { transaction_sent: "Transaction Sent", transaction_received: "Transaction Received", price_alert: "Price Alert Triggered", balance_change: "Balance Changed", wallet_login: "New Wallet Login", large_transfer: "Large Transfer (>threshold)" };

export default function WebhookBuilder() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [copied, setCopied] = useState(null);
  const [form, setForm] = useState({ name: "", trigger: "transaction_received", endpoint_url: "", secret_header: "", threshold_usd: "" });

  const { data: webhooks = [] } = useQuery({ queryKey: ["webhooks"], queryFn: () => base44.entities.WebhookConfig.list() });

  const create = useMutation({
    mutationFn: (d) => base44.entities.WebhookConfig.create({ ...d, threshold_usd: d.threshold_usd ? parseFloat(d.threshold_usd) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); setOpen(false); setForm({ name: "", trigger: "transaction_received", endpoint_url: "", secret_header: "", threshold_usd: "" }); },
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.WebhookConfig.update(id, { enabled: !enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.WebhookConfig.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const test = async (wh) => {
    setTestingId(wh.id);
    try {
      await fetch(wh.endpoint_url, { method: "POST", headers: { "Content-Type": "application/json", ...(wh.secret_header ? { "X-Webhook-Secret": wh.secret_header } : {}) }, body: JSON.stringify({ test: true, trigger: wh.trigger, timestamp: new Date().toISOString(), wallet: "test_wallet", amount: 0 }) });
      setTestResults(r => ({ ...r, [wh.id]: "success" }));
      await base44.entities.WebhookConfig.update(wh.id, { times_fired: (wh.times_fired || 0) + 1, last_fired: new Date().toISOString(), last_status: "200" });
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    } catch {
      setTestResults(r => ({ ...r, [wh.id]: "failed" }));
    }
    setTestingId(null);
  };

  const SAMPLE_PAYLOAD = { trigger: "transaction_received", wallet: "0x1234...abcd", amount: 0.5, currency: "ETH", timestamp: new Date().toISOString() };
  const copyPayload = (id) => { navigator.clipboard.writeText(JSON.stringify(SAMPLE_PAYLOAD, null, 2)); setCopied(id); setTimeout(() => setCopied(null), 1500); };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">On-Chain Webhook Builder</h1><p className="text-sm text-muted-foreground">Trigger external apps (Zapier, Make, custom) on wallet events</p></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New Webhook</Button>
      </div>

      <div className="p-3 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground">
        <Zap className="h-3.5 w-3.5 inline mr-1.5 text-yellow-500" />
        Webhooks fire a POST request to your URL when the trigger event occurs. Use with Zapier, Make.com, or any HTTP endpoint.
      </div>

      {webhooks.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground"><Globe className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No webhooks configured</p><p className="text-sm mt-1">Create a webhook to connect your wallet to external services</p></div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(wh => (
            <div key={wh.id} className={`p-4 rounded-xl border bg-card ${!wh.enabled ? "opacity-60" : "border-border"}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{wh.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{TRIGGER_LABELS[wh.trigger]}</span>
                    {!wh.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Paused</span>}
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-1 truncate">{wh.endpoint_url}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>Fired: {wh.times_fired || 0}×</span>
                    {wh.last_fired && <span>Last: {new Date(wh.last_fired).toLocaleDateString("en-GB")}</span>}
                    {wh.last_status && <span className={wh.last_status === "200" ? "text-green-500" : "text-destructive"}>HTTP {wh.last_status}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button onClick={() => copyPayload(wh.id)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Copy sample payload">
                    {copied === wh.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => test(wh)} disabled={testingId === wh.id} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Test webhook">
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <Switch checked={wh.enabled !== false} onCheckedChange={() => toggle.mutate({ id: wh.id, enabled: wh.enabled !== false })} />
                  <button onClick={() => remove.mutate(wh.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {testResults[wh.id] && (
                <div className={`mt-2 text-xs flex items-center gap-1 ${testResults[wh.id] === "success" ? "text-green-500" : "text-destructive"}`}>
                  {testResults[wh.id] === "success" ? <><CheckCircle className="h-3 w-3" /> Test fired successfully</> : <><XCircle className="h-3 w-3" /> Test failed — check URL</>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Webhook</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Name</Label><Input className="mt-1.5" placeholder="Zapier Notification" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Trigger Event</Label>
              <Select value={form.trigger} onValueChange={v => setForm(f => ({ ...f, trigger: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TRIGGER_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Endpoint URL</Label><Input className="mt-1.5 font-mono text-xs" placeholder="https://hooks.zapier.com/..." value={form.endpoint_url} onChange={e => setForm(f => ({ ...f, endpoint_url: e.target.value }))} /></div>
            <div><Label>Secret Header (optional)</Label><Input className="mt-1.5 font-mono text-xs" placeholder="my-secret-value" value={form.secret_header} onChange={e => setForm(f => ({ ...f, secret_header: e.target.value }))} /></div>
            {form.trigger === "large_transfer" && <div><Label>Threshold (USD)</Label><Input type="number" className="mt-1.5" placeholder="500" value={form.threshold_usd} onChange={e => setForm(f => ({ ...f, threshold_usd: e.target.value }))} /></div>}
            <Button className="w-full" disabled={!form.name || !form.endpoint_url || create.isPending} onClick={() => create.mutate(form)}>Create Webhook</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}