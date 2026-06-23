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
        `Permit signature (${pt}): signing lets a spender move your tokens with no on-chain ` +
        `approval — a common silent wallet-drain. Only sign if you trust this app.`,
    };
  }
  if (SEAPORT_PRIMARY_TYPES.has(pt)) {
    return {
      isAssetAuthorising: true,
      kind: 'marketplace_order',
      reason:
        `Marketplace order (${pt}): signing can give away your tokens or NFTs. ` +
        `Only sign on a marketplace you trust.`,
    };
  }
  return { isAssetAuthorising: false, reason: null };
}

// "Unlimited" allowance detection. ERC-20/Permit `value` is uint256; Permit2
// `amount` is uint160. dApps request the type max (or just below it) to mean
// "infinite" — the single most dangerous thing a Permit can hide behind a long
// opaque number. No legitimate amount, nonce, deadline, or chainId is anywhere
// near these magnitudes (~1.5e48 / ~1.2e77), so a value-based check is safe.
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;
const UNLIMITED_BAND = 1_000_000n; // tolerance below each type max
const DATE_KEY = /(deadline|expir|validuntil|validafter|starttime|endtime|sigdeadline)/i;

function asBigInt(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) { try { return BigInt(v); } catch { return null; } }
  return null;
}
function isUnlimited(n) {
  if (n == null || n < 0n) return false;
  return (n <= MAX_UINT256 && n > MAX_UINT256 - UNLIMITED_BAND)
    || (n <= MAX_UINT160 && n > MAX_UINT160 - UNLIMITED_BAND);
}
// Format a scalar leaf, surfacing the two things a Permit hides: an unlimited
// allowance, and an opaque unix-timestamp deadline. Keeps the raw value alongside
// the human form so nothing is obscured.
function formatScalar(value, key) {
  const n = asBigInt(value);
  if (n != null) {
    if (isUnlimited(n)) return `UNLIMITED (${n.toString()})`;
    if (DATE_KEY.test(key) && n >= 1_000_000_000n && n <= 10_000_000_000n) {
      try { return `${new Date(Number(n) * 1000).toISOString().slice(0, 10)} (${n.toString()})`; } catch { /* fall through */ }
    }
  }
  if (typeof value === 'bigint') return value.toString();
  return String(value);
}

// Render an EIP-712 message value for the human signing prompt. EIP-712 values
// can be bigints, nested structs (objects), or arrays of structs (Permit2
// `details`, Seaport `offer`/`consideration`). Plain String() turns those into
// "[object Object]", hiding exactly what the user is authorising — so recurse
// into containers, flag unlimited allowances, format dates, and depth-guard
// against pathologically nested untrusted input. `key` carries the field name
// (incl. nested) so amount/deadline fields can be surfaced.
function formatTypedValue(value, depth = 0, key = '') {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'object') {
    if (depth >= 6) return '…';
    if (Array.isArray(value)) {
      return `[${value.map((v) => formatTypedValue(v, depth + 1, key)).join(', ')}]`;
    }
    return `{ ${Object.entries(value)
      .map(([k, v]) => `${k}: ${formatTypedValue(v, depth + 1, k)}`)
      .join(', ')} }`;
  }
  return formatScalar(value, key);
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
      value: formatTypedValue(value, 0, name),
    })),
  };
}
