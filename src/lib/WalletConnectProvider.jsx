// @ts-nocheck
// ponytail: 964 LOC (as of 2026-08-16) intentionally NOT split. Kept unified
// for security-critical review continuity — the pre-sign RASP gate composition
// (H-1 fix, browserProbeSource + attestation), session lifecycle, and event
// routing all coexist so an auditor can trace a single WC event end-to-end
// without hopping helpers. A mechanical split risks reordering the async
// probe/gate composition the H-1 remediation depends on.
// React context for WalletConnect state.
// Holds pending proposals, pending requests, and active sessions.
// Routes all signing through WalletProvider's withPrivateKey() — never holds keys.
//
// RASP H-1 (issue #950, 2026-07-14). presignGateOrReject() used to read ONLY
// browserProbeSource, which on a native Capacitor WebView reports
// rooted/emulator/tampered = false and resolves CLEAN → ALLOW. That was the same
// fail-open class as C-01 (already fixed on the Send path via
// selectPresignProbeSource + attestation compose). This handler is invoked by a
// WC event — not React render — so useRaspArtifact cannot be used. Instead the
// gate is now ASYNC and awaits both the native OS probe and the remote-attestation
// probe AT GATE TIME with a bounded fail-closed timeout (RASP_ASYNC_PROBE_TIMEOUT_MS)
// so an in-flight bridge call cannot silently allow. During the async window
// (throw / timeout / not-yet-sampled) the source is treated as UNAVAILABLE
// (INTEGRITY_UNAVAILABLE → WARN → RASP_WARN_REJECTED); the signer is never
// reached under WARN/BLOCK. I3-preserving: attestationProbeSource() already
// checks isDeniabilitySessionActive() FIRST inside its own body — no set handle
// is introduced here (byte-identical real/decoy).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Capacitor } from '@capacitor/core';
import {
  initWalletConnect,
  onWalletConnectEvent,
  getActiveSessions,
  destroyWalletConnect,
  isWalletConnectConfigured,
  approveSession,
  rejectSession,
  respondToRequest,
  rejectRequest,
  disconnectSession,
  pairWithDapp,
} from '@/wallet-core/evm/walletconnect/session.js';
import { classifyRequest, isBlocked, REQUEST_TYPES } from '@/wallet-core/evm/walletconnect/router.js';
import { parseTypedData, detectAssetAuthorising, describeTypedData } from '@/wallet-core/evm/typed-data.js';
import { getProvider } from '@/wallet-core/evm/provider.js';
import { getNetworkByChainId } from '@/wallet-core/evm/networks.js';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletProvider.jsx';
import { presignGate } from '@/sign-gate/presign';
import { LEVEL } from '@/risk/levels';
import { scoreWcTypedDataLevel } from '@/lib/wcTypedLevel';
import { buildWcTransactionIntelligence } from '@/risk/walletConnectIntel.js';
import { buildReviewContributor } from '@/risk/reviewContributor.js';
import { readRemoteScreenPreference } from '@/lib/remoteScreenPreference.js';

// #1093 — WC pre-sign tx-risk plane. Risk-signal modules (`@/risk/signals` and
// `@/risk/calldata`) instantiate an ethers Interface at MODULE INIT time, so a
// static top-level import would crash sibling test files that fully-mock ethers
// without `Interface`. `scoreWcTxLevel` therefore lazy-imports the risk stack
// only when the SEND handler actually runs; a load or scoring failure falls
// back to LEVEL.CAUTION (I4 fail-closed).
//
// Signal subset (MINIMUM VIABLE for the WC surface): the WC handler has no
// recipientCode (S7), ENS (S5), UTXO (S6), send-history (S1/S8), or whitelist
// (S3) inputs — feeding empty/undefined would fail-closed CAUTION on every
// plain send. So we run only the two signals the audit brief called out:
//   S2 unlimited-approval — pure calldata; catches approve(_, MAX_UINT256).
//   S4 address-poisoning  — needs `counterparties`; empty today so always OK,
//                           but wired for a future address-book pass.
// A non-approve, non-lookalike send composes txLevel=LEVEL.OK, and the RASP
// env plane is the sole determinant (previous behaviour preserved).
export async function scoreWcTxLevel(txParams, caip2ChainId, evmAddress = null, remoteScreenEnabled = false) {
  const intel = await buildWcTransactionIntelligence({
    txParams,
    caip2ChainId,
    evmAddress,
    remoteScreenEnabled,
  });
  return intel?.txLevel ?? LEVEL.CAUTION;
}
import {
  detect,
  degrade,
  browserProbeSource,
  nativeProbeSource,
  selectPresignProbeSource,
  attestationProbeSource,
  detectAttestation,
  composeConditions,
  ATTESTATION_ENABLED,
  TIER,
  FRESH_PROBE_TIMEOUT_MS,
} from '@/rasp';
import { DEMO } from '@/api/demoClient';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';
import { trackEvent, EVENT } from '@/api/trackEvent';
import { evaluateSendAgainstLimits } from '@/lib/txLimits';
import { USD_RATES } from '@/lib/cryptos';
// M-6: the per-chain VERIFIED token registry (address + decimals). Data only —
// no ethers Interface at module init, so it is safe to import statically here.
import { TOKENS } from '@/wallet-core/evm/tokens.js';

// L-1 (PR #962): use the shared constant from getFreshRaspArtifact so the
// Send-path and WC-path stay in sync with a single source of truth.
const RASP_ASYNC_PROBE_TIMEOUT_MS = FRESH_PROBE_TIMEOUT_MS;

const UNAVAILABLE_SOURCE = Object.freeze({ available: false });

// Race a probe promise against a fail-closed timeout. NEVER fabricates a clean
// result: on throw or timeout the source is UNAVAILABLE, which detect() /
// detectAttestation() both map to INTEGRITY_UNAVAILABLE (→ WARN via degrade).
function withFailClosedTimeout(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(UNAVAILABLE_SOURCE);
    }, ms);
    Promise.resolve(promise)
      .then((v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); })
      .catch(() => { if (done) return; done = true; clearTimeout(timer); resolve(UNAVAILABLE_SOURCE); });
  });
}

// audit-H8: pure address validator for personal_sign. Exported for unit tests.
// personal_sign params are [hexMessage, address]; some legacy dApps reverse the
// order. Signing params[0] without verifying params[1] = wallet address would sign
// address bytes as the message if the order is flipped.
export function assertPersonalSignAddress(addrParam, walletAddress) {
  if (!addrParam || !walletAddress) {
    throw new Error(
      `personal_sign address mismatch: request targets ${addrParam ?? '(none)'} but active address is ${walletAddress ?? '(none)'}. Refusing to sign.`,
    );
  }
  if (addrParam.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error(
      `personal_sign address mismatch: request targets ${addrParam} but active address is ${walletAddress}. Refusing to sign.`,
    );
  }
}

const WalletConnectCtx = createContext(null);

