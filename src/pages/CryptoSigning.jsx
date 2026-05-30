import { useState } from "react";
import { ethers } from "ethers";
import { Key, Eye, EyeOff, Copy, Check, RefreshCw, ShieldCheck, FileSignature, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DERIVATION_PATHS = [
  { label: "Ethereum (m/44'/60'/0'/0/0)", path: "m/44'/60'/0'/0/0" },
  { label: "Ethereum #2 (m/44'/60'/0'/0/1)", path: "m/44'/60'/0'/0/1" },
  { label: "Ethereum #3 (m/44'/60'/0'/0/2)", path: "m/44'/60'/0'/0/2" },
  { label: "Ledger Legacy (m/44'/60'/0')", path: "m/44'/60'/0'" },
];

export default function CryptoSigning() {
  const [tab, setTab] = useState("generate");
  const [mnemonic, setMnemonic] = useState("");
  const [importMnemonic, setImportMnemonic] = useState("");
  const [wallet, setWallet] = useState(null);
  const [derivedWallets, setDerivedWallets] = useState([]);
  const [showPhrase, setShowPhrase] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(null);
  const [signMessage, setSignMessage] = useState("Hello from SafeDigitalWallet!");
  const [signature, setSignature] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txValue, setTxValue] = useState("0.001");
  const [signedTx, setSignedTx] = useState("");
  const [verifyAddress, setVerifyAddress] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [expandedPath, setExpandedPath] = useState(null);
  const [error, setError] = useState("");

  const copy = (text, key) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };

  const generateWallet = () => {
    setError("");
    const w = ethers.Wallet.createRandom();
    setMnemonic(w.mnemonic.phrase);
    setWallet(w);
    setShowPhrase(false);
    setSignature("");
    setSignedTx("");
    // Derive 3 accounts from the HD node
    const hdNode = ethers.HDNodeWallet.fromPhrase(w.mnemonic.phrase);
    const derived = DERIVATION_PATHS.map(p => {
      const dw = hdNode.derivePath(p.path.replace("m/", ""));
      return { path: p.path, label: p.label, address: dw.address, privateKey: dw.privateKey };
    });
    setDerivedWallets(derived);
  };

  const importWallet = () => {
    setError("");
    try {
      const phrase = importMnemonic.trim();
      if (!ethers.Mnemonic.isValidMnemonic(phrase)) {
        setError("Invalid BIP-39 mnemonic phrase. Please check your words.");
        return;
      }
      const hdNode = ethers.HDNodeWallet.fromPhrase(phrase);
      const w = hdNode.derivePath("44'/60'/0'/0/0");
      setMnemonic(phrase);
      setWallet(w);
      setShowPhrase(false);
      const derived = DERIVATION_PATHS.map(p => {
        const dw = hdNode.derivePath(p.path.replace("m/", ""));
        return { path: p.path, label: p.label, address: dw.address, privateKey: dw.privateKey };
      });
      setDerivedWallets(derived);
    } catch (e) {
      setError(e.message);
    }
  };

  const signMsg = async () => {
    if (!wallet) return;
    const sig = await wallet.signMessage(signMessage);
    setSignature(sig);
  };

  const buildSignedTx = async () => {
    if (!wallet || !txTo) return;
    setError("");
    try {
      const tx = {
        to: txTo,
        value: ethers.parseEther(txValue || "0"),
        gasLimit: 21000n,
        gasPrice: ethers.parseUnits("20", "gwei"),
        nonce: 0,
        chainId: 1n,
        type: 2,
        maxFeePerGas: ethers.parseUnits("20", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
      };
      const signed = await wallet.signTransaction(tx);
      setSignedTx(signed);
    } catch (e) {
      setError(e.message);
    }
  };

  const verifySignature = () => {
    if (!signature || !signMessage) return;
    try {
      const recovered = ethers.verifyMessage(signMessage, signature);
      setVerifyAddress(recovered);
      setVerifyResult(wallet ? recovered.toLowerCase() === wallet.address.toLowerCase() : null);
    } catch (e) {
      setVerifyResult(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Key className="h-5 w-5 text-primary" /> Real Cryptographic Signing</h1>
        <p className="text-sm text-muted-foreground">BIP-39 mnemonic generation, HD derivation, and EIP-191 message signing via ethers.js v6</p>
      </div>

      <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
        {[["generate","Generate Wallet"],["import","Import Mnemonic"],["sign","Sign Messages"],["tx","Build Transaction"]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-colors ${tab === t ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {error && <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{error}</div>}

      {tab === "generate" && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-500">
            All keys are generated client-side using ethers.js. Nothing is ever sent to a server. Clear this page to discard keys.
          </div>
          <Button className="w-full gap-2" onClick={generateWallet}><RefreshCw className="h-4 w-4" /> Generate New Random Wallet</Button>

          {mnemonic && wallet && (
            <>
              {/* Mnemonic */}
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold">BIP-39 Mnemonic (12 words)</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowPhrase(s => !s)} className="p-1.5 text-muted-foreground hover:text-foreground">{showPhrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    <button onClick={() => copy(mnemonic, "mnemonic")} className="p-1.5 text-muted-foreground hover:text-foreground">{copied === "mnemonic" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}</button>
                  </div>
                </div>
                {showPhrase ? (
                  <div className="grid grid-cols-3 gap-2">
                    {mnemonic.split(" ").map((w, i) => (
                      <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-xs">
                        <span className="text-muted-foreground w-4 text-right shrink-0">{i+1}.</span>
                        <span className="font-mono font-semibold">{w}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-center text-muted-foreground py-4">Tap eye to reveal</p>}
              </div>

              {/* Primary wallet */}
              <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                <p className="text-xs font-semibold">Primary Address (m/44'/60'/0'/0/0)</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono break-all flex-1">{wallet.address}</p>
                  <button onClick={() => copy(wallet.address, "addr")}>{copied === "addr" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}</button>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono text-muted-foreground flex-1">{showKey ? wallet.privateKey : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}</p>
                  <button onClick={() => setShowKey(s => !s)} className="text-muted-foreground">{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  {showKey && <button onClick={() => copy(wallet.privateKey, "pk")}>{copied === "pk" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}</button>}
                </div>
              </div>

              {/* HD derived accounts */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">HD Derived Accounts</p>
                {derivedWallets.map((dw, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                    <button onClick={() => setExpandedPath(expandedPath === i ? null : i)} className="w-full p-3 flex items-center gap-2 text-left">
                      <span className="text-xs font-mono text-muted-foreground flex-1 truncate">{dw.path}</span>
                      <span className="text-xs font-mono text-foreground">{dw.address.slice(0,10)}...{dw.address.slice(-6)}</span>
                      {expandedPath === i ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </button>
                    {expandedPath === i && (
                      <div className="border-t border-border p-3 bg-secondary/20 text-xs space-y-1">
                        <div className="flex items-center gap-2"><span className="text-muted-foreground w-12">Address</span><span className="font-mono break-all flex-1">{dw.address}</span><button onClick={() => copy(dw.address, `addr${i}`)}>{copied === `addr${i}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}</button></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "import" && (
        <div className="space-y-4">
          <div><Label>BIP-39 Mnemonic Phrase (12 or 24 words)</Label>
            <textarea value={importMnemonic} onChange={e => setImportMnemonic(e.target.value)} rows={3} placeholder="word1 word2 word3 ..." className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <Button className="w-full" onClick={importWallet} disabled={!importMnemonic.trim()}>Import and Derive Wallets</Button>
          {wallet && mnemonic && (
            <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/5 space-y-2">
              <p className="text-xs font-semibold text-green-500 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Valid BIP-39 Mnemonic Imported</p>
              <p className="text-xs text-muted-foreground">Primary address derived:</p>
              <p className="text-sm font-mono break-all">{wallet.address}</p>
              <p className="text-xs text-muted-foreground">{derivedWallets.length} HD accounts derived successfully.</p>
            </div>
          )}
        </div>
      )}

      {tab === "sign" && (
        <div className="space-y-4">
          {!wallet && <div className="p-4 rounded-xl bg-secondary/30 text-sm text-muted-foreground text-center">Generate or import a wallet first.</div>}
          {wallet && (
            <>
              <div className="p-3 rounded-xl border border-border bg-card text-xs">
                <span className="text-muted-foreground">Signing with: </span>
                <span className="font-mono">{wallet.address.slice(0,18)}...</span>
              </div>
              <div><Label>Message to Sign</Label>
                <textarea value={signMessage} onChange={e => setSignMessage(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <Button className="w-full gap-2" onClick={signMsg}><FileSignature className="h-4 w-4" /> Sign Message (EIP-191)</Button>
              {signature && (
                <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">Signature (65 bytes / 130 hex chars)</p>
                    <button onClick={() => copy(signature, "sig")}>{copied === "sig" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}</button>
                  </div>
                  <p className="text-[10px] font-mono break-all text-muted-foreground">{signature}</p>
                  <Button size="sm" variant="outline" className="w-full mt-2 text-xs" onClick={verifySignature}>Verify Signature</Button>
                  {verifyAddress && (
                    <div className={`p-2 rounded-lg text-xs ${verifyResult ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}`}>
                      {verifyResult ? "✓ Signature valid — recovered address matches" : "✗ Address mismatch"}
                      <p className="font-mono mt-0.5">Recovered: {verifyAddress}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "tx" && (
        <div className="space-y-4">
          {!wallet && <div className="p-4 rounded-xl bg-secondary/30 text-sm text-muted-foreground text-center">Generate or import a wallet first.</div>}
          {wallet && (
            <>
              <div className="p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 text-xs text-yellow-500">
                This builds a signed raw transaction. You can broadcast it via any Ethereum node. Nonce is set to 0 for demo.
              </div>
              <div><Label>Recipient Address</Label><Input className="mt-1.5 font-mono text-xs" placeholder="0x..." value={txTo} onChange={e => setTxTo(e.target.value)} /></div>
              <div><Label>Value (ETH)</Label><Input type="number" step="0.0001" className="mt-1.5" value={txValue} onChange={e => setTxValue(e.target.value)} /></div>
              <Button className="w-full gap-2" onClick={buildSignedTx} disabled={!txTo}><Key className="h-4 w-4" /> Sign Raw Transaction (EIP-1559)</Button>
              {signedTx && (
                <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">Signed Raw Transaction</p>
                    <button onClick={() => copy(signedTx, "tx")}>{copied === "tx" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}</button>
                  </div>
                  <p className="text-[10px] font-mono break-all text-muted-foreground">{signedTx}</p>
                  <p className="text-[10px] text-muted-foreground">Broadcast via: <span className="font-mono">eth_sendRawTransaction</span> on any Ethereum RPC</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}