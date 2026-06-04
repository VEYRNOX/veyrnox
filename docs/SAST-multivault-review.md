# Veyrnox — Targeted Security Review: Multi-Seed Vault (2026-06-04)

> **Scope.** The `feat/multi-wallet-portfolio` change (commit `7689292`, PR #69) — the
> first change to modify the vault *container*. This is a REVIEW + REPORT pass over
> the new/changed code only, against the wallet threat model (seed/keys = total loss
> if wrong). Reviewed on `review/multivault-sast`, branched off the multi-wallet
> branch. wallet-core crypto primitives were NOT touched by this review.
>
> **This is NOT the independent audit.** It does not re-verify KDF/cipher soundness;
> it verifies that this change rides *inside* the unchanged crypto without disturbing
> it, and that the serialisation/migration/isolation invariants hold. Mainnet still
> requires the independent audit (tracked launch blocker in Production-readiness.md).

## Verdict (lead with the seed/key + migration path)

**No critical/high/medium finding touches seed or key exposure, and the migration
path is lossless.** The change is genuinely *container-only*:

- The cryptographic attack surface does not move. `git diff` confirms **zero changes**
  to `vault.js` (Argon2id 192 MiB/t=3 + AES-256-GCM), `keystore/*`, `derivation*`,
  `mnemonic.js`, and `evm/vaultStore.js`. What changed is **what** gets encrypted (a
  JSON container of N mnemonics instead of one bare mnemonic), not **how**.
- The serialized container reaches **only** `keyStore.createVault(...)` — the encrypted
  store — at all six call sites. It is never logged, never put in an `Error`, never
  written to `localStorage`/`sessionStorage` in plaintext.
- Migration is lossless and proven through the **real** Argon2id+AES-GCM round trip
  (`multivault.test.js`, `multivault-keystore.test.js`): a legacy single-seed vault
  decrypts to the identical mnemonic, derives byte-identical addresses on EVM/BTC/SOL,
  and a wrong password fails with the same generic error and mutates nothing.

**Recommendation: sound enough to merge to TESTNET.** The findings below are all
LOW/INFO (privacy/hardening/edge-case), none is a seed/key exposure or a migration
data-loss path. Mainnet remains gated on the independent crypto audit.

---

## Tooling results (clean baseline holds — no regression)

| Check | Result |
|---|---|
| `npm run check:rng` | ✅ PASS — no insecure randomness in guarded paths |
| Targeted vitest (multivault, keystore, portfolios, walletMeta) | ✅ 43/43 pass |
| `npm run lint` (eslint . --quiet) | ✅ 0 errors |
| `npm audit` | 17 vulns (11 moderate, 6 high) — **identical to the documented 2026-06 baseline**; `package.json`/lockfile **unchanged** by this branch, so **zero new dependency surface** |
| semgrep | Not run — not installed on this host (Python tool, win32). Substituted: eslint + check:rng + manual data-flow grep (seed→log/throw/storage). See note below. |

- **npm audit — real vs noise (unchanged from baseline):** the 6 high are the vite
  dev-server path-traversal (dev-only, not shipped) + transitive `ws`/`uuid` reachable
  through `ethers` v6 / `@solana/web3.js`. As previously recorded, **do NOT
  `npm audit fix --force`** — the fixes are breaking downgrades (ethers@5, web3.js@0.0.3)
  that would break the wallet. No new advisories were introduced by this change.
- **semgrep gap:** semgrep could not run here. The patterns it would catch on this
  diff (secrets, dangerous sinks, taint into eval/storage) were covered manually: the
  diff adds no `eval`, no `dangerouslySetInnerHTML`, no `document.write`, no `child_process`,
  no network calls, and no new dependency. Recommend a CI semgrep run on a Linux runner
  to formally close this out before mainnet (tracking only — not a testnet blocker).

---

## Findings by severity

### Critical — none
### High — none
### Medium — none

### LOW

#### L-1 — At-rest metadata leak: wallet count + custom names in plaintext localStorage
- **`src/lib/walletMeta.js:29` (`veyrnox-wallet-meta`), `src/lib/portfolios.js:17` (`veyrnox-portfolios`)**
- **Risk (privacy, not key material).** While the app is **locked**, an observer with
  OS-level device access can read `localStorage` and learn **how many wallets** the
  primary vault holds and their **user-chosen names** (and portfolio names). It reveals
  **nothing** about seeds, private keys, addresses, or balances.
- **Exposure is bounded and does not weaken deniability.** The primary vault's existence
  is already observable, so its wallet count/names are a minor incremental leak. Critically,
  **duress/decoy and stealth/hidden wallets are never referenced here** — they live in
  separate encrypted storage and are never enumerated in these maps. So this does **not**
  defeat count-hiding or plausible deniability. Verified: `isDecoy || isHidden` sessions
  never write to `walletMeta`/`portfolios` (guards in `WalletProvider.jsx` add/import/remove/
  portfolio mutators, and the decoy/hidden unlock branch builds public state in-memory only).
- **Assessment.** This is the **only** at-rest plaintext introduced by the change, and it
  is non-secret. Acceptable for **testnet**. The module already documents the mitigation:
  if at-rest name privacy is later required, move these maps inside the encrypted vault
  (they would then require the password to read, like the seeds).
- **Recommendation.** *Flag for triage* — accept for testnet as-is, or, if name privacy
  is desired, relocate the metadata into the encrypted container. No code change made.

#### L-2 — Revealed mnemonic held in React component state during backup
- **`src/pages/WalletPortfolioPage.jsx:438,489,521`** — `setBackupTarget({ ..., mnemonic: revealWalletMnemonic(w.id) })`
- **Risk.** `revealWalletMnemonic()` correctly returns the live seed (same exposure
  contract as `withPrivateKey` — the session already holds every seed while unlocked),
  but the UI stores it in component **state** (`backupTarget`) rather than a ref, so it
  can appear in React devtools/render snapshots and persists until the dialog closes.
- **Context.** This mirrors the **existing** onboarding pattern (`generatedSeed`/`SeedGrid`,
  `WalletEntry.jsx`), so it is consistent with the established backup-screen exposure, not
  a regression introduced by multi-seed. It is unavoidable that a backup screen renders the
  seed; the residency is the only concern.
- **Recommendation.** *Flag for triage (hardening)* — clear `backupTarget` (and `created`/
  `generatedSeed`) on dialog close/unmount to minimise residency. Did not change inline:
  it touches shared UI state and the pre-existing onboarding flow does the same, so it is a
  product-wide hardening decision rather than a trivial, unambiguous fix for this PR.

### INFO

#### I-1 — `getActiveMnemonic` falls back to `wallets[0]` on a stale active id
- **`src/lib/WalletProvider.jsx:430-433`** — `mv.findWallet(c, activeIdRef.current) || c.wallets[0]`
- A defensive fallback so a session never derives from a missing wallet. In practice
  `activeIdRef` is always reconciled to a real wallet (`reconcileWalletMeta`/`switchWallet`/
  `removeWallet` repoint it), so the fallback should be unreachable. Worst case it would
  derive/sign from the **user's own first wallet** — no cross-user/cross-key exposure, no
  leak. **Isolation is intact** (each entry is a standalone BIP-39 seed; nothing
  cross-references another). No action required; noted for completeness.

#### I-2 — Migration re-encrypt is best-effort; a failed write defers migration to next unlock
- **`src/lib/WalletProvider.jsx:937-938`** — `try { await keyStore.createVault(...) } catch { /* retried next unlock */ }`
- Correct and safe by design (mirrors the M3 KDF rekey): a failed re-encrypt must not block
  unlock; the on-disk legacy bare-mnemonic vault is untouched and **no funds are lost**
  (the decrypt used the unchanged crypto). The only side effect of the rare failure case is
  cosmetic `walletMeta` churn (the next unlock re-migrates and assigns a fresh wallet id),
  which self-heals via `reconcileWalletMeta`. No seed/key impact. No action required.

---

## Threat-model checklist (explicit results)

| Question | Result |
|---|---|
| Container JSON ever logged / thrown / written unencrypted / left in memory too long? | **No.** Only flows to `createVault` (encrypted). `lock()` overwrites every seed then drops the ref. No `console.*`/`Error` carries a seed. (L-2: backup UI holds one seed in state transiently — flagged.) |
| Only **what** is encrypted changed; encryptVault/Argon2id/AES-GCM/derivation byte-for-byte unchanged? | **Confirmed** by `git diff` (zero changes to vault.js/keystore/derivation/mnemonic/vaultStore) and proven through the real-crypto round-trip tests. |
| Seed isolation — one wallet's derivation can never expose another's keys? | **Confirmed + tested.** Each entry is a standalone BIP-39 seed; add/remove are pure (new container, reference-copied siblings, no mutation). Tests prove distinct addresses per chain and byte-identical siblings after add/remove. |
| Lossless migration; no KDF weakening; wrong password fails generically + mutates nothing? | **Confirmed + tested.** Same password, same KDF params, byte-identical derived addresses; wrong password → generic `wrong password or corrupted` throw, no migration, no mutation. |
| Re-auth on add/import/remove; password not left resident? | **Confirmed.** Each mutation re-decrypts the vault with the supplied password (re-auth) then re-encrypts; the password is a function argument only — never stored in a ref/state. |
| Duress decoy + stealth hidden still single-seed, in-memory-only, never persisted into the container; panic wipe covers the container? | **Confirmed.** Decoy/hidden unlock builds transient state in-memory and never calls `createVault`/`walletMeta`; add/import/remove/portfolio mutators all hard-`throw`/no-op under `isDecoy||isHidden`. `panicWipe` adds `clearAllWalletMeta()`+`clearAllPortfolios()` and routes through `lock()` (seed overwrite). Deniability + constant-KDF timing untouched (cluster files unchanged). |
| At-rest metadata — is the count/names leak the only at-rest plaintext, and what's the exposure? | **Yes, only leak** (L-1). Non-secret count + names while locked; no seeds/keys/balances; independent of hidden-wallet deniability. Acceptable for testnet. |
| Explore mode genuinely view-only, no keys, no auth gating an empty state? | **Confirmed.** No vault → `containerRef` null → all derivation throws "locked"; honest $0 empty states; nothing to authenticate. `requireWallet()` leaves explore to surface create/import. |

---

## What I fixed
- **Nothing in code.** No trivial/unambiguous bug was found. The two LOW items are
  judgment calls (accept-vs-relocate metadata; product-wide backup-state hardening that
  also affects the pre-existing onboarding flow), so they are **flagged for triage**
  rather than silently changed.

## What needs your decision
1. **L-1** — Accept the at-rest count/names metadata leak for testnet (recommended), or
   relocate `walletMeta`/`portfolios` into the encrypted vault if at-rest name privacy is
   required before mainnet.
2. **L-2** — Decide whether to clear revealed-seed component state on backup-dialog close
   across both the new portfolio backup path and the existing onboarding flow.
3. **semgrep** — Add a CI semgrep run on a Linux runner to formally close the tooling gap
   (tracking item; not a testnet blocker).

## Merge recommendation
**The multi-seed vault is sound enough to merge to TESTNET.** The crypto core is provably
untouched, migration is lossless, seed isolation holds and is tested end-to-end through the
real crypto, deniability/panic semantics are preserved, and the only at-rest exposure is a
non-secret metadata leak. **Mainnet still requires the independent cryptographic audit** —
this review does not substitute for it.
