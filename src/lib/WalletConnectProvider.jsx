// React context for WalletConnect state.
// Holds pending proposals, pending requests, and active sessions.
// Routes all signing through WalletProvider's withPrivateKey() — never holds keys.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { toast } from 'sonner';
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
import { useWallet } from '@/lib/WalletProvider.jsx';
import { degrade, detect, TIER, browserProbeSource } from '@/rasp';
import { presignGate } from '@/sign-gate/presign';
import { LEVEL } from '@/risk/levels.js';

const WalletConnectCtx = createContext(null);

// ---------------------------------------------------------------------------
// UNAUDITED-PROVISIONAL — module-level signing helpers (audit findings C3/H7/H8)
//
// These pure-ish helpers encapsulate the per-request signing logic so it can be
// unit-tested without rendering the React provider. They NEVER touch React state;
// the component wrappers below delegate to them and then do their own
// setPendingRequests cleanup.
//
// `deps` is { withPrivateKey, evmAddress }. Keys never leave withPrivateKey.
//
// C3: every signing path computes the RASP env tier and calls presignGate BEFORE
// reaching withPrivateKey. A WC signature carries no tx amount, so we pass the
// benign tx-risk level LEVEL.OK — in a clean environment (RASP ALLOW) this
// composes to ALLOW → proceed; a hostile runtime (RASP BLOCK) fails closed to a
// reject with NO key access. I4: a RASP crash degrades to the strongest tier.
// ---------------------------------------------------------------------------

/**
 * Compute the RASP environment tier, fail-closed (I4).
 * @returns {string} a rasp TIER value
 */
function computeRaspTier() {
  let raspArtifact;
  try { raspArtifact = degrade(detect(browserProbeSource)); } catch { raspArtifact = degrade(undefined); }
  return raspArtifact?.tier ?? TIER.ALLOW;
}

/**
 * The pre-sign chokepoint shared by all WC signing handlers (audit C3).
 * Returns true if signing may proceed; false means the caller must reject.
 * @returns {boolean}
 */
function wcPresignAllows() {
  const raspTier = computeRaspTier();
  // A WC signature has no amount → benign tx-risk level. acknowledged=false:
  // there is no "sign anyway" affordance on the WC path, so a CONFIRM/BLOCK never
  // proceeds (fail closed).
  const gate = presignGate(raspTier, LEVEL.OK, false);
  return gate.proceedAllowed === true;
}

/**
 * Parse a CAIP-2 chain id ("eip155:11155111") to its integer chain id.
 * @param {string|null|undefined} caip
 * @returns {number|null}
 */
