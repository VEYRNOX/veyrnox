// components/SecurityAdvisorBanner.jsx — "Sentinel", Veyrnox's security advisor.
//
// Screens the recipient against the LOCAL threat-intel store the moment an
// address is entered — before TIP, before simulation. Shows nothing when the
// address is clean or empty.
//
// COPY: every string goes through useTranslation("security"), matching
// PoisonWarning six lines away in the same send step. Non-en catalogs resolve
// via i18next fallbackLng:'en' (see src/i18n) — they are NOT machine-filled with
// English text pretending to be a translation.
//
// COLOUR is a severity cue, never the only cue: each row also carries an icon
// and explicit text, so the warning survives a monochrome or colour-blind read.
//
// SANCTIONS: the bundled seed list carries NO 'sanctioned' entries — see
// docs/OFAC-legal-gate.md, which requires an enterprise-licensed RUNTIME API
// rather than a build-time snapshot that cannot track delistings. The
// 'sanctioned' branch below is retained because a LIVE TIP verdict can still
// produce that category at runtime, which is the disclosed path the gate allows.
// Do NOT re-add sanctioned addresses to SEED_THREATS to make this branch
// reachable offline; that is the exact thing the gate forbids.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, AlertTriangle, Skull } from 'lucide-react';
import { lookupThreatSync } from '@/lib/threatIntelStore';

// Presentation only — copy lives in the i18n catalog under send_gates.sentinel.
const CATEGORY_STYLE = {
  sanctioned:         { icon: Skull,         tone: 'critical' },
  drainer:            { icon: Skull,         tone: 'critical' },
  phishing:           { icon: Skull,         tone: 'critical' },
  exploit:            { icon: AlertTriangle, tone: 'high' },
  scam:               { icon: AlertTriangle, tone: 'high' },
  malicious_contract: { icon: AlertTriangle, tone: 'high' },
  burn:               { icon: AlertTriangle, tone: 'high' },
  mixer:              { icon: Shield,        tone: 'medium' },
};

const TONE_CLASS = {
  critical: { fg: 'text-destructive', box: 'bg-destructive/10 border-destructive/40' },
  high:     { fg: 'text-orange-400',  box: 'bg-orange-500/10 border-orange-500/40' },
  medium:   { fg: 'text-yellow-400',  box: 'bg-yellow-500/10 border-yellow-500/40' },
};

const DEFAULT_STYLE = { icon: AlertTriangle, tone: 'medium' };
const SEVERITY_ORDER = { critical: 3, high: 2, medium: 1 };

/**
 * Sentinel — local threat-intel screening for the send flow.
 * Renders nothing when the address is clean, empty, or the session is a
 * decoy/demo (lookupThreatSync returns [] there — I3).
 *
 * @param {{ address: string }} props
 */
export default function SecurityAdvisorBanner({ address }) {
  const { t } = useTranslation('security');

  const threats = useMemo(() => {
    if (!address || address.length < 10) return [];
    return lookupThreatSync(address);
  }, [address]);

  if (threats.length === 0) return null;

  const worst = threats.reduce(
    (a, b) => ((SEVERITY_ORDER[b.severity] || 0) > (SEVERITY_ORDER[a.severity] || 0) ? b : a),
    threats[0],
  );

  const style = CATEGORY_STYLE[worst.category] || DEFAULT_STYLE;
  const tone = TONE_CLASS[style.tone] || TONE_CLASS.medium;
  const Icon = style.icon;

  // Headline keyed by category, with a generic fallback for a category the
  // catalog does not yet name (e.g. a new TIP signal type).
  const headline = t([
    `send_gates.sentinel.headline.${worst.category}`,
    'send_gates.sentinel.headline.default',
  ]);

  return (
    <div
      className={`rounded-lg border p-3 ${tone.box} motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300`}
      // status, not alert: this updates while the recipient field is still being
      // edited. The project convention is polite for live-updating messages and
      // assertive only for blur-gated ones (see the send amount/address errors).
      role="status"
      data-testid="sentinel-warning"
    >
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 mt-0.5 ${tone.fg}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className={`text-sm font-bold ${tone.fg}`}>{headline}</p>

          {threats.map((threat) => (
            <div
              key={`${threat.category}:${threat.source}:${threat.note}`}
              className="flex items-start gap-2 text-xs leading-relaxed"
            >
              <span className="font-bold shrink-0 mt-px">
                {t('send_gates.sentinel.speaker')}
              </span>
              <span>
                {t('send_gates.sentinel.detail', {
                  note: threat.note || t('send_gates.sentinel.note_fallback'),
                  source: threat.source,
                })}
              </span>
            </div>
          ))}

          {worst.severity === 'critical' && (
            <div className="mt-2 pt-2 border-t border-destructive/30">
              <div className="flex items-start gap-2 text-xs leading-relaxed">
                <span className="font-bold shrink-0 mt-px">
                  {t('send_gates.sentinel.speaker')}
                </span>
                <span>{t('send_gates.sentinel.critical_footer')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