// M9 (gas cap), F-02-GASCAP (per-chain maxFeePerGas ceiling) and L-2 (priority-fee
// clamp) now live in wallet-core/evm/walletconnect/fee.js, and are re-exported
// here so every existing import and test site is unchanged.
//
// They were moved (audit 2026-08-03 H-7) because the approval modal has to show
// the user the worst-case fee these caps permit, and it must compute that from
// the SAME helpers that enforce it — but the modal's test suite mocks this whole
// module, so importing them from here would have forced a hand-inlined copy into
// a test file. That copy is exactly the display-vs-enforcement drift the fee row
// exists to close.
// Imported (not just re-exported) because this module calls them internally when
// building the transaction — `export … from` would not create local bindings.
import {
  WC_GAS_CAP,
  resolveGasLimit,
  resolveMaxFeePerGas,
  resolveMaxPriorityFeePerGas,
  resolveWcWorstCaseFeeWei,
} from '@/wallet-core/evm/walletconnect/fee.js';

export {
  WC_GAS_CAP,
  resolveGasLimit,
  resolveMaxFeePerGas,
  resolveMaxPriorityFeePerGas,
  resolveWcWorstCaseFeeWei,
};

// H8 — resolve which personal_sign param is the message and bind the address
// param to the wallet's own EVM address. EIP-1474 specifies [message, address]
// but MetaMask-legacy dApps send [address, message] (reversed). If we blindly
// signed params[0] a reversed payload would sign the address bytes, and a
// payload naming a foreign address would let a dApp obtain a signature it
// attributes to someone else. Fail closed (I4) before the key is touched.
//
// Returns { ok: true, message } or { ok: false, code }.
export function resolvePersonalSignMessage(params, ownAddress) {
  if (!ownAddress) return { ok: false, code: 'PERSONAL_SIGN_NO_WALLET' };
  let own;
  try {
    own = ethers.getAddress(ownAddress);
  } catch {
    return { ok: false, code: 'PERSONAL_SIGN_NO_WALLET' };
  }

  const arr = Array.isArray(params) ? params : [];
  // Find the index whose value is a valid EVM address equal to our own address.
  const isOwn = (v) => {
    if (typeof v !== 'string') return false;
    try {
      return ethers.getAddress(v) === own;
    } catch {
      return false;
    }
  };

  if (isOwn(arr[1])) {
    // EIP-1474 order [message, ownAddress].
    return { ok: true, message: arr[0] };
  }
  if (isOwn(arr[0])) {
    // MetaMask-legacy order [ownAddress, message] — swap.
    return { ok: true, message: arr[1] };
  }
  return { ok: false, code: 'PERSONAL_SIGN_ADDRESS_MISMATCH' };
}

// M11 — enforce WalletConnect session expiry client-side. The session's `expiry`
// (Unix seconds) is displayed in ActiveSessions but was never enforced on the
// signing path: a session past its expiry kept producing signatures and sending
// transactions. Gate every signing handler through this BEFORE the key is touched
// (fail closed, I4). A missing or non-numeric expiry is treated as expired.
//
// Returns { ok: true } or { ok: false, code }.
export function checkSessionExpiry(session, nowMs = Date.now()) {
  if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' };
  const expiry = session.expiry;
  if (typeof expiry !== 'number' || !Number.isFinite(expiry)) {
    return { ok: false, code: 'SESSION_EXPIRED' };
  }
  if (expiry * 1000 <= nowMs) return { ok: false, code: 'SESSION_EXPIRED' };
  return { ok: true };
}

// C3 — the RASP pre-sign gate the audit requires on EVERY WalletConnect signing
// handler. These module-level pure functions encapsulate the gate + per-method
// validation so they are unit-testable in isolation (the component closures below
// are thin delegators). txLevel is null for WC signing (no in-app risk score);
// acknowledged is true because the user confirmed in the WC modal before the
// handler runs. A blocked gate rejects the request and NEVER reaches
// withPrivateKey (fail closed, I4).
// Coerce an EIP-712 / CAIP-2 chain id (number, bigint, decimal or 0x-hex string)
// to a finite integer, or null when it cannot be interpreted. Pure.
function toNumericChainId(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
    if (/^\d+$/.test(s)) return parseInt(s, 10);
  }
  return null;
}

// F-07-WC — resolve the CAIP-2 chain a request must be bound to EXCLUSIVELY from
// the live session store (getActiveSessions()), never from a React prop that a
// caller could pass stale/wrong. Given the session found by topic and the
// per-request CAIP-2 (from the WC event), return the CAIP-2 to bind against:
//   - the request chain must be one the session actually approved, else null
//     (fail closed, I4 — an unbound/foreign chain must not produce a signature);
//   - when the request omits a chain but the session approved exactly one, use it.
// `session.namespaces.eip155.chains` is the authoritative approved-chain list.
// Pure; exported for unit tests.
export function resolveSessionCaip2(session, requestCaip2) {
  const approved = session?.namespaces?.eip155?.chains;
  if (!Array.isArray(approved) || approved.length === 0) return null;
  if (typeof requestCaip2 === 'string' && requestCaip2.length > 0) {
    return approved.includes(requestCaip2) ? requestCaip2 : null;
  }
  return approved.length === 1 ? approved[0] : null;
}

// M-6 (weekly audit 2026-08-25, carried from M-5 2026-08-17) — value an outgoing
// WC transaction for the SPEND-LIMIT axis.
//
// The gate used to read `txParams.value` alone, so an ERC-20 `transfer` — which
// carries value 0x0 and puts the amount in calldata — scored $0 against even an
// `ALL` cap. Nothing downstream compensated: the WC risk registry is S2
// (unlimited approval) + S4 (poisoning) only, so no signal values a plain token
// transfer, and the review contributor's level does not feed the verdict level.
//
// Decoded by hand rather than through calldata.js's `describeErc20Call`: that
// module instantiates an ethers `Interface` at MODULE INIT, and several WC test
// surfaces mock `ethers` without `Interface` (the same constraint documented for
// the risk stack at :58). Both shapes are fixed-width, so hex slicing is exact.
const ERC20_TRANSFER = '0xa9059cbb';      // transfer(address,uint256)
const ERC20_TRANSFER_FROM = '0x23b872dd'; // transferFrom(address,address,uint256)
const WORD = 64;                          // one abi word, in hex chars

/** Resolve a `to` address against the chain's VERIFIED token registry. Pure. */
function lookupRegistryToken(networkKey, address) {
  const table = TOKENS[networkKey];
  if (!table || typeof address !== 'string') return null;
  const want = address.toLowerCase();
  for (const t of Object.values(table)) {
    if (t.address.toLowerCase() === want) return t;
  }
  return null;
}

/**
 * What this transaction should be scored as spending, for the limit gate.
 *
 * Returns { valued: true, amount, currency } when the outgoing value is known,
 * or { valued: false, reason } when it is an ERC-20 transfer we CANNOT value —
 * an unregistered token (unknown decimals ⇒ unknown magnitude) or truncated
 * calldata. An unvaluable transfer must be treated as OVER limit, never as $0
 * (I4); the caller decides, this helper only refuses to guess.
 *
 * Calldata that is not one of the two transfer shapes (a swap, an approve, an
 * arbitrary contract call) is valued on the native `value` as before: it moves
 * no token balance NOW, and the approval case is what S2 exists for.
 *
 * `transferFrom` is valued regardless of whose `from` it names. Over-blocking a
 * third-party pull is the safe direction; under-scoring our own is not.
 *
 * Pure; exported for unit tests.
 */
