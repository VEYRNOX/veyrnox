import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, Plus, Shield, Eye, TrendingUp, Settings, Trash2, CheckCircle2, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import moment from "moment";

const ROLES = [
  { value: "viewer", label: "Viewer", icon: Eye, color: "text-blue-400", bg: "bg-blue-500/10", desc: "Can view balances and transaction history", permissions: ["view_balances", "view_transactions", "view_analytics"] },
  { value: "trader", label: "Trader", icon: TrendingUp, color: "text-yellow-400", bg: "bg-yellow-500/10", desc: "Can make trades and swaps but not send funds", permissions: ["view_balances", "view_transactions", "view_analytics", "make_trades", "set_alerts"] },
  { value: "manager", label: "Manager", icon: Settings, color: "text-primary", bg: "bg-primary/10", desc: "Full access except changing security settings", permissions: ["view_balances", "view_transactions", "view_analytics", "make_trades", "set_alerts", "send_funds", "manage_wallets"] },
];

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-yellow-400", label: "Pending" },
  active: { icon: CheckCircle2, color: "text-green-400", label: "Active" },
  revoked: { icon: X, color: "text-muted-foreground", label: "Revoked" },
};

const PERM_LABELS = {
  view_balances: "View Balances",
  view_transactions: "View Transactions",
  view_analytics: "View Analytics",
  make_trades: "Make Trades",
  set_alerts: "Set Alerts",
  send_funds: "Send Funds",
  manage_wallets: "Manage Wallets",
};

export default function AccountAccess() {
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ invitee_email: "", invitee_name: "", role: "viewer", note: "" });

  const { data: accesses = [] } = useQuery({ queryKey: ["account-access"], queryFn: () => base44.entities.AccountAccess.list("-created_date") });

  const active = accesses.filter(a => a.status === "active");
  const pending = accesses.filter(a => a.status === "pending");

  const selectedRole = ROLES.find(r => r.value === form.role);

  const invite = useMutation({
    mutationFn: () => base44.entities.AccountAccess.create({
      ...form, permissions: selectedRole?.permissions || [], status: "pending",
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["account-access"] }); setShowInvite(false); setForm({ invitee_email: "", invitee_name: "", role: "viewer", note: "" }); toast.success("Invitation sent"); },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.AccountAccess.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account-access"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.AccountAccess.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["account-access"] }); toast.success("Access removed"); },
  });

  const AccessCard = ({ a }) => {
    const role = ROLES.find(r => r.value === a.role);
    const st = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
    return (
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl ${role?.bg} flex items-center justify-center`}>
              {role && <role.icon className={`h-5 w-5 ${role.color}`} />}
            </div>
            <div>
              <p className="text-sm font-semibold">{a.invitee_name || a.invitee_email}</p>
              <p className="text-xs text-muted-foreground">{a.invitee_email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <st.icon className={`h-3.5 w-3.5 ${st.color}`} />
            <span className={`text-xs ${st.color}`}>{st.label}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full ${role?.bg} ${role?.color}`}>{a.role}</span>
          <span className="text-xs text-muted-foreground">{moment(a.created_date).fromNow()}</span>
        </div>
        {a.permissions?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {a.permissions.map(p => <span key={p} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full text-muted-foreground">{PERM_LABELS[p]}</span>)}
          </div>
        )}
        <div className="flex gap-2">
          {a.status === "pending" && <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setStatus.mutate({ id: a.id, status: "active" })}>Approve</Button>}
          {a.status === "active" && <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setStatus.mutate({ id: a.id, status: "revoked" })}>Revoke</Button>}
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Account Access</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Share controlled access with trusted people</p>
        </div>
        <Button onClick={() => setShowInvite(true)}><Plus className="h-4 w-4 mr-1.5" /> Invite</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Active", value: active.length, color: "text-green-400" },
          { label: "Pending", value: pending.length, color: "text-yellow-400" },
          { label: "Total", value: accesses.length, color: "text-primary" }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Role reference */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Access Roles</p>
        {ROLES.map(r => (
          <div key={r.value} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
            <div className={`h-8 w-8 rounded-lg ${r.bg} flex items-center justify-center shrink-0`}><r.icon className={`h-4 w-4 ${r.color}`} /></div>
            <div><p className="text-sm font-semibold">{r.label}</p><p className="text-xs text-muted-foreground">{r.desc}</p></div>
          </div>
        ))}
      </div>

      {accesses.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No shared access yet. Invite someone to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Shared Access ({accesses.length})</p>
          {accesses.map(a => <AccessCard key={a.id} a={a} />)}
        </div>
      )}

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={form.invitee_name} onChange={e => setForm(f => ({ ...f, invitee_name: e.target.value }))} placeholder="John Doe" className="mt-1.5" /></div>
              <div><Label>Email</Label><Input type="email" value={form.invitee_email} onChange={e => setForm(f => ({ ...f, invitee_email: e.target.value }))} placeholder="john@example.com" className="mt-1.5" /></div>
            </div>
            <div><Label>Role</Label>
              <div className="mt-1.5 space-y-2">
                {ROLES.map(r => (
                  <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value }))}
                    className={`w-full p-3 rounded-xl border text-left transition-colors flex items-center gap-3 ${form.role === r.value ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                    <div className={`h-8 w-8 rounded-lg ${r.bg} flex items-center justify-center shrink-0`}><r.icon className={`h-4 w-4 ${r.color}`} /></div>
                    <div><p className="text-sm font-semibold">{r.label}</p><p className="text-xs text-muted-foreground">{r.desc}</p></div>
                  </button>
                ))}
              </div>
            </div>
            {selectedRole && (
              <div className="p-3 rounded-lg bg-secondary">
                <p className="text-xs text-muted-foreground mb-1.5">Permissions granted:</p>
                <div className="flex flex-wrap gap-1">{selectedRole.permissions.map(p => <span key={p} className="text-[10px] bg-background px-2 py-0.5 rounded-full">{PERM_LABELS[p]}</span>)}</div>
              </div>
            )}
            <div><Label>Note (optional)</Label><Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="mt-1.5" /></div>
            <Button className="w-full" onClick={() => invite.mutate()} disabled={!form.invitee_email || invite.isPending}>Send Invitation</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}