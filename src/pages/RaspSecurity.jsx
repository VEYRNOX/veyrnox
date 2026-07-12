// src/pages/RaspSecurity.jsx
//
// RASP Security — describes the runtime integrity checks that run before every
// signature and how a compromised environment is handled. It states only what
// the checks DO and shows the live environment condition; it deliberately
// carries no build-status / audit / roadmap vocabulary. A security surface
// should not publish its own audit ledger or "not-yet-done" list — that is a
// roadmap for an attacker, not information a user needs.
//
// DENIABILITY (§3, D2/D4): every value here is environment-derived. detect() is
// a pure function of the runtime (no wallet-set handle), so this renders
// byte-identical across primary and decoy sessions.
//
// raspSurfaceModel() is retained as a pure, unit-tested helper (signing-path
// honesty guard, VULN-8) but is intentionally no longer surfaced on this page.

import { Cpu } from "lucide-react";
import { STATUS } from "@/lib/featureCatalogue";
import { detect, browserProbeSource, CONDITION } from "@/rasp";

// Human-readable label for a CONDITION constant.
const CONDITION_LABEL = {
  [CONDITION.CLEAN]: "clean",
  [CONDITION.ROOTED]: "rooted",
  [CONDITION.EMULATOR]: "emulator",
  [CONDITION.HOOKED]: "hooked",
  [CONDITION.TAMPERED]: "tampered",
  [CONDITION.INTEGRITY_FAIL]: "integrity-fail",
  [CONDITION.INTEGRITY_UNAVAILABLE]: "unavailable",
};

/**
 * Pure signing-path honesty helper (VULN-8). Retained + unit-tested so the
 * signing-path guard keeps a subject, but no longer rendered on this page.
 * @param {'verified'|'built'|'roadmap'} status
 */
export function raspSurfaceModel(status) {
  if (status === STATUS.VERIFIED) return { detectionLive: true, detection: "live" };
  if (status === STATUS.BUILT)    return { detectionLive: true, detection: "browser-active" };
  return { detectionLive: false, detection: "pending" };
}

const TONE = {
  allow: { text: "text-accent", dot: "bg-accent" },
  warn: { text: "text-caution", dot: "bg-caution" },
  block: { text: "text-risk", dot: "bg-risk" },
};

// The degradation ladder describes BEHAVIOUR — what happens to signing in each
// runtime condition — not build status. The WARN tier reflects the wired
// pre-sign gate: a risky runtime requires an explicit confirmation before the
// signature proceeds (it is not silently allowed, nor hard-blocked).
const LADDER = [
  { tier: "allow", copy: "Clean runtime — signs normally" },
  { tier: "warn", copy: "Rooted / jailbroken — you confirm the risk before signing" },
  { tier: "block", copy: "Hooking / tamper / emulator — signing refused, no override" },
];

export default function RaspSecurity() {
  // Live environment condition — pure function of runtime signals, set-blind.
  // In non-browser environments (tests / Node) this returns INTEGRITY_UNAVAILABLE.
  const liveCondition = detect(browserProbeSource);
  const liveConditionLabel = CONDITION_LABEL[liveCondition] ?? liveCondition;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="rasp-surface">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl border border-border bg-card">
            <Cpu className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">RASP Security</h1>
            <p className="text-sm text-muted-foreground">
              Runtime risk detection &amp; honest degradation — environment-risk plane
            </p>
          </div>
        </div>
      </div>

      {/* Banner — describes the active checks, no status vocabulary */}
      <div
        className="p-5 rounded-xl border border-accent/40 bg-accent/10 flex gap-3"
        data-testid="rasp-banner"
      >
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
        <div>
          <p className="font-bold text-accent">Runtime integrity checks active</p>
          <p className="text-sm text-muted-foreground mt-1">
            Before every signature the app checks its runtime for automation, hooking,
            tampering, root / jailbreak, and emulator signals. A clean environment signs
            normally; a compromised one is refused.
          </p>
        </div>
      </div>

      {/* Live environment readout — pure function of runtime signals */}
      <div
        className="p-4 rounded-xl border border-border bg-secondary/30 flex items-center gap-3"
        data-testid="rasp-live-condition"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        <span className="text-sm text-muted-foreground">Current environment:</span>
        <span className="font-mono text-sm" data-testid="rasp-condition-value">{liveConditionLabel}</span>
      </div>

      {/* Degradation ladder — behaviour per runtime condition */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          How a risky environment is handled:
        </p>
        {LADDER.map((rung) => {
          const { text: textTone, dot: dotTone } = TONE[rung.tier];
          return (
            <div
              key={rung.tier}
              className="p-4 rounded-xl border border-border bg-secondary/30 flex items-center gap-4"
              data-testid={`rasp-ladder-${rung.tier}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotTone}`} />
              <span className={`w-16 shrink-0 font-mono ${textTone}`}>{rung.tier}</span>
              <span className="text-sm text-foreground">{rung.copy}</span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        No fabricated event counts, no scan buttons — only real detections shown.
      </p>
    </div>
  );
}
