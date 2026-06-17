# ETH path — internal self-review (SECURITY_REVIEW_CHECKLIST)

> Run 2026-06-17 as the `SECURITY_REVIEW_CHECKLIST.md` pass of the internal-audit
> gate flow (internal audit → remediate → re-review → owner sign-off). This is a
> CODE-grounded review with file:line evidence — it is NOT the independent audit
> and does NOT authorize `ALLOW_MAINNET`. Per the checklist's own preamble: "None
> of this is satisfied by 'an AI wrote it carefully.'" Items needing external
> action are marked NEEDS-OWNER.

## Verdict summary

Most checklist items **PASS** against actual code + tests. Found **1 notable
security-UX finding** (truncated recipient address at the sign step), plus minor
test-coverage and hardening gaps, plus 3 owner/interop items. No fabricated
hashes, no key egress, no plaintext persistence, mainnet gating intact.

## Findings (to remediate before owner sign-off)

| ID | Sev | Finding | Evidence | Remediation |
|----|-----|---------|----------|-------------|
| F1 | **medium** | Recipient address is CSS-`truncate`d at the verify/sign chokepoint — undercuts the address-poisoning defense (which tells users to compare the FULL address). ENS-resolved address and ERC-20 recipient/spender truncate too. | `SendCrypto.jsx:950` (native send), `:792` (ENS), `:986`/`:994` (ERC-20) | Show the full address (mono, `break-all`) at the verify step; never abbreviate the thing the user must verify before signing. |
| F2 | low | No test exercises `generateMnemonic(256)` (24-word) or round-trips a freshly *generated* mnemonic through `validateMnemonic`. Checksum validity is proven only for hardcoded vectors. | `mnemonic.js:36-38` (code correct); no covering test | Add: `validateMnemonic(generateMnemonic(128))`→12 words; `(256)`→24 words. |
| F3 | low | Account-index correctness covers only indices 0 and 1; index ≥1 asserted distinct but not pinned to published vectors. | `vectors.test.js:50-54` | Add multi-index vector assertions vs an independent reference. |
| F4 | low | Deps use caret ranges, not exact pins; reproducibility rests on lockfile + `npm ci`. | `package.json` (`ethers ^6.16.0`, `@noble/curves ^1.9.7`, …); `.github/workflows/ci.yml:28` | Decide: accept lockfile-enforced reproducibility, or pin crypto libs exactly. |
| F5 | low | RNG guard runs in CI only transitively via `pretest`+`npm test`; no standalone `check:rng` CI step. If `npm test` is ever changed/skipped, the guard silently drops. | `package.json:15`, `.github/workflows/ci.yml:31` | Add a dedicated `npm run check:rng` CI step. |

### Remediation status (2026-06-17)
- **F1 — FIXED** (`838ceb0`): `truncate`→`break-all` at all four sign-step
  address displays; verified in preview (desktop 1 line, mobile wraps full
  42-char address, no ellipsis).
- **F2 — FIXED** (`b968186`): tests assert CSPRNG-generated 12/24-word mnemonics
  are valid BIP-39 + reject invalid strength.
- **F3 — PARTIALLY FIXED** (`b968186`): index coverage broadened to 0..4
  (distinct + EIP-55 shape). Per-index pinning to an external reference still
  open (not fabricated).
- **F4 — OPEN (owner decision):** caret ranges vs exact pins — lockfile + `npm
  ci` enforce reproducibility today; pinning is a judgement call left to the owner.
- **F5 — FIXED** (`b968186`): dedicated `npm run check:rng` CI step added.

## Section results (PASS items, with evidence)

### Entropy & key generation
- **CSPRNG only, no Math.random in crypto paths — PASS.** `mnemonic.js:35-42` (@scure/bip39 `generateMnemonic`); enforced by `scripts/check-crypto-rng.mjs` (wired as `pretest`/`check:rng`, harness D1).
- 12/24-word valid BIP-39 — code PASS, test GAP (**F2**).
- **Canonical address vector — PASS.** `vectors.test.js:42-48` asserts m/44'/60'/0'/0/0 for all-abandon = `0x9858EfFD232B4033E47d90003D41EC34EcaEda94`.
- Account indices distinct — PASS for 0/1; broader coverage is **F3**.

