import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Cpu, Plus, Wifi, WifiOff, Trash2, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DEVICE_TYPES = ["Ledger Nano S", "Ledger Nano X", "Trezor One", "Trezor Model T", "Coldcard", "BitBox02"];
const DEVICE_ICONS = { "Ledger": "🟦", "Trezor": "🟥", "Coldcard": "🟧", "BitBox02": "⬛" };
const getIcon = (t) => Object.entries(DEVICE_ICONS).find(([k]) => t.startsWith(k))?.[1] || "🔌";

export default function HardwareWalletPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(null);
  const [form, setForm] = useState({ name: "", device_type: "", firmware_version: "" });

  const { data: devices = [] } = useQuery({ queryKey: ["hardware-wallets"], queryFn: () => base44.entities.HardwareWallet.list() });

  const add = useMutation({
    mutationFn: (d) => base44.entities.HardwareWallet.create({ ...d, status: "disconnected", fingerprint: Math.random().toString(16).slice(2, 14) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hardware-wallets"] }); setOpen(false); setForm({ name: "", device_type: "", firmware_version: "" }); },
  });

  const connect = useMutation({
    mutationFn: async (id) => {
      setConnecting(id);
      await new Promise(r => setTimeout(r, 1800));
      return base44.entities.HardwareWallet.update(id, { status: "connected", last_connected: new Date().toISOString() });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hardware-wallets"] }); setConnecting(null); },
    onError: () => setConnecting(null),
  });

  const disconnect = useMutation({
    mutationFn: (id) => base44.entities.HardwareWallet.update(id, { status: "disconnected" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hardware-wallets"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.HardwareWallet.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hardware-wallets"] }),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Hardware Wallets</h1><p className="text-sm text-muted-foreground">Connect Ledger, Trezor and other cold storage devices</p></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Device</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { label: "Devices Registered", value: devices.length, icon: <Cpu className="h-4 w-4 text-primary" /> },
          { label: "Connected", value: devices.filter(d => d.status === "connected").length, icon: <Wifi className="h-4 w-4 text-green-500" /> },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
            {s.icon}<div><p className="font-bold text-xl">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-xl border border-border bg-secondary/30 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">ℹ️ How it works</p>
        <p>Register your device fingerprint here. When signing transactions, you'll be prompted to confirm on your hardware device. Private keys never leave the device.</p>
      </div>

      {devices.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground"><Cpu className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No devices registered</p><p className="text-sm mt-1">Add your Ledger, Trezor or other hardware wallet</p></div>
      ) : (
        <div className="space-y-3">
          {devices.map(d => (
            <div key={d.id} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getIcon(d.device_type)}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{d.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 ${d.status === "connected" ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground"}`}>
                        {d.status === "connected" ? <><CheckCircle className="h-2.5 w-2.5" /> Connected</> : <><WifiOff className="h-2.5 w-2.5" /> Offline</>}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.device_type}{d.firmware_version ? ` · v${d.firmware_version}` : ""}</p>
                    {d.last_connected && <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5"><Clock className="h-2.5 w-2.5" /> Last: {new Date(d.last_connected).toLocaleDateString("en-GB")}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {d.status !== "connected" ? (
                    <Button size="sm" variant="outline" disabled={connecting === d.id} onClick={() => connect.mutate(d.id)} className="text-xs">
                      {connecting === d.id ? "Connecting..." : "Connect"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => disconnect.mutate(d.id)} className="text-xs">Disconnect</Button>
                  )}
                  <button onClick={() => remove.mutate(d.id)} className="p-1.5 hover:text-destructive text-muted-foreground transition-colors"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground font-mono">Fingerprint: {d.fingerprint}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register Hardware Wallet</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Nickname</Label><Input className="mt-1.5" placeholder="My Ledger" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Device Type</Label>
              <Select value={form.device_type} onValueChange={v => setForm(f => ({ ...f, device_type: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select device..." /></SelectTrigger>
                <SelectContent>{DEVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Firmware Version (optional)</Label><Input className="mt-1.5" placeholder="2.1.0" value={form.firmware_version} onChange={e => setForm(f => ({ ...f, firmware_version: e.target.value }))} /></div>
            <Button className="w-full" disabled={!form.name || !form.device_type || add.isPending} onClick={() => add.mutate(form)}>{add.isPending ? "Registering..." : "Register Device"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}