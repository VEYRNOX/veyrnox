// components/SecurityAdvisorBanner.jsx — "Sentinel", Veyrnox's security advisor.
//
// A friendly, opinionated security personality that lives in the send flow.
// Sentinel checks every recipient address against the local threat intel
// database INSTANTLY on entry — before TIP, before simulation, before anything.
//
// Personality: direct, protective, warm when safe, urgent when not. Never
// robotic. Speaks like a sharp friend who happens to be a security expert.

import { useMemo } from 'react';
import { Shield, AlertTriangle, Skull } from 'lucide-react';
import { lookupThreatSync } from '@/lib/threatIntelStore';

const CATEGORY_CONFIG = {
  sanctioned: {
    icon: Skull,
    color: 'text-red-500',
    bg: 'bg-red-500/15 border-red-500/50',
    headline: () => `This address is sanctioned.`,
    detail: match => match.note
      ? `${match.note} — Source: ${match.source}. Sending here could have serious legal consequences. I strongly advise against this.`
      : `Flagged by ${match.source}. This address is on an international sanctions list. Please reconsider.`,
  },
  drainer: {
    icon: Skull,
    color: 'text-red-500',
    bg: 'bg-red-500/15 border-red-500/50',
    headline: () => `This is a known wallet drainer.`,
    detail: match => `${match.note || 'Known drainer contract'} — Source: ${match.source}. This address has stolen funds from other wallets. Do not send anything here.`,
  },
  exploit: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/15 border-orange-500/50',
    headline: () => `This address is linked to a known exploit.`,
    detail: match => `${match.note || 'Exploit wallet'} — Source: ${match.source}. Funds sent here may be unrecoverable.`,
  },
  scam: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/15 border-orange-500/50',
    headline: () => `This address is flagged as a scam.`,
    detail: match => `${match.note || 'Known scam address'} — Source: ${match.source}. Be very careful.`,
  },
  malicious_contract: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/15 border-orange-500/50',
    headline: () => `This contract has been flagged as malicious.`,
    detail: match => `${match.note || 'Malicious contract'} — Source: ${match.source}. Interacting with this could put your funds at risk.`,
  },
  mixer: {
    icon: Shield,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/15 border-yellow-500/50',
    headline: () => `This is a mixing service.`,
    detail: match => `${match.note || 'Mixing service'} — Source: ${match.source}. Transactions with mixers may be flagged by exchanges and regulators.`,
  },
  phishing: {
    icon: Skull,
    color: 'text-red-500',
    bg: 'bg-red-500/15 border-red-500/50',
    headline: () => `This address is linked to phishing.`,
    detail: match => `${match.note || 'Phishing infrastructure'} — Source: ${match.source}. This address is part of a known phishing operation.`,
  },
  burn: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/15 border-orange-500/50',
    headline: () => `This is a burn address.`,
    detail: () => `Funds sent here are permanently destroyed and cannot be recovered. Make sure this is intentional.`,
  },
};

const DEFAULT_CONFIG = {
  icon: AlertTriangle,
  color: 'text-yellow-400',
  bg: 'bg-yellow-500/15 border-yellow-500/50',
  headline: () => `Sentinel has flagged this address.`,
  detail: match => match.note || 'This address has been flagged in our threat intelligence database.',
};

function SentinelMessage({ severity, children }) {
  const prefix = severity === 'critical'
    ? 'Sentinel'
    : 'Sentinel';
  return (
    <div className="flex items-start gap-2 text-xs leading-relaxed">
      <span className="font-bold shrink-0 mt-px">{prefix}:</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * Sentinel — Veyrnox's security advisor for the send flow.
 * Checks the recipient against the local threat intel database instantly.
 * Shows nothing when the address is clean or empty.
 *
 * @param {{ address: string }} props
 */
export default function SecurityAdvisorBanner({ address }) {
  const threats = useMemo(() => {
    if (!address || address.length < 10) return [];
    return lookupThreatSync(address);
  }, [address]);

  if (threats.length === 0) return null;

  const worst = threats.reduce((a, b) => {
    const order = { critical: 3, high: 2, medium: 1 };
    return (order[b.severity] || 0) > (order[a.severity] || 0) ? b : a;
  }, threats[0]);

  const config = CATEGORY_CONFIG[worst.category] || DEFAULT_CONFIG;
  const Icon = config.icon;

  return (
    <div
      className={`rounded-lg border p-3 ${config.bg} animate-in fade-in slide-in-from-top-2 duration-300`}
      role="alert"
      data-testid="sentinel-warning"
    >
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 mt-0.5 ${config.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className={`text-sm font-bold ${config.color}`}>
            {config.headline(address)}
          </p>

          {threats.map((t, i) => (
            <SentinelMessage key={i} severity={t.severity}>
              {(CATEGORY_CONFIG[t.category] || DEFAULT_CONFIG).detail(t)}
            </SentinelMessage>
          ))}

          {worst.severity === 'critical' && (
            <div className="mt-2 pt-2 border-t border-red-500/30">
              <SentinelMessage severity="critical">
                I&apos;m flagging this as critical. You can still proceed, but please know the risks. Your safety is my priority.
              </SentinelMessage>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
