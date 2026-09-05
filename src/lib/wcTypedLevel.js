// WalletConnect eth_signTypedData_v4 pre-sign risk plane (M-5, 2026-07-28
// internal audit).
//
// Before this helper existed, `_handleSignTypedData` called
// `presignGateOrReject()` with no `txLevel`, so it defaulted to LEVEL.OK. A
// hostile dApp that pushed an unlimited Permit or any Permit2 payload was
// therefore evaluated by the RASP env plane alone — on a clean device that
// composes to ALLOW, and the signer proceeded silently. The typed-data body
// carried the entire attack (uint256 max allowance, Permit2 primary type) and
// nothing on the WC surface looked at it.
//
// `scoreWcTypedDataLevel` scores that body so `presignGateOrReject` can
// compose it into the pre-sign gate. It mirrors `scoreWcTxLevel`'s shape —
// pure, lazy import-free, fail-closed on parse failure:
//   - Permit2 primary type detected                           → LEVEL.RISK
//   - EIP-2612 Permit carrying an unlimited/near-max value    → LEVEL.RISK
//   - Any other asset-authorising typed data (Permit, Seaport)→ LEVEL.CAUTION
//   - Non-asset-authorising typed data                        → LEVEL.OK
//   - Parse failed / malformed                                → LEVEL.CAUTION
//     (I4 fail-closed — an un-scoreable body must not read as safe. The
//     handler will reject with a parse error a few lines later anyway, but the
//     gate cannot be the thing that passes it through.)
//
// Composed with the RASP tier, LEVEL.RISK → CONFIRM (requires ack; the WC
// surface passes acknowledged=false, so it fails closed) and LEVEL.CAUTION →
// WARN (same). LEVEL.OK preserves the prior behaviour on benign typed data.
//
// SET-BLIND (I3): takes only the raw typed-data payload. No wallet-set handle,
// no network, no keys.

import { LEVEL } from '@/risk/levels';
import { parseTypedData, detectAssetAuthorising } from '@/wallet-core/evm/typed-data.js';

// Permit2 primary types (Uniswap Permit2 contract). Regular EIP-2612 Permit
// uses the bare 'Permit' primary type and is scored separately by allowance
// magnitude.
// All SIX Permit2 primary types. The batch SignatureTransfer pair was missing
// until 2026-09-05; because an unrecognised name falls through to LEVEL.OK and
// OK is the only verdict this surface signs, `PermitBatchTransferFrom` was the
// single Permit-family payload that could be approved. See typed-data.js.
const PERMIT2_PRIMARY_TYPES = new Set([
  'PermitSingle',
  'PermitBatch',
  'PermitTransferFrom',
  'PermitWitnessTransferFrom',
  'PermitBatchTransferFrom',
  'PermitBatchWitnessTransferFrom',
]);

// Same unlimited-allowance detection shape as typed-data.js `isUnlimited`.
// Kept local so the risk score does not depend on an internal export from
// typed-data.js.
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;
const UNLIMITED_BAND = 1_000_000n;

function asBigInt(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) {
    try { return BigInt(v); } catch { return null; }
  }
  if (typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v)) {
    try { return BigInt(v); } catch { return null; }
  }
  return null;
}

function isUnlimited(n) {
  if (n == null || n < 0n) return false;
  return (
    (n <= MAX_UINT256 && n > MAX_UINT256 - UNLIMITED_BAND) ||
    (n <= MAX_UINT160 && n > MAX_UINT160 - UNLIMITED_BAND)
  );
}

// Recursively walk the typed-data message looking for an allowance-shaped
// field whose value is at or near uint256/uint160 max. Depth-guarded against
// pathologically nested untrusted input (mirrors formatTypedValue).
const ALLOWANCE_KEY = /^(value|amount|allowance)$/i;

function hasUnlimitedAllowance(node, depth = 0, key = '') {
  if (node == null || depth >= 6) return false;
  if (typeof node === 'object') {
    if (Array.isArray(node)) {
      return node.some((v) => hasUnlimitedAllowance(v, depth + 1, key));
    }
    return Object.entries(node).some(
      ([k, v]) => hasUnlimitedAllowance(v, depth + 1, k),
    );
  }
  if (!ALLOWANCE_KEY.test(key)) return false;
  const n = asBigInt(node);
  return n != null && isUnlimited(n);
}

// Accepts either the raw typed-data payload (string or object) OR an already-
// parsed `parseTypedData()` result. Callers on the WC signing path already
// need `parsed` for the subsequent chain-id and signer checks, so they parse
// once and pass the result here to avoid double-parsing (and to avoid burning
// through single-shot test mocks of parseTypedData).
export function scoreWcTypedDataLevel(input) {
  let parsed;
  const looksParsed =
    input != null && typeof input === 'object' && 'valid' in input;
  try {
    parsed = looksParsed ? input : parseTypedData(input);
  } catch {
    return LEVEL.CAUTION;
  }
  if (!parsed || !parsed.valid) return LEVEL.CAUTION;

  const primaryType = parsed.primaryType;
  if (typeof primaryType === 'string' && PERMIT2_PRIMARY_TYPES.has(primaryType)) {
    return LEVEL.RISK;
  }

  const authorising = detectAssetAuthorising(parsed) ?? {};
  if (authorising.isAssetAuthorising) {
    if (authorising.kind === 'permit' && hasUnlimitedAllowance(parsed.message)) {
      return LEVEL.RISK;
    }
    return LEVEL.CAUTION;
  }

  return LEVEL.OK;
}