function caipToChainId(caip) {
  if (typeof caip !== 'string') return null;
  const n = parseInt(caip.replace(/^eip155:/, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Handle a personal_sign request (audit C3 gate + H8 param normalization).
 *
 * H8: params may arrive as standard [message, address] or legacy reversed
 * [address, message] (older MetaMask). Use ethers.isAddress to detect which slot
 * is the address; the OTHER slot is the message. If an address param is present
 * and differs (case-insensitive) from deps.evmAddress, reject and throw — we must
 * never sign a message attributed to an address we do not control (fail closed).
 *
 * @param {{withPrivateKey: Function, evmAddress?: string|null}} deps
 * @param {string} topic
 * @param {number} id
 * @param {Array<string>} params
 * @param {string} [_sessionChainCaip]
 * @returns {Promise<void>}
 */
export async function _handlePersonalSign(deps, topic, id, params, _sessionChainCaip) {
  // C3 — gate BEFORE any key access.
  if (!wcPresignAllows()) {
    await rejectRequest(topic, id);
    return;
  }

  // H8 — normalize param order. Standard: [message, address]. Legacy: [address, message].
  const [a, b] = params;
  let message;
  let claimedAddress = null;
  if (ethers.isAddress(b)) {
    message = a;
    claimedAddress = b;
  } else if (ethers.isAddress(a)) {
    // Legacy reversed order.
    message = b;
    claimedAddress = a;
  } else {
    // No address param present — treat params[0] as the message.
    message = a;
  }

  // H8 — if the request names an address we do not control, refuse (fail closed).
  if (claimedAddress && deps.evmAddress && claimedAddress.toLowerCase() !== deps.evmAddress.toLowerCase()) {
    await rejectRequest(topic, id);
    throw new Error(`personal_sign address mismatch: request targets ${claimedAddress} but wallet is ${deps.evmAddress}`);
  }

  const sig = await deps.withPrivateKey(0, async (pk) => {
    const wallet = new ethers.Wallet(pk);
    return wallet.signMessage(ethers.getBytes(message));
  });
  await respondToRequest(topic, id, sig);
}

/**
 * Handle an eth_signTypedData_v4 request (audit C3 gate + H7 chainId replay).
 *
 * H7: an EIP-712 payload carries its own domain.chainId. A dApp on a Sepolia
 * session could present a payload whose domain.chainId is mainnet, harvesting a
 * signature replayable on another chain. If the parsed domain declares a chainId
 * and it differs from the WC session's chain, reject and throw. If the domain has
 * no chainId, skip the check (backwards compatible).
 *
 * @param {{withPrivateKey: Function, evmAddress?: string|null}} deps
 * @param {string} topic
 * @param {number} id
 * @param {Array<string>} params
 * @param {string} [sessionChainCaip]
 * @returns {Promise<void>}
 */
export async function _handleSignTypedData(deps, topic, id, params, sessionChainCaip) {
  // C3 — gate BEFORE any key access.
  if (!wcPresignAllows()) {
    await rejectRequest(topic, id);
    return;
  }

  const typedDataJson = params[1] ?? params[0];
  const parsed = parseTypedData(typedDataJson);
  if (!parsed.valid) throw new Error(`Invalid typed data: ${parsed.error}`);

  // H7 — cross-chain replay guard. Only fires when the domain declares a chainId
  // AND we know the session chain.
  const domainChainId = parsed.domain?.chainId;
  const sessionChainId = caipToChainId(sessionChainCaip);
  if (domainChainId != null && sessionChainId != null && Number(domainChainId) !== sessionChainId) {
    await rejectRequest(topic, id);
    throw new Error(`EIP-712 domain.chainId (${domainChainId}) does not match the WalletConnect session chain (${sessionChainId})`);
  }

  const { EIP712Domain: _ignored, ...typesWithoutDomain } = parsed.types;
  const sig = await deps.withPrivateKey(0, async (pk) => {
    const wallet = new ethers.Wallet(pk);
    return wallet.signTypedData(parsed.domain, typesWithoutDomain, parsed.message);
  });
  await respondToRequest(topic, id, sig);
}

/**
 * Handle an eth_sendTransaction request (audit C3 gate). Preserves the existing
 * VULN-19 chain-id RPC guard and the 1M gas cap (I5 — backend untrusted).
 *
 * @param {{withPrivateKey: Function, evmAddress?: string|null}} deps
 * @param {string} topic
 * @param {number} id
 * @param {Array<object>} params
 * @param {string} caip2ChainId  "eip155:11155111" from the WC session namespace
 * @returns {Promise<void>}
 */
export async function _handleSendTransaction(deps, topic, id, params, caip2ChainId) {
  // C3 — gate BEFORE any key access.
  if (!wcPresignAllows()) {
    await rejectRequest(topic, id);
    return;
  }

  const txParams = params[0];
  const chainId = parseInt(String(caip2ChainId).replace(/^eip155:/, ''), 10);
  const net = getNetworkByChainId(chainId);

  const hash = await deps.withPrivateKey(0, async (pk) => {
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
      tx.maxFeePerGas = BigInt(txParams.maxFeePerGas);
      tx.maxPriorityFeePerGas = BigInt(txParams.maxPriorityFeePerGas ?? 0);
      tx.type = 2;
    } else if (txParams.gasPrice) {
      tx.gasPrice = BigInt(txParams.gasPrice);
      tx.type = 0;
    }

    const GAS_CAP = 1_000_000n;
    if (txParams.gas) {
      tx.gasLimit = BigInt(txParams.gas) < GAS_CAP ? BigInt(txParams.gas) : GAS_CAP;
    }

    const sent = await wallet.sendTransaction(tx);
    return sent.hash;
  });

  await respondToRequest(topic, id, hash);
}

export function WalletConnectProvider({ children }) {
  // NOTE: lastAuthAt is NOT in the WalletProvider context value (it lives in a
  // private ref: lastAuthAtRef). isSendReauthRequired() is the context-exposed gate
  // that reads it. We expose isSendReauthRequired to the modal instead.
  const { accounts, isUnlocked, withPrivateKey, isSendReauthRequired } = useWallet();
  const evmAddress = accounts?.[0]?.address ?? null;

  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [pendingProposals, setPendingProposals] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sessions, setSessions] = useState([]);

  const refreshSessions = useCallback(() => setSessions(getActiveSessions()), []);

  useEffect(() => {
    if (!isUnlocked || !isWalletConnectConfigured()) return;
    let cancelled = false;
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
  }, [isUnlocked, refreshSessions]);

  // Destroy client when wallet locks — I3 compliance
  useEffect(() => {
    if (!isUnlocked) {
      destroyWalletConnect();
      setInitialized(false);
      setPendingProposals([]);
      setPendingRequests([]);
      setSessions([]);
    }
  }, [isUnlocked]);

  const handleApproveSession = useCallback(async (proposalId) => {
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
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
    refreshSessions();
  }, [evmAddress, pendingProposals, refreshSessions]);

  const handleRejectSession = useCallback(async (proposalId) => {
    await rejectSession(proposalId);
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
  }, []);

  // Cleanup a resolved pending request from local state.
  const clearPendingRequest = useCallback((topic, id) => {
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, []);

  // Sign a personal_sign request. params: [hexMessage, address] (or legacy reversed).
  // Delegates to the module-level _handlePersonalSign (C3 gate + H8), then cleans up.
  const handlePersonalSign = useCallback(async (topic, id, params, caip2ChainId) => {
    try {
      await _handlePersonalSign({ withPrivateKey, evmAddress }, topic, id, params, caip2ChainId);
    } finally {
      clearPendingRequest(topic, id);
    }
  }, [withPrivateKey, evmAddress, clearPendingRequest]);

  // Sign an eth_signTypedData_v4 request. params: [address, typedDataJson]
  // Delegates to the module-level _handleSignTypedData (C3 gate + H7), then cleans up.
  const handleSignTypedData = useCallback(async (topic, id, params, caip2ChainId) => {
    try {
      await _handleSignTypedData({ withPrivateKey, evmAddress }, topic, id, params, caip2ChainId);
    } finally {
      clearPendingRequest(topic, id);
    }
  }, [withPrivateKey, evmAddress, clearPendingRequest]);

  // Sign and broadcast an eth_sendTransaction request.
  // caip2ChainId: "eip155:11155111" format from the WC session namespace.
  // Delegates to the module-level _handleSendTransaction (C3 gate + VULN-19 guard
  // + 1M gas cap), then cleans up.
  const handleSendTransaction = useCallback(async (topic, id, params, caip2ChainId) => {
    try {
      await _handleSendTransaction({ withPrivateKey, evmAddress }, topic, id, params, caip2ChainId);
    } finally {
      clearPendingRequest(topic, id);
    }
  }, [withPrivateKey, evmAddress, clearPendingRequest]);

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
    const { request: { method, params } } = req.params;
    const type = classifyRequest(method);
    const blocked = isBlocked(method);
    let typedDataMeta = null;
    if (type === REQUEST_TYPES.SIGN_TYPED_DATA) {
      const raw = params[1] ?? params[0];
      const parsed = parseTypedData(raw);
      typedDataMeta = {
        parsed,
        assetAuthorising: detectAssetAuthorising(parsed),
        description: describeTypedData(parsed),
      };
    }
    return { ...req, type, blocked, typedDataMeta };
  }, []);

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
