import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Vote, Plus, CheckCircle2, XCircle, Clock, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const PROTOCOLS = ["Uniswap","Aave","Compound","MakerDAO","Curve","Lido","Synthetix","ENS"];
const STATUS_CONFIG = {
  active: { icon: Clock, color: "text-yellow-400", bg: "border-yellow-500/20 bg-yellow-500/5" },
  passed: { icon: CheckCircle2, color: "text-green-400", bg: "border-green-500/20 bg-green-500/5" },
  rejected: { icon: XCircle, color: "text-destructive", bg: "border-destructive/20 bg-destructive/5" },
  pending: { icon: Clock, color: "text-muted-foreground", bg: "border-border bg-card" },
};

const DEMO_PROPOSALS = [
  { protocol: "Uniswap", title: "Deploy Uniswap v4 on Base", description: "Proposal to deploy the latest Uniswap v4 contracts on the Base network to capture L2 volume.", status: "active", votes_for: 42_000_000, votes_against: 8_500_000, ends_at: "2026-06-02", token_symbol: "UNI", voting_power: 250 },
  { protocol: "Aave", title: "Add USDC.e as Collateral", description: "Enable USDC.e (bridged USDC) as a collateral asset across Aave V3 markets.", status: "active", votes_for: 18_200_000, votes_against: 3_100_000, ends_at: "2026-05-30", token_symbol: "AAVE", voting_power: 15 },
  { protocol: "MakerDAO", title: "Increase DAI Savings Rate to 8%", description: "Raise the DSR from 5% to 8% to attract more DAI deposits and improve stability.", status: "passed", votes_for: 65_000_000, votes_against: 2_000_000, ends_at: "2026-05-20", token_symbol: "MKR", voting_power: 0 },
  { protocol: "ENS", title: "Reduce .eth Registration Fee", description: "Lower the annual cost of short ENS names to improve accessibility.", status: "rejected", votes_for: 5_000_000, votes_against: 14_000_000, ends_at: "2026-05-15", token_symbol: "ENS", voting_power: 50 },
];

function VoteBar({ forVotes, against }) {
  const total = forVotes + against;
  const pct = total > 0 ? (forVotes / total) * 100 : 50;
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span className="text-green-400">For: {(forVotes / 1_000_000).toFixed(1)}M</span>
        <span className="text-destructive">Against: {(against / 1_000_000).toFixed(1)}M</span>
      </div>
    </div>
  );
}

export default function DAOGovernance() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [votes, setVotes] = useState({});
  const [form, setForm] = useState({ protocol: "Uniswap", title: "", description: "", token_symbol: "", voting_power: "", ends_at: "" });

  const { data: myProposals = [] } = useQuery({ queryKey: ["dao-proposals"], queryFn: () => base44.entities.DAOProposal.list("-created_date") });

  const allProposals = [...DEMO_PROPOSALS, ...myProposals];

  const create = useMutation({
    mutationFn: () => base44.entities.DAOProposal.create({ ...form, status: "pending", votes_for: 0, votes_against: 0, voting_power: Number(form.voting_power) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dao-proposals"] }); setShowCreate(false); toast.success("Proposal created"); },
  });

  const castVote = (proposalTitle, direction) => {
    setVotes(v => ({ ...v, [proposalTitle]: direction }));
    toast.success(`Voted ${direction} on "${proposalTitle.substring(0, 30)}..."`);
  };

  const active = allProposals.filter(p => p.status === "active");
  const past = allProposals.filter(p => p.status !== "active");

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Vote className="h-6 w-6 text-primary" /> DAO Governance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vote on proposals across your DeFi protocols</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Proposal</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Active Proposals", value: active.length }, { label: "Voted", value: Object.keys(votes).length }, { label: "Protocols", value: new Set(allProposals.map(p=>p.protocol)).size }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <p className="text-xl font-bold text-primary">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="active">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="active" className="flex-1">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="past" className="flex-1">Closed ({past.length})</TabsTrigger>
        </TabsList>

        {[{ key: "active", proposals: active }, { key: "past", proposals: past }].map(tab => (
          <TabsContent key={tab.key} value={tab.key} className="mt-3 space-y-3">
            {tab.proposals.length === 0 ? <p className="text-center text-muted-foreground text-sm py-8">No proposals here</p>
              : tab.proposals.map((p, i) => {
                const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
                const voted = votes[p.title];
                return (
                  <div key={i} className={`p-4 rounded-xl border ${cfg.bg} space-y-3`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">{p.protocol} · {p.token_symbol}</p>
                        <p className="text-sm font-semibold mt-0.5">{p.title}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <cfg.icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                        <span className={`text-[10px] capitalize ${cfg.color}`}>{p.status}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                    {p.votes_for !== undefined && <VoteBar forVotes={p.votes_for} against={p.votes_against} />}
                    {p.voting_power > 0 && p.status === "active" && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Your voting power: <span className="text-foreground font-medium">{p.voting_power} {p.token_symbol}</span></p>
                        {voted
                          ? <p className="text-xs font-semibold text-primary">✓ Voted {voted}</p>
                          : <div className="flex gap-2">
                              <Button size="sm" className="flex-1 h-7 text-xs bg-green-500 hover:bg-green-600" onClick={() => castVote(p.title, "for")}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Vote For
                              </Button>
                              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => castVote(p.title, "against")}>
                                <XCircle className="h-3 w-3 mr-1" /> Against
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => castVote(p.title, "abstain")}>
                                <Minus className="h-3 w-3" />
                              </Button>
                            </div>}
                      </div>
                    )}
                    {p.ends_at && <p className="text-[10px] text-muted-foreground">{p.status === "active" ? "Ends" : "Ended"} {moment(p.ends_at).fromNow()}</p>}
                  </div>
                );
              })}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Track a Proposal</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Protocol</Label>
              <Select value={form.protocol} onValueChange={v => setForm(f => ({ ...f, protocol: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{PROTOCOLS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Proposal Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Proposal title" className="mt-1.5" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this proposal do?" className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Token Symbol</Label><Input value={form.token_symbol} onChange={e => setForm(f => ({ ...f, token_symbol: e.target.value }))} placeholder="UNI" className="mt-1.5" /></div>
              <div><Label>My Voting Power</Label><Input type="number" value={form.voting_power} onChange={e => setForm(f => ({ ...f, voting_power: e.target.value }))} placeholder="0" className="mt-1.5" /></div>
            </div>
            <div><Label>Ends At</Label><Input type="date" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} className="mt-1.5" /></div>
            <Button className="w-full" onClick={() => create.mutate()} disabled={!form.title || !form.protocol || create.isPending}>Add Proposal</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}