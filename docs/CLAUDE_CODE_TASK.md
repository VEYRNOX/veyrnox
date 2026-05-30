# Claude Code — EVM Slice Integration Task

This package contains a verified-where-possible EVM wallet slice. Your job is to
integrate it into the live repo, install deps, run the tests, and prove a real
Sepolia send. Keep the existing UI; replace only the fake core.

## Constraints (do not violate)
- Keys/seeds NEVER leave the device. Never log, persist, or send mnemonics or
  private keys. The backend stores ciphertext + PUBLIC addresses only.
- Mainnet stays GATED (`ALLOW_MAINNET=false`) — testnet (Sepolia) only.
- Do NOT write balances to the DB as source of truth; read them from chain.
- Run `npm run check:rng` and `npm test`; both must pass before opening a PR.
- Open a branch + PR for human review. Do not merge. The crypto paths require
  human verification and an independent audit before any mainnet use.

## Steps
1. Copy `src/wallet-core/**` and `src/lib/WalletProvider.jsx` into the repo
   (paths align with the existing `@/*` alias).
2. Install deps:
   `npm i @scure/bip39 @scure/bip32 @noble/curves @noble/hashes hash-wasm`
   (ethers v6 is already present). Dev: `npm i -D vitest fake-indexeddb`.
3. Add the RNG guard to package.json:
   `"check:rng": "node scripts/check-crypto-rng.mjs"`, and as a `pretest` hook.
   Configure vitest with jsdom + `fake-indexeddb/auto` so vaultStore tests run.
4. Wrap the app in `<WalletProvider>` (see docs/SendCrypto.integration.md).
5. Rewire `SendCrypto.jsx` per docs/SendCrypto.integration.md — swap ONLY the
   `sendTx` mutation core; keep all UI and security-UX components.
6. Rewire `HDWalletManager.jsx`: replace the toy `generateMnemonic` and
   `deriveAddress` with `useWallet().createWallet/importWallet` and the derived
   `accounts`. Show the mnemonic ONCE on creation for backup; never store it.
7. Make the selectable wallets come from derived HD `accounts` (public
   addresses), persisting only labels + addresses in base44 — never keys.
8. Run `npm run check:rng && npm test`. Fix anything red.
9. Manual Sepolia proof (testnet, no real funds):
   - Create a wallet, fund the address from a Sepolia faucet.
   - Send a small amount to another address.
   - Confirm the tx hash resolves on https://sepolia.etherscan.io
   - Confirm the displayed balance updates from the chain read, not the DB.
10. Open a PR summarizing changes + paste the Sepolia tx hash for review.

## Out of scope (leave for later, do not improvise)
- Mainnet enablement, backend vault sync, non-EVM chains (BTC/SOL/etc.),
  hardware-wallet integration. These have their own design + audit needs.
