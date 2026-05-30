import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, Plus, Eye, Heart, Share2, Star, Globe, Lock, TrendingUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const AVAILABLE_ASSETS = ["BTC", "ETH", "SOL", "USDC", "USDT", "BNB", "ADA", "AVAX", "MATIC", "LINK"];

export default function Community() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", description: "", assets: [], is_public: true });

  const { data: allWatchlists = [] } = useQuery({ queryKey: ["watchlists"], queryFn: () => base44.entities.SharedWatchlist.list("-created_date") });

  const myWatchlists = allWatchlists.filter(w => w.created_by_id); // all are mine for now
  const publicWatchlists = allWatchlists.filter(w => w.is_public);
  const filtered = publicWatchlists.filter(w => !search || w.name.toLowerCase().includes(search.toLowerCase()) || w.assets?.some(a => a.toLowerCase().includes(search.toLowerCase())));

  const createWatchlist = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.SharedWatchlist.create({ ...form, owner_name: user.full_name || user.email, followers: 0 });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlists"] }); setShowCreate(false); setForm({ name: "", description: "", assets: [], is_public: true }); toast.success("Watchlist created"); },
  });

  const deleteWatchlist = useMutation({
    mutationFn: (id) => base44.entities.SharedWatchlist.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlists"] }),
  });

  const followWatchlist = useMutation({
    mutationFn: (w) => base44.entities.SharedWatchlist.update(w.id, { followers: (w.followers || 0) + 1 }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlists"] }); toast.success("Following watchlist"); },
  });

  const toggleAsset = (asset) => setForm(f => ({ ...f, assets: f.assets.includes(asset) ? f.assets.filter(a => a !== asset) : [...f.assets, asset] }));

  const WatchlistCard = ({ w, showDelete }) => (
    <div className="p-4 rounded-xl border border-border bg-card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{w.name}</p>
            {w.is_public ? <Globe className="h-3 w-3 text-muted-foreground" /> : <Lock className="h-3 w-3 text-muted-foreground" />}
          </div>
          {w.description && <p className="text-xs text-muted-foreground">{w.description}</p>}
          <p className="text-[10px] text-muted-foreground mt-0.5">by {w.owner_name || "Anonymous"} · {moment(w.created_date).fromNow()}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Heart className="h-3.5 w-3.5" /> {w.followers || 0}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {w.assets?.map(a => <span key={a} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full font-mono">{a}</span>)}
      </div>
      <div className="flex gap-2 mt-1">
        {!showDelete && <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-7" onClick={() => followWatchlist.mutate(w)}><Heart className="h-3 w-3" /> Follow</Button>}
        {showDelete && <Button variant="destructive" size="sm" className="flex-1 text-xs h-7" onClick={() => deleteWatchlist.mutate(w.id)}>Delete</Button>}
      </div>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Community</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Share watchlists and discover community picks</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Create</Button>
      </div>

      <Tabs defaultValue="discover">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="discover" className="flex-1">Discover</TabsTrigger>
          <TabsTrigger value="mine" className="flex-1">My Watchlists ({myWatchlists.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="mt-3 space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search watchlists or assets..." className="pl-9" />
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? "No matching watchlists" : "No public watchlists yet — be the first!"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.sort((a, b) => (b.followers || 0) - (a.followers || 0)).map(w => <WatchlistCard key={w.id} w={w} showDelete={false} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-3 space-y-3">
          {myWatchlists.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Star className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">You haven't created any watchlists yet</p>
            </div>
          ) : (
            <div className="space-y-3">{myWatchlists.map(w => <WatchlistCard key={w.id} w={w} showDelete={true} />)}</div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Watchlist</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My top picks" className="mt-1.5" /></div>
            <div><Label>Description (optional)</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1.5" /></div>
            <div>
              <Label>Assets</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {AVAILABLE_ASSETS.map(a => (
                  <button key={a} onClick={() => toggleAsset(a)} className={`text-xs px-3 py-1 rounded-full border transition-colors ${form.assets.includes(a) ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-muted-foreground"}`}>{a}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
              <div>
                <p className="text-sm font-medium">Make Public</p>
                <p className="text-xs text-muted-foreground">Visible to the community</p>
              </div>
              <Switch checked={form.is_public} onCheckedChange={v => setForm(f => ({ ...f, is_public: v }))} />
            </div>
            <Button className="w-full" onClick={() => createWatchlist.mutate()} disabled={!form.name || form.assets.length === 0 || createWatchlist.isPending}>Create Watchlist</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}