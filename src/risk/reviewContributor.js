// @ts-nocheck

import { addressesEqualForCurrency } from '@/lib/selfSend';

function isSameAddress(address, candidate, currency) {
  if (!address || !candidate) return false;
  return addressesEqualForCurrency(address, candidate, currency);
}

function firstMatch(items, predicate) {
  for (const item of items || []) {
    if (predicate(item)) return item;
  }
  return null;
}

export function buildReviewContributor({
  recipient = null,
  currency = null,
  history = [],
  knownAddresses = [],
  whitelist = [],
  sessionMeta = null,
} = {}) {
  if (!recipient || !currency) {
    return {
      applicable: false,
      settled: true,
      level: null,
      summary: null,
      evidence: null,
    };
  }

  const whitelistMatch = firstMatch(
    whitelist,
    (entry) => entry?.currency === currency && isSameAddress(recipient, entry?.address, currency),
  );
  if (whitelistMatch) {
    return {
      applicable: true,
      settled: true,
      level: 'OK',
      summary: 'Recipient is explicitly trusted in your allowlist.',
      evidence: {
        kind: 'whitelist',
        address: whitelistMatch.address,
      },
    };
  }

  const contactMatch = firstMatch(
    knownAddresses,
    (entry) => isSameAddress(recipient, entry?.address, currency),
  );
  if (contactMatch) {
    return {
      applicable: true,
      settled: true,
      level: 'OK',
      summary: contactMatch.label
        ? `Recipient matches ${contactMatch.label}.`
        : 'Recipient matches a saved or previously used counterparty.',
      evidence: {
        kind: 'known_counterparty',
        address: contactMatch.address,
        label: contactMatch.label ?? null,
      },
    };
  }

  const priorSend = firstMatch(
    history,
    (tx) => tx?.type === 'send'
      && tx?.currency === currency
      && isSameAddress(recipient, tx?.to_address, currency),
  );
  if (priorSend) {
    return {
      applicable: true,
      settled: true,
      level: 'OK',
      summary: 'Recipient matches a prior successful send in this wallet set.',
      evidence: {
        kind: 'prior_send',
        address: priorSend.to_address,
        lastSeenAt: priorSend.created_date ?? priorSend.date ?? null,
      },
    };
  }

  const dappName = sessionMeta?.name || 'connected dApp';
  const dappNote = sessionMeta?.url ? ` via ${dappName}` : '';
  return {
    applicable: true,
    settled: true,
    level: 'INFO',
    summary: `This looks like a first-time recipient for this wallet set${dappNote}.`,
    evidence: {
      kind: 'first_time_recipient',
      address: recipient,
      dappName: sessionMeta?.name ?? null,
      dappUrl: sessionMeta?.url ?? null,
    },
  };
}
