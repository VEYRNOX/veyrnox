import { CloudOff } from "lucide-react";

// Honest "needs a server we don't ship" notice (base44 removal, Phase 3).
//
// Some features genuinely cannot run on-device — they require a backend the
// local-first build doesn't include (an LLM endpoint for AI pages, an email
// sender for OTP delivery). Rather than fake a result, the feature surfaces
// this notice and disables the action. See base44Client.js (LLM_AVAILABLE /
// EMAIL_AVAILABLE) for where the gate is decided.
export default function LocalBuildNotice({ feature, detail }) {
  return (
    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
      <CloudOff className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
      <div className="text-sm min-w-0">
        <p className="font-semibold text-foreground">{feature} isn't available in this local build</p>
        <p className="text-muted-foreground mt-0.5">{detail}</p>
      </div>
    </div>
  );
}
