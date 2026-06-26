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
import { degrade, detect, TIER, browserProbeSource } from '@/rasp';
import { LEVEL } from '@/risk/levels';

// C3: RASP pre-sign environment gate for dApp (WalletConnect) signing handlers.
// personal_sign / signTypedData / sendTransaction reach withPrivateKey() and sign
// or broadcast with a real key, so they are signing chokepoints and must carry the
// SAME RASP plane the in-app Send chokepoint enforces — otherwise a paired dApp
// could exfiltrate a signature in a hostile runtime that Send would BLOCK.
// detect()/degrade() are PURE functions of the environment (I3 set-blind); a RASP
// crash fails closed to the strongest BLOCK (I4). The tx-risk plane is N/A at this
// seam (no recipient risk scoring here), so we pass LEVEL.OK for tx level — the
// RASP plane is what gates. Mirrors CryptoSigning.jsx raspGuardAllowsSigning().
function raspGuardAllowsSigning() {
  let tier;
  try { tier = degrade(detect(browserProbeSource)).tier; } catch { tier = degrade(undefined)?.tier ?? TIER.BLOCK; }
  const gate = presignGate(tier, LEVEL.OK, false);
  return gate.proceedAllowed && gate.signerReachable;
}

const WalletConnectCtx = createContext(null);

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

  // Sign a personal_sign request. params: [hexMessage, address]
  const handlePersonalSign = useCallback(async (topic, id, params) => {
    if (!raspGuardAllowsSigning()) {
      await rejectRequest(topic, id, 'RASP_BLOCK');
      setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
      return;
    }
    const hexMsg = params[0];
    const sig = await withPrivateKey(0, async (pk) => {
      const wallet = new ethers.Wallet(pk);
      return wallet.signMessage(ethers.getBytes(hexMsg));
    });
    await respondToRequest(topic, id, sig);
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, [withPrivateKey]);

  // Sign an eth_signTypedData_v4 request. params: [address, typedDataJson]
  const handleSignTypedData = useCallback(async (topic, id, params) => {
    if (!raspGuardAllowsSigning()) {
      await rejectRequest(topic, id, 'RASP_BLOCK');
      setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
      return;
    }
    const typedDataJson = params[1] ?? params[0];
    const parsed = parseTypedData(typedDataJson);
    if (!parsed.valid) throw new Error(`Invalid typed data: ${parsed.error}`);
    const { EIP712Domain: _ignored, ...typesWithoutDomain } = parsed.types;
    const sig = await withPrivateKey(0, async (pk) => {
      const wallet = new ethers.Wallet(pk);
      return wallet.signTypedData(parsed.domain, typesWithoutDomain, parsed.message);
    });
    await respondToRequest(topic, id, sig);
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, [withPrivateKey]);

  // Sign and broadcast an eth_sendTransaction request.
  // caip2ChainId: "eip155:11155111" format from the WC session namespace.
  // Gas cap of 1M enforced regardless of dApp suggestion (I5 — backend untrusted).
  const handleSendTransaction = useCallback(async (topic, id, params, caip2ChainId) => {
    if (!raspGuardAllowsSigning()) {
      await rejectRequest(topic, id, 'RASP_BLOCK');
      setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
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

      const GAS_CAP = 1_000_000n;
      if (txParams.gas) {
        tx.gasLimit = BigInt(txParams.gas) < GAS_CAP ? BigInt(txParams.gas) : GAS_CAP;
      }

      const sent = await wallet.sendTransaction(tx);
      return sent.hash;
    });

    await respondToRequest(topic, id, hash);
    setPendingRequests((prev) => prev.filter((r) => !(r.topic === topic && r.id === id)));
  }, [withPrivateKey]);

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
