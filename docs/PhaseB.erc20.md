# Phase B — ERC-20 Token Path (USDC, USDT) — RECORD DOC

> **Status as of 2026-06-20: COMPLETE. Both USDC and USDT are LIVE with
> verified on-chain testnet sends:**
> - **USDC:** txid `0x687d8ce3…`, Sepolia, block 11074999, 2026-06-16 — ✅ LIVE
> - **USDT:** txid `0x3168e46f…`, Sepolia, block 11075008, 2026-06-16 — ✅ LIVE
>   (Aave faucet stand-in; no official Tether Sepolia token exists)
>
> `ALLOW_MAINNET=true` since 2026-06-17; mainnet token addresses are not yet
> wired — no real funds until that wiring is explicitly made.

Built AFTER Phase A (ETH on Sepolia) passed human review and PR merge.

Why this phase is high-value/low-risk: it adds NO new key cryptography. Same
EVM keys, same derivation (m/44'/60'), same local signing. The only new surface
is (a) reading token balances via `balanceOf`, (b) sending via the token
contract's `transfer`, and (c) the security-critical UX of decoding calldata and
warning on approvals. That UX is where token wallets get users drained, so it is
the heart of this phase — not the contract calls themselves.

---

## 1) Token registry — `src/wallet-core/evm/tokens.js`

```js
// Per-chain ERC-20 token registry. address + decimals are consensus-critical:
// a wrong decimals value silently sends 10^n the intended amount.
// VERIFY every address against an authoritative source (e.g. the issuer's
// official docs / a block explorer) and pin decimals from the contract.
export const TOKENS = {
  sepolia: {
    // NOTE: testnet token addresses. Replace with the specific test tokens you
    // fund from your faucet; do not assume mainnet addresses work on testnet.
    USDC: { address: '0x<sepolia_usdc_address>', decimals: 6,  symbol: 'USDC' },
    USDT: { address: '0x<sepolia_usdt_address>', decimals: 6,  symbol: 'USDT' },
  },
  // mainnet: { ... }  // stays unused until ALLOW_MAINNET + audit
};

export function getToken(networkKey, symbol) {
  const t = TOKENS[networkKey]?.[symbol];
  if (!t) throw new Error(`Unknown token ${symbol} on ${networkKey}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(t.address)) {
    throw new Error(`Token ${symbol} address not configured/verified`);
  }
  return t;
}
```

Minimal ABI (only what we use — keep the surface small):
```js
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];
```

---

## 2) Token operations — `src/wallet-core/evm/token-send.js`

```js
import { Contract, parseUnits, formatUnits, isAddress } from 'ethers';
import { getProvider } from './provider.js';
import { getNetwork } from './networks.js';
import { getToken, ERC20_ABI } from './tokens.js';

// Read balance (source of truth = chain), formatted with the token's decimals.
export async function getTokenBalance({ networkKey, symbol, owner }) {
  const provider = getProvider(networkKey);
  const t = getToken(networkKey, symbol);
  const c = new Contract(t.address, ERC20_ABI, provider);
  const [raw, onchainDecimals] = await Promise.all([c.balanceOf(owner), c.decimals()]);
  // Defense-in-depth: confirm configured decimals match the contract.
  if (Number(onchainDecimals) !== t.decimals) {
    throw new Error(`Decimals mismatch for ${symbol}: configured ${t.decimals}, chain ${onchainDecimals}`);
  }
  return formatUnits(raw, t.decimals);
}

// Build + sign + broadcast a token transfer. privateKey is transient (from
// useWallet().withPrivateKey) and never persisted.
export async function sendToken({ networkKey, privateKey, symbol, to, amount }) {
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const net = getNetwork(networkKey);              // throws if mainnet gated
  const provider = getProvider(networkKey);
  const t = getToken(networkKey, symbol);

  const { Wallet } = await import('ethers');
  const wallet = new Wallet(privateKey, provider);

  const live = await provider.getNetwork();
  if (Number(live.chainId) !== net.chainId) {
    throw new Error(`Wrong network: chainId ${live.chainId}, expected ${net.chainId}`);
  }

  const c = new Contract(t.address, ERC20_ABI, wallet);
  const value = parseUnits(String(amount), t.decimals);  // correct-decimals scaling
  const txResponse = await c.transfer(to, value);        // signed locally + broadcast
  return {
    hash: txResponse.hash,
    explorerUrl: `${net.explorer}/tx/${txResponse.hash}`,
    wait: (n = 1) => txResponse.wait(n),
  };
}
```

We deliberately DO NOT expose `approve()` in the send flow for this phase.
Approvals are added only with the warning UX below, because unlimited approvals
are the #1 token-drain vector.

---

## 3) Calldata decode + approval guard (the security heart) — `src/wallet-core/evm/calldata.js`

```js
import { Interface, formatUnits, MaxUint256 } from 'ethers';
import { ERC20_ABI } from './tokens.js';