export function resolveWcSpendAmount(txParams, net) {
  const data = typeof txParams?.data === 'string' ? txParams.data.toLowerCase() : '0x';
  const selector = data.slice(0, 10);
  const isTransfer = selector === ERC20_TRANSFER;
  const isTransferFrom = selector === ERC20_TRANSFER_FROM;

  if (isTransfer || isTransferFrom) {
    // transfer: 4-byte selector + 2 words. transferFrom: + 3 words. The amount
    // is always the LAST word. Anything shorter cannot be decoded honestly.
    const words = isTransfer ? 2 : 3;
    if (data.length < 10 + words * WORD) {
      return { valued: false, reason: 'ERC20_CALLDATA_MALFORMED' };
    }
    const token = lookupRegistryToken(net?.key, txParams?.to);
    if (!token) return { valued: false, reason: 'ERC20_TOKEN_UNKNOWN' };
    let raw;
    try {
      raw = BigInt(`0x${data.slice(10 + (words - 1) * WORD, 10 + words * WORD)}`);
    } catch {
      return { valued: false, reason: 'ERC20_CALLDATA_MALFORMED' };
    }
    return {
      valued: true,
      amount: Number(raw) / 10 ** token.decimals,
      currency: token.symbol,
    };
  }

  let amount = 0;
  if (txParams?.value != null && txParams.value !== '0x' && txParams.value !== '0x0') {
    // wei → native units, safe for values up to ~9e6 ETH.
    amount = Number(BigInt(txParams.value)) / 1e18;
  }
  return { valued: true, amount, currency: net?.symbol };
}

/** True if the user has ANY enabled cap that a send could breach. Pure. */
function hasEnabledSpendLimit(limits) {
  return Array.isArray(limits) && limits.some(
    (l) => l && l.enabled && (l.per_transaction_limit != null || l.daily_limit != null),
  );
}

// RASP-A3 (2026-07-05 internal audit, MEDIUM): the WalletConnect signing path has
// NO interactive UI surface to render a WARN friction dialog. The Send UI's RASP-3
// fix lets WARN/CONFIRM proceed ONLY with the user's explicit "sign anyway" tap;
// there is no such tap here. Previously this passed acknowledged=true unconditionally
// to presignGate, which made WARN and CONFIRM auto-proceed — silently bypassing the
// friction the RASP-3 fix requires. Fail closed (I4): the WC path NEVER trusts an
// acknowledgement. Only a clean ALLOW tier proceeds; every non-ALLOW tier (WARN,
// CONFIRM, BLOCK) rejects the request before the key is touched.
//
// Returns { proceedAllowed, rejectCode }. rejectCode is the code the caller passes to
// rejectRequest when proceedAllowed is false: RASP_BLOCK for a hard BLOCK, else
// RASP_WARN_REJECTED (WARN/CONFIRM cannot be acknowledged on this surface).
// RASP H-1 (issue #950): native-aware, async, fail-closed pre-sign gate.
// On native, awaits the OS-level probe (nativeProbeSource) and the
// remote-attestation verdict (attestationProbeSource) AT GATE TIME with a
// bounded timeout. selectPresignProbeSource never falls back to the browser
// leg's CLEAN on native (C-01), and detectAttestation fails closed to
// INTEGRITY_UNAVAILABLE on unavailable / thrown / timed-out verdicts. On web
// the browser leg is used exactly as before.
async function presignGateOrReject(txLevel = LEVEL.OK) {
  let tier;
  try {
    const isNative = Capacitor.isNativePlatform();
    // Kick off both async legs in parallel. Each is fail-closed by construction
    // (the source functions themselves return {available:false} on throw), and
    // wrapped in a fail-closed timeout so an in-flight bridge cannot silently
    // allow. On web the OS/attestation legs are not sampled — the browser leg
    // is the source of truth off-device.
    const [nativeSource, attestationResult] = await Promise.all([
      isNative
        ? withFailClosedTimeout(nativeProbeSource(), RASP_ASYNC_PROBE_TIMEOUT_MS)
        : Promise.resolve(null),
      isNative && ATTESTATION_ENABLED
        ? withFailClosedTimeout(attestationProbeSource(), RASP_ASYNC_PROBE_TIMEOUT_MS)
        : Promise.resolve(null),
    ]);
    // NATIVE: OS leg only (browser CLEAN is meaningless here — C-01). ATTESTATION
    // is composed via composeConditions so the STRONGER (more dangerous) leg wins:
    // e.g. CLEAN native ∘ INTEGRITY_FAIL attestation → INTEGRITY_FAIL (BLOCK).
    // Attestation is set-blind: attestationProbeSource() checks
    // isDeniabilitySessionActive() FIRST inside its own body (I3 — decoy makes
    // zero egress). No wallet-set handle is passed or accepted here.
    const osCondition = detect(
      selectPresignProbeSource(isNative, nativeSource, browserProbeSource),
    );
    const attestCondition = detectAttestation(attestationResult);
    const artifact = degrade(composeConditions(osCondition, attestCondition));
    // I4 fail-closed on shape drift: an artifact with no tier maps to BLOCK, not
    // ALLOW (RASP-A2 discipline — absence of a clean signal is not a clean signal).
    tier = artifact?.tier ?? TIER.BLOCK;
  } catch {
    // Total failure in the detection chain → strongest BLOCK, signer unreachable.
    tier = TIER.BLOCK;
  }
  // #1093 — txLevel is now composed from a real WC-scoped tx-risk score (see
  // WC_TX_RISK_SIGNALS and _handleSendTransaction). Passing LEVEL.OK is still
  // honest for the signing paths that have no tx plane at all (personal_sign,
  // eth_signTypedData_v4): those callers omit txLevel and get the default.
  //
  // acknowledged=false: the WC path has no interactive surface to obtain a real
  // "sign anyway" tap, so it must never present one. Only a clean ALLOW passes;
  // WARN/CONFIRM/BLOCK do not (fail closed, I4).
  const gate = presignGate(tier, txLevel, false);
  if (gate.proceedAllowed) return { proceedAllowed: true, rejectCode: null };
  // Attribute the reject to the owning plane so the reject code is truthful:
  //   owner==='tx' → the tx-risk plane blocked (S2 unlimited approval, S4 poison,
  //     …): TX_RISK_REJECTED — the WC surface cannot obtain "sign anyway".
  //   hard BLOCK (signer unreachable) → RASP_BLOCK.
  //   otherwise WARN/CONFIRM owned by the RASP plane → RASP_WARN_REJECTED.
  let rejectCode;
  if (!gate.signerReachable) rejectCode = 'RASP_BLOCK';
  else if (gate.owner === 'tx') rejectCode = 'TX_RISK_REJECTED';
  else rejectCode = 'RASP_WARN_REJECTED';
  return { proceedAllowed: false, rejectCode };
}

