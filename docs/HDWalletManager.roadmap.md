# HDWalletManager Rewiring + 10-Asset Roadmap

Two things in one doc:
1. How to rewire HDWalletManager onto the real core (keep the UI).
2. The roadmap to make all 10 assets real, in safe order — with a status
   model so the UI can show all 10 WITHOUT letting users transact on ones
   that aren't actually implemented.

The hard rule throughout: **a wallet may only SEND if its asset's status is
`live`.** Showing a non-functional asset is fine; letting funds move on it is
not. This is exactly the failure mode of the original code (10 fake wallets) —
we keep the 10, but make dysfunction visible and non-transactable.

---

## Part 1 — Asset status registry (single source of truth)

Create `src/wallet-core/assets.js`:

```js
// Status drives BOTH display and capability gating.
//  live       = real keys, real signing/broadcast, send allowed
//  receive_only = real address derivation, can receive/show balance, NO send
//  coming_soon  = shown in UI as roadmap, NO address, NO send
export const ASSET_STATUS = { LIVE: 'live', RECEIVE_ONLY: 'receive_only', COMING_SOON: 'coming_soon' };

export const ASSETS = [
  // EVM-native + EVM chains share the secp256k1 / m/44'/60' derivation.
  { symbol: 'ETH',   name: 'Ethereum',  family: 'evm', chain: 'sepolia', status: 'live' },
  { symbol: 'USDC',  name: 'USD Coin',  family: 'erc20', chain: 'sepolia', status: 'coming_soon' },
  { symbol: 'USDT',  name: 'Tether',    family: 'erc20', chain: 'sepolia', status: 'coming_soon' },
  { symbol: 'MATIC', name: 'Polygon',   family: 'evm', chain: 'polygon', status: 'coming_soon' },
  { symbol: 'ARB',   name: 'Arbitrum',  family: 'evm', chain: 'arbitrum', status: 'coming_soon' },
  { symbol: 'OP',    name: 'Optimism',  family: 'evm', chain: 'optimism', status: 'coming_soon' },
  { symbol: 'AVAX',  name: 'Avalanche', family: 'evm', chain: 'avalanche', status: 'coming_soon' },
  { symbol: 'BNB',   name: 'BNB Chain', family: 'evm', chain: 'bsc', status: 'coming_soon' },
  // Non-EVM: separate derivation + signing + audits. Stubs throw today.
  { symbol: 'BTC',   name: 'Bitcoin',   family: 'btc', chain: 'bitcoin', status: 'coming_soon' },
  { symbol: 'SOL',   name: 'Solana',    family: 'solana', chain: 'solana', status: 'coming_soon' },
];

export const canSend = (a) => a.status === ASSET_STATUS.LIVE;
export const canReceive = (a) => a.status !== ASSET_STATUS.COMING_SOON;
```

As each asset becomes real, you flip its `status` — one line, and the UI +
gating update together. Nothing is "secretly" functional or non-functional.

---

## Part 2 — Rewire HDWalletManager.jsx (keep the UI)

DELETE the placeholders entirely:
- `generateMnemonic()` (Math.random over ~130 words) → use `useWallet().createWallet`.
- `deriveAddress()` (string-hash) → use derived `accounts` for EVM; for non-EVM,
  show NO fabricated address (status `coming_soon` => address hidden).
- `MOCK_WALLETS` → remove; wallets come from derivation + persisted public labels.

KEEP: the wallet list UI, the tabs (My Wallets / Import / Generate), the
expand/detail layout, copy buttons, styling.

Wire generate/import:
```jsx
import { useWallet } from '@/lib/WalletProvider';
const { createWallet, importWallet, accounts } = useWallet();

// Generate tab:
const seed = await createWallet(password);   // returns mnemonic ONCE for backup
setGeneratedSeed(seed);                       // show for backup, then drop it
// Import tab:
await importWallet(importPhrase.trim(), password);  // validates BIP-39 checksum
```