### Vault / encryption
- **Argon2id params — PASS.** `vault.js:51-56`: t=3, p=1, memory=192 MiB, hashLength=32; per-blob params + upgrade-only rekey. (Param *strength* = NEEDS-OWNER, flagged in-code at `vault.js:44-50`.)
- **Fresh CSPRNG salt(16)+iv(12) per encryption, never reused — PASS.** `vault.js:139-142` via `crypto.getRandomValues`.
- **Wrong password AND tampered ciphertext fail closed — PASS.** `vault.js:169-175`; tests `vectors.test.js:64-73`.
- **Only ciphertext persisted; no plaintext to storage/log/analytics/network — PASS.** `vault.js:146-153`, `vaultStore.js:36-48`, native `native.js:75-84` (`setSynchronize(false)`). No `console`/`fetch`/`analytics` on secret material.
- **vaultStore refuses non-encrypted objects — PASS.** `vaultStore.js:38-40`; guard test `evm-slice.test.js:30-36`.

### Key lifetime / signing & broadcast
- **Mnemonic in a ref, cleared on lock / tab-hide / idle — PASS.** `WalletProvider.jsx:147,368-399,458-462,405-411`.
- **Private keys transient for signing, never stored — PASS.** `WalletProvider.jsx:1328-1334`, `:554`.
- **Local signing, key never sent to RPC — PASS.** `send.js:60,84`; recovers to sender in `evm-send-signing.test.js:110`.
- **chainId verified before broadcast — PASS.** `send.js:55-58`, `signing.js:53-56`; `chainid-guard.test.js:48-63`.
- **Mainnet gated + gating test — PASS.** `networks.js:182,200-202`; `networks.test.js:80-105`.
- **Real network tx hash (not fabricated) — PASS.** `send.js:87`; `evm-send-signing.test.js:113`.
- **Balances read live from chain — PASS.** `provider.js:47-51`, `SendCrypto.jsx:254-263`. *Owner note:* the displayed transaction *list* is DB-backed (base44, local) keyed to real txids for screening — balances/spendable remain chain-sourced; confirm this is acceptable for the "history" audit scope.

### Anti-phishing UX
- Poison/look-alike warning wired — PASS (`SendCrypto.jsx:35,347-350,823-825`; engine `evm/poison.js:50-119`). BUT full-address display at confirm = **F1**.
- ENS resolution displayed — PASS (`SendCrypto.jsx:103-119,790-794`), with the **F1** truncation caveat; mismatch is risk-scored (`:459-460`).

### Supply chain / build
- Audit triaged — PASS (`docs/audit-triage/ethers-ws-advisory.md`; harness allowlist `eth-wallet-audit.mjs:288-291,312-314`). Pinning = **F4**.
- Crypto deps limited to @scure/@noble/ethers/hash-wasm — PASS (`package.json`). (`@solana/web3.js` pulls tweetnacl but SOL is `receive_only`, not on the active ETH signing path.)
- RNG guard in CI — PASS transitively; standalone step = **F5**.

## NEEDS-OWNER (cannot be satisfied by static review)
1. **Interop:** import the generated mnemonic into an independent wallet (MetaMask) and confirm the SAME first address (recoverability). The canonical vector (F-section) gives strong code conformance; the external import is the owner's confirmation.
2. **Argon2id parameter strength** sign-off for target devices (flagged in-code; an audit/owner judgement).
3. **Transaction-list provenance** (DB-backed vs chain/explorer-indexed) — confirm acceptable for audit scope.

## Gate status after this review
Internal audit step = automated harness ✅ + this self-review ✅ (with F1–F5 open).
Remaining: remediate F1 (and decide F2–F5) → re-review → owner sign-off. `ALLOW_MAINNET`
stays `false`. This review does not flip any gate.
