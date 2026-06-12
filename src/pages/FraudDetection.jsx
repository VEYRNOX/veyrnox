import { ShieldAlert, Clock, ShieldCheck } from "lucide-react";

// Honest placeholder. This route is classified `disabled` in
// src/lib/featureClassification.js ('/fraud') and is intercepted by FeatureGate
// before this component ever mounts — so in normal operation users see
// HonestDisabledPage, not this. It is kept as a fail-closed fallback: the earlier
// version labelled itself "AI Fraud Detection" / "Real-time monitoring" but ran
// no analysis — runScan() was a 2s timeout that always reported "no new threats
// detected", and the Detection Rules tab rendered a hardcoded MOCK_RULES array
// presented as actively enforced. That theatre has been removed so the page no
// longer claims protection it does not deliver.
export default function FraudDetection() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl border border-border bg-card"><ShieldAlert className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-xl font-bold">Fraud Detection</h1>
          <p className="text-sm text-muted-foreground">Automated threat monitoring</p>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-border bg-secondary/30">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <p className="font-semibold">Not available yet</p>
        </div>
        <p className="text-sm text-muted-foreground">
          There is no automated or "AI" fraud scan running in this build, and no
          background rule engine is monitoring your activity. Claiming otherwise
          would be fake security, so this page no longer pretends to. Nothing here
          analyses transactions or flags threats on its own.
        </p>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="font-semibold">The real protections you do have</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Before you sign, the Pre-Sign Scanner shows the plain-language risk of a
          transaction; Address Screening and Trust Score run real on-device
          heuristics over the address and token; and the Security Dashboard
          summarises your live local signals. None of these claim to be a guarantee
          — always verify independently before signing.
        </p>
      </div>
    </div>
  );
}
