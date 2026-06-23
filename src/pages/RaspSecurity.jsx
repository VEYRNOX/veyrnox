// src/pages/RaspSecurity.jsx
//
// RASP Security — honest CURRENT-STATE surface. UNAUDITED-PROVISIONAL.
//
// Shows only what is real: the degradation policy is built + tested; browser-level
// detection is active (navigator.webdriver + legacy fingerprints → HOOKED);
// OS-level detection (root/jailbreak/tamper) is pending native plugin + audit.
// The send path is wired to the browser probe (RASP always runs; a normal browser
// gets CLEAN → ALLOW, automation gets HOOKED → BLOCK).
//
// HONESTY-LOCK (§5). The capability claim is DERIVED from the feature catalogue
// status (same source Features.jsx uses), not hand-typed:
//   verified  → full 'live' (real-device-verified native probes)
//   built     → 'browser-active' (browser probes running, OS-level pending)
//   roadmap   → 'pending' (nothing running)
// Extracted into raspSurfaceModel() so the coupling is unit-tested.
//
// DENIABILITY (§3, D2/D4). Every value here is a GLOBAL build-state fact. The
// live detect() result is a pure function of the ENVIRONMENT — no wallet-set
// handle — so it renders byte-identical across primary and decoy sessions.

import { Cpu } from "lucide-react";
import { FEATURE_CATEGORIES, STATUS, resolveStatus } from "@/lib/featureCatalogue";
import { detect, browserProbeSource, CONDITION } from "@/rasp";

const RASP_FEATURE = FEATURE_CATEGORIES
  .flatMap((c) => c.features)
  .find((f) => f.name === "RASP");

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
 * Pure: a resolved catalogue status → the surface's display model. Detection is
 * 'live' only for evidenced `verified`; 'browser-active' for `built` (browser
 * probes wired, OS-level pending); 'pending' for roadmap.
 * Extracted so the honesty-lock is unit-tested without rendering React.
 * @param {'verified'|'built'|'roadmap'} status
 */
export function raspSurfaceModel(status) {
  if (status === STATUS.VERIFIED) return { detectionLive: true, detection: "live" };
  if (status === STATUS.BUILT)    return { detectionLive: true, detection: "browser-active" };
  return { detectionLive: false, detection: "pending" };
}

// Static design content — the DESIGNED ladder, framed current-tense now that
// browser-level detection is active.
const TONE = {
  allow: { text: "text-accent", dot: "bg-accent" },
  warn: { text: "text-caution", dot: "bg-caution" },
  block: { text: "text-risk", dot: "bg-risk" },
};
const LADDER = [
  { tier: "allow", copy: "Clean runtime — normal sign flow" },
  { tier: "warn", copy: "Rooted / jailbroken — one sentence, biometric re-confirm" },
  { tier: "block", copy: "Hooking / tamper / emulator — signing refused, no override" },
];

export default function RaspSecurity() {
  // Honesty-lock: derive the live capability claim from the catalogue, not a
  // literal. If the catalogue entry is somehow missing, fail honest to roadmap.
  const status = RASP_FEATURE ? resolveStatus(RASP_FEATURE) : STATUS.ROADMAP;
  const model = raspSurfaceModel(status);

  // Live environment condition — pure function of browser signals, set-blind.
  // In non-browser environments (tests / Node) this returns INTEGRITY_UNAVAILABLE.
  const liveCondition = detect(browserProbeSource);
  const liveConditionLabel = CONDITION_LABEL[liveCondition] ?? liveCondition;

  const stats = [
    { label: "Degradation policy", value: "built" },
    { label: "Detection", value: model.detection },
    { label: "Wired to send path", value: "yes" },
    { label: "Independent audit", value: "not yet" },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="rasp-surface">
      {/* Header + undroppable provisional tag */}
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
        <span className="shrink-0 px-2.5 py-1 rounded-md border border-caution/40 text-caution font-mono text-xs">
          UNAUDITED-PROVISIONAL
        </span>
      </div>

      {/* Status banner — derived from catalogue status (honesty-lock) */}
      <div
        className="p-5 rounded-xl border border-accent/40 bg-accent/10 flex gap-3"
        data-testid="rasp-banner"
      >
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
        <div>
          <p className="font-bold text-accent">Browser-level detection active · OS-level detection pending audit</p>
          <p className="text-sm text-muted-foreground mt-1">
            The degradation policy is built and tested, and browser probes (automation detection) are active.
            OS-level probes (root / jailbreak / tamper) need a native plugin, pending the independent audit.
          </p>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-xl border border-border bg-card"
            data-testid={`rasp-stat-${s.label}`}
          >
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-xl font-mono text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Live environment readout — pure function of browser signals */}
      <div
        className="p-4 rounded-xl border border-border bg-secondary/30 flex items-center gap-3"
        data-testid="rasp-live-condition"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        <span className="text-sm text-muted-foreground">Current environment:</span>
        <span className="font-mono text-sm" data-testid="rasp-condition-value">{liveConditionLabel}</span>
      </div>

      {/* Degradation ladder */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Degradation ladder — browser-level detection active; OS-level detection pending audit:
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
        No fabricated event counts, no &quot;active monitoring&quot; claim, no scan button — RASP shows
        only what is real.
      </p>
    </div>
  );
}
