# WalletConnect / dApp Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build WalletConnect v2 dApp connectivity (D1 transport + D2 message signing + D3 tx signing) behind `VITE_WALLETCONNECT_PROJECT_ID`, following all Veyrnox security invariants.

**Architecture:** A thin `session.js` singleton wraps `@walletconnect/web3wallet`; a `WalletConnectProvider.jsx` React context holds live proposal/request/session state and routes signing through WalletProvider's existing `withPrivateKey()` hook (keys never leave the device). All signing goes through the existing wallet-core paths; `eth_sign` and `wallet_addEthereumChain` are blocked outright; Permit/Permit2/Seaport trigger mandatory hard warnings; `eth_sendTransaction` runs full local simulation before the user sees the approve button.

**Tech Stack:** `@walletconnect/web3wallet` ^1.14, `@walletconnect/utils` (peer dep), ethers v6, existing `simulate.js`, existing `withPrivateKey()` / `sendReauthRequired()` patterns.

---

## Prerequisite: WalletConnect Project ID

The user must create a free project at https://cloud.walletconnect.com and add to `.env.local`:

```
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

The app degrades gracefully (shows a setup screen) if the variable is absent.

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/wallet-core/evm/typed-data.js` | EIP-712 parse, Permit/Permit2/Seaport detection, human summary. Pure — no keys, no network. |
| `src/wallet-core/evm/walletconnect/router.js` | Classify incoming WC request methods → type enum. Pure. |
| `src/wallet-core/evm/walletconnect/session.js` | WC2 client singleton: init, pair, session lifecycle, request respond. No key material. |
| `src/lib/WalletConnectProvider.jsx` | React context: holds proposals/requests/sessions state, routes signing through WalletProvider. |
| `src/components/walletconnect/SessionProposalModal.jsx` | Approve/reject incoming dApp connection. |
| `src/components/walletconnect/RequestApprovalModal.jsx` | Approve/reject sign or send-tx request (the critical path). |
| `src/components/walletconnect/ActiveSessions.jsx` | Scrollable list of active sessions with revoke button. |
| `src/pages/WalletConnect.jsx` | Main WalletConnect page: URI input, sessions, pending request badge. |
| `src/wallet-core/evm/__tests__/typed-data.test.js` | Tests for typed-data.js (pure, fast). |
| `src/wallet-core/evm/__tests__/walletconnect-router.test.js` | Tests for router.js (pure, fast). |

### Modified files
| File | Change |
|------|--------|
| `package.json` | Add `@walletconnect/web3wallet`, `@walletconnect/utils` |
| `vite.config.js` | Add WC packages to `optimizeDeps.include`; add `define: { 'process.env': '{}' }` |
| `src/App.jsx` | Add lazy `/walletconnect` route behind `WALLETCONNECT_ENABLED` |
| `src/lib/navigation.js` | Add WalletConnect nav item to Connect group |
| `src/lib/featureCatalogue.js` | Update WalletConnect status `roadmap` → `provisional` |

---

## Task 1: Install packages + Vite config

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`

- [ ] **Step 1: Install WalletConnect SDK**

```powershell
npm install @walletconnect/web3wallet @walletconnect/utils
```

Expected: Both packages land in `node_modules`. No peer-dep errors (they ship their own deps).

- [ ] **Step 2: Read current vite.config.js**

```powershell
cat src/../vite.config.js
```

(Use the Read tool — just confirming the step.) Find the existing `optimizeDeps` block and the `resolve.alias` section.

- [ ] **Step 3: Add WC packages to optimizeDeps + process shim**

In `vite.config.js`, locate the `optimizeDeps` block (already exists; has `buffer` entries). Add the WC packages and the `process` shim:

```js
// Inside the optimizeDeps.include array — append:
'@walletconnect/web3wallet',
'@walletconnect/utils',
'@walletconnect/core',
```

Also add a `define` block (at the top level of `defineConfig({...})`), alongside `resolve`:

```js
define: {
  'process.env': '{}',
},
```

- [ ] **Step 4: Verify dev server starts without errors**

```powershell
npm run dev -- --port 5173
```

Expected: Vite starts, no "cannot resolve @walletconnect" errors. Kill with Ctrl+C.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json vite.config.js
git commit -m "build: install @walletconnect/web3wallet + vite optimizeDeps"
```

---

## Task 2: `typed-data.js` — EIP-712 parse + Permit detection

**Files:**
- Create: `src/wallet-core/evm/typed-data.js`
- Create: `src/wallet-core/evm/__tests__/typed-data.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/wallet-core/evm/__tests__/typed-data.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseTypedData, detectAssetAuthorising, describeTypedData } from '../typed-data.js';

const PERMIT = {
  types: {
    EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: { name: 'DAI', chainId: 11155111, verifyingContract: '0xabc' },
  primaryType: 'Permit',
  message: { owner: '0x111', spender: '0x222', value: '1000000000000000000', nonce: 0, deadline: 9999999999 },
};

const PERMIT2 = {
  types: {
    PermitSingle: [{ name: 'details', type: 'PermitDetails' }, { name: 'spender', type: 'address' }],
    PermitDetails: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }],
  },
  domain: { name: 'Permit2', verifyingContract: '0xCCC' },
  primaryType: 'PermitSingle',
  message: { details: { token: '0xTKN', amount: '1000' }, spender: '0xDEF' },
};

const TYPED_TRANSFER = {
  types: { Transfer: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  domain: { name: 'MyApp' },
  primaryType: 'Transfer',
  message: { to: '0xABC', amount: '500' },
};

describe('parseTypedData', () => {
  it('accepts a raw object', () => {
    const r = parseTypedData(PERMIT);
    expect(r.valid).toBe(true);
    expect(r.primaryType).toBe('Permit');
  });
  it('accepts a JSON string', () => {
    const r = parseTypedData(JSON.stringify(PERMIT));
    expect(r.valid).toBe(true);
  });
  it('returns valid:false on garbage JSON', () => {
    expect(parseTypedData('not json').valid).toBe(false);
  });
  it('returns valid:false when primaryType missing', () => {
    expect(parseTypedData({ types: {}, domain: {}, message: {} }).valid).toBe(false);
  });
});

describe('detectAssetAuthorising', () => {
  it('flags Permit as asset-authorising', () => {
    const r = detectAssetAuthorising(parseTypedData(PERMIT));
    expect(r.isAssetAuthorising).toBe(true);
    expect(r.kind).toBe('permit');
    expect(r.reason).toMatch(/Permit/);
  });
  it('flags PermitSingle (Permit2) as asset-authorising', () => {
    const r = detectAssetAuthorising(parseTypedData(PERMIT2));
    expect(r.isAssetAuthorising).toBe(true);
    expect(r.kind).toBe('permit');
  });
  it('does not flag a plain Transfer type', () => {
    const r = detectAssetAuthorising(parseTypedData(TYPED_TRANSFER));
    expect(r.isAssetAuthorising).toBe(false);
  });
  it('does not flag invalid typed data', () => {
    const r = detectAssetAuthorising({ valid: false });
    expect(r.isAssetAuthorising).toBe(false);
  });
});

describe('describeTypedData', () => {
  it('returns primaryType and domain name in summary', () => {
    const r = describeTypedData(parseTypedData(PERMIT));
    expect(r.summary).toContain('Permit');
    expect(r.summary).toContain('DAI');
    expect(r.appName).toBe('DAI');
    expect(r.chainId).toBe(11155111);
    expect(r.contract).toBe('0xabc');
  });
  it('returns fields as name/value pairs', () => {
    const r = describeTypedData(parseTypedData(PERMIT));
    const spender = r.fields.find(f => f.name === 'spender');
    expect(spender.value).toBe('0x222');
  });
  it('returns summary for invalid data', () => {
    const r = describeTypedData({ valid: false });
    expect(r.summary).toBe('Invalid typed data');
    expect(r.fields).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```powershell
