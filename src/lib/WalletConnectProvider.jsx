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
import { presignGate } from '@/sign-gate/presign';
import { detect, degrade, browserProbeSource } from '@/rasp';

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

// M9 — enforce a 1,000,000 gas cap UNCONDITIONALLY, including when the dApp
// omits the `gas` field. Previously the cap only applied to a dApp-supplied
// `gas`; with `gas` omitted, ethers auto-estimated with no ceiling, so a
// malicious dApp could craft a tx that consumes the full block gas limit and
// drain funds. We estimate gas ourselves when omitted, then clamp either value
// (dApp's or our estimate) to the cap. I5 — backend/dApp untrusted by design.
//
// txGas: the dApp-supplied `gas` (hex string, bigint, or undefined).
// estimatedGas: bigint result of provider.estimateGas, used when txGas is absent.
// Returns a bigint <= 1_000_000n.
export const WC_GAS_CAP = 1_000_000n;
export function resolveGasLimit(txGas, estimatedGas) {
  const requested = txGas != null ? BigInt(txGas) : BigInt(estimatedGas);
  return requested > WC_GAS_CAP ? WC_GAS_CAP : requested;
}

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

function presignGateOrReject() {
  const { tier } = degrade(detect(browserProbeSource));
  return presignGate(tier, null, true);
}

export async function _handlePersonalSign({ withPrivateKey, evmAddress }, topic, id, params) {
  const gate = presignGateOrReject();
  if (!gate.proceedAllowed) {
    await rejectRequest(topic, id, 'RASP_BLOCK').catch(() => {});
    return;
  }
  const arr = Array.isArray(params) ? params : [];
  let hexMsg;
  if (evmAddress) {
    // H8 — resolve which param is the message and bind the address param to our
    // own wallet (EIP-1474 [message, address] vs MetaMask-legacy [address,
    // message]). Reject (fail closed, I4) if no param is our own address.
    const own = evmAddress.toLowerCase();
    const isOwn = (v) =>
      typeof v === 'string' && ethers.isAddress(v) && v.toLowerCase() === own;
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
  } else {
    hexMsg = arr[0];
  }
  const sig = await withPrivateKey(0, async (pk) => {
    const wallet = new ethers.Wallet(pk);
    return wallet.signMessage(ethers.getBytes(hexMsg));
  });
  await respondToRequest(topic, id, sig);
}

export async function _handleSignTypedData({ withPrivateKey }, topic, id, params, sessionCaip2) {
  const gate = presignGateOrReject();
  if (!gate.proceedAllowed) {
    await rejectRequest(topic, id, 'RASP_BLOCK').catch(() => {});
    return;
  }
  const typedDataJson = params[1] ?? params[0];
  const parsed = parseTypedData(typedDataJson);
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

export async function _handleSendTransaction({ withPrivateKey }, topic, id, params, caip2ChainId) {
  const gate = presignGateOrReject();
  if (!gate.proceedAllowed) {
    await rejectRequest(topic, id, 'RASP_BLOCK').catch(() => {});
    return;
  }
  const txParams = params[0];
  const chainId = parseInt(caip2ChainId.replace(/^eip155:/, ''), 10);
  const net = getNetworkByChainId(chainId);

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
      tx.maxFeePerGas = BigInt(txParams.maxFeePerGas);
      tx.maxPriorityFeePerGas = BigInt(txParams.maxPriorityFeePerGas ?? 0);
      tx.type = 2;
    } else if (txParams.gasPrice) {
      tx.gasPrice = BigInt(txParams.gasPrice);
      tx.type = 0;
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
  const { accounts, isUnlocked, isDecoy, isHidden, withPrivateKey, isSendReauthRequired } = useWallet();
  const evmAddress = accounts?.[0]?.address ?? null;

  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [pendingProposals, setPendingProposals] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sessions, setSessions] = useState([]);

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
    if (!isUnlocked || isDecoy || isHidden || !isWalletConnectConfigured()) return;
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
  }, [isUnlocked, isDecoy, isHidden, refreshSessions]);

  // Destroy client when wallet locks or transitions into a deniability session (I3).
  useEffect(() => {
    if (!isUnlocked || isDecoy || isHidden) {
      destroyWalletConnect();
      setInitialized(false);
      setPendingProposals([]);
      setPendingRequests([]);
      setSessions([]);
    }
  }, [isUnlocked, isDecoy, isHidden]);

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
  const handleSignTypedData = useCallback(async (topic, id, params, caip2ChainId) => {
    await assertSessionLive(topic, id); // M11
    // H-NEW-B — step-up re-auth check at the signing chokepoint (fail closed, I4).
    if (isSendReauthRequired()) {
      await rejectRequest(topic, id, 'STEP_UP_REQUIRED').catch(() => {});
      throw new Error('Signing rejected [STEP_UP_REQUIRED]: re-authentication required before signing.');
    }
    // H7 — the session's CAIP-2 chain id lives on the pending request the modal
    // is acting on; pass it to the pure helper for cross-chain replay protection.
    // Fall back to the caller-supplied chain when the request is not in state.
    const sessionCaip2 = pendingRequests.find(
      (r) => r.topic === topic && r.id === id,
    )?.params?.chainId ?? caip2ChainId;
    await _handleSignTypedData({ withPrivateKey }, topic, id, params, sessionCaip2);
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, [withPrivateKey, pendingRequests, assertSessionLive, isSendReauthRequired]);

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
    await _handleSendTransaction({ withPrivateKey }, topic, id, params, caip2ChainId);
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, [withPrivateKey, assertSessionLive, isSendReauthRequired]);

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
