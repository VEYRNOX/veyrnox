import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Globe, Plus, Trash2, ShieldOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const COMMON_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CN", name: "China" },
  { code: "RU", name: "Russia" },
  { code: "KP", name: "North Korea" },
  { code: "IR", name: "Iran" },
  { code: "SY", name: "Syria" },
  { code: "CU", name: "Cuba" },
];

export default function GeoBlocking() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [countryName, setCountryName] = useState("");
  const [reason, setReason] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectedCountry, setDetectedCountry] = useState(null);

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ["geo-blocks"],
    queryFn: () => base44.entities.GeoBlock.list(),
  });

  const addBlock = useMutation({
    mutationFn: () => base44.entities.GeoBlock.create({ country_code: countryCode.toUpperCase(), country_name: countryName, reason, enabled: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo-blocks"] });
      setShowAdd(false);
      setCountryCode(""); setCountryName(""); setReason("");
      toast.success("Country blocked");
    },
  });

  const toggleBlock = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.GeoBlock.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["geo-blocks"] }),
  });

  const deleteBlock = useMutation({
    mutationFn: (id) => base44.entities.GeoBlock.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo-blocks"] });
      toast.success("Block removed");
    },
  });

  const detectLocation = async () => {
    setDetecting(true);
    try {
      const res = await fetch("https://ipapi.co/json/");
      const data = await res.json();
      setDetectedCountry({ code: data.country_code, name: data.country_name });
    } catch {
      toast.error("Could not detect location");
    } finally {
      setDetecting(false);
    }
  };

  const quickAdd = (c) => {
    setCountryCode(c.code);
    setCountryName(c.name);
    setShowAdd(true);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Geo-Blocking</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Restrict account access by country</p>
      </div>

      {/* Current Location */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm font-medium">Your Current Location</p>
        {detectedCountry ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">{detectedCountry.name} <span className="text-muted-foreground font-mono text-xs">({detectedCountry.code})</span></p>
              {blocks.find(b => b.country_code === detectedCountry.code && b.enabled) ? (
                <p className="text-xs text-destructive mt-0.5 flex items-center gap-1"><ShieldOff className="h-3 w-3" /> This country is currently blocked</p>
              ) : (
                <p className="text-xs text-green-500 mt-0.5">Access allowed</p>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => quickAdd(detectedCountry)}>Block this country</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={detectLocation} disabled={detecting}>
            {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Globe className="h-3.5 w-3.5 mr-1" />}
            Detect My Location
          </Button>
        )}
      </div>

      {/* Quick Add */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Quick Block</p>
        <div className="flex flex-wrap gap-2">
          {COMMON_COUNTRIES.map(c => (
            <button
              key={c.code}
              onClick={() => quickAdd(c)}
              className="text-xs px-2.5 py-1 rounded-full border border-border bg-secondary hover:border-primary/40 transition-colors"
            >
              {c.code} · {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Blocked Countries */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Blocked Countries ({blocks.filter(b => b.enabled).length} active)</h2>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : blocks.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No countries blocked</p>
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map(b => (
            <div key={b.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{b.country_name} <span className="text-muted-foreground font-mono text-xs">({b.country_code})</span></p>
                {b.reason && <p className="text-xs text-muted-foreground truncate">{b.reason}</p>}
              </div>
              <Switch checked={b.enabled} onCheckedChange={v => toggleBlock.mutate({ id: b.id, enabled: v })} />
              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => deleteBlock.mutate(b.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Block Country</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Country Code (ISO 2)</Label>
              <Input value={countryCode} onChange={e => setCountryCode(e.target.value.toUpperCase())} placeholder="e.g. US" maxLength={2} className="mt-1.5 font-mono" />
            </div>
            <div>
              <Label>Country Name</Label>
              <Input value={countryName} onChange={e => setCountryName(e.target.value)} placeholder="e.g. United States" className="mt-1.5" />
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Regulatory compliance..." className="mt-1.5" />
            </div>
            <Button className="w-full" onClick={() => addBlock.mutate()} disabled={!countryCode || !countryName || addBlock.isPending}>
              Add Block
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}