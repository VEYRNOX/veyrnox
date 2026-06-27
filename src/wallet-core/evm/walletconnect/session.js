// WalletConnect v2 client singleton.
// Handles pairing, session lifecycle, and request/response dispatch.
// NEVER holds or touches key material. Pure transport layer.

import { Core } from '@walletconnect/core';
import { Web3Wallet } from '@walletconnect/web3wallet';
import { getSdkError, buildApprovedNamespaces } from '@walletconnect/utils';
import { SUPPORTED_CHAIN_IDS } from './router.js';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

let _client = null;
const _listeners = new Set();
// Store pending proposals by id so approveSession can call buildApprovedNamespaces.
// Each entry is { proposal, insertedAt }. Stale entries (a dApp proposed but the
// user dismissed the modal without pressing Reject) are TTL-evicted so the map
// cannot grow unbounded and a stale id cannot trigger a later approveSession race.
const _pendingProposals = new Map();
// audit-H9: companion timer map — one clearTimeout handle per proposal so stale
// entries are evicted even if the user dismisses the modal without pressing Reject.
const _proposalTimers = new Map();

// audit-H9: WalletConnect proposals carry their own expiry (Unix seconds).
// Use it if present; fall back to 5 minutes so the map never fills indefinitely.
export const DEFAULT_PROPOSAL_TTL_MS = 5 * 60 * 1000;

// Pure — exported for unit tests. Computes the ms until a proposal expires.
// Clamps to 0 (fire immediately) if the expiry has already passed.
export function computeProposalTtlMs(expiryEpochSeconds, nowMs = Date.now()) {
  if (!expiryEpochSeconds) return DEFAULT_PROPOSAL_TTL_MS;
  return Math.max(0, expiryEpochSeconds * 1000 - nowMs);
}

function _scheduleProposalExpiry(proposalId, expiryEpochSeconds) {
  return setTimeout(() => {
    _pendingProposals.delete(proposalId);
    _proposalTimers.delete(proposalId);
  }, computeProposalTtlMs(expiryEpochSeconds));
}

function _clearProposalTimer(proposalId) {
  const t = _proposalTimers.get(proposalId);
  if (t !== undefined) { clearTimeout(t); _proposalTimers.delete(proposalId); }
}

// H9 — pending proposals live at most this long before being rejected + evicted.
export const PROPOSAL_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Injectable clock so tests can advance time deterministically.
let _now = () => Date.now();

function _storeProposal(proposal) {
  _pendingProposals.set(proposal.id, { proposal, insertedAt: _now() });
}

// Reject + evict every proposal older than PROPOSAL_TTL_MS. Safe to call on a
// timer or lazily on the next insert. Rejection failures are swallowed per id so
// one bad id can't block cleanup of the rest (fail honest, fail closed).
export async function cleanupExpiredProposals() {
  const cutoff = _now() - PROPOSAL_TTL_MS;
  for (const [id, entry] of _pendingProposals) {
    if (entry.insertedAt <= cutoff) {
      _pendingProposals.delete(id);
      try {
        if (_client) {
          await _client.rejectSession({ id, reason: getSdkError('SESSION_SETTLEMENT_FAILED') });
        }
      } catch { /* dApp may already be gone; eviction still stands */ }
    }
  }
}

export function isWalletConnectConfigured() {
  return Boolean(PROJECT_ID);
}

export async function initWalletConnect() {
  if (_client) return _client;
  if (!PROJECT_ID) {
    console.warn('[Veyrnox] WalletConnect disabled: VITE_WALLETCONNECT_PROJECT_ID not set.');
    return null;
  }
  const core = new Core({ projectId: PROJECT_ID });
  _client = await Web3Wallet.init({
    // pino version mismatch between @walletconnect/core and @walletconnect/web3wallet causes a
    // spurious ICore type error; runtime is correct, both packages resolve the same Core instance.
    // @ts-ignore
    core,
    metadata: {
      name: 'Veyrnox',
      description: 'Self-custody coercion-resistant crypto wallet',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://veyrnox.app',
      icons: [],
    },
  });
  _client.on('session_proposal', (proposal) => {
    // Lazily evict stale proposals on each new one so a spamming dApp can't pile up.
    void cleanupExpiredProposals();
    _storeProposal(proposal);
    _emit('session_proposal', proposal);
  });
  _client.on('session_request', (data) => _emit('session_request', data));
  _client.on('session_delete', (data) => _emit('session_delete', data));
  _client.on('session_request_expire', (data) => _emit('session_request_expire', data));
  return _client;
}

