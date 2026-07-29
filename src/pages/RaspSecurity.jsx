// src/pages/RaspSecurity.jsx
//
// RASP Security — describes the runtime integrity checks that run before every
// signature and how a compromised environment is handled. It states only what
// the checks DO and shows the live environment condition; it deliberately
// carries no build-status / audit / roadmap vocabulary. A security surface
// should not publish its own audit ledger or "not-yet-done" list — that is a
// roadmap for an attacker, not information a user needs.
//
// DENIABILITY (§3, D2/D4): every value here is environment-derived.
// useRaspArtifact() is a pure function of the runtime (no wallet-set handle),
// so this renders byte-identical across primary and decoy sessions.
//
// raspSurfaceModel() is retained as a pure, unit-tested helper (signing-path
// honesty guard, VULN-8) but is intentionally no longer surfaced on this page.
//
// ── P2-8 (2026-07-15) — dashboard uses the shared useRaspArtifact() hook ──
// Previously this page sampled the native probe once on mount (no G4-A
// foreground / G4-B 60s heartbeat re-probe) and composed ONLY detect(nativeProbe)
// — the remote-attestation axis (detectAttestation + composeConditions) was
// missing, so a device where the OS probe said CLEAN but attestation said
// INTEGRITY_FAIL rendered "clean/allow" here while the Send flow correctly
// composed to BLOCK. The refactor to useRaspArtifact() closes both gaps: the
// hook re-probes on foreground + heartbeat AND composes the attestation axis.
// The dashboard is an environment-read surface (not an unlock path), so
// attestation is sampled eagerly (the hook's default behaviour) — attestation
// itself remains I3-guarded inside attestationProbeSource().
//
// I18N (Phase 2 slice 2): copy driven by `security.rasp.*` (see i18n/locales/).
// CONDITION_LABEL uses translated tokens where the label is USER-facing prose,
// and keeps the raw slug (e.g. "hooked") where it names an industry term the
// same across languages. tier / condition CONSTANTS keep their internal string
// values — those are not user-facing and gate downstream behaviour.

import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { STATUS } from "@/lib/featureCatalogue";
import { useRaspArtifact, CONDITION, TIER } from "@/rasp";

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

const DOT_TONE = {
  [TIER.ALLOW]: "bg-accent",
  [TIER.WARN]:  "bg-caution",
  [TIER.BLOCK]: "bg-risk",
};

// Which ladder rungs to render, in order. Copy comes from the security bundle
// so the "what happens per tier" story reads consistently across locales.
const LADDER_TIERS = ["allow", "warn", "block"];

export default function RaspSecurity() {
  const { t } = useTranslation("security");

  // P2-8: single source of truth. The hook composes on-device probe AND
  // attestation, re-probes on foreground/heartbeat, and returns a fail-closed
  // BLOCK artifact on any detection throw.
  const artifact = useRaspArtifact();
  const liveTier = artifact?.tier ?? TIER.BLOCK;
  const liveCondition = artifact?.condition;

  // Condition slug → translated label. The slug is the AUTHORITATIVE key
  // (never translated); the label is prose. Unknown slug falls back to the raw
  // slug rather than an empty string (I4 — visible bug > silent blank).
  const CONDITION_LABEL_MAP = {
    [CONDITION.CLEAN]: t("rasp.conditions.clean"),
    [CONDITION.ROOTED]: t("rasp.conditions.rooted"),
    [CONDITION.ELEVATED]: t("rasp.conditions.elevated"),
    [CONDITION.EMULATOR]: t("rasp.conditions.emulator"),
    [CONDITION.HOOKED]: t("rasp.conditions.hooked"),
    [CONDITION.TAMPERED]: t("rasp.conditions.tampered"),
    [CONDITION.INTEGRITY_FAIL]: t("rasp.conditions.integrity_fail"),
    [CONDITION.INTEGRITY_UNAVAILABLE]: t("rasp.conditions.unavailable"),
  };
  const liveConditionLabel = CONDITION_LABEL_MAP[liveCondition] ?? (liveCondition ?? t("rasp.conditions.unavailable"));

  // Screen-reader severity prefix for the environment readout — colour alone is
  // insufficient signal for AT users.
  const TIER_SEVERITY_LABEL = {
    [TIER.ALLOW]: t("rasp.tier_severity.allow"),
    [TIER.WARN]:  t("rasp.tier_severity.warn"),
    [TIER.BLOCK]: t("rasp.tier_severity.block"),
  };

  const dotTone = DOT_TONE[liveTier] ?? "bg-caution";

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="rasp-surface">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl border border-border bg-card">
            <Cpu className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("rasp.heading")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("rasp.subhead")}
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
          <p className="font-bold text-accent">{t("rasp.banner_title")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("rasp.banner_body")}
          </p>
        </div>
      </div>

      {/* Live environment readout — pure function of runtime signals */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="p-4 rounded-xl border border-border bg-secondary/30 flex items-center gap-3"
        data-testid="rasp-live-condition"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotTone}`} aria-hidden="true" />
        <span className="text-sm text-muted-foreground">{t("rasp.current_env")}</span>
        <span className="sr-only">{TIER_SEVERITY_LABEL[liveTier] ?? t("rasp.tier_severity.unknown")} — </span>
        <span className="font-mono text-sm" data-testid="rasp-condition-value">{liveConditionLabel}</span>
      </div>

      {/* Degradation ladder — behaviour per runtime condition */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("rasp.ladder_heading")}
        </p>
        {LADDER_TIERS.map((tier) => {
          const { text: textTone, dot: dotTone } = TONE[tier];
          return (
            <div
              key={tier}
              className="p-4 rounded-xl border border-border bg-secondary/30 flex items-center gap-4"
              data-testid={`rasp-ladder-${tier}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotTone}`} />
              <span className={`w-16 shrink-0 font-mono ${textTone}`}>{tier}</span>
              <span className="text-sm text-foreground">{t(`rasp.ladder.${tier}`)}</span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        {t("rasp.footer")}
      </p>
    </div>
  );
}
