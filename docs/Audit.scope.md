# Security Audit — Scope & Planning

> Purpose: define exactly what a security audit of Veyrnox covers, so reviews are
> well-prepared and (for the independent pass) quotes are fast/accurate. This same
> scope is used by BOTH the internal audit (the hard gate, below) and the
> independent third-party audit (additional depth). Scope now even though audits
> run AFTER the MVP freeze — top firms have 2–3 month waitlists, so early scoping
> avoids rush fees, and writing the scope forces a clean articulation of the system.

> HARD LINE: no mainnet / real funds until the **internal security audit** is
> complete and its findings are remediated (and re-reviewed). **The internal audit
> is the hard pass that opens the mainnet gate** (flips `ALLOW_MAINNET`). An
> independent third-party audit will ALSO be performed against the scope below as
> defensive depth, but it is NOT the hard gate — the internal audit is.
> Build MVP → freeze → internal audit → fix → re-review → THEN flip ALLOW_MAINNET.
> Never the reverse. (Honesty note: do not represent the product as
> "independently audited" on the strength of the internal audit alone — the
> internal audit is the gate; independence is a separate, additional claim only
> once that pass is actually done.)

---

## What Veyrnox IS (frames the scope + cost)

A **client-side, non-custodial EVM wallet application** — NOT a smart-contract
or DeFi protocol. This matters for cost: protocol/bridge/L1 audits run
$50k–$500k; a **wallet-application audit is a more contained scope**, typically
**~$7k–$30k and 2–4 weeks** with a specialist firm (confirm per quote). The
review is of application code (key handling, signing, storage, UX), not on-chain
contract math.

- Keys generated/stored/used entirely on the user's device; we never custody
  funds (this is also why it's exempt from Google Play's crypto licensing and
  approvable on Apple as storage).
- Tech: React/Vite web app, audited crypto libs (@scure/bip39, @scure/bip32,
  @scure/btc-signer, @noble/curves, @noble/hashes, ethers v6, hash-wasm
  Argon2id), Capacitor for mobile shell.

---

## In-scope for the audit (the MVP surface)

### 1. Cryptographic core (HIGHEST priority) — `src/wallet-core/`
- **Mnemonic generation** (`mnemonic.js`): BIP-39 entropy from CSPRNG; no
  Math.random anywhere in crypto paths (enforced by `scripts/check-crypto-rng.mjs`).
- **Key derivation** (`derivation.js`): BIP-32/44, EVM path m/44'/60'/0'/0/x.
  Verify against standard vectors (the canonical Hardhat address is tested).
- **Vault** (`vault.js`): Argon2id KDF + AES-256-GCM. Verify parameters,
  authenticated-encryption usage, that only ciphertext is ever persisted.
- **Signing** (`signing.js`): local transaction signing; keys never leave device;
  no key material logged or serialized.
- **Key lifetime in memory**: seed/private keys held only as long as a signing
  op needs; cleared on lock; never in webview storage on native (post-M2).