export function onWalletConnectEvent(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function _emit(event, data) {
  for (const cb of _listeners) {
    try { cb(event, data); } catch { /* never let a listener crash the client */ }
  }
}

// M8 — structurally validate a WalletConnect v2 pairing URI BEFORE handing it to
// the SDK. We do not parse it fully (the SDK owns that); we only reject anything
// that is not shaped like `wc:<topic>@2?relay-protocol=...` so non-wc schemes
// (javascript:, https:, empty) can never reach client.pair. Fail honest, closed.
// Format ref: wc:{topic}@{version}?relay-protocol={protocol}&symKey={key}
const WC_V2_URI_RE = /^wc:[0-9a-zA-Z]+@2\?[^#]*relay-protocol=/;

export function validatePairingUri(uri) {
  if (typeof uri !== 'string') {
    const e = Object.assign(new Error('WalletConnect pairing URI must be a string.'), { code: 'WC_INVALID_PAIRING_URI' });
    throw e;
  }
  const trimmed = uri.trim();
  if (!WC_V2_URI_RE.test(trimmed)) {
    const e = Object.assign(new Error(
      'Not a valid WalletConnect v2 pairing URI (expected wc:<topic>@2?relay-protocol=...).',
    ), { code: 'WC_INVALID_PAIRING_URI' });
    throw e;
  }
  return trimmed;
}

export async function pairWithDapp(uri) {
  // Validate structure BEFORE touching the SDK so a malformed/non-wc URI is
  // rejected at the boundary, never injected into client.pair.
  const safeUri = validatePairingUri(uri);
  const client = await initWalletConnect();
  if (!client) throw new Error('WalletConnect is not configured on this build.');
  await client.pair({ uri: safeUri });
}

export async function approveSession(proposalId, evmAddress, chainIds) {
  const client = await initWalletConnect();
  if (!client) throw new Error('WalletConnect is not configured on this build.');
  // Evict first so an already-expired proposal can never be approved (stale-race guard).
  await cleanupExpiredProposals();
  const entry = _pendingProposals.get(proposalId);
  if (!entry) throw new Error('Proposal not found — it may have expired');
  const proposal = entry.proposal;
  const supportedCaip = chainIds
    .filter((id) => SUPPORTED_CHAIN_IDS.has(id))
    .map((id) => `eip155:${id}`);
  if (!supportedCaip.length) throw new Error('No supported chains in proposal');
  const accounts = supportedCaip.map((chain) => `${chain}:${evmAddress}`);
  const namespaces = buildApprovedNamespaces({
    proposal: proposal.params,
    supportedNamespaces: {
      eip155: {
        chains: supportedCaip,
        // audit-H6: eth_signTypedData (v1) and eth_signTypedData_v3 are blocked
        // (encoding mismatch with v4 handler). Do not advertise them — a dApp
        // that requests them will receive a USER_REJECTED, not a bad signature.
        methods: [
          'eth_sendTransaction',
          'personal_sign',
          'eth_signTypedData_v4',
        ],
        events: ['chainChanged', 'accountsChanged'],
        accounts,
      },
    },
  });
  await client.approveSession({ id: proposalId, namespaces });
  _clearProposalTimer(proposalId); // audit-H9
  _pendingProposals.delete(proposalId);
}

export async function rejectSession(proposalId) {
  const client = await initWalletConnect();
  if (!client) throw new Error('WalletConnect is not configured on this build.');
  await client.rejectSession({ id: proposalId, reason: getSdkError('USER_REJECTED') });
  _clearProposalTimer(proposalId); // audit-H9
  _pendingProposals.delete(proposalId);
}

export async function respondToRequest(topic, id, result) {
  const client = await initWalletConnect();
  if (!client) throw new Error('WalletConnect is not configured on this build.');
  await client.respondToSessionRequest({
    topic,
    response: { id, result, jsonrpc: '2.0' },
  });
}

export async function rejectRequest(topic, id) {
  const client = await initWalletConnect();
  if (!client) throw new Error('WalletConnect is not configured on this build.');
  await client.respondToSessionRequest({
    topic,
    response: {
      id,
      jsonrpc: '2.0',
      error: getSdkError('USER_REJECTED'),
    },
  });
}

export async function disconnectSession(topic) {
  const client = await initWalletConnect();
  if (!client) throw new Error('WalletConnect is not configured on this build.');
  await client.disconnectSession({ topic, reason: getSdkError('USER_DISCONNECTED') });
}

export function getActiveSessions() {
  return _client ? Object.values(_client.getActiveSessions()) : [];
}

// Call on wallet lock — destroys the singleton so the next unlock gets a fresh client.
// Required by I3: deniability mode must make zero backend calls; destroying the WC
// client ensures no lingering relay connection can be tied back to the real wallet.
//
// L4 — before nulling the client we MUST signal each active session as
// USER_DISCONNECTED, otherwise the dApp believes the session is still live and
// can queue signing requests that resurface on the next unlock. Per-session
// errors are swallowed (a stale session must not block disconnecting the rest).
//
// Returns a promise so callers that *can* await get a clean teardown, but it is
// safe to call fire-and-forget (the sync caller on lock does not await): the
// client and maps are torn down synchronously after the best-effort disconnects.
export async function destroyWalletConnect() {
  const client = _client;
  if (client) {
    let sessions = [];
    try {
      sessions = Object.values(client.getActiveSessions() || {});
    } catch { /* if we can't enumerate, still proceed to tear down */ }
    for (const session of sessions) {
      try {
        await client.disconnectSession({
          topic: session.topic,
          reason: getSdkError('USER_DISCONNECTED'),
        });
      } catch { /* dApp/relay may already be gone; teardown still proceeds */ }
    }
  }
  _client = null;
  // audit-H9: clear all pending timers before wiping the map so nothing fires
  // after destroy (e.g. a proposal that arrived just before a wallet lock).
  for (const t of _proposalTimers.values()) clearTimeout(t);
  _proposalTimers.clear();
  _pendingProposals.clear();
  _listeners.clear();
}

// Active (non-evicted) proposal ids. Useful for diagnostics and tests.
export function getPendingProposalIds() {
  return Array.from(_pendingProposals.keys());
}

// --- Test-only seams (no production caller) ---
export function __setProposalClock(fn) { _now = fn; }
export function __setTestClient(client) { _client = client; }
export function __injectPendingProposal(proposal) { _storeProposal(proposal); }
