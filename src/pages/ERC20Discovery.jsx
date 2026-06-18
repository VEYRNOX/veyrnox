import { Coins, Clock, ShieldCheck } from "lucide-react";

// Honest placeholder. This route is classified `disabled` in
// src/lib/featureClassification.js ('/erc20-discovery') and is intercepted by
// FeatureGate before this component ever mounts — so in normal operation users
// see HonestDisabledPage, not this. It is kept as a fail-closed fallback: the
// earlier version fabricated a token scan (Math.random balances, a random
// subset of well-known tokens, random spam scores, even a random address) and
// presented it as the user's real on-chain holdings. That fabrication has been
// removed so the lie no longer exists in source, even behind the gate.
export default function ERC20Discovery() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl border border-border bg-card"><Coins className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-xl font-bold">ERC-20 Token Discovery</h1>
          <p className="text-sm text-muted-foreground">Auto-detect tokens on an Ethereum address</p>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-border bg-secondary/30">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <p className="font-semibold">Not available yet</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Discovering every token held by an address means scanning its ERC-20
          Transfer-event history — which requires a third-party indexer this build
          does not run, and would reveal the address to that indexer. <strong>VEYRNOX</strong> does
          not do this today, and nothing on this page queries a real blockchain.
        </p>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="font-semibold">What works today instead</p>
        </div>
        <p className="text-sm text-muted-foreground">
          The wallet reads balances for tokens it already knows (e.g. USDC, USDT on
          testnet) directly from chain via your configured RPC — no indexer, no
          address leak. Add a token by its contract address to track it.
        </p>
      </div>
    </div>
  );
}
