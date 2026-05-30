import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Fingerprint, Plus, CheckCircle2, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const DID_METHODS = [
  { value: "did:ethr", label: "did:ethr", desc: "Ethereum-based DID", chain: "Ethereum", icon: "Ξ" },
  { value: "did:sol", label: "did:sol", desc: "Solana-based DID", chain: "Solana", icon: "◎" },
  { value: "did:key", label: "did:key", desc: "Cryptographic key-pair DID", chain: "Off-chain", icon: "🔑" },
  { value: "did:web", label: "did:web", desc: "Domain-linked DID", chain: "Web", icon: "🌐" },
  { value: "did:ion", label: "did:ion", desc: "Bitcoin-anchored DID (ION)", chain: "Bitcoin", icon: "₿" },
];

const CREDENTIAL_TYPES = [
  { type: "KYC Verified", icon: "✅", desc: "Identity verification passed", issuer: "SafeDigitalWallet" },
  { type: "Pro Trader", icon: "📈", desc: "Trading volume > $100k", issuer: "SafeDigitalWallet" },
  { type: "Early Adopter", icon: "⭐", desc: "Joined in the first year", issuer: "SafeDigitalWallet" },
  { type: "Multi-Sig Guardian", icon: "🛡", desc: "Active multi-sig signer", issuer: "SafeDigitalWallet" },
  { type: "DeFi Expert", icon: "🌊", desc: "Used 5+ DeFi protocols", issuer: "SafeDigitalWallet" },
];

function generateDID(method) {
  const rand = Math.random().toString(36).substring(2, 18);
  return `${method}:${rand}`;
}

export default function DIDManagement() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ method: "did:ethr", display_name: "", bio: "", wallet_address: "" });

  const { data: dids = [] } = useQuery({ queryKey: ["dids"], queryFn: () => base44.entities.DecentralizedIdentity.list("-created_date") });

  const primaryDID = dids.find(d => d.status === "active");

  const create = useMutation({
    mutationFn: () => base44.entities.DecentralizedIdentity.create({
      ...form, did: generateDID(form.method), status: "active", verified: false,
      public_key: `0x${Math.random().toString(16).substring(2, 66)}`,
      credentials: [],
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dids"] }); setShowCreate(false); toast.success("DID created successfully"); },
  });

  const addCredential = useMutation({
    mutationFn: ({ id, credential }) => {
      const did = dids.find(d => d.id === id);
      const updated = [...(did?.credentials || []), credential];
      return base44.entities.DecentralizedIdentity.update(id, { credentials: updated });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dids"] }); toast.success("Credential added"); },
  });

  const revoke = useMutation({
    mutationFn: (id) => base44.entities.DecentralizedIdentity.update(id, { status: "revoked" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dids"] }); toast.success("DID revoked"); },
  });

  const copyDID = (did) => { navigator.clipboard.writeText(did); toast.success("DID copied"); };

  const handleAddCredential = (c) => {
    if (!primaryDID) return;
    addCredential.mutate({
      id: primaryDID.id,
      credential: { type: c.type, icon: c.icon, issuer: c.issuer, issued_at: new Date().toISOString() },
    });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Fingerprint className="h-6 w-6 text-primary" /> Decentralised Identity</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Self-sovereign identity and verifiable credentials</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Create DID</Button>
      </div>

      {/* Primary DID card */}
      {primaryDID ? (
        <div className="p-5 rounded-2xl border border-primary/30 bg-primary/5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center text-2xl">
              {DID_METHODS.find(m => m.value === primaryDID.method)?.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-base font-bold">{primaryDID.display_name}</p>
                {primaryDID.verified && <CheckCircle2 className="h-4 w-4 text-green-400" />}
              </div>
              <button onClick={() => copyDID(primaryDID.did)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <span className="font-mono truncate max-w-[180px]">{primaryDID.did}</span>
                <Copy className="h-3 w-3 shrink-0" />
              </button>
            </div>
          </div>
          {primaryDID.bio && <p className="text-sm text-muted-foreground">{primaryDID.bio}</p>}
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">{primaryDID.method}</span>
            <span className="text-muted-foreground">Created {moment(primaryDID.created_date).fromNow()}</span>
          </div>
          {primaryDID.credentials?.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Verifiable Credentials ({primaryDID.credentials.length})</p>
              <div className="flex flex-wrap gap-2">
                {primaryDID.credentials.map((c, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs bg-secondary px-2.5 py-1 rounded-full">
                    <span>{c.icon}</span>{c.type}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={() => revoke.mutate(primaryDID.id)}>Revoke DID</Button>
        </div>
      ) : (
        <div className="text-center py-10 border-2 border-dashed border-border rounded-2xl">
          <Fingerprint className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground mb-3">No decentralised identity yet</p>
          <Button onClick={() => setShowCreate(true)}>Create Your DID</Button>
        </div>
      )}

      <Tabs defaultValue="credentials">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="credentials" className="flex-1">Earn Credentials</TabsTrigger>
          <TabsTrigger value="all" className="flex-1">All DIDs ({dids.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="credentials" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">Collect verifiable credentials to build your on-chain reputation</p>
          {CREDENTIAL_TYPES.map(c => {
            const hasIt = primaryDID?.credentials?.some(x => x.type === c.type);
            return (
              <div key={c.type} className={`p-3 rounded-xl border bg-card flex items-center gap-3 ${hasIt ? "border-green-500/20" : "border-border"}`}>
                <span className="text-2xl">{c.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{c.type}</p>
                  <p className="text-xs text-muted-foreground">{c.desc} · by {c.issuer}</p>
                </div>
                {hasIt
                  ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                  : <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!primaryDID} onClick={() => handleAddCredential(c)}>Claim</Button>
                }
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="all" className="mt-3 space-y-2">
          {dids.map(d => (
            <div key={d.id} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
              <span className="text-xl">{DID_METHODS.find(m => m.value === d.method)?.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{d.display_name}</p>
                <p className="text-xs font-mono text-muted-foreground truncate">{d.did}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${d.status === "active" ? "bg-green-500/10 text-green-400" : "bg-secondary text-muted-foreground"}`}>{d.status}</span>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Decentralised Identity</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Display Name</Label><Input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Your on-chain name" className="mt-1.5" /></div>
            <div><Label>DID Method</Label>
              <div className="mt-1.5 space-y-1.5">
                {DID_METHODS.map(m => (
                  <button key={m.value} onClick={() => setForm(f => ({ ...f, method: m.value }))}
                    className={`w-full p-2.5 rounded-xl border text-left transition-colors flex items-center gap-2.5 ${form.method === m.value ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                    <span className="text-lg">{m.icon}</span>
                    <div><p className="text-xs font-semibold">{m.label}</p><p className="text-[10px] text-muted-foreground">{m.desc} · {m.chain}</p></div>
                  </button>
                ))}
              </div>
            </div>
            <div><Label>Bio (optional)</Label><Input value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Describe yourself..." className="mt-1.5" /></div>
            <div><Label>Linked Wallet Address</Label><Input value={form.wallet_address} onChange={e => setForm(f => ({ ...f, wallet_address: e.target.value }))} placeholder="0x..." className="mt-1.5 font-mono text-xs" /></div>
            <Button className="w-full" onClick={() => create.mutate()} disabled={!form.display_name || create.isPending}>Create Identity</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}