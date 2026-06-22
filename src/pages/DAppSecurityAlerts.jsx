// pages/DAppSecurityAlerts.jsx
//
// dApp domain check against a LOCAL known-bad / phishing list. Veyrnox does NOT
// audit, rate, or verify dApps, and this page no longer pretends to: it does one
// honest thing — checks whether a domain is on a small, local known-bad list
// (the same "local flagged list" pattern as wallet-core/evm/poison.js), and says
// so when it is.
//
// HONESTY CONTRACT:
//   - NO numeric "trust score", NO "Audit verified", NO "Safe to connect". Those
//     were fabricated over a hardcoded list and are removed.
//   - A domain NOT on the local list is reported as "not on the local known-bad
//     list" — explicitly NOT a safety verdict. The list is a small local seed, not
//     a live feed, and absence proves nothing.
//   - The list itself is illustrative/local and clearly labelled as such — it is a
//     starting point to be extended with a real threat feed, not a guarantee of
//     coverage.

import { useState } from "react";
import { ShieldAlert, Shield, AlertTriangle, XCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// A SMALL, LOCAL known-bad / phishing dApp domain list. Local = checking it leaks
// nothing off-device. Illustrative and non-exhaustive — intended to be hydrated
// from a real threat feed later. It never asserts a domain is "safe", only flags
// the ones it knows are bad.
const LOCAL_KNOWN_BAD = [
  { domain: "fakeswap-rewards.xyz", reason: "Known phishing / wallet-drainer domain" },
  { domain: "airdrop-claim2024.io", reason: "Known approval-drainer / fake airdrop" },
  { domain: "uniswap-app.org", reason: "Look-alike of uniswap.org (typosquat)" },
  { domain: "metamask-wallet.app", reason: "Look-alike of metamask.io (credential phish)" },
];
const BAD_SET = new Map(LOCAL_KNOWN_BAD.map((b) => [b.domain.toLowerCase(), b]));

function normalizeDomain(input) {
  return input.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

export default function DAppSecurityAlerts() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);

  const handleCheck = () => {
    if (!url.trim()) return;
    const domain = normalizeDomain(url);
    const hit = BAD_SET.get(domain);
    setResult(hit ? { domain, flagged: true, reason: hit.reason } : { domain, flagged: false });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-caution/10 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-caution" />
        </div>
        <div>
          <h1 className="text-xl font-bold">dApp Domain Check</h1>
          <p className="text-sm text-muted-foreground">Check a dApp domain against a local known-bad / phishing list</p>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-secondary/50 border border-border flex items-start gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          <strong>VEYRNOX</strong> does not audit, rate, or verify dApps. This only checks a small, local known-bad list — it can
          tell you a domain is <span className="font-medium">known bad</span>, but it can never tell you a domain is
          safe to connect. Absence from the list is not a safety check.
        </p>
      </div>

      {/* Domain check */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input placeholder="app.uniswap.org or paste a dApp URL" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCheck()} />
            <Button onClick={handleCheck} disabled={!url.trim()} aria-label="Check domain">
              <Shield className="h-4 w-4" />
            </Button>
          </div>

          {result && (
            result.flagged ? (
              <div className="p-4 rounded-xl border bg-destructive/10 border-destructive/30 space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-destructive shrink-0" />
                  <p className="font-bold text-sm">{result.domain}</p>
                  <Badge variant="outline" className="text-destructive border-current text-[10px]">On known-bad list</Badge>
                </div>
                <p className="text-xs text-destructive">{result.reason}</p>
                <Button variant="destructive" size="sm" className="w-full">Do Not Connect to This Site</Button>
              </div>
            ) : (
              <div className="p-4 rounded-xl border bg-secondary/40 border-border space-y-1.5">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-muted-foreground shrink-0" />
                  <p className="font-bold text-sm">{result.domain}</p>
                  <Badge variant="outline" className="text-muted-foreground border-current text-[10px]">Not on local list</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Not on the local known-bad list. This is <span className="font-medium">not</span> a safety verdict — the list is
                  small and local, <strong>VEYRNOX</strong> does not verify dApps, and absence here does not mean the site is safe to connect.
                  Verify the URL yourself and review every connection request and approval.
                </p>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* The local known-bad list itself — shown honestly as a local, non-exhaustive seed. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-caution" />Local known-bad list</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground mb-1">Illustrative local entries — not a live feed and not exhaustive. A real threat feed is on the roadmap.</p>
          {LOCAL_KNOWN_BAD.map((b) => (
            <div key={b.domain} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-semibold truncate">{b.domain}</p>
                <p className="text-xs text-muted-foreground">{b.reason}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