export async function _handlePersonalSign({ withPrivateKey, evmAddress }, topic, id, params) {
  const gate = await presignGateOrReject();
  if (!gate.proceedAllowed) {
    await rejectRequest(topic, id, gate.rejectCode).catch(() => {});
    return;
  }
  // H-1 (#745) — a null/absent wallet address means we CANNOT bind the signing
  // address to our own wallet, so we must not sign at all. Reject before touching
  // the key (fail closed, I4), identical to the address-present-but-mismatched
  // path below. Previously the else branch signed arr[0] with zero verification.
  if (!evmAddress) {
    await rejectRequest(topic, id, 'PERSONAL_SIGN_ADDRESS_MISMATCH').catch(() => {});
    throw new Error(
      `Rejected personal_sign [PERSONAL_SIGN_ADDRESS_MISMATCH]: no active wallet ` +
      `address to bind the signature to. ` +
      `Veyrnox will not sign a message without a verified address.`,
    );
  }

  const arr = Array.isArray(params) ? params : [];
  // H8 — resolve which param is the message and bind the address param to our
  // own wallet (EIP-1474 [message, address] vs MetaMask-legacy [address,
  // message]). Reject (fail closed, I4) if no param is our own address.
  const own = evmAddress.toLowerCase();
  const isOwn = (v) =>
    typeof v === 'string' && ethers.isAddress(v) && v.toLowerCase() === own;
  let hexMsg;
  if (isOwn(arr[1])) {
    hexMsg = arr[0]; // EIP-1474 order [message, ownAddress]
  } else if (isOwn(arr[0])) {
    hexMsg = arr[1]; // MetaMask-legacy order [ownAddress, message]
  } else {
    await rejectRequest(topic, id, 'PERSONAL_SIGN_ADDRESS_MISMATCH').catch(() => {});
    throw new Error(
      `Rejected personal_sign [PERSONAL_SIGN_ADDRESS_MISMATCH]: the signing ` +
      `address does not match this wallet (address mismatch). ` +
      `Veyrnox will not sign a message bound to a different address.`,
    );
  }
  const sig = await withPrivateKey(0, async (pk) => {
    const wallet = new ethers.Wallet(pk);
    return wallet.signMessage(ethers.getBytes(hexMsg));
  });
  await respondToRequest(topic, id, sig);
}

export async function _handleSignTypedData({ withPrivateKey, evmAddress }, topic, id, params, sessionCaip2) {
  // M-5 (2026-07-28 internal audit): score the typed-data body BEFORE the
  // pre-sign gate so unlimited Permit / Permit2 payloads compose to
  // CONFIRM/WARN (fail closed) instead of relying on the RASP env plane
  // alone. Pure, no signer touched. See src/lib/wcTypedLevel.js. Parse once
  // here and reuse for the H7 chain-id and address checks below — a second
  // parseTypedData() would burn through single-shot test mocks AND cost a
  // redundant JSON.parse on every real request.
  const typedDataJson = params?.[1] ?? params?.[0];
  const parsed = parseTypedData(typedDataJson);
  const typedLevel = scoreWcTypedDataLevel(parsed);
  const gate = await presignGateOrReject(typedLevel);
  if (!gate.proceedAllowed) {
    await rejectRequest(topic, id, gate.rejectCode).catch(() => {});
    return;
  }

  // #1092 — bind params[0] (the signer address per eth_signTypedData_v4) to
  // the active EVM address. A dApp naming a foreign address would otherwise
  // receive a signature attributed to our active key. Fail closed (I4): an
  // absent evmAddress or params[0] cannot be bound, so both reject.
  const ownAddr = typeof evmAddress === 'string' ? evmAddress.toLowerCase() : null;
  const signerParam = typeof params?.[0] === 'string' ? params[0].toLowerCase() : null;
  if (!ownAddr || !signerParam || ownAddr !== signerParam) {
    await rejectRequest(topic, id, 'TYPED_DATA_ADDRESS_MISMATCH').catch(() => {});
    throw new Error(
      `Rejected typed-data signature [TYPED_DATA_ADDRESS_MISMATCH]: request ` +
      `targets ${params?.[0] ?? '(none)'} but active address is ${evmAddress ?? '(none)'}. ` +
      `Veyrnox will not sign typed data bound to a different address.`,
    );
  }

  // `parsed` was produced above (M-5) so the risk score, chain-id bind, and
  // signer all share ONE parseTypedData() call.
  if (!parsed.valid) throw new Error(`Invalid typed data: ${parsed.error}`);

  // H7 — bind the EIP-712 domain.chainId to the WalletConnect SESSION chain.
  // Fail closed (I4): when the session chain is known, the typed data MUST carry
  // a matching domain.chainId. A domain with no chainId cannot be bound to this
  // session, so it is rejected rather than signed — an unbound signature could be
  // replayed on another chain. Computed inline (pure) so the gate does not depend
  // on a separately-imported helper.
  const sessionChainId = toNumericChainId(
    typeof sessionCaip2 === 'string' ? sessionCaip2.split(':')[1] : null,
  );
  if (sessionChainId == null) {
    await rejectRequest(topic, id, 'SESSION_CHAINID_INVALID').catch(() => {});
    throw new Error(
      `Rejected typed-data signature [SESSION_CHAINID_INVALID]: this connection has no valid chain. ` +
      `Veyrnox will not produce a signature valid on a different chain.`,
    );
  }
  const rawDomainChainId = parsed?.domain?.chainId;
  const domainChainId = rawDomainChainId != null ? toNumericChainId(rawDomainChainId) : null;
  if (domainChainId == null || domainChainId !== sessionChainId) {
    await rejectRequest(topic, id, 'CHAIN_ID_MISMATCH').catch(() => {});
    throw new Error(
      `Rejected typed-data signature [CHAIN_ID_MISMATCH]: domain.chainId (${rawDomainChainId ?? '(absent)'}) ` +
      `does not match this connection's chain (${sessionChainId}). ` +
      `Veyrnox will not produce a signature valid on a different chain.`,
    );
  }

  const { EIP712Domain: _ignored, ...typesWithoutDomain } = parsed.types;
  const sig = await withPrivateKey(0, async (pk) => {
    const wallet = new ethers.Wallet(pk);
    return wallet.signTypedData(parsed.domain, typesWithoutDomain, parsed.message);
  });
  await respondToRequest(topic, id, sig);
}

