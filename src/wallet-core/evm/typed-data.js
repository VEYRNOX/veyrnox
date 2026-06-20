// EIP-712 typed-data decode, Permit/Permit2/Seaport detection, human summary.
// Pure — no keys, no network calls.

const PERMIT_PRIMARY_TYPES = new Set([
  'Permit', 'PermitSingle', 'PermitBatch',
  'PermitTransferFrom', 'PermitWitnessTransferFrom',
]);
const SEAPORT_PRIMARY_TYPES = new Set(['OrderComponents', 'BulkOrder']);

export function parseTypedData(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { valid: false, error: 'Could not parse typed data' };
  }
  const { types, domain, primaryType, message } = parsed ?? {};
  if (!types || !primaryType || !message) {
    return { valid: false, error: 'Missing required EIP-712 fields (types, primaryType, message)' };
  }
  return { valid: true, types, domain: domain ?? {}, primaryType, message };
}

export function detectAssetAuthorising(parsed) {
  if (!parsed.valid) return { isAssetAuthorising: false, reason: null };
  const pt = parsed.primaryType;
  if (PERMIT_PRIMARY_TYPES.has(pt)) {
    return {
      isAssetAuthorising: true,
      kind: 'permit',
      reason:
        `This is a Permit signature (${pt}). Signing this off-chain message authorises a spender ` +
        `to move your tokens WITHOUT a separate on-chain approval transaction. ` +
        `Malicious dApps use Permit signatures to drain wallets silently.`,
    };
  }
  if (SEAPORT_PRIMARY_TYPES.has(pt)) {
    return {
      isAssetAuthorising: true,
      kind: 'marketplace_order',
      reason:
        `This is a marketplace order (${pt}). Signing commits you to a trade — ` +
        `you may give away tokens or NFTs. Only sign orders you have verified on a trusted marketplace.`,
    };
  }
  return { isAssetAuthorising: false, reason: null };
}

export function describeTypedData(parsed) {
  if (!parsed.valid) return { summary: 'Invalid typed data', fields: [] };
  const { domain, primaryType, message } = parsed;
  return {
    summary: `${primaryType} on ${domain.name ?? 'unknown contract'}`,
    appName: domain.name ?? null,
    chainId: domain.chainId ?? null,
    contract: domain.verifyingContract ?? null,
    primaryType,
    fields: Object.entries(message ?? {}).map(([name, value]) => ({
      name,
      value: String(value),
    })),
  };
}
