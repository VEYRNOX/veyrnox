# Independent Security Audit — Scope & Planning

> Purpose: define exactly what an independent third-party audit of Veyrnox would
> cover, so quotes are fast/accurate and the audit (the gate before any mainnet/
> real-money use) is well-prepared. Scope now even though the audit runs AFTER
> the MVP freeze — top firms have 2–3 month waitlists, so early scoping avoids
> rush fees, and writing the scope forces a clean articulation of the system.

> HARD LINE: no mainnet / real funds until this audit is complete and findings
> are remediated (and re-reviewed). Build MVP → freeze → audit → fix → re-review
> → THEN flip ALLOW_MAINNET. Never the reverse.

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
  @noble/curves, @noble/hashes, ethers v6, hash-wasm Argon2id), Capacitor for
  mobile shell.

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
- BTC and SOL (separate non-EVM stacks — own future audits).
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
- **Good docs + tests cut cost 15–25%** → your clean repo, 58 tests, and these
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
- Remediate all critical/high (and reasonable medium) findings.
- Pay for the re-review pass to confirm fixes don't introduce regressions.
- Only THEN consider flipping ALLOW_MAINNET, per the hard line.
- Keep the report — it's a material asset for build-to-sell due diligence.