export async function _handleSendTransaction(
  { withPrivateKey, evmAddress, actionPasswordConfigured = false, txLimits = [], history = [], knownAddresses = [], whitelist = [], usdRates = USD_RATES, remoteScreenEnabled = false },
  topic, id, params, caip2ChainId,
) {
  const txParams = params[0] ?? {};

  // #1093 — compose a real tx-risk txLevel BEFORE calling the pre-sign gate,
  // so unlimited approvals (and future poison-address hits) drive presignGate
  // → CONFIRM/BLOCK. Pure: no network, no signer, no seed. Failures fall back
  // to CAUTION (I4 fail-closed) — the WC surface has no "sign anyway" ack.
  const intel = await buildWcTransactionIntelligence({
    txParams,
    caip2ChainId,
    evmAddress,
    remoteScreenEnabled,
    history,
    knownAddresses,
    whitelist,
  });
  const txLevel = intel?.txLevel ?? LEVEL.CAUTION;

  // RASP + tx compose gate. Kept BEFORE the from-binding so a WARN/BLOCK-tier
  // environment (or a tx-owned RISK) is reported by the appropriate code even
  // when the request also happens to have a foreign / missing `from`.
  const gate = await presignGateOrReject(txLevel);
  if (!gate.proceedAllowed) {
    await rejectRequest(topic, id, gate.rejectCode).catch(() => {});
    return;
  }

  // #1091 — bind txParams.from to the active EVM address. A dApp requesting a
  // send FROM a foreign address, or omitting `from` entirely, MUST reject
  // before the key is touched. Mirrors H8 for personal_sign. Fail closed (I4):
  // an absent evmAddress cannot be bound to anything, so it also rejects.
  const ownAddr = typeof evmAddress === 'string' ? evmAddress.toLowerCase() : null;
  const fromAddr = typeof txParams.from === 'string' ? txParams.from.toLowerCase() : null;
  if (!ownAddr || !fromAddr || ownAddr !== fromAddr) {
    await rejectRequest(topic, id, 'SEND_ADDRESS_MISMATCH').catch(() => {});
    throw new Error(
      `Rejected transaction [SEND_ADDRESS_MISMATCH]: request targets ` +
      `${txParams.from ?? '(none)'} but active address is ${evmAddress ?? '(none)'}. ` +
      `Veyrnox will not broadcast from a foreign address.`,
    );
  }

  const chainId = parseInt(caip2ChainId.replace(/^eip155:/, ''), 10);
  const net = getNetworkByChainId(chainId);

  // #1090 — Action Password 2FA gate. The in-app Send flow requires the second
  // factor at the sign chokepoint (see sendGate.js §6b). The WC surface has NO
  // in-band affordance to collect the Action Password mid-flow; the honest
  // fail-closed path (I4) is to REJECT so the user routes through the in-app
  // Send screen where the full 2FA dance runs. Never bypass.
  if (actionPasswordConfigured === true) {
    await rejectRequest(topic, id, 'WC_TWO_FACTOR_REQUIRED').catch(() => {});
    throw new Error(
      `Rejected transaction [WC_TWO_FACTOR_REQUIRED]: an Action Password ` +
      `is configured for this wallet. Complete the send from the in-app ` +
      `Send screen so the second factor can be entered.`,
    );
  }

  // #1090 — spend limit gate. Mirrors the in-app Send flow's evaluation. WC has
  // no acknowledgement affordance, so a breach REJECTS (fail closed, I4).
  //
  // THIS GATE IS THE ONLY THING ENFORCING THE CAP on the WC surface. The comment
  // that used to sit here claimed risk scoring compensated for scoring the
  // native `value` alone; it never did (M-6, see resolveWcSpendAmount for why).
  // So the amount comes from resolveWcSpendAmount, which values BOTH the native
  // field and standard ERC-20 transfer / transferFrom calldata.
  //
  // A transfer that cannot be valued (token outside the verified registry,
  // truncated calldata) is treated as OVER limit while ANY cap is configured —
  // unknown decimals means unknown magnitude AND unknown currency, so any
  // enabled cap could be the one it breaches. It is never scored as $0.
  let limitRejectCode = null;
  try {
    const spend = resolveWcSpendAmount(txParams, net);
    if (!spend.valued) {
      if (hasEnabledSpendLimit(txLimits)) limitRejectCode = 'WC_SEND_UNVALUED_TOKEN';
    } else if (evaluateSendAgainstLimits({
      amount: spend.amount,
      currency: spend.currency,
      usdRates,
      history,
      limits: txLimits,
    }).blocked) {
      limitRejectCode = 'WC_SEND_LIMIT_EXCEEDED';
    }
  } catch {
    // A failure computing the gate is indistinguishable from an unvaluable
    // transfer, so it gets the same treatment: refuse while a cap is configured
    // rather than silently allow. (This path used to be unconditionally
    // fail-open on the limit axis.) With no cap configured there is nothing to
    // breach and nothing to fail closed about.
    if (hasEnabledSpendLimit(txLimits)) limitRejectCode = 'WC_SEND_UNVALUED_TOKEN';
  }
  if (limitRejectCode) {
    await rejectRequest(topic, id, limitRejectCode).catch(() => {});
    throw new Error(
      `Rejected transaction [${limitRejectCode}]: ` +
      (limitRejectCode === 'WC_SEND_UNVALUED_TOKEN'
        ? `this request moves a token Veyrnox cannot value on this chain, so it ` +
          `cannot be checked against your spending caps. `
        : `this send would exceed a configured spending cap. `) +
      `Complete the send from the in-app Send screen so the limit can be ` +
      `reviewed and acknowledged.`,
    );
  }

  const hash = await withPrivateKey(0, async (pk) => {
    const provider = getProvider(net.key);
    // VULN-19 guard: verify the RPC endpoint is actually on the expected chain.
    const onChain = parseInt(await provider.send('eth_chainId', []), 16);
    if (onChain !== chainId) throw new Error(`Chain ID mismatch: expected ${chainId}, got ${onChain}`);

    const wallet = new ethers.Wallet(pk, provider);
    const tx = {
      to: txParams.to,
      value: txParams.value ? BigInt(txParams.value) : 0n,
      data: txParams.data ?? '0x',
    };

    if (txParams.maxFeePerGas) {
      // F-02-GASCAP — clamp the dApp-supplied maxFeePerGas to the per-chain
      // ceiling. Fail closed (I4): if it cannot be parsed, skip setting the fee
      // fields (let ethers/RPC populate them) rather than build a bad tx.
      const cappedMaxFee = resolveMaxFeePerGas(txParams.maxFeePerGas, net.key);
      if (cappedMaxFee != null) {
        tx.maxFeePerGas = cappedMaxFee;
        // L-2 — clamp the priority fee to the capped max fee so it can never
        // exceed it (an invalid EIP-1559 tx / uncapped tip otherwise).
        tx.maxPriorityFeePerGas = resolveMaxPriorityFeePerGas(
          txParams.maxPriorityFeePerGas,
          cappedMaxFee,
        );
        tx.type = 2;
      }
    } else if (txParams.gasPrice) {
      // gasPrice is a legacy (type-0) equivalent of maxFeePerGas; apply the same
      // per-chain ceiling so the type-0 path cannot bypass the cap (F-02-GASCAP).
      const cappedGasPrice = resolveMaxFeePerGas(txParams.gasPrice, net.key);
      if (cappedGasPrice != null) {
        tx.gasPrice = cappedGasPrice;
        tx.type = 0;
      }
    }

    // M9 — cap gas to 1M whether or not the dApp supplied `gas`. When omitted we
    // estimate ourselves and clamp the estimate too, so a dApp can never bypass
    // the cap by leaving `gas` out. If no estimate is available, clamp to the cap.
    const estimatedGas = txParams.gas != null
      ? 0n
      : await provider.estimateGas(tx).catch(() => WC_GAS_CAP);
    tx.gasLimit = resolveGasLimit(txParams.gas, estimatedGas);

    const sent = await wallet.sendTransaction(tx);
    return sent.hash;
  });

  await respondToRequest(topic, id, hash);
}

