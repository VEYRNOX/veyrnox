// pages/SecurityScanner.jsx
//
// Pre-Sign Transaction Scanner. This page runs the REAL wallet-core transaction
// risk logic — the same `describeErc20Call` decode + `assessEvmTransaction` risk
// assessment that powers the Send flow's pre-sign preview (evm/simulate.js) — over
// whatever ERC-20 calldata the user pastes. It renders the honest
// `TransactionPreview` component, which NEVER asserts a transaction is "safe":
// with no findings it says "no KNOWN risk patterns detected — not a guarantee".
//
// HONESTY CONTRACT (mirrors evm/simulate.js + TransactionPreview):
//   - No canned verdicts. Findings come from the real assessor over the real
//     decoded bytes (unlimited approval, known-bad/burn recipient, look-alike
//     poisoning, unrecognised calldata, large outflow…).
//   - This pure path decodes + assesses LOCALLY (no key, no network). It does NOT
//     run the on-chain eth_call dry-run (that needs a live unlocked wallet on a
//     real RPC, reached from the actual Send flow); it says so, and never claims
//     to have simulated against chain state.
//   - If the input can't be decoded as an ERC-20 call, the assessor flags it as an
//     unrecognised call — we surface that, we do not fake a "safe" result.
//   - The live, RPC-backed preview (with representative high-risk samples) is shown
//     below via the shared TransactionSimulationDemo.

import { useState } from "react";
import { isHexString } from "ethers";
import { ScanSearch, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import TransactionPreview from "@/components/TransactionPreview";
import TransactionSimulationDemo from "@/components/TransactionSimulationDemo";
import { describeErc20Call } from "@/wallet-core/evm/calldata";
import { assessEvmTransaction } from "@/wallet-core/evm/simulate";

const COVERAGE_NOTE =
  "Checked on your device — no key used, nothing sent to any server, no on-chain simulation run here. " +
  "It finds KNOWN risk patterns in the calldata. It is not a guarantee of safety and won't catch every threat. " +
  "A fuller check runs inside the real Send flow before you approve.";

export default function SecurityScanner() {
  const [calldata, setCalldata] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [decimals, setDecimals] = useState("18");
  const [result, setResult] = useState(null);
  const [inputError, setInputError] = useState(null);

  const handleScan = () => {
    setResult(null);
    setInputError(null);
    const data = calldata.trim();
    if (!data || !isHexString(data) || data.length < 10) {
      setInputError(
        "Paste the transaction's data field as a 0x-prefixed hex string. A plain address or signed transaction won't work — you need the calldata.",
      );
      return;
    }
    const dec = Number.parseInt(decimals, 10);
    const decoded = describeErc20Call({
      data,
      tokenSymbol: tokenSymbol.trim() || undefined,
      decimals: Number.isFinite(dec) ? dec : 18,
    });
    // Pure, local assessment — same logic the Send pre-sign preview uses. No RPC,
    // so contract-code / balance facts are unknown; the assessor degrades honestly.
    const assessment = assessEvmTransaction({
      decoded,
      txTo: null,
      tokenSymbol: tokenSymbol.trim() || decoded.tokenSymbol || null,
    });
    setResult({
      chain: "evm",
      simulated: false, // decode + risk-assessment only; no on-chain dry-run here
      willRevert: false,
      decoded,
      ...assessment,
      source: { mode: "decode-only", queries: [], thirdParty: false },
      coverageNote: COVERAGE_NOTE,
    });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <ScanSearch className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Transaction Scanner</h1>
          <p className="text-sm text-muted-foreground">Check ERC-20 calldata for known risks — on your device, before you sign</p>
        </div>
      </div>

      {/* How it works — honest about what this does and does NOT do. */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardContent className="pt-4 space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">What this does</p>
          <p>
            Paste the <span className="font-mono">data</span> field from a transaction. It checks
            for known risk patterns — unlimited approvals, look-alike addresses, unrecognised calls
            — on your device, with no network. It never tells you a transaction is safe. Nothing
            flagged means nothing detected, not a clean bill of health.
          </p>
        </CardContent>
      </Card>

      {/* Input */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Transaction data field (0x…)</label>
            <textarea
              className="w-full h-24 text-xs font-mono p-2 rounded-lg bg-secondary border border-border resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="0xa9059cbb… (transfer) or 0x095ea7b3… (approve)"
              value={calldata}
              onChange={(e) => setCalldata(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Token symbol (optional)</label>
              <Input value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)} placeholder="USDC" className="text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Token decimals</label>
              <Input value={decimals} onChange={(e) => setDecimals(e.target.value)} placeholder="18" inputMode="numeric" className="text-xs" />
            </div>
          </div>
          <Button className="w-full" onClick={handleScan} disabled={!calldata.trim()}>
            <ScanSearch className="h-4 w-4 mr-2" />Decode &amp; Assess
          </Button>
        </CardContent>
      </Card>

      {inputError && (
        <div className="p-3 rounded-lg bg-caution/10 border border-caution/30 flex items-start gap-2 text-xs text-caution">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{inputError}</span>
        </div>
      )}

      {/* Real assessment of the pasted calldata. */}
      {result && <TransactionPreview result={result} />}

      {/* Live, RPC-backed preview with representative samples (the real Send-flow preview). */}
      <div>
        <p className="text-sm font-semibold mb-2">Live examples</p>
        <p className="text-xs text-muted-foreground mb-2">
          Built from the same checks you&apos;ll see before you approve a transaction. Each runs real risk
          logic across chains and risk patterns.
        </p>
        <TransactionSimulationDemo />
      </div>
    </div>
  );
}
