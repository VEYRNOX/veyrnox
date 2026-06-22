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

// Render an EIP-712 message value for the human signing prompt. EIP-712 values
// can be bigints, nested structs (objects), or arrays of structs (Permit2
// `details`, Seaport `offer`/`consideration`). Plain String() turns those into
// "[object Object]", hiding exactly what the user is authorising — so recurse
// into containers, stringify bigints, and depth-guard against pathologically
// nested untrusted input.
function formatTypedValue(value, depth = 0) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return String(value);
  if (depth >= 6) return '…';
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatTypedValue(v, depth + 1)).join(', ')}]`;
  }
  return `{ ${Object.entries(value)
    .map(([k, v]) => `${k}: ${formatTypedValue(v, depth + 1)}`)
    .join(', ')} }`;
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
      value: formatTypedValue(value),
    })),
  };
}
