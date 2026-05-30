import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Gift, Copy, Check, Users, DollarSign, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STATUS_CONFIG = {
  pending: { label: "Pending", cls: "bg-yellow-500/10 text-yellow-500" },
  joined: { label: "Joined", cls: "bg-blue-500/10 text-blue-500" },
  rewarded: { label: "Rewarded", cls: "bg-green-500/10 text-green-500" },
};

export default function ReferralTracker() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ referred_email: "", referred_name: "", note: "" });

  const { data: referrals = [] } = useQuery({ queryKey: ["referrals"], queryFn: () => base44.entities.ReferralRecord.list("-created_date") });

  const create = useMutation({
    mutationFn: (d) => base44.entities.ReferralRecord.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["referrals"] }); setOpen(false); setForm({ referred_email: "", referred_name: "", note: "" }); },
  });

  const markJoined = useMutation({
    mutationFn: (id) => base44.entities.ReferralRecord.update(id, { status: "joined" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referrals"] }),
  });

  const markRewarded = useMutation({
    mutationFn: (id) => base44.entities.ReferralRecord.update(id, { status: "rewarded", reward_paid: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referrals"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.ReferralRecord.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referrals"] }),
  });

  // Unique referral link per user
  const referralCode = "SAFE-" + (referrals.length > 0 ? referrals[0].created_by_id?.slice(-6).toUpperCase() : "ABC123");
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;

  const copyLink = () => { navigator.clipboard.writeText(referralLink); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const total = referrals.length;
  const joined = referrals.filter(r => r.status !== "pending").length;
  const totalRewards = referrals.filter(r => r.status === "rewarded").reduce((s, r) => s + (r.reward_usd || 0), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Referral Tracker</h1>
          <p className="text-sm text-muted-foreground">Track users you've invited and rewards earned</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Referral</Button>
      </div>

      {/* Referral link */}
      <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2 mb-2">
          <Gift className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Your Referral Link</p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-2">
          <span className="flex-1 text-xs font-mono text-muted-foreground truncate">{referralLink}</span>
          <button onClick={copyLink} className="p-1.5 rounded-md hover:bg-secondary transition-colors shrink-0">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">Share this link to invite friends. You earn rewards when they join and trade.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Invited", value: total, icon: <Users className="h-4 w-4 text-blue-500" /> },
          { label: "Joined", value: joined, icon: <Star className="h-4 w-4 text-yellow-500" /> },
          { label: "Rewards", value: `$${totalRewards.toLocaleString()}`, icon: <DollarSign className="h-4 w-4 text-green-500" /> },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <div className="flex justify-center mb-1">{s.icon}</div>
            <p className="font-bold text-lg">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {referrals.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <Gift className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No referrals yet</p>
          <p className="text-sm mt-1">Share your link or add referrals manually</p>
        </div>
      ) : (
        <div className="space-y-2">
          {referrals.map(r => (
            <div key={r.id} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                    {(r.referred_name || r.referred_email)?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{r.referred_name || r.referred_email}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS_CONFIG[r.status]?.cls}`}>{STATUS_CONFIG[r.status]?.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.referred_email} · {new Date(r.created_date).toLocaleDateString("en-GB")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {r.status === "pending" && (
                    <button onClick={() => markJoined.mutate(r.id)} className="text-xs px-2 py-1 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors">Mark Joined</button>
                  )}
                  {r.status === "joined" && (
                    <button onClick={() => markRewarded.mutate(r.id)} className="text-xs px-2 py-1 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors">Mark Rewarded</button>
                  )}
                  {r.status === "rewarded" && <Gift className="h-4 w-4 text-green-500 mx-2" />}
                  <button onClick={() => remove.mutate(r.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"><span className="text-xs">✕</span></button>
                </div>
              </div>
              {r.note && <p className="text-xs text-muted-foreground mt-1.5 ml-12">{r.note}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Referral</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Email</Label><Input className="mt-1.5" type="email" placeholder="friend@example.com" value={form.referred_email} onChange={e => setForm(f => ({ ...f, referred_email: e.target.value }))} /></div>
            <div><Label>Name (optional)</Label><Input className="mt-1.5" placeholder="Alice" value={form.referred_name} onChange={e => setForm(f => ({ ...f, referred_name: e.target.value }))} /></div>
            <div><Label>Note (optional)</Label><Input className="mt-1.5" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            <Button className="w-full" disabled={!form.referred_email || create.isPending} onClick={() => create.mutate(form)}>
              {create.isPending ? "Saving..." : "Add Referral"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}