Per-asset rows render from ASSETS, with status-driven affordances:
```jsx
import { ASSETS, canSend, canReceive, ASSET_STATUS } from '@/wallet-core/assets';

{ASSETS.map(asset => {
  const evmAccount = asset.family === 'evm' || asset.family === 'erc20'
    ? accounts[0] : null;            // EVM family shares one derived address
  return (
    <WalletRow
      key={asset.symbol}
      asset={asset}
      address={canReceive(asset) ? evmAccount?.address : null}  // no fake addresses
      badge={asset.status}            // 'Live' / 'Receive only' / 'Coming soon'
      sendDisabled={!canSend(asset)}  // HARD gate, not cosmetic
    />
  );
})}
```

UI requirements for honesty (important):
- `coming_soon`: show the row greyed with a "Coming soon" badge; NO address,
  Send + Receive disabled. Tooltip: "Not yet available."
- `receive_only`: show address + balance, Receive enabled, Send disabled with
  "Sending not yet enabled for {symbol}."
- `live`: full function.

---

## Part 3 — Roadmap to make all 10 real (safe order)

Each phase ends at its own verification + (for mainnet) audit gate. Do not flip
a status to `live` until that asset's crypto path is verified.

### Phase A — ETH (DONE in the slice)
- Native Sepolia send, local signing, chain-as-truth. Status: `live` (testnet).
- Gate to mainnet: independent audit + checklist sign-off.

### Phase B — ERC-20 tokens (USDC, USDT) — biggest reach for least new crypto
- No NEW key crypto: same EVM keys/derivation/signing. New work is the TOKEN
  path: `transfer`/`approve` calldata via ethers `Contract`, decimals handling,
  and (critical) human-readable approval UX + unlimited-approval warnings.
- Add token registry (address + decimals per chain). Read balances via
  `balanceOf`. Send via `transfer`.
- Verify: testnet USDC transfer; decode calldata shown to user before signing.
- Flip USDC/USDT to `live` (testnet) after review.

### Phase C — Additional EVM chains (MATIC, ARB, OP, AVAX, BNB)
- Mostly CONFIG, not new crypto: add each to `evm/networks.js` (chainId, RPC,
  explorer, symbol), keep `enabled:false`/gated until tested. Same signing code,
  chainId verification already in place.
- Per-chain testing: a testnet send on each; confirm chainId guard rejects
  cross-chain mistakes.
- Note: native gas symbols differ (MATIC/AVAX/BNB); ensure fee + display use
  the chain's symbol, not hardcoded ETH.
- Flip each to `live` (testnet) as its test passes.

### Phase D — Bitcoin (separate implementation)
- Shares NOTHING with EVM. Implement with `@scure/btc-signer`: BIP-84 (bech32
  P2WPKH) derivation `m/84'/0'/0'/0/0`, UTXO selection, fee estimation, PSBT
  signing, broadcast via a Bitcoin node/Esplora API.
- Its own test vectors (BIP-84) + its own audit scope. Status `coming_soon`
  until then; replace the throwing stub in derivation.js.

### Phase E — Solana (separate implementation)
- ed25519 (NOT secp256k1), SLIP-0010 `m/44'/501'/0'/0'`, base58 addresses,
  `@solana/web3.js` for tx build/sign/broadcast, devnet first.
- Its own test vectors + audit scope. Status `coming_soon` until then.

### Cross-cutting before ANY mainnet
- Independent third-party audit covering every `live` path.
- Per-asset interop check (derive here, import into a reference wallet, same
  address).
- RNG guard extended to any new crypto files; tests for each asset.

---

## Why this order
EVM-native → ERC-20 → more EVM chains reuses one audited key core and multiplies
coverage fast (7 of 10 assets are EVM-family). BTC and SOL are deliberately last
because they are independent crypto stacks needing their own audits — doing them
early would multiply audit cost and risk before the core is proven.
```
