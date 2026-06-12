// src/pages/RaspSecurity.jsx
//
// RASP Security — honest CURRENT-STATE surface (brief). UNAUDITED-PROVISIONAL.
//
// Shows only what is real: the degradation policy is built + tested; runtime
// detection is parked (not monitoring); nothing is wired to the send path; the
// independent audit has not run. It DESCRIBES the designed allow/warn/block
// ladder as static copy — it never imports or invokes degrade()/detect() (§7),
// so this stays a pure presentation surface (no key, no egress, no detector).
//
// HONESTY-LOCK (§5). The one capability claim a reader's threat model depends on
// — "is detection active?" — is DERIVED from the feature catalogue's resolved
// status (the same source Features.jsx uses), not hand-typed. Detection counts
// as live ONLY if the catalogue resolves RASP to `verified`; it resolves to
// `roadmap` today, so the surface fails honest to "not yet active". There is no
// "active / monitoring" branch on this current-state surface (the active-state
// dashboard is a separate cycle, §10) — fail honest, fail closed (I4).
//
// DENIABILITY (§3, D2/D4). Every value here is a GLOBAL build-state fact; nothing
// is set-derived. The surface renders byte-identical across real and decoy sets.

import { Cpu } from "lucide-react";
import { FEATURE_CATEGORIES, STATUS, resolveStatus } from "@/lib/featureCatalogue";

const RASP_FEATURE = FEATURE_CATEGORIES
  .flatMap((c) => c.features)
  .find((f) => f.name === "RASP");

/**
 * Pure: a resolved catalogue status → the surface's display model. Detection is
 * "live" ONLY for an evidenced `verified`; everything else is honest "pending".
 * Extracted so the honesty-lock is unit-tested without rendering React.
 * @param {'verified'|'built'|'roadmap'} status
 */
export function raspSurfaceModel(status) {
  const detectionLive = status === STATUS.VERIFIED;
  return { detectionLive, detection: detectionLive ? "live" : "pending" };
}

// Static design content — the DESIGNED ladder, framed future-tense (§11). One
// fixed tone class per tier (Tailwind needs literal class names, never dynamic).
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

  const stats = [
    { label: "Degradation policy", value: "built" },
    { label: "Detection", value: model.detection },
    { label: "Wired to send path", value: "no" },
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

      {/* Amber status banner — the honest current state, derived (no active branch) */}
      <div
        className="p-5 rounded-xl border border-caution/40 bg-caution/10 flex gap-3"
        data-testid="rasp-banner"
      >
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-caution" />
        <div>
          <p className="font-bold text-caution">Policy built · detection not yet active</p>
          <p className="text-sm text-muted-foreground mt-1">
            The degradation logic is built and tested. Runtime detection is pending — it does
            not monitor yet.
          </p>
        </div>
      </div>

      {/* Stat tiles — real build-state facts, mono values, no counts. Inlined
          (not a nested component) so the label/value live as real element
          children, not as props on a child node. */}
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

      {/* Designed ladder — framed future-tense (designed, not live) */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Designed degradation ladder — what RASP will do once detection is active:
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

      {/* Footer — the omissions are deliberate */}
      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        No fabricated event counts, no &quot;active&quot; claim, no scan button — RASP shows
        only what is real.
      </p>
    </div>
  );
}