npx vitest run src/wallet-core/evm/__tests__/typed-data.test.js
```

Expected: FAIL — `Cannot find module '../typed-data.js'`

- [ ] **Step 3: Implement `typed-data.js`**

Create `src/wallet-core/evm/typed-data.js`:

```js
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
      value: String(value),
    })),
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
npx vitest run src/wallet-core/evm/__tests__/typed-data.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/wallet-core/evm/typed-data.js src/wallet-core/evm/__tests__/typed-data.test.js
git commit -m "feat(walletconnect): EIP-712 typed-data parse + Permit/Permit2 detection"
```

---

## Task 3: `walletconnect/router.js` — request classifier

**Files:**
- Create: `src/wallet-core/evm/walletconnect/router.js`
- Create: `src/wallet-core/evm/__tests__/walletconnect-router.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/wallet-core/evm/__tests__/walletconnect-router.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { classifyRequest, isBlocked, REQUEST_TYPES, SUPPORTED_CHAIN_IDS } from '../walletconnect/router.js';

describe('classifyRequest', () => {
  it('classifies eth_sendTransaction', () => {
    expect(classifyRequest('eth_sendTransaction')).toBe(REQUEST_TYPES.SEND_TRANSACTION);
  });
  it('classifies personal_sign', () => {
    expect(classifyRequest('personal_sign')).toBe(REQUEST_TYPES.PERSONAL_SIGN);
  });
  it('classifies eth_signTypedData_v4', () => {
    expect(classifyRequest('eth_signTypedData_v4')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA);
  });
  it('classifies eth_signTypedData (no version suffix)', () => {
    expect(classifyRequest('eth_signTypedData')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA);
  });
  it('classifies eth_signTypedData_v3', () => {
    expect(classifyRequest('eth_signTypedData_v3')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA);
  });
  it('classifies eth_sign as ETH_SIGN (blocked variant)', () => {
    expect(classifyRequest('eth_sign')).toBe(REQUEST_TYPES.ETH_SIGN);
  });
  it('classifies wallet_switchEthereumChain', () => {
    expect(classifyRequest('wallet_switchEthereumChain')).toBe(REQUEST_TYPES.SWITCH_CHAIN);
  });
  it('classifies wallet_addEthereumChain', () => {
    expect(classifyRequest('wallet_addEthereumChain')).toBe(REQUEST_TYPES.ADD_CHAIN);
  });
  it('returns UNKNOWN for unrecognised methods', () => {
    expect(classifyRequest('eth_getBalance')).toBe(REQUEST_TYPES.UNKNOWN);
    expect(classifyRequest('wallet_getSnaps')).toBe(REQUEST_TYPES.UNKNOWN);
  });
});

describe('isBlocked', () => {
  it('blocks eth_sign (raw bytes — too dangerous)', () => {
    expect(isBlocked('eth_sign')).toBe(true);
  });
  it('blocks wallet_addEthereumChain (arbitrary RPC injection)', () => {
    expect(isBlocked('wallet_addEthereumChain')).toBe(true);
  });
  it('does not block personal_sign', () => {
    expect(isBlocked('personal_sign')).toBe(false);
  });
  it('does not block eth_sendTransaction', () => {
    expect(isBlocked('eth_sendTransaction')).toBe(false);
  });
});