export function WalletConnectProvider({ children }) {
  // NOTE: lastAuthAt is NOT in the WalletProvider context value (it lives in a
  // private ref: lastAuthAtRef). isSendReauthRequired() is the context-exposed gate
  // that reads it. We expose isSendReauthRequired to the modal instead.
  const { accounts, isUnlocked, isDecoy, isHidden, withPrivateKey, isSendReauthRequired, actionPasswordConfigured } = useWallet();
  const evmAddress = accounts?.[0]?.address ?? null;

  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [pendingProposals, setPendingProposals] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sessions, setSessions] = useState([]);
  // I3: these three queries emit backend traffic carrying real-wallet metadata
  // (counterparty history, saved contacts, whitelist). They must be sealed by the
  // SAME predicate the relay effect below uses (:665) — not by the React flags
  // alone. `isDecoy`/`isHidden` are React state and LAG the module-level
  // deniability flag, so a panic/stealth transition leaves a window in which
  // `setDeniabilitySession(true)` has already fired while these still read false.
  // `isUnlocked` is required too: without it the queries run against a locked
  // vault. Fail closed (I4) — one shared const so the three cannot drift apart.
  const entityQueryEnabled = isUnlocked && !isDecoy && !isHidden && !isDeniabilityOrDemoActive();
  const { data: corpusHistory = [] } = /** @type {{ data: any[] }} */ (useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 100),
    enabled: entityQueryEnabled,
  }));
  const { data: addressBook = [] } = useQuery({
    queryKey: ['address-book'],
    queryFn: () => base44.entities.AddressBook.list(),
    enabled: entityQueryEnabled,
  });
  const { data: whitelist = [] } = useQuery({
    queryKey: ['whitelisted-addresses'],
    queryFn: () => base44.entities.WhitelistedAddress.list(),
    enabled: entityQueryEnabled,
  });
  const knownAddresses = useMemo(() => {
    const out = [];
    for (const tx of corpusHistory) {
      if (tx.to_address) out.push({ address: tx.to_address, label: tx.type === 'send' ? "an address you've paid before" : 'a counterparty in your history', date: tx.created_date });
      if (tx.from_address) out.push({ address: tx.from_address, label: 'a counterparty in your history', date: tx.created_date });
      if (tx.address) out.push({ address: tx.address, label: 'a counterparty in your history', date: tx.created_date });
    }
    for (const c of addressBook) out.push({ address: c.address, label: c.name ? `your saved contact "${c.name}"` : 'a saved contact' });
    for (const w of whitelist) out.push({ address: w.address, label: 'a whitelisted address' });
    return out;
  }, [corpusHistory, addressBook, whitelist]);

  // M11: getActiveSessions() may include sessions whose expiry has passed if the
  // SDK has not yet fired session_expire (e.g. the app was offline). Drop them so
  // the UI never shows — nor lets a request resolve against — a dead session.
  const refreshSessions = useCallback(() => {
    const now = Math.floor(Date.now() / 1000);
    setSessions(getActiveSessions().filter((s) => s.expiry > now));
  }, []);

  useEffect(() => {
    // I3: deniability sessions must make zero backend calls — WC relay WebSocket
    // must not open for decoy or hidden sessions (violates I3 if it does).
    // DEMO: a stale persisted `veyrnox-demo=1` can coexist with a REAL unlocked,
    // non-decoy vault (the known localStorage trap). Demo presents fake data and
    // simulates sends elsewhere, so the WC relay must NOT open here — otherwise a
    // demo facade would front a live relay socket and real dApp signing/broadcast
    // (I2/I3 violation). Fail closed (I4): treat demo like a deniability session.
    if (isDeniabilityOrDemoActive() || !isUnlocked || isDecoy || isHidden || !isWalletConnectConfigured()) return;
    let cancelled = false;
    // I2-WC-RELAY: WC relay opens at unlock time, not pairing. Lazy-init is a TODO (see audit-2026-07-04-internal.md).
    initWalletConnect()
      .then(() => { if (!cancelled) { setInitialized(true); refreshSessions(); } })
      .catch((e) => { if (!cancelled) setError(e.message); });

    const unsub = onWalletConnectEvent((event, data) => {
      if (event === 'session_proposal') {
        setPendingProposals((prev) => [...prev.filter((p) => p.id !== data.id), data]);
      } else if (event === 'session_request') {
        const method = data.params?.request?.method;
        if (isBlocked(method)) {
          const { topic, id } = data;
          rejectRequest(topic, id).catch(() => {});
          const reason = method === 'eth_sign'
            ? 'eth_sign rejected: this method signs arbitrary bytes and is disabled for your safety.'
            : method === 'wallet_switchEthereumChain'
              ? 'wallet_switchEthereumChain is not supported — chain switching is not yet implemented.'
            : `"${method}" is not permitted by Veyrnox.`;
          toast.error(reason);
        } else if (method === 'personal_sign') {
          // H8 pre-modal: reject before showing the approval modal if the requested
          // signer doesn't match the active wallet address. Fail closed (I4) — the user
          // must never be asked to approve signing for a foreign address.
          const reqParams = data.params?.request?.params ?? [];
          const check = resolvePersonalSignMessage(reqParams, evmAddress);
          if (!check.ok) {
            rejectRequest(data.topic, data.id, check.code).catch(() => {});
          } else {
            setPendingRequests((prev) => [...prev.filter((r) => r.id !== data.id), data]);
          }
        } else if (method === 'eth_sendTransaction') {
          // #1091 pre-modal: reject before showing the approval modal if the
          // requested `from` doesn't match the active wallet address. Fail
          // closed (I4) — the user must never be asked to approve a send from
          // a foreign address. Mirrors H8's pre-modal pattern.
          const reqParams = data.params?.request?.params ?? [];
          const txParam = reqParams[0] ?? {};
          const ownAddr = typeof evmAddress === 'string' ? evmAddress.toLowerCase() : null;
          const fromAddr = typeof txParam.from === 'string' ? txParam.from.toLowerCase() : null;
          // L-3 (audit 2026-08-25) pre-modal chain bind. This branch checked
          // `from` and nothing else, while the typed-data branch below already
          // bound the chain — so a chain the session never approved reached the
          // modal and was only caught at sign time (:895). Same helper, same
          // fail-closed shape: an unapproved or ambiguous chain resolves to null.
          const boundCaip2 = resolveSessionCaip2(
            getActiveSessions().find((s) => s.topic === data.topic),
            data.params?.chainId,
          );
          if (!ownAddr || !fromAddr || ownAddr !== fromAddr) {
            rejectRequest(data.topic, data.id, 'SEND_ADDRESS_MISMATCH').catch(() => {});
          } else if (boundCaip2 == null) {
            rejectRequest(data.topic, data.id, 'SESSION_CHAINID_INVALID').catch(() => {});
          } else {
            setPendingRequests((prev) => [...prev.filter((r) => r.id !== data.id), data]);
          }
        } else if (method === 'eth_signTypedData_v4') {
          // H7 pre-modal: reject before showing the modal if domain.chainId mismatches
          // the session chain. Mirrors _handleSignTypedData's chain-binding check.
          // #1092 pre-modal: also reject if params[0] (signer address) doesn't
          // match our active EVM address (mirror H8's address-binding pattern).
          let rejected = false;
          const reqParams = data.params?.request?.params ?? [];
          const ownAddr = typeof evmAddress === 'string' ? evmAddress.toLowerCase() : null;
          const signerParam = typeof reqParams?.[0] === 'string' ? reqParams[0].toLowerCase() : null;
          if (!ownAddr || !signerParam || ownAddr !== signerParam) {
            rejectRequest(data.topic, data.id, 'TYPED_DATA_ADDRESS_MISMATCH').catch(() => {});
            rejected = true;
          }
          // L-2 (audit 2026-08-25): this used JSON.parse where sign time uses
          // parseTypedData (:397). dApps routinely send params[1] as an OBJECT,
          // and JSON.parse(object) stringifies to "[object Object]" and throws —
          // so the catch swallowed it and the chain bind was SKIPPED for every
          // such request. Sign time still rejected CHAIN_ID_MISMATCH, but only
          // after the user had walked a whole approval modal. parseTypedData
          // takes string or object; toNumericChainId matches sign time's
          // coercion so a hex domain.chainId is read identically on both sides.
          // #2076: bind against the approved session chain, not the request's
          // own CAIP-2 string, so an unapproved chain is rejected before the
          // user sees the approval modal.
          if (!rejected) {
            const parsed = parseTypedData(reqParams[1] ?? reqParams[0]);
            // Invalid payload: leave it queued so _handleSignTypedData rejects
            // with the real parse error, exactly as before.
            if (parsed.valid) {
              const domainChainId = toNumericChainId(parsed?.domain?.chainId);
              const sessionCaip2 = resolveSessionCaip2(
                getActiveSessions().find((s) => s.topic === data.topic),
                data.params?.chainId,
              );
              const sessionChainId = toNumericChainId(
                typeof sessionCaip2 === 'string' ? sessionCaip2.split(':')[1] : null,
              );
              if (sessionChainId == null) {
                rejectRequest(data.topic, data.id, 'SESSION_CHAINID_INVALID').catch(() => {});
                rejected = true;
              } else if (domainChainId == null || domainChainId !== sessionChainId) {
                rejectRequest(data.topic, data.id, 'CHAIN_ID_MISMATCH').catch(() => {});
                rejected = true;
              }
            }
          }
          if (!rejected) {
            setPendingRequests((prev) => [...prev.filter((r) => r.id !== data.id), data]);
          }
        } else {
          setPendingRequests((prev) => [...prev.filter((r) => r.id !== data.id), data]);
        }
      } else if (event === 'session_delete' || event === 'session_expire') {
        refreshSessions();
        setPendingRequests((prev) => prev.filter((r) => r.topic !== data.topic));
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [isUnlocked, isDecoy, isHidden, refreshSessions, evmAddress]);

  // Destroy client when wallet locks or transitions into a deniability session (I3).
  // DEMO is treated exactly like a deniability transition: if a live client somehow
  // survives into a demo session (e.g. demo flag flipped after unlock), tear it down
  // so no relay socket or real dApp signing lingers behind the demo facade (I4).
  useEffect(() => {
    if (isDeniabilityOrDemoActive() || !isUnlocked || isDecoy || isHidden) {
      destroyWalletConnect();
      setInitialized(false);
      setPendingProposals([]);
      setPendingRequests([]);
      setSessions([]);
    }
  }, [isUnlocked, isDecoy, isHidden]);

  const handleApproveSession = useCallback(async (proposalId) => {
    const gate = await presignGateOrReject();
    // H-1 (audit 2026-07-20): this read USED to be `gate.blocked` / `gate.sentence`
    // — properties presignGateOrReject has never returned. It returns
    // `{ proceedAllowed, rejectCode }` (see :375/:386), so both were permanently
    // undefined and the check was a no-op: EVERY session approval proceeded
    // regardless of RASP tier, including a hard BLOCK on a rooted/hooked device.
    // Read the same shape the three signing handlers read (fail closed, I4).
    if (!gate.proceedAllowed) {
      throw new Error(`RASP integrity check failed — session refused (${gate.rejectCode})`);
    }
    // L-4 (audit 2026-07-28): session approval must obey the same step-up window
    // as signing. Without this, a coerced/opportunistic attacker within the reauth
    // window could approve a fresh dApp session that then requests signing — the
    // per-request gate exists but the connection itself sidesteps H-NEW-B.
    // Fail closed (I4).
    if (isSendReauthRequired()) {
      throw new Error('Step-up re-auth required — unlock again to approve this connection');
    }
    if (!evmAddress) throw new Error('No wallet address — unlock first');
    const proposal = pendingProposals.find((p) => p.id === proposalId);
    if (!proposal) throw new Error('Proposal not found');
    // Extract requested chains (CAIP-2, e.g. "eip155:1") from required + optional
    // namespaces and parse to integer chain IDs. session.js:approveSession filters
    // these against SUPPORTED_CHAIN_IDS, so unsupported chains drop out there.
    const ns = proposal.params?.requiredNamespaces?.eip155?.chains ?? [];
    const optNs = proposal.params?.optionalNamespaces?.eip155?.chains ?? [];
    const chainIds = [...new Set(
      [...ns, ...optNs].map((c) => parseInt(c.replace(/^eip155:/, ''), 10)),
    )];
    await approveSession(proposalId, evmAddress, chainIds);
    void trackEvent(EVENT.WC_SESSION_APPROVED).catch(() => {});
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
    refreshSessions();
  }, [evmAddress, pendingProposals, refreshSessions, isSendReauthRequired]);

  const handleRejectSession = useCallback(async (proposalId) => {
    await rejectSession(proposalId);
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
  }, []);

  // M11 — every signing handler must call this BEFORE touching the key. It looks
  // up the live session by topic from getActiveSessions() (the authoritative
  // source, not stale React state) and rejects the request + clears it if the
  // session has expired. On rejection it throws so the caller surfaces the error;
  // it never falls through to the signing path (fail closed, I4).
  const assertSessionLive = useCallback(async (topic, id) => {
    const session = getActiveSessions().find((s) => s.topic === topic);
    const check = checkSessionExpiry(session);
    if (check.ok) return;
    // Normalise both SESSION_NOT_FOUND and SESSION_EXPIRED to SESSION_EXPIRED on
    // the wire: from the signer's perspective an absent session is equally dead,
    // and a single fail-closed code keeps the contract simple (I4).
    await rejectRequest(topic, id, 'SESSION_EXPIRED').catch(() => {});
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
    refreshSessions();
    const detail = check.code === 'SESSION_NOT_FOUND'
      ? 'the connection no longer exists'
      : 'this connection has expired';
    throw new Error(
      `Rejected signing request [SESSION_EXPIRED]: ${detail}. ` +
      `Veyrnox will not sign for an expired connection — reconnect the dApp.`,
    );
  }, [refreshSessions]);

  // Sign a personal_sign request. EIP-1474 order is [hexMessage, address] but
  // MetaMask-legacy dApps reverse it to [address, hexMessage]. H8: resolve the
  // message safely and reject (fail closed, I4) if no param is our own address,
  // BEFORE the key is touched.
  const handlePersonalSign = useCallback(async (topic, id, params) => {
    await assertSessionLive(topic, id); // M11
    // H-NEW-B — step-up re-auth check at the signing chokepoint. The UI gate in
    // RequestApprovalModal can be bypassed; this is the authoritative enforcement.
    // Reject and throw before the key is ever touched (fail closed, I4).
    if (isSendReauthRequired()) {
      await rejectRequest(topic, id, 'STEP_UP_REQUIRED').catch(() => {});
      throw new Error('Signing rejected [STEP_UP_REQUIRED]: re-authentication required before signing.');
    }
    await _handlePersonalSign({ withPrivateKey, evmAddress }, topic, id, params);
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, [withPrivateKey, evmAddress, assertSessionLive, isSendReauthRequired]);

  // Sign an eth_signTypedData_v4 request. params: [address, typedDataJson]
  const handleSignTypedData = useCallback(async (topic, id, params, requestCaip2) => {
    await assertSessionLive(topic, id); // M11
    // H-NEW-B — step-up re-auth check at the signing chokepoint (fail closed, I4).
    if (isSendReauthRequired()) {
      await rejectRequest(topic, id, 'STEP_UP_REQUIRED').catch(() => {});
      throw new Error('Signing rejected [STEP_UP_REQUIRED]: re-authentication required before signing.');
    }
    // H7 + F-07-WC — resolve the CAIP-2 chain to bind against EXCLUSIVELY from the
    // live session store (getActiveSessions()), never a React prop/state fallback.
    // resolveSessionCaip2 verifies the per-request chain is one this session
    // actually approved; a mismatch/absent chain yields null → _handleSignTypedData
    // rejects with SESSION_CHAINID_INVALID (fail closed, I4).
    const session = getActiveSessions().find((s) => s.topic === topic);
    const sessionCaip2 = resolveSessionCaip2(session, requestCaip2);
    await _handleSignTypedData({ withPrivateKey, evmAddress }, topic, id, params, sessionCaip2);
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, [withPrivateKey, evmAddress, assertSessionLive, isSendReauthRequired]);

  // Sign and broadcast an eth_sendTransaction request.
  // caip2ChainId: "eip155:11155111" format from the WC session namespace.
  // Gas cap of 1M enforced in both branches — whether the dApp suggests gas or
  // we estimate it ourselves (I5 — backend untrusted).
  const handleSendTransaction = useCallback(async (topic, id, params, caip2ChainId) => {
    await assertSessionLive(topic, id); // M11
    // H-NEW-B — step-up re-auth check at the signing chokepoint (fail closed, I4).
    if (isSendReauthRequired()) {
      await rejectRequest(topic, id, 'STEP_UP_REQUIRED').catch(() => {});
      throw new Error('Signing rejected [STEP_UP_REQUIRED]: re-authentication required before signing.');
    }
    // L-1 + F-07-WC — the requested chain MUST be one this session actually
    // approved. Resolve it EXCLUSIVELY from the live session store (never a
    // caller-supplied prop), mirroring the typed-data path. A chain the session
    // did not approve yields null → reject with SESSION_CHAINID_INVALID before
    // the key is touched (fail closed, I4) — an unbound chain must not broadcast.
    const session = getActiveSessions().find((s) => s.topic === topic);
    const boundCaip2 = resolveSessionCaip2(session, caip2ChainId);
    if (boundCaip2 == null) {
      await rejectRequest(topic, id, 'SESSION_CHAINID_INVALID').catch(() => {});
      throw new Error(
        `Rejected transaction [SESSION_CHAINID_INVALID]: this connection did not ` +
        `approve the requested chain (${caip2ChainId ?? '(none)'}). ` +
        `Veyrnox will not broadcast a transaction on an unapproved chain.`,
      );
    }
    // #1090 — fetch the same limits + history sources the in-app Send screen
    // reads so the WC send path enforces the SAME gates. Fail-open on read
    // error (matches the in-app "no limits configured → allow" default);
    // fail-closed happens inside _handleSendTransaction if a limit is breached.
    // Dynamic-import base44 so unrelated WC tests (e.g. demoGate) that mock
    // demoClient without the full base44 surface don't break on module load;
    // the entities are only needed at sign-time, not at provider mount.
    let txLimits = [];
    let history = [];
    try {
      const { base44 } = await import('@/api/base44Client');
      try { txLimits = await base44.entities.TransactionLimit.list(); } catch { txLimits = []; }
      try { history = await base44.entities.Transaction.list('-created_date', 100); } catch { history = []; }
    } catch { /* base44 unavailable in this test surface — fail open on limit axis */ }
    await _handleSendTransaction(
      {
        withPrivateKey,
        evmAddress,
        actionPasswordConfigured,
        txLimits,
        history,
        knownAddresses,
        whitelist,
        usdRates: USD_RATES,
        remoteScreenEnabled: readRemoteScreenPreference(!!import.meta.env.VITE_TIP_BASE_URL),
      },
      topic, id, params, boundCaip2,
    );
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, [withPrivateKey, evmAddress, actionPasswordConfigured, assertSessionLive, isSendReauthRequired, knownAddresses, whitelist]);

  const handleRejectRequest = useCallback(async (topic, id) => {
    await rejectRequest(topic, id);
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, []);

  const handleDisconnect = useCallback(async (topic) => {
    await disconnectSession(topic);
    refreshSessions();
  }, [refreshSessions]);

  // Enrich a raw pending request with parsed typed-data / classification metadata
  const enrichRequest = useCallback((req) => {
    // L-1 (audit 2026-08-25): destructured non-defensively, on the RENDER path.
    // The handler that queues a request optional-chains the identical access
    // (:683) and lets a method-less request fall through the permissive `else`,
    // so a queued request with no `params.request` threw during render of the
    // whole provider subtree. classifyRequest(undefined) already yields UNKNOWN,
    // which the approval modal treats as approve-blocked — the honest outcome.
    const { method, params } = req.params?.request ?? {};
    const type = classifyRequest(method);
    const blocked = isBlocked(method);
    let typedDataMeta = null;
    let reviewMeta = null;
    if (type === REQUEST_TYPES.SIGN_TYPED_DATA) {
      const raw = params?.[1] ?? params?.[0];
      const parsed = parseTypedData(raw);
      typedDataMeta = {
        parsed,
        assetAuthorising: detectAssetAuthorising(parsed),
        description: describeTypedData(parsed),
      };
    }
    if (type === REQUEST_TYPES.SEND_TRANSACTION) {
      const txParam = params?.[0] ?? {};
      const chainId = typeof req.params?.chainId === 'string'
        ? parseInt(req.params.chainId.replace(/^eip155:/, ''), 10)
        : NaN;
      const wcNetwork = Number.isFinite(chainId) ? getNetworkByChainId(chainId) : null;
      reviewMeta = buildReviewContributor({
        recipient: txParam.to ?? null,
        currency: wcNetwork?.symbol ?? 'ETH',
        history: corpusHistory,
        knownAddresses,
        whitelist,
        sessionMeta: getActiveSessions().find((s) => s.topic === req.topic)?.peer?.metadata ?? null,
      });
    }
    return { ...req, type, blocked, typedDataMeta, reviewMeta };
  }, [corpusHistory, knownAddresses, whitelist]);

  return (
    <WalletConnectCtx.Provider value={{
      initialized,
      configured: isWalletConnectConfigured(),
      error,
      pendingProposals,
      pendingRequests: pendingRequests.map(enrichRequest),
      sessions,
      pair: pairWithDapp,
      approveSession: handleApproveSession,
      rejectSession: handleRejectSession,
      signPersonal: handlePersonalSign,
      signTypedData: handleSignTypedData,
      sendTransaction: handleSendTransaction,
      rejectRequest: handleRejectRequest,
      disconnect: handleDisconnect,
      refreshSessions,
      evmAddress,
      // isSendReauthRequired() reads lastAuthAtRef (a private ref in WalletProvider).
      // Exposed here so RequestApprovalModal can enforce the 2-minute reauth window
      // without needing a direct ref to lastAuthAt.
      isSendReauthRequired,
    }}>
      {children}
    </WalletConnectCtx.Provider>
  );
}

export function useWalletConnect() {
  const ctx = useContext(WalletConnectCtx);
  if (!ctx) throw new Error('useWalletConnect must be used inside WalletConnectProvider');
  return ctx;
}
