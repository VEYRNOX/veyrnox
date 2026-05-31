import { useState } from "react";
import { Globe, Search, Star, ExternalLink, Shield, TrendingUp, Gamepad2, Image, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DAPPS = [
  { name: "Uniswap", description: "Leading DEX on Ethereum", url: "https://app.uniswap.org", category: "DeFi", icon: "🦄", verified: true },
  { name: "Aave", description: "Decentralised lending protocol", url: "https://app.aave.com", category: "DeFi", icon: "🔷", verified: true },
  { name: "OpenSea", description: "Largest NFT marketplace", url: "https://opensea.io", category: "NFT", icon: "🌊", verified: true },
  { name: "Curve", description: "Stablecoin DEX and yield", url: "https://curve.fi", category: "DeFi", icon: "🌀", verified: true },
  { name: "1inch", description: "DEX aggregator for best rates", url: "https://1inch.io", category: "DeFi", icon: "⚡", verified: true },
  { name: "Magic Eden", description: "Multi-chain NFT marketplace", url: "https://magiceden.io", category: "NFT", icon: "✨", verified: true },
  { name: "Axie Infinity", description: "Play-to-earn NFT game", url: "https://axieinfinity.com", category: "Gaming", icon: "🎮", verified: false },
  { name: "Blur", description: "NFT trading for professionals", url: "https://blur.io", category: "NFT", icon: "💨", verified: true },
  { name: "GMX", description: "Decentralised perpetual exchange", url: "https://gmx.io", category: "DeFi", icon: "🎯", verified: true },
  { name: "Lens Protocol", description: "Decentralised social graph", url: "https://hey.xyz", category: "Social", icon: "🌿", verified: true },
  { name: "Compound", description: "Algorithmic money markets", url: "https://compound.finance", category: "DeFi", icon: "🟢", verified: true },
  { name: "The Sandbox", description: "Virtual world and gaming", url: "https://sandbox.game", category: "Gaming", icon: "🏖️", verified: false },
];

const CATEGORIES = [
  { id: "all", label: "All", icon: Globe },
  { id: "DeFi", label: "DeFi", icon: TrendingUp },
  { id: "NFT", label: "NFT", icon: Image },
  { id: "Gaming", label: "Gaming", icon: Gamepad2 },
  { id: "Social", label: "Social", icon: Star },
];

export default function Web3Browser() {
  const [url, setUrl] = useState("");
  const [browsing, setBrowsing] = useState(null);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState(["Uniswap", "Aave", "OpenSea"]);

  const filtered = DAPPS
    .filter(d => category === "all" || d.category === category)
    .filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.description.toLowerCase().includes(search.toLowerCase()));

  const toggleFav = (name) => setFavorites(f => f.includes(name) ? f.filter(x => x !== name) : [...f, name]);

  const openApp = (dapp) => { setBrowsing(dapp); setUrl(dapp.url); };

  const handleUrlNavigate = () => {
    let nav = url;
    if (!nav.startsWith("http")) nav = "https://" + nav;
    setBrowsing({ name: nav, url: nav, icon: "🌐", verified: false, description: nav });
  };

  if (browsing) return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Browser bar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setBrowsing(null)}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-xs">
          <Shield className="h-3 w-3 text-green-400 shrink-0" />
          <span className="truncate text-muted-foreground">{browsing.url}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setBrowsing(null)}><X className="h-4 w-4" /></Button>
      </div>
      {/* dApp info banner */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-secondary/50 border-b border-border">
        <span className="text-2xl">{browsing.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold">{browsing.name}</p>
            {browsing.verified && <Shield className="h-3.5 w-3.5 text-green-400" />}
          </div>
          <p className="text-xs text-muted-foreground">{browsing.description}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => window.open(browsing.url, "_blank")}>
          <ExternalLink className="h-3 w-3" /> Open
        </Button>
      </div>
      {/* Preview area */}
      <div className="flex-1 flex items-center justify-center bg-secondary/30 rounded-b-xl">
        <div className="text-center space-y-4 p-8">
          <span className="text-6xl">{browsing.icon}</span>
          <div>
            <p className="text-lg font-semibold">{browsing.name}</p>
            <p className="text-sm text-muted-foreground mb-4">{browsing.description}</p>
            <p className="text-xs text-muted-foreground max-w-xs">For security, dApps open in your default browser where your Web3 wallet extension can securely connect.</p>
          </div>
          <Button className="gap-2" onClick={() => window.open(browsing.url, "_blank")}>
            <ExternalLink className="h-4 w-4" /> Launch {browsing.name}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Globe className="h-6 w-6 text-primary" /> Web3 Browser</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Discover and launch verified dApps</p>
      </div>

      {/* URL bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleUrlNavigate()} placeholder="Search dApps or enter URL..." className="pl-9" />
        </div>
        <Button onClick={handleUrlNavigate} disabled={!url}>Go</Button>
      </div>

      {/* Favorites */}
      {favorites.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Favourites</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {DAPPS.filter(d => favorites.includes(d.name)).map(d => (
              <button key={d.name} onClick={() => openApp(d)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors shrink-0">
                <span>{d.icon}</span>
                <span className="text-xs font-medium">{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${category === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            <c.icon className="h-3 w-3" /> {c.label}
          </button>
        ))}
      </div>

      {/* dApp grid */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter dApps..." className="pl-9" />
        </div>
        <div className="grid gap-2">
          {filtered.map(d => (
            <div key={d.name} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3 hover:border-primary/30 transition-colors">
              <span className="text-2xl">{d.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold">{d.name}</p>
                  {d.verified && <Shield className="h-3 w-3 text-green-400" />}
                  <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full text-muted-foreground">{d.category}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{d.description}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleFav(d.name)}>
                  <Star className={`h-3.5 w-3.5 ${favorites.includes(d.name) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openApp(d)}>Launch</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}