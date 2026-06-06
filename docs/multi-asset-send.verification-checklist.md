# Multi-asset send — hands-on testnet verification checklist

> **Status of this doc:** PLANNING / TODO. Nothing here is verified. Every asset
> below is still `receive_only` in `src/wallet-core/assets.js` and stays that way
> until a real on-chain testnet send is confirmed and signed off. An asset flips to
> `live` ONLY after its **Confirmed txid** cell is filled with a real explorer link.
> Never a `status: live` without a confirmed txid. (Master doc §24.3; honest-tagging
> discipline.)

## How to run the sends (dev-only ungate)

The production `canSend()` gate blocks sending a `receive_only` asset. For hands-on
verification only, a dev-only, testnet-only ungate relaxes the **UI gate decision**
without changing any asset's status (see `src/lib/devSendOverride.js`). It is
provably inert in production builds (compiles to `false`; verified from the emitted
bundle).

```bash
# macOS/Linux
VITE_DEV_UNGATE_SEND=1 npm run dev
# Windows PowerShell
$env:VITE_DEV_UNGATE_SEND=1; npm run dev
```

Then: unlock the wallet → pick the asset → an orange **"DEV UNGATE ACTIVE"** banner
confirms the bypass is on → fund the address from the faucet → send a small amount →
paste the resulting txid into the table below. The send routes through the same
local-sign + broadcast path the unit tests pin (see *Test coverage* at the bottom).

All EVM/ERC-20 assets derive the **same address as your Sepolia ETH wallet**
(secp256k1, `m/44'/60'/0'/0/0`). Fund THAT address on each chain.

## Per-asset checklist (EVM natives + ERC-20 tokens)