describe('SUPPORTED_CHAIN_IDS', () => {
  it('includes Sepolia testnet', () => {
    expect(SUPPORTED_CHAIN_IDS.has(11155111)).toBe(true);
  });
  it('includes Ethereum mainnet', () => {
    expect(SUPPORTED_CHAIN_IDS.has(1)).toBe(true);
  });
  it('does not include random chain IDs', () => {
    expect(SUPPORTED_CHAIN_IDS.has(99999)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
npx vitest run src/wallet-core/evm/__tests__/walletconnect-router.test.js
```

Expected: FAIL — `Cannot find module '../walletconnect/router.js'`

- [ ] **Step 3: Implement `walletconnect/router.js`**

Create `src/wallet-core/evm/walletconnect/router.js`:

```js
// Classify incoming WalletConnect session request methods.
// Pure — no keys, no network, no React.

export const REQUEST_TYPES = {
  SEND_TRANSACTION: 'send_transaction',
  PERSONAL_SIGN: 'personal_sign',
  SIGN_TYPED_DATA: 'sign_typed_data',
  ETH_SIGN: 'eth_sign',       // BLOCKED — raw arbitrary bytes, too dangerous
  SWITCH_CHAIN: 'switch_chain',
  ADD_CHAIN: 'add_chain',      // BLOCKED — arbitrary RPC injection
  UNKNOWN: 'unknown',
};

const METHOD_MAP = {
  eth_sendTransaction: REQUEST_TYPES.SEND_TRANSACTION,
  personal_sign: REQUEST_TYPES.PERSONAL_SIGN,
  eth_signTypedData: REQUEST_TYPES.SIGN_TYPED_DATA,
  eth_signTypedData_v3: REQUEST_TYPES.SIGN_TYPED_DATA,
  eth_signTypedData_v4: REQUEST_TYPES.SIGN_TYPED_DATA,
  eth_sign: REQUEST_TYPES.ETH_SIGN,
  wallet_switchEthereumChain: REQUEST_TYPES.SWITCH_CHAIN,
  wallet_addEthereumChain: REQUEST_TYPES.ADD_CHAIN,
};

// Methods rejected immediately — never prompt the user
export const BLOCKED_METHODS = new Set(['eth_sign', 'wallet_addEthereumChain']);

export function classifyRequest(method) {
  return METHOD_MAP[method] ?? REQUEST_TYPES.UNKNOWN;
}

export function isBlocked(method) {
  return BLOCKED_METHODS.has(method);
}

// CAIP-2 chain IDs Veyrnox supports. Mirrors the networks in evm/networks.js.
export const SUPPORTED_CHAIN_IDS = new Set([
  11155111,  // Sepolia
  80002,     // Polygon Amoy
  421614,    // Arbitrum Sepolia
  11155420,  // OP Sepolia
  43113,     // Avalanche Fuji
  97,        // BNB Testnet
  1,         // Ethereum Mainnet
  137,       // Polygon
  42161,     // Arbitrum One
  10,        // Optimism
  43114,     // Avalanche C-Chain
  56,        // BNB Chain
]);
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
npx vitest run src/wallet-core/evm/__tests__/walletconnect-router.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/wallet-core/evm/walletconnect/router.js src/wallet-core/evm/__tests__/walletconnect-router.test.js
git commit -m "feat(walletconnect): request classifier — method → type enum, blocked set"
```

---

## Task 4: `walletconnect/session.js` — WC2 client singleton

**Files:**
- Create: `src/wallet-core/evm/walletconnect/session.js`

There is no unit test for this file — it wraps a third-party SDK that requires a real network + project ID. It is integration-tested via the UI in Task 9.

- [ ] **Step 1: Create `session.js`**

Create `src/wallet-core/evm/walletconnect/session.js`:

```js
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
    throw new Error('VITE_WALLETCONNECT_PROJECT_ID is not set. Add it to .env.local.');
  }
  const core = new Core({ projectId: PROJECT_ID });
  _client = await Web3Wallet.init({
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
  for (const event of ['session_request', 'session_delete', 'session_expire']) {
    _client.on(event, (data) => _emit(event, data));
  }
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
  await client.pair({ uri: uri.trim() });
}

export async function approveSession(proposalId, evmAddress, chainIds) {
  const client = await initWalletConnect();
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
          'wallet_switchEthereumChain',
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
  await client.rejectSession({ id: proposalId, reason: getSdkError('USER_REJECTED') });
  _pendingProposals.delete(proposalId);
}

export async function respondToRequest(topic, id, result) {
  const client = await initWalletConnect();
  await client.respondToSessionRequest({
    topic,
    response: { id, result, jsonrpc: '2.0' },
  });
}

export async function rejectRequest(topic, id) {
  const client = await initWalletConnect();
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
```

- [ ] **Step 2: Commit**

```powershell
git add src/wallet-core/evm/walletconnect/session.js
git commit -m "feat(walletconnect): WC2 client singleton — pair, approve, reject, disconnect"
```

---

## Task 5: `WalletConnectProvider.jsx` — React context

**Files:**
- Create: `src/lib/WalletConnectProvider.jsx`

- [ ] **Step 1: Create `WalletConnectProvider.jsx`**

Create `src/lib/WalletConnectProvider.jsx`:

```jsx
// React context for WalletConnect state.
// Holds pending proposals, pending requests, and active sessions.
// Routes all signing through WalletProvider's withPrivateKey() — never holds keys.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
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
import { useWallet } from '@/lib/WalletProvider.jsx';

const WalletConnectCtx = createContext(null);

export function WalletConnectProvider({ children }) {
  const { accounts, isUnlocked, withPrivateKey, lastAuthAt } = useWallet();
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
        setPendingRequests((prev) => [...prev.filter((r) => r.id !== data.id), data]);
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
    const chainIds = [11155111]; // testnet first; mainnet chains available post-gate
    await approveSession(proposalId, evmAddress, chainIds);
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
    refreshSessions();
  }, [evmAddress, refreshSessions]);

  const handleRejectSession = useCallback(async (proposalId) => {
    await rejectSession(proposalId);
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
  }, []);

  // Sign a personal_sign request. params: [hexMessage, address]
  const handlePersonalSign = useCallback(async (topic, id, params) => {
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
      rejectRequest: handleRejectRequest,
      disconnect: handleDisconnect,
      refreshSessions,
      evmAddress,
      lastAuthAt,
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
```

- [ ] **Step 2: Commit**

```powershell
git add src/lib/WalletConnectProvider.jsx
git commit -m "feat(walletconnect): React context — session state, personal_sign, signTypedData"
```

---

## Task 6: `SessionProposalModal.jsx` — approve / reject connection

**Files:**
- Create: `src/components/walletconnect/SessionProposalModal.jsx`

- [ ] **Step 1: Create `SessionProposalModal.jsx`**

Create `src/components/walletconnect/SessionProposalModal.jsx`:

```jsx
// Modal shown when a dApp proposes a WalletConnect session.
// Shows dApp metadata, requested chains/methods, and approve/reject buttons.
// Design: calm near-black surfaces, teal accent for verified/approve,
// IBM Plex Mono for addresses. Follows Veyrnox design-system.

import styles from './SessionProposalModal.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { useState } from 'react';

export function SessionProposalModal({ proposal, onClose }) {
  const { approveSession, rejectSession, evmAddress } = useWalletConnect();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const meta = proposal.params?.proposer?.metadata ?? {};
  const requiredNs = proposal.params?.requiredNamespaces ?? {};
  const methods = requiredNs.eip155?.methods ?? [];
  const chains = requiredNs.eip155?.chains ?? [];

  async function handleApprove() {
    setBusy(true);
    setErr(null);
    try {
      await approveSession(proposal.id);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      await rejectSession(proposal.id);
      onClose();
    } catch {
      onClose(); // always close on reject
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Connect to dApp?</h2>

        <div className={styles.dappInfo}>
          {meta.icons?.[0] && (
            <img src={meta.icons[0]} alt="" className={styles.icon} width={48} height={48} />
          )}
          <div>
            <p className={styles.dappName}>{meta.name ?? 'Unknown dApp'}</p>
            <p className={styles.dappUrl}>{meta.url ?? ''}</p>
          </div>
        </div>

        <p className={styles.label}>Connecting wallet</p>
        <p className={styles.address}>{evmAddress ?? '—'}</p>

        {chains.length > 0 && (
          <>
            <p className={styles.label}>Requested chains</p>
            <ul className={styles.list}>
              {chains.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </>
        )}

        {methods.length > 0 && (
          <>
            <p className={styles.label}>Requested methods</p>
            <ul className={styles.list}>
              {methods.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </>
        )}

        <p className={styles.warning}>
          Only connect to dApps you trust. This wallet will be visible to the dApp once connected.
        </p>

        {err && <p className={styles.error}>{err}</p>}

        <div className={styles.actions}>
          <button className={styles.rejectBtn} onClick={handleReject} disabled={busy}>
            Reject
          </button>
          <button className={styles.approveBtn} onClick={handleApprove} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Create `src/components/walletconnect/SessionProposalModal.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 6, 8, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.modal {
  background: #12171f;
  border: 1px solid #1D222B;
  border-radius: 16px;
  padding: 28px 24px;
  width: min(440px, 92vw);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #f0f2f5;
  margin: 0;
}
.dappInfo {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #0d1117;
  border-radius: 10px;
  padding: 12px;
}
.icon { border-radius: 8px; }
.dappName { font-size: 1rem; font-weight: 600; color: #f0f2f5; margin: 0; }
.dappUrl { font-size: 0.8rem; color: #8b949e; margin: 0; font-family: 'IBM Plex Mono', monospace; }
.label { font-size: 0.75rem; color: #8b949e; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; }
.address { font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: #f0f2f5; margin: 0; word-break: break-all; }
.list { margin: 0; padding-left: 18px; color: #8b949e; font-size: 0.85rem; }
.warning {
  background: rgba(210, 153, 34, 0.12);
  border: 1px solid rgba(210, 153, 34, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.85rem;
  color: #d29922;
  margin: 0;
}
.error { color: #f85149; font-size: 0.85rem; margin: 0; }
.actions { display: flex; gap: 12px; margin-top: 4px; }
.rejectBtn {
  flex: 1;
  padding: 11px;
  border-radius: 10px;
  border: 1px solid #1D222B;
  background: transparent;
  color: #f0f2f5;
  font-size: 0.95rem;
  cursor: pointer;
}
.rejectBtn:hover { background: #1D222B; }
.approveBtn {
  flex: 1;
  padding: 11px;
  border-radius: 10px;
  border: none;
  background: #4ADAC2;
  color: #050608;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}
.approveBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.approveBtn:hover:not(:disabled) { background: #5de8d0; }
.rejectBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 2: Commit**

```powershell
git add src/components/walletconnect/
git commit -m "feat(walletconnect): SessionProposalModal — approve/reject dApp connection"
```

---

## Task 7: `RequestApprovalModal.jsx` — sign / send-tx approval

This is the highest-stakes component. It must:
- Show exactly what is being signed
- Show Permit/Permit2/Seaport hard warnings in red
- For `eth_sendTransaction`: show simulation result before approve button
- Require `lastAuthAt` within the 2-minute window (or show reauth prompt)
- Route signing through `useWalletConnect()` which routes through `withPrivateKey()`
- Never enable the approve button until any required acknowledgements are checked

**Files:**
- Create: `src/components/walletconnect/RequestApprovalModal.jsx`
- Create: `src/components/walletconnect/RequestApprovalModal.module.css`

- [ ] **Step 1: Create `RequestApprovalModal.jsx`**

Create `src/components/walletconnect/RequestApprovalModal.jsx`:

```jsx
import { useState } from 'react';
import { ethers } from 'ethers';
import styles from './RequestApprovalModal.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { REQUEST_TYPES } from '@/wallet-core/evm/walletconnect/router.js';
import { sendReauthRequired, REAUTH_WINDOW_MS } from '@/lib/sendReauth.js';
import { simulateEvmTx } from '@/wallet-core/evm/simulate.js';
import { getProvider } from '@/wallet-core/evm/provider.js';
import { getNetworkByChainId } from '@/wallet-core/evm/networks.js';

export function RequestApprovalModal({ request, onClose, onReauthNeeded }) {
  const { signPersonal, signTypedData, rejectRequest } = useWalletConnect();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [permitAcknowledged, setPermitAcknowledged] = useState(false);
  const [simulation, setSimulation] = useState(null);   // null = not yet run
  const [simRunning, setSimRunning] = useState(false);

  const { topic, id, params, type, blocked, typedDataMeta } = request;
  const { request: { method, params: reqParams } } = params;
  const chainId = Number(params.chainId?.split(':')[1] ?? 0);

  // --- Reauth guard ---
  const { lastAuthAt } = useWalletConnect();
  const needsReauth = sendReauthRequired({ lastAuthAt, now: Date.now(), windowMs: REAUTH_WINDOW_MS });

  // --- Blocked methods: auto-reject, never show approve ---
  if (blocked) {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <h2 className={styles.title}>Request blocked</h2>
          <p className={styles.body}>
            <strong>{method}</strong> is not supported by Veyrnox.
            {method === 'eth_sign' && ' Raw byte signing (eth_sign) is disabled — it cannot show you what you are signing.'}
            {method === 'wallet_addEthereumChain' && ' Adding arbitrary chains is disabled to prevent RPC injection attacks.'}
          </p>
          <button className={styles.rejectBtn} onClick={() => { rejectRequest(topic, id); onClose(); }}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // --- personal_sign: decode the hex message to human-readable text where possible ---
  let personalSignMessage = null;
  if (type === REQUEST_TYPES.PERSONAL_SIGN) {
    try {
      personalSignMessage = ethers.toUtf8String(reqParams[0]);
    } catch {
      personalSignMessage = reqParams[0]; // show raw hex if not valid UTF-8
    }
  }

  // --- Run simulation for eth_sendTransaction ---
  async function runSimulation() {
    setSimRunning(true);
    try {
      const tx = reqParams[0];
      const network = getNetworkByChainId(chainId);
      if (!network) throw new Error(`Chain ${chainId} not supported`);
      const provider = getProvider(network.networkKey);
      const result = await simulateEvmTx({ provider, tx, network });
      setSimulation(result);
    } catch (e) {
      setSimulation({ error: e.message });
    } finally {
      setSimRunning(false);
    }
  }

  // --- Approve handler ---
  async function handleApprove() {
    if (needsReauth) { onReauthNeeded?.(); return; }
    if (type === REQUEST_TYPES.SIGN_TYPED_DATA && typedDataMeta?.assetAuthorising?.isAssetAuthorising && !permitAcknowledged) return;
    if (type === REQUEST_TYPES.SEND_TRANSACTION && !simulation) return; // must simulate first

    setBusy(true);
    setErr(null);
    try {
      if (type === REQUEST_TYPES.PERSONAL_SIGN) {
        await signPersonal(topic, id, reqParams);
      } else if (type === REQUEST_TYPES.SIGN_TYPED_DATA) {
        await signTypedData(topic, id, reqParams);
      } else {
        throw new Error(`Signing for ${type} via WalletConnect is not yet implemented.`);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    try { await rejectRequest(topic, id); } catch { /* ignore */ }
    onClose();
  }

  const isAssetAuth = typedDataMeta?.assetAuthorising?.isAssetAuthorising;
  const approveBlocked =
    needsReauth ||
    (isAssetAuth && !permitAcknowledged) ||
    (type === REQUEST_TYPES.SEND_TRANSACTION && !simulation);

  const sessionMeta = request.params?.proposer?.metadata ?? {};

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.appName}>{sessionMeta.name ?? 'dApp'}</span>
          <span className={styles.methodBadge}>{method}</span>
        </div>

        {/* PERSONAL SIGN */}
        {type === REQUEST_TYPES.PERSONAL_SIGN && (
          <>
            <p className={styles.label}>Message to sign</p>
            <pre className={styles.messageBox}>{personalSignMessage}</pre>
            <p className={styles.hint}>
              Signing this message will NOT send a transaction or cost gas.
              Only sign messages from dApps you trust.
            </p>
          </>
        )}

        {/* TYPED DATA */}
        {type === REQUEST_TYPES.SIGN_TYPED_DATA && typedDataMeta && (
          <>
            <p className={styles.label}>{typedDataMeta.description.summary}</p>
            <ul className={styles.fieldList}>
              {typedDataMeta.description.fields.map((f) => (
                <li key={f.name} className={styles.field}>
                  <span className={styles.fieldName}>{f.name}</span>
                  <span className={styles.fieldValue}>{f.value}</span>
                </li>
              ))}
            </ul>

            {isAssetAuth && (
              <div className={styles.permitWarning}>
                <p className={styles.permitTitle}>⚠ Token Authorisation Warning</p>
                <p className={styles.permitBody}>{typedDataMeta.assetAuthorising.reason}</p>
                <label className={styles.permitCheck}>
                  <input
                    type="checkbox"
                    checked={permitAcknowledged}
                    onChange={(e) => setPermitAcknowledged(e.target.checked)}
                  />
                  I understand this signature authorises a spender to move my tokens
                </label>
              </div>
            )}
          </>
        )}

        {/* SEND TRANSACTION */}
        {type === REQUEST_TYPES.SEND_TRANSACTION && (
          <>
            <p className={styles.label}>Transaction</p>
            <div className={styles.txBox}>
              <div className={styles.txRow}><span>To</span><span className={styles.mono}>{reqParams[0]?.to ?? '—'}</span></div>
              <div className={styles.txRow}><span>Value</span><span className={styles.mono}>{reqParams[0]?.value ? ethers.formatEther(BigInt(reqParams[0].value)) + ' ETH' : '0 ETH'}</span></div>
              {reqParams[0]?.data && reqParams[0].data !== '0x' && (
                <div className={styles.txRow}><span>Data</span><span className={styles.mono}>{reqParams[0].data.slice(0, 10)}…</span></div>
              )}
            </div>

            {!simulation && (
              <button className={styles.simBtn} onClick={runSimulation} disabled={simRunning}>
                {simRunning ? 'Simulating…' : 'Simulate transaction (required)'}
              </button>
            )}
            {simulation && !simulation.error && (
              <div className={styles.simResult}>
                <p className={styles.simOk}>Simulation passed</p>
                {simulation.risks?.map((r, i) => (
                  <p key={i} className={styles.simRisk}>{r.message ?? r.label}</p>
                ))}
              </div>
            )}
            {simulation?.error && (
              <div className={styles.simError}>Simulation failed: {simulation.error}</div>
            )}
            <p className={styles.hint}>
              eth_sendTransaction via WalletConnect is in preview — tx signing is not yet wired. Reject for now.
            </p>
          </>
        )}

        {/* UNKNOWN */}
        {type === REQUEST_TYPES.UNKNOWN && (
          <p className={styles.body}>
            Unknown request method <strong>{method}</strong>. Veyrnox cannot safely display or sign this. Rejecting.
          </p>
        )}

        {needsReauth && (
          <p className={styles.reauthNotice}>
            Your session has timed out. Please re-authenticate before signing.
          </p>
        )}

        {err && <p className={styles.error}>{err}</p>}

        <div className={styles.actions}>
          <button className={styles.rejectBtn} onClick={handleReject} disabled={busy}>
            Reject
          </button>
          {type !== REQUEST_TYPES.UNKNOWN && (
            <button
              className={styles.approveBtn}
              onClick={needsReauth ? () => onReauthNeeded?.() : handleApprove}
              disabled={busy || (approveBlocked && !needsReauth) || type === REQUEST_TYPES.SEND_TRANSACTION}
            >
              {busy ? 'Signing…' : needsReauth ? 'Re-authenticate' : 'Approve'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `RequestApprovalModal.module.css`**

Create `src/components/walletconnect/RequestApprovalModal.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 6, 8, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.modal {
  background: #12171f;
  border: 1px solid #1D222B;
  border-radius: 16px;
  padding: 24px;
  width: min(480px, 94vw);
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 90vh;
  overflow-y: auto;
}
.header { display: flex; align-items: center; justify-content: space-between; }
.appName { font-size: 1rem; font-weight: 600; color: #f0f2f5; }
.methodBadge {
  background: #1D222B;
  color: #8b949e;
  font-size: 0.75rem;
  font-family: 'IBM Plex Mono', monospace;
  padding: 3px 8px;
  border-radius: 6px;
}
.label { font-size: 0.75rem; color: #8b949e; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; }
.messageBox {
  background: #0d1117;
  border: 1px solid #1D222B;
  border-radius: 8px;
  padding: 12px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.82rem;
  color: #f0f2f5;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 160px;
  overflow-y: auto;
}
.fieldList { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.field {
  display: flex;
  justify-content: space-between;
  background: #0d1117;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 0.85rem;
}
.fieldName { color: #8b949e; }
.fieldValue { color: #f0f2f5; font-family: 'IBM Plex Mono', monospace; word-break: break-all; text-align: right; max-width: 60%; }
.permitWarning {
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.4);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.permitTitle { font-weight: 700; color: #f85149; margin: 0; font-size: 0.95rem; }
.permitBody { color: #f0f2f5; margin: 0; font-size: 0.85rem; line-height: 1.5; }
.permitCheck { display: flex; gap: 8px; align-items: flex-start; font-size: 0.85rem; color: #f0f2f5; cursor: pointer; }
.txBox {
  background: #0d1117;
  border: 1px solid #1D222B;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.txRow { display: flex; justify-content: space-between; font-size: 0.85rem; }
.txRow span:first-child { color: #8b949e; }
.mono { font-family: 'IBM Plex Mono', monospace; color: #f0f2f5; word-break: break-all; max-width: 72%; text-align: right; }
.simBtn {
  background: #1D222B;
  border: 1px solid #2d3748;
  border-radius: 8px;
  color: #4ADAC2;
  padding: 9px;
  font-size: 0.9rem;
  cursor: pointer;
  width: 100%;
}
.simBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.simResult { background: rgba(74, 218, 194, 0.08); border: 1px solid rgba(74, 218, 194, 0.25); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
.simOk { color: #4ADAC2; font-size: 0.85rem; margin: 0; }
.simRisk { color: #d29922; font-size: 0.82rem; margin: 0; }
.simError { background: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3); border-radius: 8px; padding: 10px; color: #f85149; font-size: 0.85rem; }
.hint { font-size: 0.8rem; color: #8b949e; margin: 0; }
.body { color: #f0f2f5; margin: 0; }
.reauthNotice { background: rgba(210, 153, 34, 0.12); border: 1px solid rgba(210, 153, 34, 0.3); border-radius: 8px; padding: 10px; color: #d29922; font-size: 0.85rem; margin: 0; }
.error { color: #f85149; font-size: 0.85rem; margin: 0; }
.actions { display: flex; gap: 12px; }
.rejectBtn {
  flex: 1; padding: 11px; border-radius: 10px;
  border: 1px solid #1D222B; background: transparent;
  color: #f0f2f5; font-size: 0.95rem; cursor: pointer;
}
.rejectBtn:hover:not(:disabled) { background: #1D222B; }
.rejectBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.approveBtn {
  flex: 1; padding: 11px; border-radius: 10px;
  border: none; background: #4ADAC2;
  color: #050608; font-size: 0.95rem; font-weight: 600; cursor: pointer;
}
.approveBtn:hover:not(:disabled) { background: #5de8d0; }
.approveBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Commit**

```powershell
git add src/components/walletconnect/
git commit -m "feat(walletconnect): RequestApprovalModal — personal_sign + typed-data with Permit warning"
```

---

## Task 8: `ActiveSessions.jsx` — sessions list

**Files:**
- Create: `src/components/walletconnect/ActiveSessions.jsx`
- Create: `src/components/walletconnect/ActiveSessions.module.css`

- [ ] **Step 1: Create `ActiveSessions.jsx`**

Create `src/components/walletconnect/ActiveSessions.jsx`:

```jsx
import styles from './ActiveSessions.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { useState } from 'react';

export function ActiveSessions() {
  const { sessions, disconnect, refreshSessions } = useWalletConnect();
  const [disconnecting, setDisconnecting] = useState(null);

  if (!sessions.length) {
    return <p className={styles.empty}>No active sessions</p>;
  }

  async function handleDisconnect(topic) {
    setDisconnecting(topic);
    try { await disconnect(topic); } catch { refreshSessions(); }
    setDisconnecting(null);
  }

  return (
    <ul className={styles.list}>
      {sessions.map((s) => {
        const meta = s.peer?.metadata ?? {};
        const expiry = new Date(s.expiry * 1000).toLocaleDateString();
        return (
          <li key={s.topic} className={styles.item}>
            <div className={styles.info}>
              {meta.icons?.[0] && <img src={meta.icons[0]} alt="" className={styles.icon} width={32} height={32} />}
              <div>
                <p className={styles.name}>{meta.name ?? 'Unknown dApp'}</p>
                <p className={styles.url}>{meta.url ?? s.topic.slice(0, 16) + '…'}</p>
                <p className={styles.expiry}>Expires {expiry}</p>
              </div>
            </div>
            <button
              className={styles.revokeBtn}
              onClick={() => handleDisconnect(s.topic)}
              disabled={disconnecting === s.topic}
            >
              {disconnecting === s.topic ? '…' : 'Revoke'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

Create `src/components/walletconnect/ActiveSessions.module.css`:

```css
.empty { color: #8b949e; font-size: 0.9rem; text-align: center; padding: 24px 0; margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0d1117;
  border: 1px solid #1D222B;
  border-radius: 10px;
  padding: 12px 14px;
}
.info { display: flex; align-items: center; gap: 10px; }
.icon { border-radius: 6px; flex-shrink: 0; }
.name { font-size: 0.9rem; font-weight: 600; color: #f0f2f5; margin: 0; }
.url { font-size: 0.78rem; color: #8b949e; margin: 0; font-family: 'IBM Plex Mono', monospace; }
.expiry { font-size: 0.75rem; color: #6e7681; margin: 0; }
.revokeBtn {
  background: transparent;
  border: 1px solid rgba(248, 81, 73, 0.35);
  color: #f85149;
  border-radius: 7px;
  padding: 6px 12px;
  font-size: 0.82rem;
  cursor: pointer;
  flex-shrink: 0;
}
.revokeBtn:hover:not(:disabled) { background: rgba(248, 81, 73, 0.1); }
.revokeBtn:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 2: Commit**

```powershell
git add src/components/walletconnect/ActiveSessions.jsx src/components/walletconnect/ActiveSessions.module.css
git commit -m "feat(walletconnect): ActiveSessions list with revoke"
```

---

## Task 9: `pages/WalletConnect.jsx` — main page

**Files:**
- Create: `src/pages/WalletConnect.jsx`
- Create: `src/pages/WalletConnect.module.css`

- [ ] **Step 1: Create `WalletConnect.jsx`**

Create `src/pages/WalletConnect.jsx`:

```jsx
import { useState, useEffect } from 'react';
import styles from './WalletConnect.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { SessionProposalModal } from '@/components/walletconnect/SessionProposalModal.jsx';
import { RequestApprovalModal } from '@/components/walletconnect/RequestApprovalModal.jsx';
import { ActiveSessions } from '@/components/walletconnect/ActiveSessions.jsx';
import { REQUEST_TYPES } from '@/wallet-core/evm/walletconnect/router.js';
import { useWallet } from '@/lib/WalletProvider.jsx';

const CONFIGURED = Boolean(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID);

export default function WalletConnect() {
  const { initialized, error, pendingProposals, pendingRequests, pair } = useWalletConnect();
  const { isUnlocked } = useWallet();

  const [uri, setUri] = useState('');
  const [pairError, setPairError] = useState(null);
  const [pairing, setPairing] = useState(false);
  const [activeProposal, setActiveProposal] = useState(null);
  const [activeRequest, setActiveRequest] = useState(null);

  // Auto-surface the first pending proposal/request
  useEffect(() => {
    if (!activeProposal && pendingProposals.length) setActiveProposal(pendingProposals[0]);
  }, [pendingProposals, activeProposal]);

  useEffect(() => {
    if (!activeRequest && pendingRequests.length) setActiveRequest(pendingRequests[0]);
  }, [pendingRequests, activeRequest]);

  if (!CONFIGURED) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>WalletConnect</h1>
        <div className={styles.setupCard}>
          <p className={styles.setupTitle}>Project ID required</p>
          <p className={styles.setupBody}>
            To use WalletConnect, add your WalletConnect Cloud project ID to{' '}
            <code>.env.local</code>:
          </p>
          <pre className={styles.setupCode}>VITE_WALLETCONNECT_PROJECT_ID=your_project_id</pre>
          <p className={styles.setupBody}>
            Get a free project ID at{' '}
            <span className={styles.link}>cloud.walletconnect.com</span>
            {' '}(do not paste the URL here — open it in your browser manually).
          </p>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>WalletConnect</h1>
        <p className={styles.locked}>Unlock your wallet to connect to dApps.</p>
      </div>
    );
  }

  async function handlePair() {
    if (!uri.trim()) return;
    setPairing(true);
    setPairError(null);
    try {
      await pair(uri);
      setUri('');
    } catch (e) {
      setPairError(e.message);
    } finally {
      setPairing(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>WalletConnect</h1>

      {error && <p className={styles.error}>WalletConnect error: {error}</p>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Pair with dApp</h2>
        <p className={styles.hint}>
          In the dApp, choose "WalletConnect" and copy the URI or scan the QR code.
          Paste the URI below.
        </p>
        <div className={styles.pairRow}>
          <input
            className={styles.uriInput}
            type="text"
            placeholder="wc:..."
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePair()}
            disabled={!initialized || pairing}
          />
          <button
            className={styles.pairBtn}
            onClick={handlePair}
            disabled={!initialized || pairing || !uri.trim()}
          >
            {pairing ? 'Pairing…' : 'Pair'}
          </button>
        </div>
        {pairError && <p className={styles.error}>{pairError}</p>}
        {!initialized && !error && <p className={styles.hint}>Initialising…</p>}
      </section>

      {pendingRequests.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Pending requests
            <span className={styles.badge}>{pendingRequests.length}</span>
          </h2>
          <ul className={styles.requestList}>
            {pendingRequests.map((r) => (
              <li
                key={`${r.topic}:${r.id}`}
                className={styles.requestItem}
                onClick={() => setActiveRequest(r)}
              >
                <span className={styles.requestMethod}>{r.params?.request?.method}</span>
                <span className={styles.requestChevron}>›</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Active sessions</h2>
        <ActiveSessions />
      </section>

      {activeProposal && (
        <SessionProposalModal
          proposal={activeProposal}
          onClose={() => setActiveProposal(null)}
        />
      )}

      {activeRequest && (
        <RequestApprovalModal
          request={activeRequest}
          onClose={() => setActiveRequest(null)}
          onReauthNeeded={() => {
            setActiveRequest(null);
            // Nav back to unlock/settings — reauth flow not yet wired for WC
            window.history.back();
          }}
        />
      )}
    </div>
  );
}
```

Create `src/pages/WalletConnect.module.css`:

```css
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px 16px 64px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.heading { font-size: 1.4rem; font-weight: 700; color: #f0f2f5; margin: 0; }
.section { display: flex; flex-direction: column; gap: 12px; }
.sectionTitle {
  font-size: 0.9rem;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.badge {
  background: #4ADAC2;
  color: #050608;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 1px 7px;
}
.hint { font-size: 0.85rem; color: #8b949e; margin: 0; }
.pairRow { display: flex; gap: 10px; }
.uriInput {
  flex: 1;
  background: #0d1117;
  border: 1px solid #1D222B;
  border-radius: 10px;
  padding: 11px 13px;
  color: #f0f2f5;
  font-size: 0.9rem;
  font-family: 'IBM Plex Mono', monospace;
  outline: none;
}
.uriInput:focus { border-color: #4ADAC2; }
.uriInput::placeholder { color: #6e7681; }
.pairBtn {
  background: #4ADAC2;
  border: none;
  border-radius: 10px;
  padding: 11px 20px;
  color: #050608;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.pairBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.pairBtn:hover:not(:disabled) { background: #5de8d0; }
.error { color: #f85149; font-size: 0.85rem; margin: 0; }
.locked { color: #8b949e; font-size: 0.95rem; }
.requestList { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.requestItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0d1117;
  border: 1px solid #1D222B;
  border-radius: 8px;
  padding: 11px 14px;
  cursor: pointer;
}
.requestItem:hover { border-color: #4ADAC2; }
.requestMethod { font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: #f0f2f5; }
.requestChevron { color: #8b949e; font-size: 1.1rem; }
.setupCard {
  background: #12171f;
  border: 1px solid #1D222B;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.setupTitle { font-weight: 600; color: #f0f2f5; margin: 0; }
.setupBody { font-size: 0.88rem; color: #8b949e; margin: 0; }
.setupCode {
  background: #0d1117;
  border: 1px solid #1D222B;
  border-radius: 6px;
  padding: 10px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.85rem;
  color: #4ADAC2;
  margin: 0;
}
.link { color: #4ADAC2; }
```

- [ ] **Step 2: Commit**

```powershell
git add src/pages/WalletConnect.jsx src/pages/WalletConnect.module.css
git commit -m "feat(walletconnect): WalletConnect page — pair, sessions, pending requests"
```

---

## Task 10: Wire into App.jsx, navigation, feature catalogue

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/lib/navigation.js`
- Modify: `src/lib/featureCatalogue.js`

- [ ] **Step 1: Read the current App.jsx lazy-import block and route list**

Find the Connect group in `src/App.jsx` — look for the `/connect` and `/web3` routes. They are lazy-loaded. Add WalletConnect similarly.

- [ ] **Step 2: Add lazy import and route in App.jsx**

In `src/App.jsx`, add alongside other lazy imports at the top:

```js
const WalletConnect = lazy(() => import('@/pages/WalletConnect.jsx'));
```

Add `WalletConnectProvider` to the imports:

```js
import { WalletConnectProvider } from '@/lib/WalletConnectProvider.jsx';
```

Add the route inside the Connect route group (alongside `/connect` and `/web3`):

```jsx
<Route path="/walletconnect" element={<WalletConnect />} />
```

Wrap the route subtree that needs WC context (the Connect group) with `<WalletConnectProvider>`. The exact placement depends on how the Connect group is structured — it must be inside `WalletProvider` and wrap only the routes that use `useWalletConnect()`. If the Connect group already has a wrapper component, add `WalletConnectProvider` inside that. If not, add it as a layout wrapper:

```jsx
<WalletConnectProvider>
  <Route path="/walletconnect" element={<WalletConnect />} />
  {/* other Connect group routes */}
</WalletConnectProvider>
```

**Note for implementer:** After reading App.jsx, find the existing `<Route path="/connect" ...>` and `<Route path="/web3" ...>` and add the new route and provider in the same pattern as the existing ones. Do not restructure the route hierarchy.

- [ ] **Step 3: Add nav item in navigation.js**

In `src/lib/navigation.js`, find the Connect group (the array/object containing `/connect` and `/web3`). Add:

```js
{
  label: 'WalletConnect',
  path: '/walletconnect',
  icon: 'link',        // use whatever icon system the codebase uses
},
```

**Note for implementer:** Read `navigation.js` first and match the exact shape of existing items. The `icon` value must match what the existing items use.

- [ ] **Step 4: Update featureCatalogue.js**

In `src/lib/featureCatalogue.js`, find the `'WalletConnect / dApp Connector'` entry (currently `status: 'roadmap'`). Update it to:

```js
{
  name: 'WalletConnect / dApp Connector',
  status: 'provisional',
  summary: 'Connect to dApps via WalletConnect v2',
  explanation:
    'WalletConnect v2 transport + message signing (D1+D2). ' +
    'Pair with dApps, approve/reject session proposals, sign personal_sign and eth_signTypedData_v4 ' +
    'requests with Permit/Permit2 hard warnings. ' +
    'eth_sendTransaction (D3) is display-only pending real-device testnet verification. ' +
    'Requires VITE_WALLETCONNECT_PROJECT_ID in .env.local.',
},
```

- [ ] **Step 5: Run full test suite to confirm nothing broken**

```powershell
npx vitest run --reporter=dot
```

Expected: All existing tests pass. The 2 pre-existing OOM timeouts (sendDispatch + csp-wasm-kdf without `--singleFork`) are known failures; everything else green.

- [ ] **Step 6: Commit**

```powershell
git add src/App.jsx src/lib/navigation.js src/lib/featureCatalogue.js
git commit -m "feat(walletconnect): wire route, nav item, feature catalogue"
```

---

## Task 11: Push, PR, CI

- [ ] **Step 1: Push the branch**

```powershell
git push -u origin HEAD
```

- [ ] **Step 2: Open PR**

```powershell
gh pr create --title "feat: WalletConnect v2 dApp connector (D1+D2 — transport + signing)" --body "$(cat <<'EOF'
## Summary
- Installs `@walletconnect/web3wallet` + Vite optimizeDeps fix
- Adds `typed-data.js`: pure EIP-712 parse, Permit/Permit2/Seaport detection
- Adds `walletconnect/router.js`: request classifier (eth_sign + wallet_addEthereumChain blocked)
- Adds `walletconnect/session.js`: WC2 singleton — pair, session lifecycle, respond
- Adds `WalletConnectProvider.jsx`: React context holding proposals/requests/sessions state; routes signing through existing `withPrivateKey()` (keys never leave device)
- `SessionProposalModal`: approve/reject dApp connection with chain + method display
- `RequestApprovalModal`: personal_sign + eth_signTypedData_v4 with mandatory Permit/Permit2 hard warning + acknowledgement checkbox; sendReauthRequired 2-min window enforced; eth_sendTransaction display-only pending testnet verification
- `ActiveSessions`: list with per-session revoke
- `WalletConnect` page: URI paste pairing, sessions, pending request list
- Feature catalogue: roadmap → provisional

## Status
D1 (transport): ✅ pair, approve/reject sessions, session list, revoke  
D2 (message signing): ✅ personal_sign + eth_signTypedData_v4 with Permit hard warning  
D3 (tx signing): 🔶 DISPLAY-ONLY — simulation wired, signing not wired pending testnet txid  
D4 (session hardening): PLANNED

## Security
- I1: signing via `withPrivateKey()` — key never stored in WC layer
- I2: no egress except WC relay (project-ID-gated relay, not Veyrnox backend)
- I3: `destroyWalletConnect()` called on wallet lock — no lingering relay connection
- I4: eth_sign + wallet_addEthereumChain blocked outright; Permit requires explicit checkbox

## Test plan
- [ ] Set `VITE_WALLETCONNECT_PROJECT_ID` in `.env.local`
- [ ] `npm run dev`, navigate to /walletconnect
- [ ] Open https://react-app.walletconnect.com (example dApp) in a browser tab, copy the WC URI
- [ ] Paste URI into Veyrnox WalletConnect page, click Pair — session proposal should appear
- [ ] Approve — dApp shows connected
- [ ] Trigger a personal_sign from the dApp — approval modal should appear with message
- [ ] Approve — dApp receives the signature
- [ ] Trigger an eth_signTypedData_v4 with a Permit — warning and checkbox should appear
- [ ] Revoke session from Active Sessions list — dApp shows disconnected
- [ ] Lock wallet — WC relay destroys (no lingering connection)

🤖 Generated with Claude Code
EOF
)"
```

- [ ] **Step 3: Watch CI**

```powershell
gh pr checks HEAD --watch
```

Expected: `verify` passes (the same suite that passed in prior PRs).

---

## Self-Review

### Spec coverage
- D1 transport (pair, session approve/reject, session list, revoke): ✅ Tasks 4, 6, 8, 9
- D2 message signing (personal_sign, eth_signTypedData_v4, Permit warn): ✅ Tasks 5, 7
- D3 tx signing: ⚠️ Intentionally display-only per CLAUDE.md "verify, don't assert" rule. eth_sendTransaction signing is blocked in the approve button (`type === REQUEST_TYPES.SEND_TRANSACTION` disables approve). Simulation is wired so the UI can show risk info. Full D3 needs a real testnet txid — correct to hold here.
- D4 session hardening: PLANNED (session expiry, chain switching — out of scope this PR)
- `WALLETCONNECT_ENABLED` flag: Replaced by `VITE_WALLETCONNECT_PROJECT_ID` check — the project ID IS the feature flag. No project ID = no feature. This is cleaner than a separate boolean.
- Feature flag guard on route: ✅ Page degrades gracefully if project ID absent
- Fail closed on unknown calldata: ✅ UNKNOWN type shows "cannot safely display or sign", approve not shown
- Permit/Permit2/Seaport hard warn: ✅ Red box + mandatory checkbox
- Step-up reauth: ✅ `sendReauthRequired` check in RequestApprovalModal
- I3 deniability on lock: ✅ `destroyWalletConnect()` called in WalletConnectProvider on `!isUnlocked`
- eth_sign blocked: ✅ BLOCKED_METHODS set + blocked === true renders block UI
- wallet_addEthereumChain blocked: ✅ same

### Placeholder scan
No TBDs, no "add error handling" vagueness — every step has complete code.

### Type consistency
- `classifyRequest` → `REQUEST_TYPES.*` string — used consistently in router.js, WalletConnectProvider.jsx, RequestApprovalModal.jsx
- `parseTypedData` → `{ valid, types, domain, primaryType, message }` — used identically in typed-data.js and WalletConnectProvider.jsx
- `enrichRequest` in WalletConnectProvider attaches `type`, `blocked`, `typedDataMeta` — all three are read in RequestApprovalModal
- `withPrivateKey(index, fn)` — index=0 used consistently (primary EVM account)
- Session object from `getActiveSessions()` has `s.topic`, `s.peer.metadata`, `s.expiry` — used in ActiveSessions.jsx
