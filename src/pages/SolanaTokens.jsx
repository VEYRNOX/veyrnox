import { Clock, ShieldCheck } from "lucide-react";

// Honest placeholder. This route is classified `disabled` in
// src/lib/featureClassification.js ('/solana') and is intercepted by FeatureGate
// before this component ever mounts — so in normal operation users see
// HonestDisabledPage, not this. It is kept as a fail-closed fallback: the earlier
// version hardcoded a fake Solana wallet (fixed address, balance, SPL token list
// and prices, with Math.random() 24h changes) and presented it as the user's
// real Solana portfolio, with a Send dialog that built no real transaction. That
// fabrication has been removed so the lie no longer exists in source.
export default function SolanaTokens() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-lg font-bold">◎</div>
        <div>
          <h1 className="text-xl font-bold">Solana Wallet</h1>
          <p className="text-sm text-muted-foreground">SOL and SPL tokens</p>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-border bg-secondary/30">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <p className="font-semibold">Not available yet</p>
        </div>
        <p className="text-sm text-muted-foreground">
          A live Solana view needs real balance and token reads from a Solana RPC,
          wired through wallet-core. That is not built yet. Nothing on this page
          shows real holdings, and there is no working Solana send here.
        </p>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="font-semibold">Where Solana stands</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Veyrnox can derive a Solana account from your seed (ed25519 / SLIP-0010),
          but Solana is not yet wired into the send dispatch. When it is, balances
          and transactions here will come from a real RPC, not constants.
        </p>
      </div>
    </div>
  );
}