| Asset | Network (chainId) | Gas token | Faucet | Explorer (tx) | Expected on-chain result | Confirmed txid |
|---|---|---|---|---|---|---|
| ARB | Arbitrum Sepolia (421614) | ETH | bridge Sepolia ETH via [Arbitrum bridge](https://bridge.arbitrum.io/), or [QuickNode Arb-Sepolia faucet](https://faucet.quicknode.com/arbitrum/sepolia) | `https://sepolia.arbiscan.io/tx/<hash>` | Native value transfer succeeds; sender ETH balance ↓ by amount + gas | _(pending)_ |
| OP | OP Sepolia (11155420) | ETH | [Superchain faucet](https://console.optimism.io/faucet), or bridge | `https://sepolia-optimism.etherscan.io/tx/<hash>` | Native value transfer succeeds; sender ETH balance ↓ by amount + gas | _(pending)_ |
| MATIC | Polygon Amoy (80002) | **POL** | [Polygon faucet → Amoy](https://faucet.polygon.technology/) | `https://amoy.polygonscan.com/tx/<hash>` | Native POL transfer succeeds; fee/balance UI shows **POL**, not ETH | _(pending)_ |
| AVAX | Avalanche Fuji (43113) | **AVAX** | [Core/Avalanche Fuji faucet](https://core.app/tools/testnet-faucet/) | `https://testnet.snowtrace.io/tx/<hash>` | Native AVAX transfer succeeds; fee/balance UI shows **AVAX** | _(pending)_ |
| BNB | BNB Smart Chain Testnet (97) | **tBNB** | [BNB testnet faucet](https://www.bnbchain.org/en/testnet-faucet) | `https://testnet.bscscan.com/tx/<hash>` | Native tBNB transfer succeeds; fee/balance UI shows **tBNB**. ⚠️ See BNB gas note | _(pending)_ |
| USDC | Sepolia (11155111) | ETH (for gas) | [Circle faucet → Ethereum Sepolia](https://faucet.circle.com/) for USDC; Sepolia ETH faucet for gas | `https://sepolia.etherscan.io/tx/<hash>` | `transfer()` to USDC contract `0x1c7D…7238`; recipient USDC ↑ by amount; 6-dec scaling | _(pending)_ |
| USDT | Sepolia (11155111) — Aave faucet stand-in | ETH (for gas) | [Aave faucet → mint test USDT](https://gho.aave.com/faucet/); Sepolia ETH for gas | `https://sepolia.etherscan.io/tx/<hash>` | `transfer()` to test-USDT `0xaA8E…33D0`; recipient USDT ↑ by amount; **6-dec** scaling (not 18) | _(pending)_ |
| BTC | Bitcoin testnet (BIP-84, `tb1…` P2WPKH) | BTC (sat/vB, auto fee-rate) | [mempool testnet faucet](https://mempool.space/testnet) / [bitcoinfaucet.uo1.net](https://bitcoinfaucet.uo1.net/) | `https://mempool.space/testnet/tx/<txid>` | P2WPKH send succeeds; sum(inputs)=outputs+fee; change returns to self; 8-dec (sats) scaling | _(pending)_ |
| SOL | Solana devnet | SOL (base fee, auto) | `solana airdrop 2 <addr> --url devnet` or [faucet.solana.com](https://faucet.solana.com/) | `https://explorer.solana.com/tx/<sig>?cluster=devnet` | System transfer succeeds; rent-exempt minimum respected; recipient SOL ↑; 9-dec (lamports) scaling | _(pending)_ |

### ⚠️ BNB gas note
BNB testnet supports EIP-1559 (Hertz hardfork) but pins **baseFee = 0**, and BSC
nodes enforce a **minimum gas price**. The app's "Slow" tier (baseFee 0 + 0.1 gwei
floor) can underprice below that minimum and be rejected by the node. If a BNB send
bounces with a "gas price too low / underpriced" error, pick **Standard or Fast**
(or a custom fee ≥ the BSC minimum, typically ~1 gwei) — this is a fee selection,
not a code bug.

## After you confirm a txid (what I will do, per asset)
1. Paste the txid → I verify it on the explorer (correct from/to/value/token, success).
2. Flip **only that asset** `receive_only → live` in `assets.js`.
3. Record the txid + date in `docs/Feature-Status.md` (the verified table).
No asset moves to `live` before its row above has a real confirmed txid.

## Test coverage backing this (already merged, all green)
- `__tests__/networks.test.js` — chainId/symbol per chain verified vs ethereum-lists; mainnets gated.
- `__tests__/chainid-guard.test.js` — pre-broadcast wrong-chain guard fires per chain.
- `__tests__/evm-send-signing.test.js` — native sends: signed bytes commit to the correct chainId/recipient/value/fee and recover to the sender (ETH control + ARB/OP/MATIC/AVAX/BNB); cross-chain replay isolation.
- `__tests__/evm-token-send-signing.test.js` — ERC-20 sends: signed bytes are `transfer()` to the correct token contract, 6-dec scaling, on-chain decimals cross-check aborts a mismatch before signing (USDC + USDT).
- `lib/__tests__/sendDispatch.test.js` — the BTC/SOL dispatch units: `toBaseUnits` (BigInt-only decimal→sats/lamports; over-precision and non-positive amounts throw) and `normalizeSendResult` (per-family result shape).
- `__tests__/sol-send-signing.test.js` — SOL local signing: `buildAndSignSol` produces a System transfer to the correct recipient/lamports, fee payer = sender, signature verifies. (BTC's `buildAndSignTx` is already covered by `btc-coinselect.test.js`.)
- `__tests__/erc20.test.js` — calldata decode, exact-unit scaling, registry guard, unlimited-approval warning.
- `lib/__tests__/devSendOverride.test.js` — the dev ungate is false in every combination except dev-build + explicit opt-in.

## Now wired in this batch (BTC + SOL dispatch)
- **BTC** (Bitcoin testnet, BIP-84) and **SOL** (Solana devnet) are now routed by
  `SendCrypto.jsx` to `wallet-core/btc/send.js` / `wallet-core/sol/send.js` via the
  pure `lib/sendDispatch.js` (family dispatch + amount→sats/lamports conversion).
  They remain `receive_only` until a confirmed txid is pasted above — identical
  honest-tagging discipline as the EVM assets.

## Deferred (not in this batch)
- BTC fee-rate (sat/vB) selector and SOL priority-fee selector — sends use the
  auto-fetched fee rate / base fee.
- Live on-chain balance reads for BTC/SOL — the UI max-check is skipped for them;
  the send path enforces real funds (BTC coin-selection, SOL rent/balance).
