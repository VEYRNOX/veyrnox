# On-chain send/receive evidence — MODULE-CONFIRMED, app-path verification PENDING

> **Status: NOT `live`. NOT in `verified-evidence.json`.** The transactions below are
> real and independently confirmed on-chain (explorer / RPC), but they were produced by
> **wallet-core / module sends, NOT through the app's `SendCrypto` dispatch path**
> (ETH + SOL are self-transfers; BTC went to a faucet address). Per CLAUDE.md
> ("verify, don't assert") and `docs/multi-asset-send.verification-checklist.md`, an
> asset flips `receive_only → live` **only** after an **app-path** send confirms on a
> block explorer. So **BTC + SOL remain `receive_only`** and `verified-evidence.json`
> stays empty until that step. This file is an honest interim receipt, not a flip.

## Confirmed on-chain (independently verified 2026-06-12)

| Chain | Derived address (receive) | Balance (confirmed) | Send tx (confirmed) | Send shape | Source |
|---|---|---|---|---|---|
| **ETH** (Sepolia) | `0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729` | 0.181857377152892 ETH | `0x2d4d5df057c6f61abaf78383d6cad9d1f7f66abfa2b2aec6520a0be8811b8ea9` — **success**, 11,156 confs | 0.001 ETH **self-transfer** | Blockscout (eth-sepolia) |
| **BTC** (testnet) | `tb1qztdfvzkdup458v6nk555ztzsgduh7lhggekx54` | 0.00142564 BTC (recv 0.00335269, 2 tx) | `d9cc113f2c9c94d7175e546e29b16920aeadd9d34baca7596a0394ab2362a62e` — **confirmed**, block 4,990,393 | 0.0005 BTC → faucet `tb1qlj64…25p7q`; change to self | mempool.space/testnet |
| **SOL** (devnet) | `Cp5MYrCMbUe7wra4ziGsVN672ZjpeLi5CFNj4Je7yFWK` | 0.49999 SOL (499,990,000 lamports) | `cCqCiKMdfXDHJRc75bn8u2uDBReuo3rfT2NLXMx26W8eWp7omMnSU3gTu3RMMZkQuUdJMZoFYdpV2wR8zZTEXic` — **finalized**, `status: Ok` | 0.001 SOL **self-transfer** (System program) | api.devnet.solana.com (getTransaction/getBalance) |

## What this DOES validate
- **Receive** — the app's per-chain address derivation is correct, and real funds have
  landed and confirmed at all three derived addresses.
- **Wallet-core signing/broadcast** — each chain's signing stack constructs a valid
  transaction the network accepts and finalizes (EVM secp256k1 / BTC BIP-84 P2WPKH /
  SOL ed25519 System transfer).

## What this does NOT validate (the open gate)
- **The app's `SendCrypto` dispatch path on-chain.** None of these txids was produced by
  the app UI. That path is exactly what had real defects — the structurally-unsatisfiable
  2FA send gate (fixed by #152, merged) and the mainnet-only BTC recipient regex that
  rejected `tb1…` testnet addresses (fixed in PR #123). It has never broadcast on-chain.

## Remaining step to flip to `live`
1. Merge PR #123 (BTC/SOL family dispatch + `tb1` fix), now mergeable on top of #152.
2. Send a small amount of **each** asset **through the app UI** (re-auth with PIN/password).
3. Confirm those **app-produced** txids on the explorers/RPC above, then — and only then —
   flip BTC + SOL to `live` in `src/wallet-core/assets.js` and record the app-path txids in
   `verified-evidence.json` with the date.

*Testnet/throwaway only. `ALLOW_MAINNET` stays false. Code + module sends = BUILT; never "verified".*
