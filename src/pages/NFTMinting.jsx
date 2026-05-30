import { useState, useRef } from "react";
import { Palette, Upload, Image, CheckCircle, Plus, Trash2, ExternalLink, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const NETWORKS = ["Ethereum", "Polygon", "Arbitrum", "Optimism", "Base"];

export default function NFTMinting() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [network, setNetwork] = useState("Polygon");
  const [supply, setSupply] = useState("1");
  const [royalty, setRoyalty] = useState("5");
  const [price, setPrice] = useState("");
  const [attributes, setAttributes] = useState([{ trait: "", value: "" }]);
  const [image, setImage] = useState(null);
  const [minting, setMinting] = useState(false);
  const [minted, setMinted] = useState(null);
  const [mode, setMode] = useState("single"); // single | collection | drop

  const { data: nfts = [] } = useQuery({
    queryKey: ["nft-assets"],
    queryFn: () => base44.entities.NFTAsset.list("-created_date", 20),
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setImage(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const addAttribute = () => setAttributes(p => [...p, { trait: "", value: "" }]);
  const removeAttribute = (i) => setAttributes(p => p.filter((_, idx) => idx !== i));
  const updateAttr = (i, field, val) => setAttributes(p => p.map((a, idx) => idx === i ? { ...a, [field]: val } : a));

  const handleMint = async () => {
    if (!name.trim()) return;
    setMinting(true);
    await new Promise(r => setTimeout(r, 3000));
    const tokenId = Math.floor(Math.random() * 10000);
    const contractAddr = "0x" + Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const txHash = "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    await base44.entities.NFTAsset.create({
      name,
      description,
      token_id: String(tokenId),
      contract_address: contractAddr,
      network,
      image_url: image || `https://source.unsplash.com/400x400/?abstract,${tokenId}`,
    });
    setMinted({ name, tokenId, contractAddr, txHash, network });
    setMinting(false);
    qc.invalidateQueries({ queryKey: ["nft-assets"] });
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
          <Palette className="h-5 w-5 text-pink-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">NFT Minting Studio</h1>
          <p className="text-sm text-muted-foreground">Mint, drop, and manage NFT collections</p>
        </div>
      </div>

      {minted ? (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-green-500 font-bold">
              <CheckCircle className="h-5 w-5" /> NFT Minted Successfully!
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-xs text-muted-foreground">Name</p><p className="font-semibold">{minted.name}</p></div>
              <div><p className="text-xs text-muted-foreground">Token ID</p><p className="font-semibold">#{minted.tokenId}</p></div>
              <div><p className="text-xs text-muted-foreground">Network</p><p className="font-semibold">{minted.network}</p></div>
              <div><p className="text-xs text-muted-foreground">Standard</p><p className="font-semibold">ERC-721</p></div>
            </div>
            <div className="p-2 bg-secondary rounded-lg">
              <p className="text-xs text-muted-foreground mb-0.5">Contract</p>
              <code className="text-xs font-mono">{minted.contractAddr.slice(0, 20)}...</code>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setMinted(null); setName(""); setDescription(""); setImage(null); }}>Mint Another</Button>
              <Button className="flex-1"><ExternalLink className="h-4 w-4 mr-2" />View on OpenSea</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-secondary rounded-lg">
            {["single", "collection", "drop"].map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md text-sm font-semibold capitalize transition-colors ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                {m === "single" ? "Single NFT" : m === "collection" ? "Collection" : "Drop Campaign"}
              </button>
            ))}
          </div>

          {/* Upload */}
          <Card>
            <CardContent className="pt-4">
              <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,application/json" className="hidden" onChange={handleFileChange} />
              {image ? (
                <div className="relative">
                  <img src={image} alt="NFT preview" className="w-full h-48 object-cover rounded-xl" />
                  <button onClick={() => setImage(null)} className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  className="w-full h-36 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                  <Upload className="h-8 w-8" />
                  <p className="text-sm">Upload image, video, audio, or 3D model</p>
                  <p className="text-xs">Max 100MB · JPG, PNG, GIF, MP4, MP3, GLB</p>
                </button>
              )}
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">NFT Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
                <Input placeholder="My Awesome NFT" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                <textarea
                  className="w-full h-20 text-sm p-2 rounded-lg bg-secondary border border-border resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Describe your NFT..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Supply</label>
                  <Input type="number" value={supply} onChange={e => setSupply(e.target.value)} min="1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Royalty %</label>
                  <Input type="number" value={royalty} onChange={e => setRoyalty(e.target.value)} min="0" max="15" />
                </div>
              </div>
              {mode !== "single" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Mint Price (ETH)</label>
                  <Input type="number" placeholder="0.05" value={price} onChange={e => setPrice(e.target.value)} />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Network</label>
                <Select value={network} onValueChange={setNetwork}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Attributes */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Properties</CardTitle>
                <Button size="sm" variant="ghost" onClick={addAttribute}><Plus className="h-4 w-4 mr-1" />Add</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {attributes.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Trait type" value={a.trait} onChange={e => updateAttr(i, "trait", e.target.value)} className="flex-1" />
                  <Input placeholder="Value" value={a.value} onChange={e => updateAttr(i, "value", e.target.value)} className="flex-1" />
                  <button onClick={() => removeAttribute(i)} className="p-2 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button className="w-full" onClick={handleMint} disabled={minting || !name.trim()}>
            {minting ? <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />Minting on {network}...</> : <><Palette className="h-4 w-4 mr-2" />{mode === "single" ? "Mint NFT" : mode === "collection" ? "Deploy Collection" : "Launch Drop"}</>}
          </Button>
        </>
      )}
    </div>
  );
}