- **Audit log** (`auditLog.js`, S4 — PR #72): opt-in, OFF by default. Entries are stored as a single AES-GCM blob (via `vault.js encryptVault`) in the SAME `veyrnox-vault`/`vault` store as the primary vault, duress decoy, stealth pool, and panic marker, under a neutral key — byte-shaped identically to every other vault blob. **Audit focus — review ALONGSIDE the deniability stack, not as a generic logging feature:** verify (a) it is destroyed by panic wipe (it's in the cleared store); (b) the in-code denylist genuinely cannot record any duress/stealth/hidden/panic/decoy/seed event — its whole safety claim is that it cannot betray the deniability features; (c) the blob is indistinguishable in shape from other vault blobs (not a forensic tell); (d) when disabled, nothing is written at all. A naive audit log on a deniability wallet is a security regression; confirm this one isn't.

### 2. EVM operations — `src/wallet-core/evm/`
- **Networks** (`networks.js`): chainId correctness (verified vs ethereum-lists),
  the mainnet gate (`ALLOW_MAINNET`) and per-network `enabled` flags, RPC treated
  as untrusted (read/broadcast only).
- **Sending** (`send.js`, `token-send.js`): chainId verification at sign time,
  amount/decimals handling (parseUnits), no wrong-network/replay exposure.
- **Tokens** (`tokens.js`): address verification discipline, on-chain decimals
  cross-check, the unconfigured-token guard.
- **Calldata decode + approval guard** (`calldata.js`): the anti-blind-signing
  control — unlimited-approval detection + the required acknowledgement, fail-safe
  on unknown calldata. (Auditors flag wallet UIs that show misleading tx info.)

### 2b. Bitcoin operations (Phase BTC, NEW attack surface) — `src/wallet-core/btc/`
A SEPARATE cryptographic stack from the EVM family (UTXO model, bech32, PSBT) —
shares nothing with the secp256k1/account engine beyond the BIP-39 seed. New
audit surface; review independently of the EVM slice.
- **Derivation** (`derivation.js`): BIP-84 native SegWit (P2WPKH), path
  `m/84'/{0|1}'/0'/{change}/{index}`. coin type 1' on testnet/signet, 0' on
  mainnet. Verified against the authoritative BIP-84 spec vectors + the testnet
  vector (`__tests__/btc-derivation.test.js`). Interop caveat: BIP-44/49 seeds
  derive different addresses (documented, surfaced in UI).
- **Networks** (`networks.js`): testnet/signet enabled; **mainnet gated**
  (`ALLOW_BTC_MAINNET=false`) exactly like the EVM `ALLOW_MAINNET`. The Esplora
  indexer is UNTRUSTED (read + broadcast only); broadcast re-checks the gate.
- **Coin selection + change** (`coinselect.js`, HIGHEST-RISK): UTXO selection,
  vsize-based fee, and **change-output construction**. The cardinal invariant
  `sum(inputs) === sum(outputs) + fee` is asserted on every plan
  (`assertPlanConserves`) and RE-verified against the signed bytes in `send.js`
  (`tx.fee === plan.feeSats`). Dust change is folded into the fee and disclosed.
  Audit focus: that change can never be silently burned to fee, change always
  returns to a wallet-controlled address, all money math is BigInt sats.
- **Send** (`send.js`): build PSBT/tx with `@scure/btc-signer`, sign LOCALLY
  (key supplied transiently via `WalletProvider.withBtcPrivateKey`), broadcast.
- **Library**: `@scure/btc-signer` (paulmillr/@scure family, consistent with the
  existing audited bip39/bip32/noble stack). Added to the supply-chain review.
- Status: BTC is **receive_only** until a real testnet send is verified on-chain
  and reviewed (see `docs/PhaseBTC.verification.md`), then → live; mainnet stays
  gated until this audit clears.

### 2c. Solana operations (Phase SOL, NEW CURVE — biggest divergence) — `src/wallet-core/sol/`
A THIRD, distinct cryptographic family. Unlike EVM/BTC (both secp256k1), Solana
is **ed25519** — a different elliptic curve with its own key generation, signing
primitive, and HD-derivation standard. Shares NOTHING with the other stacks
beyond the BIP-39 seed. Review independently; this materially expands the
key/signing attack surface (the audit now covers TWO curves, not one).
- **Derivation** (`derivation.js`, `slip10.js`): **ed25519 SLIP-0010**,
  hardened-only, path `m/44'/501'/0'/0'` (Phantom/Solflare-compatible). SLIP-0010
  is implemented on `@noble/hashes` (hmac+sha512) and pinned against the
  AUTHORITATIVE SLIP-0010 ed25519 spec vectors; the derived address is
  cross-checked against `@solana/web3.js` `Keypair.fromSeed` (`__tests__/sol-derivation.test.js`).
  Address = base58 of the 32-byte ed25519 pubkey (`@scure/base`). Audit focus:
  hardened-only enforcement (ed25519 has no public derivation), curve/path
  correctness (interop = recoverability), no key material logged.
- **Networks** (`networks.js`): devnet/testnet enabled; **mainnet gated**
  (`ALLOW_SOL_MAINNET=false`) exactly like `ALLOW_BTC_MAINNET` / `ALLOW_MAINNET`.
  The JSON-RPC is UNTRUSTED (read + broadcast only); broadcast re-checks the gate.
- **Send + the two Solana fund-loss traps** (`send.js`, HIGHEST-RISK):
  - **Blockhash expiry**: txs embed a recent blockhash and are SILENTLY dropped
    after `lastValidBlockHeight`. A FRESH blockhash is fetched at send time,
    confirmation is bounded by that deadline, and a `TransactionExpired*` error
    drives a refetch/rebuild/resend (bounded retries). Audit focus: a stale
    blockhash can never silently lose a user's send.
  - **Rent-exemption minimum**: the pure planner `planSolTransfer` BLOCKS (a)
    dust to a new (0-balance) recipient below the rent-exempt minimum and (b)
    stranding the sender at a sub-rent-exempt dust remainder (allows exactly 0 or
    >= rentMin). Lamport math is BigInt end-to-end. Tested in
    `__tests__/sol-send.test.js`. Audit focus: no transfer can brick an account.
  - Signing is LOCAL (ed25519) via a transiently-supplied key
    (`WalletProvider.withSolPrivateKey`); the RPC only broadcasts.
- **Libraries**: `@solana/web3.js` (chain/tx layer; supply-chain review — large
  dependency tree) + the existing `@noble`/`@scure` primitives for keys. Note:
  `@solana/web3.js` v1 references the Node `Buffer` global; it is confined to
  `provider.js`/`send.js` (the browser receive_only path uses only
  `derivation.js`), and the hands-on verification runs in Node.
- Status: SOL is **receive_only** until a real devnet send is verified on-chain
  and reviewed (harness: `scripts/sol-devnet-send.mjs`), then → live; mainnet
  stays gated until this audit clears.

### 2d. Address screening (S2, NEW surface) — `src/wallet-core/evm/suspicious.js` + `src/wallet-core/data/`
LOCAL-only recipient screening wired into the send risk assessment; warns-not-blocks, never asserts "safe". Pluggable-provider design; `screenAddress` routes by family so EVM and BTC addresses are both screened at runtime.
- **Providers**: a general on-device blocklist (PR #70 — burn sinks + a sanctioned address; scam/drainer categories deliberately empty, no fabricated entries) and an OFAC sanctions provider (PR #71) over a bundled, dated OFAC SDN snapshot (`data/ofac-sanctioned.json`, ~700 entries, rebuilt via `scripts/refresh-ofac-blocklist.mjs`).
- **Audit focus**: (a) screening is advisory and cannot block/alter a signed tx or leak intent off-device (no phone-home — verify no network in this path); (b) data PROVENANCE and currency — the snapshot is dated and delisting-aware (e.g. Tornado Cash excluded post-2025 delisting), so a stale snapshot must not produce false sanctions hits; (c) family routing correctly screens BTC at runtime, not only in unit tests. NOTE: OFAC sanctions screening in a financial product is gated on independent LEGAL review (separate from this security audit) before it may ship.

### 3. Native secure storage (post-M2) — mobile
- iOS Secure Enclave/Keychain + Android Keystore/StrongBox integration.
- Biometric gating of unlock / transaction authorisation.
- Confirm keys never written to webview/IndexedDB on native.
- (M2 MUST be done before the audit if mobile is in the audited MVP.)

### 4. Application / integration layer
- `WalletProvider` (in-memory unlocked session, auto-lock).
- The wallet UI pages (HDWalletManager, SendCrypto) for misleading-info / scam-
  facilitation bugs and correct address/amount display.
- Dependency review (supply-chain) of the crypto libs + Capacitor.

---

## Explicitly OUT of scope (deferred features — keep them out of this audit)
- DEX swaps, DeFi deposits, WalletConnect/dApp arbitrary-tx signing (Phase D).
- **Social Recovery and Multi-Sig** — ❌ REMOVED from the app
  [audit-blocked-and-not-advertised]; neither ever shipped (Social Recovery never
  built; Multi-Sig was a UI shell with fake addresses, now deleted). NOT in scope.
  If either is ever greenlit as a real audited design, it adds its own scope.
- SPL tokens / Associated Token Accounts, Solana staking & programs (Phase SOL
  is native SOL only). BTC and SOL native stacks are IN scope above (§2b, §2c) as
  separate non-EVM families; their token/contract layers are deferred.
- Base44 backend / billing (separate concern; not key-handling).
Keeping these out keeps THIS audit contained and cheaper. Each, when built, adds
its own audit scope (and Phase D notably expands it a lot).

---

## Candidate firms (research-based; get multiple quotes, match to threat model)
- **Specialist wallet-audit firms** (likely best fit / cost): e.g. Hacken
  (wallet-audit service, CCSSA/CEP/CBP-certified, 10–20 business days), BlockApex
  (~$7k–$15k, 2–4 wks). Wallet-focused = good scope match.
- **Tier-1 security research** (higher cost/waitlist, strongest for key/signing):
  Trail of Bits (noted strong for custody/signing/key-management; adversarial
  mindset), Cure53 (app/crypto/web security), Kudelski Security, OpenZeppelin,
  ConsenSys Diligence, Quantstamp, Sigma Prime.
- Get **3+ quotes**. No single firm is best for all; match strengths to a
  key-management/client-app threat model, not DeFi-protocol skills.

## Cost/timeline expectations (2026, from research)
- Wallet-app audit: ~$7k–$30k, ~2–4 weeks (vs $50k–$500k for DeFi/bridges).
- **Budget for the re-review:** the second-pass verification of your fixes is
  usually billed separately — plan for it.
- **Rush = +30–50%.** Tier-1 firms have 2–3 month waitlists → engage early.
- **Good docs + tests cut cost 15–25%** → your clean repo, 390 tests, and these
  design docs are a direct discount lever.

---

## Pre-audit readiness checklist (do before requesting the scoped quote)
- [ ] MVP feature-frozen (no churn during the audit window).
- [ ] M2 native secure storage complete (if mobile is in the audited scope).
- [ ] All tests green; `check:rng` green; CI documented.
- [ ] Threat model written (assets = user keys/funds; adversaries = malicious
      RPC, malicious dApp [if/when], device compromise, supply-chain, phishing UX).
- [ ] Architecture doc + this scope handed to the firm.
- [ ] Repo access (read-only) + build/run instructions ready.
- [ ] Internal self-review pass done first (cheap bugs found before paid hours) —
      see docs/SECURITY_REVIEW_CHECKLIST.md.
- [ ] Decide remediation + re-review budget up front.

## After the audit
- **Internal audit (the gate):** remediate all critical/high (and reasonable
  medium) findings; do the re-review pass to confirm fixes don't introduce
  regressions. Only once the internal audit is complete + remediated + re-reviewed
  may `ALLOW_MAINNET` be flipped, per the hard line above.
- **Independent audit (additional depth, non-gating):** still commission it against
  this scope; remediate + pay for its re-review. It strengthens assurance and is a
  material asset for build-to-sell due diligence, but it does not gate mainnet —
  the internal audit does. Only claim "independently audited" once this pass is
  genuinely complete.
