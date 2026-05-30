import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, Eye, EyeOff, Edit, CheckCircle, Copy, Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function PublicProfiles() {
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ username: "", bio: "", twitter_handle: "", show_allocation: true, show_pnl: false, show_transactions: false, is_public: false });

  const { data: profiles = [] } = useQuery({ queryKey: ["public-profiles"], queryFn: () => base44.entities.PublicProfile.list() });
  const profile = profiles[0];

  const save = useMutation({
    mutationFn: (d) => profile ? base44.entities.PublicProfile.update(profile.id, d) : base44.entities.PublicProfile.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["public-profiles"] }); setEditMode(false); },
  });

  const currentForm = profile ? { username: profile.username || "", bio: profile.bio || "", twitter_handle: profile.twitter_handle || "", show_allocation: profile.show_allocation ?? true, show_pnl: profile.show_pnl ?? false, show_transactions: profile.show_transactions ?? false, is_public: profile.is_public ?? false } : form;

  const [editForm, setEditForm] = useState(currentForm);
  const profileUrl = profile?.username ? `${window.location.origin}/profile/${profile.username}` : "";
  const copyUrl = () => { navigator.clipboard.writeText(profileUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const PRIVACY = [
    { key: "show_allocation", label: "Show Asset Allocation", desc: "Portfolio distribution visible to followers" },
    { key: "show_pnl", label: "Show P&L", desc: "Profit and loss visible publicly" },
    { key: "show_transactions", label: "Show Recent Trades", desc: "Last 5 trades visible" },
  ];

  if (!profile && !editMode) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div><h1 className="text-xl font-bold">Public Profile</h1><p className="text-sm text-muted-foreground">Share your trading performance with the community</p></div>
        <div className="text-center py-16 space-y-4">
          <Users className="h-12 w-12 mx-auto text-muted-foreground opacity-30" />
          <p className="font-medium">No public profile yet</p>
          <p className="text-sm text-muted-foreground">Create a profile to share your portfolio with followers</p>
          <Button onClick={() => setEditMode(true)} className="gap-2"><Edit className="h-4 w-4" /> Create Profile</Button>
        </div>
      </div>
    );
  }

  if (editMode) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{profile ? "Edit Profile" : "Create Profile"}</h1>
          <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
        </div>
        <div className="space-y-4">
          <div><Label>Username</Label><Input className="mt-1.5" placeholder="satoshi_w" value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value.replace(/\s/g, "_").toLowerCase() }))} /></div>
          <div><Label>Bio</Label><textarea rows={2} className="w-full mt-1.5 rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="DeFi enthusiast. 5+ years crypto." value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} /></div>
          <div><Label>Twitter / X Handle</Label><Input className="mt-1.5" placeholder="@username" value={editForm.twitter_handle} onChange={e => setEditForm(f => ({ ...f, twitter_handle: e.target.value }))} /></div>
          <div className="space-y-2">
            {PRIVACY.map(p => (
              <div key={p.key} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
                <div><p className="text-sm font-medium">{p.label}</p><p className="text-xs text-muted-foreground">{p.desc}</p></div>
                <Switch checked={editForm[p.key]} onCheckedChange={v => setEditForm(f => ({ ...f, [p.key]: v }))} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl border border-primary/20 bg-primary/5">
            <div><p className="text-sm font-semibold">Make Profile Public</p><p className="text-xs text-muted-foreground">Anyone with the link can view your profile</p></div>
            <Switch checked={editForm.is_public} onCheckedChange={v => setEditForm(f => ({ ...f, is_public: v }))} />
          </div>
          <Button className="w-full" disabled={!editForm.username || save.isPending} onClick={() => save.mutate(editForm)}>{save.isPending ? "Saving..." : "Save Profile"}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Public Profile</h1><p className="text-sm text-muted-foreground">Your trading identity</p></div>
        <Button variant="outline" size="sm" onClick={() => { setEditForm(currentForm); setEditMode(true); }} className="gap-2"><Edit className="h-4 w-4" /> Edit</Button>
      </div>

      {/* Profile card */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold shrink-0">{profile.username?.charAt(0)?.toUpperCase()}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-bold text-lg">@{profile.username}</p>
              {profile.verified && <CheckCircle className="h-4 w-4 text-blue-500" />}
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${profile.is_public ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground"}`}>
                {profile.is_public ? <><Globe className="h-2.5 w-2.5 inline mr-0.5" />Public</> : <><EyeOff className="h-2.5 w-2.5 inline mr-0.5" />Private</>}
              </span>
            </div>
            {profile.bio && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
            {profile.twitter_handle && <p className="text-xs text-primary mt-1">{profile.twitter_handle}</p>}
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>{profile.followers || 0} followers</span>
              <span>{profile.following || 0} following</span>
            </div>
          </div>
        </div>
      </div>

      {profile.is_public && profileUrl && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-sm font-semibold mb-2">Profile Link</p>
          <div className="flex items-center gap-2 bg-secondary rounded-lg p-2">
            <span className="flex-1 text-xs font-mono text-muted-foreground truncate">{profileUrl}</span>
            <button onClick={copyUrl}>{copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />}</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Visibility Settings</p>
        {PRIVACY.map(p => (
          <div key={p.key} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card text-sm">
            <span className="font-medium">{p.label}</span>
            {profile[p.key] ? <Eye className="h-4 w-4 text-green-500" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>
    </div>
  );
}