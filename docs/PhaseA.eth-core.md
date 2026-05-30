# Phase A — Real ETH Key Core on Sepolia (RECORD DOC)

> Written retroactively to complete the docs set. Phase A predates the
> "one doc per phase" pattern (its planning lived in CLAUDE_CODE_TASK.md,
> SendCrypto.integration.md, HDWalletManager.roadmap.md). This records what
> Phase A built, why, and how it was verified — the cryptographic FOUNDATION
> every later phase reuses.

---

## What Phase A replaced (the starting point)

The original Base44 prototype had a 100% FAKE cryptographic core behind a
polished UI:
- `generateMnemonic` used `Math.random()` over a ~130-word list — NOT valid
  BIP-39, not secure entropy.
- `deriveAddress` was a decorative string-hash — produced addresses that were
  nobody's real address (funds sent there would be lost).
- "Sending" fabricated a tx hash with `Math.random()` and edited a Base44 DB
  balance — no signing, no broadcast, no chain.
- Wallet state lived server-side (custodial-by-accident).

Phase A replaced this with a real, standards-correct, non-custodial core.

---

## What Phase A built — `src/wallet-core/`

Built on AUDITED libraries (no hand-rolled crypto):
@scure/bip39, @scure/bip32, @noble/curves, @noble/hashes, ethers v6,
hash-wasm (Argon2id).

- **mnemonic.js** — real BIP-39 mnemonic generation from the platform CSPRNG
  (crypto.getRandomValues). Valid checksums; 12/24-word.
- **derivation.js** — real BIP-32/44 derivation; EVM path m/44'/60'/0'/0/x via
  ethers. (BTC/SOL intentionally left as throwing stubs — separate future stacks.)
- **vault.js** — Argon2id (memory-hard KDF) + AES-256-GCM encrypted vault; fresh
  random salt+IV; only ciphertext persisted; non-extractable WebCrypto key.
- **signing.js** — local transaction/message signing; key never leaves device;
  chainId verified before broadcast.
- **evm/networks.js** — Sepolia default; mainnet present but GATED (ALLOW_MAINNET
  =false). chainId verified at sign time.
- **evm/provider.js** — RPC treated as untrusted (read + broadcast only).
- **evm/send.js** — build → sign locally → broadcast; chain is source of truth.
- **vaultStore.js** — IndexedDB; persists ciphertext only; guard refuses non-
  encrypted objects.
- **lib/WalletProvider.jsx** — in-memory unlocked session; decrypted secret held
  only while unlocked.
- **assets.js** — asset registry with status tiers (live / receive_only /
  coming_soon) and a hard canSend gate.
- **scripts/check-crypto-rng.mjs** — CI tripwire: fails the build if Math.random
  appears in guarded crypto paths. Wired as a required check (pretest hook).

The existing UI was KEPT; only the fake core was swapped for the real one.

---

## How Phase A was VERIFIED (not just "an AI wrote it")

- ✅ check:rng passes — no insecure randomness in crypto paths.
- ✅ Test vectors pass — incl. canonical BIP-44 address
  0x9858EfFD232B4033E47d90003D41EC34EcaEda94 for the standard test mnemonic.
- ✅ Crypto runs in a real browser — Argon2id WASM instantiates, AES-GCM vault
  round-trips, derivation yields valid addresses (verified live, not just Node).
- ✅ **Interop check passed** — a seed generated IN THE APP imported into
  MetaMask yields the SAME first address (app UI and MetaMask both derived
  0xaC027A9B34e600e8A89Cd02b87EAcc4e5c49A163 from one seed). Interop = funds are
  real and recoverable in any standard wallet.
- ✅ **Real testnet send proven end-to-end BY HAND** — generate → derive → fund
  from Sepolia faucet → sign locally → broadcast → confirm. The path that was
  100% fake now genuinely moves funds.
- ✅ Mainnet GATED throughout; ETH on Sepolia is the only `live` asset (status
  earned by the verified send).

A UI gap was found and fixed during verification: the app generated a seed but
didn't display the derived address — fixed so the address shows (commit fcfe861).

---

## Status & invariants carried forward
- Non-custodial: keys generated/stored/used on device; backend (if any) sees
  only ciphertext or already-signed txs.
- Testnet only; mainnet gated behind ALLOW_MAINNET until the independent audit.
- Audited libs only; RNG guard in CI.
- This core is REUSED unchanged by Phase B (tokens), Phase C (more EVM chains),
  and the mobile phases — which is why later phases add little/no new crypto.

## Known limitation (see SECURITY_SELFREVIEW_FINDINGS.md)
JavaScript can't securely zeroize secrets in memory (immutable strings linger
until GC). Best-effort zeroization is in place; the real mitigation is M2's
native Secure Enclave/Keystore on mobile. Documented for the auditor.

## Related docs
- docs/SECURITY_REVIEW_CHECKLIST.md — pre-audit sign-off list
- docs/SECURITY_SELFREVIEW_FINDINGS.md — vault.js + signing.js verified correct
- docs/Audit.scope.md — this core is the #1 audit priority
- docs/MVP.roadmap.md — where Phase A sits in the whole program
