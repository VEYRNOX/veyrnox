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
// Store pending proposals by id so approveSession can call buildApprovedNamespaces
const _pendingProposals = new Map();

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
    _pendingProposals.set(proposal.id, proposal);
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

export async function pairWithDapp(uri) {
  const client = await initWalletConnect();
  if (!client) throw new Error('WalletConnect is not configured on this build.');
  await client.pair({ uri: uri.trim() });
}

export async function approveSession(proposalId, evmAddress, chainIds) {
  const client = await initWalletConnect();
  if (!client) throw new Error('WalletConnect is not configured on this build.');
  const proposal = _pendingProposals.get(proposalId);
  if (!proposal) throw new Error('Proposal not found — it may have expired');
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
        methods: [
          'eth_sendTransaction',
          'personal_sign',
          'eth_signTypedData',
          'eth_signTypedData_v3',
          'eth_signTypedData_v4',
        ],
        events: ['chainChanged', 'accountsChanged'],
        accounts,
      },
    },
  });
  await client.approveSession({ id: proposalId, namespaces });
  _pendingProposals.delete(proposalId);
}

export async function rejectSession(proposalId) {
  const client = await initWalletConnect();
  if (!client) throw new Error('WalletConnect is not configured on this build.');
  await client.rejectSession({ id: proposalId, reason: getSdkError('USER_REJECTED') });
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
export function destroyWalletConnect() {
  _client = null;
  _pendingProposals.clear();
  _listeners.clear();
}