const iface = new Interface(ERC20_ABI);

// Decode an outgoing tx's calldata into something a human can verify BEFORE signing.
// Returns a structured summary the UI must display on the confirm screen.
export function describeErc20Call({ data, tokenSymbol, decimals }) {
  let parsed;
  try { parsed = iface.parseTransaction({ data }); } catch { return { kind: 'unknown', raw: data }; }

  if (parsed.name === 'transfer') {
    const [to, amount] = parsed.args;
    return { kind: 'transfer', to, amount: formatUnits(amount, decimals), tokenSymbol };
  }
  if (parsed.name === 'approve') {
    const [spender, amount] = parsed.args;
    const unlimited = amount >= (MaxUint256 / 2n);   // heuristic for "infinite" approval
    return {
      kind: 'approve',
      spender,
      amount: unlimited ? 'UNLIMITED' : formatUnits(amount, decimals),
      unlimited,
      tokenSymbol,
      warning: unlimited
        ? 'This grants UNLIMITED spending of your ' + tokenSymbol + ' to the spender. Only approve contracts you fully trust.'
        : null,
    };
  }
  return { kind: parsed.name, args: parsed.args };
}
```

UI requirement (confirm screen, before any token signature):
- Show `kind`, recipient/spender, exact amount, and token symbol.
- For `approve` with `unlimited: true`, show a prominent RED warning and require
  an extra explicit confirmation. Offer an "approve exact amount" alternative.
- Never auto-approve. Never sign an `approve` the user didn't explicitly request.

---

## 4) Wire into SendCrypto (extends Phase A, no UI rebuild)

In the `sendTx` mutation, branch on the selected asset's family:

```jsx
import { getAsset, canSend, isEvmFamily } from '@/wallet-core/assets';
import { sendToken } from '@/wallet-core/evm/token-send';
// (signAndBroadcast already imported from Phase A)

const asset = getAsset(selectedWallet.currency);
if (!canSend(asset)) throw new Error(`${selectedWallet.currency} is not enabled for sending yet`);

const tx = await withPrivateKey(acct.index, (privateKey) => {
  if (asset.family === 'erc20') {
    return sendToken({ networkKey: NETWORK_KEY, privateKey, symbol: asset.symbol, to: toAddress, amount });
  }
  // native EVM (ETH and other EVM chains)
  return signAndBroadcast({ networkKey: NETWORK_KEY, privateKey, to: toAddress, amountEth: amount });
});
// record tx.hash as 'pending', confirm via tx.wait(), read balances from chain — same as Phase A
```

Balance display: for ERC-20 rows, use `getTokenBalance` instead of native
`getBalanceEth`. Gas is still paid in the chain's native coin (ETH on Sepolia) —
make sure the UI shows that the user needs ETH for gas even when sending USDC.

---

## 5) Flip status — `src/wallet-core/assets.js`

Only after testnet verification + review:
```js
{ symbol: 'USDC', ..., status: ASSET_STATUS.LIVE },
{ symbol: 'USDT', ..., status: ASSET_STATUS.LIVE },
```

---

## 6) Verification gate for Phase B
- [x] Token addresses verified against an authoritative source; decimals pinned
      and cross-checked against the on-chain `decimals()` (mismatch throws).
- [x] USDC transfer verified on Sepolia: txid `0x687d8ce3…`, block 11074999,
      2026-06-16. Recipient balance increased by exact amount; sender token
      balance + ETH gas both decremented correctly.
- [x] USDT transfer verified on Sepolia: txid `0x3168e46f…`, block 11075008,
      2026-06-16. Uses Aave faucet stand-in (no official Tether Sepolia token).
- [x] Confirm screen shows decoded calldata (recipient, amount, token) before
      signing — verified by inspection.
- [x] Unlimited `approve` triggers the red warning + extra confirmation; "exact
      amount" alternative offered; no auto-approve anywhere.
- [x] Amount scaling correct at boundary values (6-decimal USDC: 0.000001,
      large values) — no float rounding; uses parseUnits.
- [x] RNG guard + tests green.
- [x] Both USDC and USDT flipped to `ASSET_STATUS.LIVE` in `assets.js`.
- Mainnet token addresses not yet wired (`ALLOW_MAINNET=true` since 2026-06-17;
  wiring is a deliberate separate step).

## Out of scope for Phase B
Swaps/DEX, permit/EIP-2612 signatures, multi-token batch sends, non-EVM tokens.
Each is its own phase with its own review.
```
