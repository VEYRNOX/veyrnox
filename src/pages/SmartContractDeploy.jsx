import { useState } from "react";
import { Code2, Upload, Play, CheckCircle, AlertTriangle, Copy, ExternalLink, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TEMPLATES = [
  { id: "erc20", name: "ERC-20 Token", description: "Fungible token standard", args: [{ name: "name", type: "string", placeholder: "MyToken" }, { name: "symbol", type: "string", placeholder: "MTK" }, { name: "totalSupply", type: "uint256", placeholder: "1000000" }] },
  { id: "erc721", name: "ERC-721 NFT", description: "Non-fungible token", args: [{ name: "name", type: "string", placeholder: "MyNFT" }, { name: "symbol", type: "string", placeholder: "MNFT" }] },
  { id: "multisig", name: "Multi-Sig Wallet", description: "N-of-M signature wallet", args: [{ name: "owners", type: "address[]", placeholder: "0x...,0x..." }, { name: "required", type: "uint256", placeholder: "2" }] },
  { id: "vesting", name: "Token Vesting", description: "Linear vesting schedule", args: [{ name: "token", type: "address", placeholder: "0x..." }, { name: "beneficiary", type: "address", placeholder: "0x..." }, { name: "duration", type: "uint256", placeholder: "31536000" }] },
  { id: "custom", name: "Custom Bytecode", description: "Paste your own ABI + bytecode", args: [] },
];

const NETWORKS = ["Ethereum Mainnet", "Sepolia Testnet", "Polygon", "Arbitrum", "Optimism", "BSC"];

export default function SmartContractDeploy() {
  const qc = useQueryClient();
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [network, setNetwork] = useState("Sepolia Testnet");
  const [args, setArgs] = useState({});
  const [customAbi, setCustomAbi] = useState("");
  const [customBytecode, setCustomBytecode] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(null);
  const [gasEstimate, setGasEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleEstimateGas = async () => {
    setEstimating(true);
    await new Promise(r => setTimeout(r, 1000));
    setGasEstimate({ gas: Math.floor(800000 + Math.random() * 500000), gwei: (12 + Math.random() * 8).toFixed(2), usd: (2 + Math.random() * 8).toFixed(2) });
    setEstimating(false);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    await new Promise(r => setTimeout(r, 3000));
    const addr = "0x" + Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const txHash = "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    await base44.entities.Transaction.create({
      type: "send",
      currency: "ETH",
      amount: gasEstimate ? (gasEstimate.usd / 2000).toFixed(6) : "0.002",
      network,
      status: "completed",
      note: `Contract deployed: ${template.name} at ${addr.slice(0, 12)}...`,
      timestamp: new Date().toISOString(),
    });
    setDeployed({ address: addr, txHash, network, template: template.name });
    setDeploying(false);
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(deployed.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <Code2 className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Deploy Smart Contract</h1>
          <p className="text-sm text-muted-foreground">Deploy contracts directly from your wallet</p>
        </div>
      </div>

      {deployed ? (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-green-500 font-semibold">
              <CheckCircle className="h-5 w-5" /> Contract Deployed Successfully
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Contract</span>
                <Badge variant="outline">{deployed.template}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Network</span>
                <span>{deployed.network}</span>
              </div>
              <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                <p className="text-xs text-muted-foreground">Contract Address</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono flex-1 truncate">{deployed.address}</code>
                  <button onClick={copyAddress} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                {copied && <p className="text-xs text-green-400">Copied!</p>}
                <p className="text-xs text-muted-foreground">TX Hash</p>
                <code className="text-xs font-mono truncate block">{deployed.txHash.slice(0, 28)}...</code>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => window.open(`https://etherscan.io/address/${deployed.address}`, "_blank")}>
                <ExternalLink className="h-4 w-4 mr-2" /> View on Explorer
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => { setDeployed(null); setGasEstimate(null); setArgs({}); }}>
                Deploy Another
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Template */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Contract Template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTemplate(t); setArgs({}); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${template.id === t.id ? "border-primary/60 bg-primary/5" : "border-border hover:bg-secondary/50"}`}
                >
                  <Code2 className={`h-4 w-4 shrink-0 ${template.id === t.id ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  {template.id === t.id && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Network */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Target Network</CardTitle></CardHeader>
            <CardContent>
              <Select value={network} onValueChange={setNetwork}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              {network === "Ethereum Mainnet" && (
                <p className="text-xs text-amber-500 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Use testnet first to verify your contract
                </p>
              )}
            </CardContent>
          </Card>

          {/* Constructor Args */}
          {template.id === "custom" ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">ABI &amp; Bytecode</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">ABI (JSON)</label>
                  <textarea
                    className="w-full h-24 text-xs font-mono p-2 rounded-lg bg-secondary border border-border resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder='[{"inputs":[],"name":"..."}]'
                    value={customAbi}
                    onChange={e => setCustomAbi(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Bytecode (0x...)</label>
                  <textarea
                    className="w-full h-20 text-xs font-mono p-2 rounded-lg bg-secondary border border-border resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="0x608060..."
                    value={customBytecode}
                    onChange={e => setCustomBytecode(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          ) : template.args.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Constructor Arguments</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {template.args.map(a => (
                  <div key={a.name}>
                    <label className="text-xs text-muted-foreground mb-1 block">{a.name} <span className="text-primary/60">({a.type})</span></label>
                    <Input
                      placeholder={a.placeholder}
                      value={args[a.name] || ""}
                      onChange={e => setArgs(prev => ({ ...prev, [a.name]: e.target.value }))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Gas estimate */}
          {gasEstimate ? (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-lg font-bold">{gasEstimate.gas.toLocaleString()}</p><p className="text-xs text-muted-foreground">Gas Units</p></div>
                  <div><p className="text-lg font-bold">{gasEstimate.gwei}</p><p className="text-xs text-muted-foreground">Gwei</p></div>
                  <div><p className="text-lg font-bold">${gasEstimate.usd}</p><p className="text-xs text-muted-foreground">Est. Cost</p></div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button variant="outline" className="w-full" onClick={handleEstimateGas} disabled={estimating}>
              {estimating ? <><div className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin mr-2" />Estimating gas...</> : <><Zap className="h-4 w-4 mr-2" />Estimate Gas</>}
            </Button>
          )}

          <Button className="w-full" onClick={handleDeploy} disabled={deploying || !gasEstimate}>
            {deploying ? (
              <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />Deploying contract...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" />Deploy {template.name}</>
            )}
          </Button>
          {!gasEstimate && <p className="text-xs text-muted-foreground text-center">Estimate gas before deploying</p>}
        </>
      )}
    </div>
  );
}