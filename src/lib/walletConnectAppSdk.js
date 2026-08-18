// @ts-nocheck
// WalletConnect App SDK (Reown AppKit + UniversalConnector) helper for the
// read-only "/connect" import flow. This is intentionally SESSION-SHORT:
// connect, read public account/balance data, then disconnect immediately so the
// page does not keep a background dApp session alive after import/cancel.

import { getBalanceEth } from '@/wallet-core/evm/provider.js';
import { NETWORKS, getNetworkInfo } from '@/wallet-core/evm/networks.js';
import { WALLETCONNECT_PROJECT_ID } from '@/wallet-core/evm/walletconnect/projectId.js';

const APP_METADATA = Object.freeze({
  name: 'Veyrnox',
  description: 'Import a read-only snapshot of an external wallet into Veyrnox',
  url: 'https://veyrnox.com',
  icons: ['https://veyrnox.com/icon-512.png'],
});

const EVM_METHODS = Object.freeze(['eth_accounts', 'eth_chainId']);
const EVM_EVENTS = Object.freeze(['accountsChanged', 'chainChanged']);

let connectorPromise = null;

function toAppKitNetwork(net) {
  return {
    id: net.chainId,
    chainNamespace: 'eip155',
    caipNetworkId: `eip155:${net.chainId}`,
    name: net.name,
    nativeCurrency: {
      name: net.symbol,
      symbol: net.symbol,
      decimals: net.decimals,
    },
    rpcUrls: {
      default: { http: [net.defaultRpcUrl] },
    },
  };
}

export function getWalletConnectAppSdkConfig() {
  const chains = Object.values(NETWORKS).map(toAppKitNetwork);
  return {
    projectId: WALLETCONNECT_PROJECT_ID,
    metadata: APP_METADATA,
    networks: [
      {
        namespace: 'eip155',
        methods: [...EVM_METHODS],
        events: [...EVM_EVENTS],
        chains,
      },
    ],
    modalConfig: {
      manualWCControl: true,
      features: {
        analytics: false,
        email: false,
        socials: false,
        swaps: false,
        onramp: false,
      },
    },
  };
}

export async function getWalletConnectAppConnector() {
  if (!connectorPromise) {
    connectorPromise = import('@reown/appkit-universal-connector').then(({ UniversalConnector }) =>
      UniversalConnector.init(getWalletConnectAppSdkConfig()),
    );
  }
  return connectorPromise;
}

export async function disconnectWalletConnectAppConnector() {
  if (!connectorPromise) return;
  try {
    const connector = await connectorPromise;
    await connector.disconnect();
  } catch {
    // Ignore disconnect errors: import flow is already complete/cancelled.
  } finally {
    connectorPromise = null;
  }
}

function parseCaipAccount(value) {
  if (typeof value !== 'string') return null;
  const [namespace, chainId, address] = value.split(':');
  if (!namespace || !chainId || !address) return null;
  return {
    namespace,
    chainId,
    address,
    caipNetworkId: `${namespace}:${chainId}`,
  };
}

function resolveNetworkKeyFromCaip2(caipNetworkId) {
  if (typeof caipNetworkId !== 'string') return null;
  const [, chainIdRaw] = caipNetworkId.split(':');
  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId)) return null;
  return Object.values(NETWORKS).find((net) => net.chainId === chainId)?.key || null;
}

export async function buildWalletConnectImportPreview(session, readBalance = getBalanceEth) {
  const accounts = session?.namespaces?.eip155?.accounts || [];
  const seen = new Set();
  const assets = [];

  for (const account of accounts) {
    const parsed = parseCaipAccount(account);
    if (!parsed || parsed.namespace !== 'eip155') continue;
    const dedupeKey = `${parsed.caipNetworkId}:${parsed.address.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const networkKey = resolveNetworkKeyFromCaip2(parsed.caipNetworkId);
    if (!networkKey) continue;
    const net = getNetworkInfo(networkKey);
    if (!net) continue;

    let balance = 0;
    let balanceUnavailable = false;
    try {
      balance = Number(await readBalance(networkKey, parsed.address));
      if (!Number.isFinite(balance)) {
        balance = 0;
        balanceUnavailable = true;
      }
    } catch {
      balanceUnavailable = true;
    }

    assets.push({
      currency: net.symbol,
      address: parsed.address,
      balance,
      balanceUnavailable,
      networkKey,
      networkName: net.name,
      caipNetworkId: parsed.caipNetworkId,
    });
  }

  if (!assets.length) {
    throw new Error('No supported WalletConnect accounts were returned by the connected wallet.');
  }

  return assets;
}

export async function connectWalletConnectImportPreview() {
  const connector = await getWalletConnectAppConnector();
  try {
    const { session } = await connector.connect();
    const assets = await buildWalletConnectImportPreview(session);
    return { assets };
  } finally {
    await disconnectWalletConnectAppConnector();
  }
}
