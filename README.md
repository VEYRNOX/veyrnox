# Veyrnox Wallet

[![mainnet](https://img.shields.io/badge/mainnet-unlocked%202026--06--17-4ADAC2?style=flat-square&labelColor=1D222B)](./docs/Feature-Status.md)
[![platforms](https://img.shields.io/badge/platforms-iOS%20%C2%B7%20Android-4ADAC2?style=flat-square&labelColor=1D222B)](./docs/Feature-Status.md)
[![assets](https://img.shields.io/badge/assets-10%20live-4ADAC2?style=flat-square&labelColor=1D222B)](./src/wallet-core/assets.js)
[![core audit](https://img.shields.io/badge/core%20audit-ECC%20%C2%B7%20Jun%202026-4ADAC2?style=flat-square&labelColor=1D222B)](./docs/audit-triage/)
[![KEK & RASP audit](https://img.shields.io/badge/KEK%20%26%20RASP%20audit-INTERNAL%20%C2%B7%20independent%20outstanding-8A94A3?style=flat-square&labelColor=1D222B)](./docs/Feature-Status.md)
[![deniability](https://img.shields.io/badge/deniability-BUILT-4ADAC2?style=flat-square&labelColor=1D222B)](./src/wallet-core/deniabilitySession.js)

A self-custody cryptocurrency wallet built for coercion resistance and plausible deniability. Your seed is your identity — keys never touch a server.

**Stack:** Vite · React · Capacitor (iOS & Android) · ethers v6 · @noble/@scure cryptography

## Status

All 10 assets are testnet-verified — each has a real on-chain send confirmed on a block explorer. Throughout this README, **"verified" means a real on-chain testnet transaction, never merely passing tests or a clean review.**

An independent third-party audit (ECC, June 2026) covered the core wallet. The **hardware-KEK layer and native OS-level RASP are internally device-verified only** — independent audit of those areas is still outstanding. Features are marked as one of **BUILT** (in code, testnet/provisional), **TARGET** (designed, not yet confirmed in shipped code), or **roadmap**; nothing below should be read as independently audited unless stated.

## Features

### Multi-chain support
One HD seed derives per-chain accounts. EVM assets share a single secp256k1 address; BTC and SOL have independent derivation paths.

| Asset | Derivation | Status |
|---|---|---|
| ETH, MATIC, ARB, OP | m/44'/60' (secp256k1) | Live · testnet-verified |
| AVAX, BNB | m/44'/60' (shared EVM) | Live · testnet-verified |
| USDC, USDT | ERC-20 contract calls on the EVM address | Live · testnet-verified |
| BTC | m/84'/0' (SegWit, UTXO/PSBT) | Live · testnet-verified |
| SOL | SLIP-0010 (ed25519) | Live · testnet-verified |

### Coercion resistance (S3)
- **Duress PIN** — unlocks a separate decoy wallet with its own seed, balances, and history
- **Hidden wallets** — deniable chaff-slot pool (256 fixed-length slots, all users) hides wallet count
- **Panic wipe** — irreversible local key-material destruction triggered by a panic PIN or in-app action
- **Deniability sessions** — decoy/hidden sessions make zero backend calls (I3); no wallet-count tells, no cardinality leaks

### Hardware-bound encryption (KEK)
PIN/password-derived factor (Argon2id) is combined with a hardware factor via HKDF — both must be present to unlock.

| Platform | Hardware factor | Biometric gate |
|---|---|---|
| iOS | Secure Enclave ECIES | Face ID / Touch ID (no credential fallback) |
| Android | AndroidKeyStore HMAC-SHA256 (StrongBox-preferred, TEE-accepted) | Biometric-only (no credential fallback) |
| Web (Phase 1) | WebAuthn PRF platform authenticator | password-only fallback on Safari |

> **Status:** BUILT and device-verified on real hardware (internal review only — this layer is **not yet independently audited**).

### Transaction security (S2)
- **Pre-sign simulation** — local-first dry-run preview (eth_call, UTXO analysis, SOL simulation) with risk flags before signing
- **Address safety** — poison/look-alike address warnings, spam token filtering
- **Token approvals** — view and revoke ERC-20 allowances
- **Anomaly detection** — local history-aware heuristics (large-to-new-recipient, approve-then-transfer patterns)
- **Fee control** — per-chain fee tiers (Slow/Standard/Fast/Custom) with gas caps

### WalletConnect v2
Full dApp signing support with security controls:
- **RASP pre-sign gate** — blocked environment = rejected request, key never touched
- **EIP-712 chain binding** — domain chainId validated against WC session; mismatch or missing chainId = reject
- **personal_sign address binding** — resolves EIP-1474 vs MetaMask param order; rejects if neither param matches wallet address
- **Gas cap** — dApp-supplied gas clamped to 1,000,000
- **Session expiry** — expired/absent session = reject
- **Step-up re-auth** — stale auth window = reject before any key operation

### Runtime integrity (S4 — RASP)
Browser-level automation and hooking detection is live and e2e-proven: an automated or hooked environment trips the **BLOCK** tier, which is unconditional — signing is refused (not warned) and cannot be overridden by acknowledgement.

Native OS-level integrity is partial: the Android root/Frida/emulator/tamper probe is built and wired but **not yet verified on a real rooted/hooked device**; the iOS jailbreak probe and remote attestation (Play Integrity / App Attest) are **roadmap**. Probes fail honest — an unavailable probe degrades to WARN, never a fabricated "clean" result.

## Security model

| Invariant | Description |
|---|---|
| I1 | Keys never leave the device |
| I2 | No silent data egress |
| I3 | Deniability mode makes zero backend calls |
| I4 | Fail honest, fail closed — no fake security |
| I5 | Backend untrusted by design |
| I6 | Hardware-bound KEK: HKDF(H ‖ C), ordered concatenation, not XOR |

### Vault cryptography
- AES-256-GCM with fresh IV per encryption, no nonce reuse
- Argon2id KDF (192 MiB memory, 3 iterations, parallelism 1)
- Blob-stored KDF params for forward-compatible migration
- `crypto.getRandomValues` only — no `Math.random` in wallet-core
