# Phase BTC — Bitcoin Support (DESIGN DOC)

> A SEPARATE cryptographic stack from the EVM family — shares NOTHING with the
> secp256k1/account-based EVM core beyond the seed phrase. UTXO model, different
> derivation, different signing, different libraries, own testnet, own audit
> scope. Treat with the same discipline as Phase A: audited libs, hands-on
> verification, mainnet gated, its own branch/PR/review.
>
> Built AFTER the EVM work; SOL follows after BTC is verified. This expands the
> audit scope — update docs/Audit.scope.md when it lands.

---

## Why BTC is a real new build (not config)

The EVM chains all reuse one secp256k1 account-based engine. Bitcoin is
fundamentally different:
- **UTXO model**, not account/balance. You don't have "a balance"; you have a
  set of Unspent Transaction Outputs. Sending = selecting UTXOs as inputs,
  creating outputs (recipient + change back to yourself), and the difference is
  the fee. This is the single biggest conceptual difference and where bugs hide.
- **Different address types / derivation standards** (decision below).
- **PSBT signing** (Partially Signed Bitcoin Transactions), not ethers.
- **Fees in sat/vByte** based on tx size, not gas.
- **Its own testnet** (testnet3 or signet) and faucets/explorers.

Same SEED works (BIP-39 mnemonic is shared); everything after derivation differs.

---

## Design decisions (settle these in the spec, not mid-build)

### 1. Address type / derivation standard → **BIP-84 (native SegWit, bech32)**
- Use **BIP-84**: path `m/84'/0'/0'/0/x`, native SegWit `bc1q...` (mainnet) /
  `tb1q...` (testnet) addresses. Rationale: lowest fees, modern standard, broad
  support, what most current wallets default to.
- (Note BIP-44 `1...` legacy and BIP-49 `3...` wrapped-SegWit exist; we
  standardise on BIP-84. Document that imported seeds from BIP-44/49 wallets
  would derive different addresses — a known interop caveat to surface in UI.)

### 2. Libraries → audited, @scure/@noble family for consistency
- **@scure/btc-signer** (by paulmillr/@scure — same authors as your bip39/bip32)
  for address derivation, PSBT building + signing. Preferred for consistency
  with the existing audited stack.
- **@scure/bip32** (already in the project) for HD derivation; **@noble/hashes**
  (already present) for hashing.
- AVOID hand-rolling. AVOID less-maintained libs where a @scure equivalent exists.
- Evaluate at build time; do not assume versions — verify current + maintained.

### 3. Network access → an untrusted Bitcoin API/indexer
- Unlike EVM JSON-RPC, you need a UTXO-aware data source (e.g. an Esplora/
  mempool.space-style API, or Electrum-protocol server) to: fetch UTXOs for an
  address, get fee estimates, and broadcast raw tx. Treat it as UNTRUSTED
  (read + broadcast only) — same rule as the EVM RPC.
- Pick a reputable testnet endpoint; make it overridable.

### 4. Coin selection + fees
- Implement a clear coin-selection strategy (e.g. largest-first or a documented
  algorithm). Compute fee from estimated tx vSize × sat/vByte. ALWAYS create a
  correct change output back to a wallet-controlled address — a missing/incorrect
  change output BURNS funds as fee. This is the highest-risk bug in UTXO wallets;
  test it explicitly.

### 5. Change addresses / gap limit
- Decide change address handling (the `m/84'/0'/0'/1/x` change branch) and an
  address gap-limit policy for scanning. Document it.

---

## Architecture (mirror the EVM slice's separation)

New module set, parallel to evm/ — e.g. `src/wallet-core/btc/`:
- `derivation.js` — BIP-84 path; derive address(es) + pubkeys from the shared seed.
- `provider.js` — untrusted Bitcoin API client (UTXO fetch, fee estimate,
  broadcast). Read/broadcast only.
- `coinselect.js` — UTXO selection + fee + change-output construction.
- `send.js` — build PSBT → sign locally (@scure/btc-signer) → broadcast.
- registry/assets entry: BTC, family `btc`, `coming_soon` → `receive_only` →
  `live` only after a verified testnet send.

Reuse: the BIP-39 mnemonic/seed (shared). The vault (vault.js) stores the same
seed; BTC derivation reads from it. NO change to EVM code.

Keys remain on device; signing local; the same self-custody invariants as Phase A.

---

## Verification gates (hands-on, like ETH — none skipped)
- [ ] Derived BIP-84 address from the standard test seed matches an INDEPENDENT
      reference wallet (interop = recoverable). Pick a known test vector.
- [ ] Address format correct: `tb1q...` on testnet, `bc1q...` mainnet.
- [ ] UTXO fetch works against the testnet indexer for a funded address.
- [ ] **Change output correctness** — a send returns correct change to a wallet
      address; no funds burned to fee. Test with explicit assertions.
- [ ] Fee computed from vSize × sat/vByte; sane on testnet.
- [ ] **Real testnet send proven end-to-end BY HAND** — derive → fund from a
      BTC testnet/signet faucet → build+sign PSBT → broadcast → confirm on a
      testnet explorer. Same bar ETH cleared.
- [ ] Mainnet gated (no real BTC until audit). BTC stays receive_only until the
      verified send, then live.
- [ ] check:rng still green (no Math.random in BTC crypto paths); RNG guard
      extended to cover btc/.
- [ ] Existing EVM tests untouched and green.
- [ ] BTC stack added to docs/Audit.scope.md.

---

## Out of scope for Phase BTC
- Lightning, multisig, Taproot/BIP-86 (unless you later decide), coinjoin/privacy
  features. Keep v1 to single-sig BIP-84 send/receive/store.
- SOL (next phase, separate).
- No mainnet.

## Honest cost note
This is a full new crypto stack — comparable in effort/risk to Phase A, and it
expands the independent audit (UTXO/PSBT handling is new attack surface). Worth
re-confirming the audit scope/quote after BTC + SOL land. The disciplined payoff:
real, verified BTC — not a fake "supported" badge.

## Briefing note for Claude Code (when ready)
"Execute Phase BTC per docs/PhaseBTC.md. BIP-84 (bech32), @scure/btc-signer,
testnet first, mainnet gated. Build btc/ parallel to evm/ — do NOT change EVM
code or crypto. Implement coin selection with CORRECT change outputs (explicit
tests). Extend check:rng to btc/. Keep BTC receive_only (no live until a verified
testnet send). Run check:rng + tests (must stay green). Open a PR, do not merge."
