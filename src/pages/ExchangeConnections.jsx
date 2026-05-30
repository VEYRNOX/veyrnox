import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, RefreshCw, Trash2, CheckCircle2, AlertCircle, Clock, Eye, EyeOff, Zap } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const EXCHANGES = [
  { id: "binance", name: "Binance", emoji: "🟡", description: "World's largest crypto exchange" },
  { id: "kraken", name: "Kraken", emoji: "🐙", description: "Trusted US-based exchange" },
  { id: "coinbase", name: "Coinbase", emoji: "🔵", description: "Beginner-friendly US exchange" },
];

const STATUS_CONFIG = {
  active: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", label: "Connected" },
  error: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Error" },
  pending: { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Pending sync" },
};

function MaskedKey({ value }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <code className="text-xs font-mono text-muted-foreground">
        {show ? value : value.slice(0, 6) + "••••••••••••" + value.slice(-4)}
      </code>
      <button onClick={() => setShow(s => !s)} className="text-muted-foreground hover:text-foreground transition-colors">
        {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
    </div>
  );
}

export default function ExchangeConnections() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [exchange, setExchange] = useState("binance");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [syncing, setSyncing] = useState(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["exchange-connections"],
    queryFn: () => base44.entities.ExchangeConnection.list("-created_date"),
  });

  const addConnection = useMutation({
    mutationFn: (data) => base44.entities.ExchangeConnection.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange-connections"] });
      setOpen(false);
      setLabel(""); setApiKey(""); setApiSecret("");
      toast.success("Exchange added — click Sync to import balances");
    },
    onError: () => toast.error("Failed to save connection"),
  });

  const deleteConnection = useMutation({
    mutationFn: (id) => base44.entities.ExchangeConnection.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange-connections"] });
      toast.success("Connection removed");
    },
  });

  const syncBalances = async (conn) => {
    setSyncing(conn.id);
    try {
      const res = await base44.functions.invoke("fetchExchangeBalances", { connectionId: conn.id });
      queryClient.invalidateQueries({ queryKey: ["exchange-connections"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      toast.success(`Synced ${res.data?.imported || 0} balances from ${conn.exchange}`);
    } catch (e) {
      toast.error(e.response?.data?.error || "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  const ex = EXCHANGES.find(e => e.id === exchange);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exchange Connections</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Import balances from exchange accounts</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add Exchange
        </Button>
      </div>

      {/* Exchange cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-2xl">🔗</div>
          <p className="font-semibold">No exchanges connected</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Connect Binance, Kraken, or Coinbase to automatically sync your exchange balances.
          </p>
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Exchange
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map(conn => {
            const exInfo = EXCHANGES.find(e => e.id === conn.exchange);
            const status = STATUS_CONFIG[conn.status] || STATUS_CONFIG.pending;
            const StatusIcon = status.icon;
            return (
              <div key={conn.id} className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-xl bg-secondary flex items-center justify-center text-xl shrink-0">
                    {exInfo?.emoji || "🔗"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{conn.label || exInfo?.name}</p>
                      <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.bg} ${status.color}`}>
                        <StatusIcon className="h-2.5 w-2.5" />
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">{conn.exchange}</p>
                    {conn.last_synced && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Last synced {moment(conn.last_synced).fromNow()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={syncing === conn.id}
                      onClick={() => syncBalances(conn)}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing === conn.id ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteConnection.mutate(conn.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border pt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-16 shrink-0">API KEY</span>
                    <MaskedKey value={conn.api_key} />
                  </div>
                </div>

                {conn.status === "error" && conn.error_message && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {conn.error_message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info box */}
      <div className="p-4 rounded-xl border border-border bg-card/50 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" /> API Key Permissions
        </p>
        <p className="text-xs text-muted-foreground">Only grant <strong className="text-foreground">read-only</strong> permissions when creating API keys on your exchange. This app never requests withdrawal or trading permissions.</p>
      </div>

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Connect Exchange</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Exchange</Label>
              <Select value={exchange} onValueChange={setExchange}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXCHANGES.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.emoji} {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ex && <p className="text-xs text-muted-foreground mt-1">{ex.description}</p>}
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder={`My ${ex?.name || ""} Account`} className="mt-1.5" />
            </div>
            <div>
              <Label>API Key</Label>
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste your read-only API key" className="mt-1.5 font-mono text-sm" />
            </div>
            <div>
              <Label>API Secret</Label>
              <Input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="Paste your API secret" className="mt-1.5 font-mono text-sm" />
            </div>
            <Button
              className="w-full"
              disabled={!apiKey || !apiSecret || addConnection.isPending}
              onClick={() => addConnection.mutate({ exchange, label, api_key: apiKey, api_secret: apiSecret, status: "pending" })}
            >
              {addConnection.isPending ? "Saving…" : "Save & Connect"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}