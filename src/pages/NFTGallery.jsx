import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Image, Play, ExternalLink, Heart, Share2, Grid3X3, List, Music, Film } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const DEMO_NFTS = [
  { id: "n1", name: "Bored Ape #8817", collection: "BAYC", chain: "Ethereum", token_id: "8817", media_type: "image", thumbnail: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=400&q=80", floor_price: 12.4, floor_currency: "ETH", rarity_rank: 142, traits: [{ trait_type: "Background", value: "Orange" }, { trait_type: "Fur", value: "Gold" }, { trait_type: "Eyes", value: "Laser Eyes" }] },
  { id: "n2", name: "CryptoPunk #3100", collection: "CryptoPunks", chain: "Ethereum", token_id: "3100", media_type: "image", thumbnail: "https://images.unsplash.com/photo-1639762681057-408e52192e55?w=400&q=80", floor_price: 48.2, floor_currency: "ETH", rarity_rank: 7, traits: [{ trait_type: "Type", value: "Alien" }, { trait_type: "Accessories", value: "Headband" }] },
  { id: "n3", name: "Azuki #9605", collection: "Azuki", chain: "Ethereum", token_id: "9605", media_type: "image", thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80", floor_price: 8.1, floor_currency: "ETH", rarity_rank: 856, traits: [{ trait_type: "Type", value: "Spirit" }, { trait_type: "Hair", value: "Pink" }] },
  { id: "n4", name: "DeGod #4224", collection: "DeGods", chain: "Solana", token_id: "4224", media_type: "image", thumbnail: "https://images.unsplash.com/photo-1609205807107-2b8e96f5c4f5?w=400&q=80", floor_price: 320, floor_currency: "SOL", rarity_rank: 331, traits: [{ trait_type: "Background", value: "Gold" }, { trait_type: "Body", value: "Divine" }] },
  { id: "n5", name: "Mad Lads #1892", collection: "Mad Lads", chain: "Solana", token_id: "1892", media_type: "image", thumbnail: "https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=400&q=80", floor_price: 55, floor_currency: "SOL", rarity_rank: 1204 },
  { id: "n6", name: "Chromie Squiggle #3028", collection: "Art Blocks", chain: "Ethereum", token_id: "3028", media_type: "generative", thumbnail: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80", floor_price: 1.8, floor_currency: "ETH", rarity_rank: 288 },
];

const CHAIN_COLORS = { Ethereum: "#627EEA", Solana: "#14B8A6", Polygon: "#8247E5", Bitcoin: "#F97316" };

const MEDIA_ICONS = { image: Image, video: Film, audio: Music, generative: Grid3X3 };

export default function NFTGallery() {
  const [view, setView] = useState("grid");
  const [selected, setSelected] = useState(null);
  const [liked, setLiked] = useState(new Set());
  const [chainFilter, setChainFilter] = useState("all");

  const { data: dbNFTs = [] } = useQuery({ queryKey: ["nfts-gallery"], queryFn: () => base44.entities.NFTAsset.list() });
  const nfts = dbNFTs.length > 0 ? dbNFTs : DEMO_NFTS;
  const chains = ["all", ...new Set(nfts.map(n => n.chain))];
  const displayed = chainFilter === "all" ? nfts : nfts.filter(n => n.chain === chainFilter);

  const totalValue = DEMO_NFTS.reduce((s, n) => s + (n.floor_price || 0) * (n.floor_currency === "ETH" ? 3200 : 167), 0);
  const toggleLike = (id) => setLiked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const MediaBadge = ({ type }) => {
    if (!type || type === "image") return null;
    const Icon = MEDIA_ICONS[type] || Image;
    return <div className="absolute top-2 right-2 p-1 rounded-full bg-black/60"><Icon className="h-3 w-3 text-white" /></div>;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">NFT Gallery</h1>
          <p className="text-sm text-muted-foreground">{nfts.length} NFTs · Est. ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView("grid")} className={`p-2 rounded-lg ${view === "grid" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"}`}><Grid3X3 className="h-4 w-4" /></button>
          <button onClick={() => setView("list")} className={`p-2 rounded-lg ${view === "list" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"}`}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Chain filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chains.map(c => (
          <button key={c} onClick={() => setChainFilter(c)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold capitalize shrink-0 transition-colors ${chainFilter === c ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"}`}>
            {c === "all" ? "All Chains" : c}
          </button>
        ))}
      </div>

      {/* Grid view */}
      {view === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {displayed.map(nft => (
            <div key={nft.id} className="group rounded-2xl border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-all" onClick={() => setSelected(nft)}>
              <div className="relative aspect-square overflow-hidden bg-secondary">
                <img src={nft.thumbnail} alt={nft.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <MediaBadge type={nft.media_type} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </div>
              <div className="p-3">
                <p className="text-xs font-semibold truncate">{nft.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{nft.collection}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHAIN_COLORS[nft.chain] || "#888" }} />
                    <span className="text-[9px] text-muted-foreground">{nft.chain}</span>
                  </div>
                  <span className="text-xs font-bold">{nft.floor_price} {nft.floor_currency}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="space-y-2">
          {displayed.map(nft => (
            <div key={nft.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelected(nft)}>
              <div className="h-14 w-14 rounded-xl overflow-hidden bg-secondary shrink-0">
                <img src={nft.thumbnail} alt={nft.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{nft.name}</p>
                <p className="text-xs text-muted-foreground">{nft.collection}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHAIN_COLORS[nft.chain] || "#888" }} /><span className="text-[10px] text-muted-foreground">{nft.chain}</span></div>
                  {nft.rarity_rank && <span className="text-[10px] text-purple-400">Rank #{nft.rarity_rank}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold">{nft.floor_price} {nft.floor_currency}</p>
                <p className="text-xs text-muted-foreground">Floor</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NFT Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        {selected && (
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <div className="aspect-square relative bg-secondary">
              <img src={selected.thumbnail} alt={selected.name} className="w-full h-full object-cover" />
              {selected.media_type === "video" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-16 w-16 rounded-full bg-black/60 flex items-center justify-center">
                    <Play className="h-7 w-7 text-white ml-1" />
                  </div>
                </div>
              )}
              <div className="absolute top-3 right-3 flex gap-2">
                <button onClick={() => toggleLike(selected.id)} className={`p-2 rounded-full bg-black/60 transition-colors ${liked.has(selected.id) ? "text-red-400" : "text-white"}`}><Heart className={`h-4 w-4 ${liked.has(selected.id) ? "fill-current" : ""}`} /></button>
                <a href={`https://opensea.io/assets/ethereum/${selected.token_id}`} target="_blank" rel="noreferrer" className="p-2 rounded-full bg-black/60 text-white"><ExternalLink className="h-4 w-4" /></a>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-lg">{selected.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm text-muted-foreground">{selected.collection}</p>
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHAIN_COLORS[selected.chain] || "#888" }} />
                    <span className="text-xs text-muted-foreground">{selected.chain}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">{selected.floor_price} {selected.floor_currency}</p>
                  <p className="text-xs text-muted-foreground">Floor price</p>
                </div>
              </div>
              {selected.rarity_rank && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Rarity rank:</span>
                  <span className="font-bold text-purple-400">#{selected.rarity_rank}</span>
                </div>
              )}
              {selected.traits && selected.traits.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">TRAITS</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {selected.traits.map(t => (
                      <div key={t.trait_type} className="p-2 rounded-xl bg-primary/5 border border-primary/20 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">{t.trait_type}</p>
                        <p className="text-xs font-semibold">{t.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1 text-xs h-9"><Share2 className="h-3.5 w-3.5" /> Share</Button>
                <Button className="flex-1 text-xs h-9">List for Sale</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}