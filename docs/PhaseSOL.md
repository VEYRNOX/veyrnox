# Phase SOL — Solana Support (DESIGN DOC)

> The MOST divergent stack from your existing work. EVM is secp256k1/account;
> BTC is secp256k1/UTXO; Solana is **ed25519** — a different elliptic curve
> entirely. Your existing derivation/signing does NOT apply. Different SDK,
> address format, transaction model, fee model. Treat as a full new crypto stack
> with the Phase A discipline: audited libs, hands-on verification, mainnet
> gated, own branch/PR/review. Build AFTER BTC is verified.
>
> Expands the audit scope — update docs/Audit.scope.md when it lands.

---

## Why SOL is the biggest divergence

- **Curve: ed25519, not secp256k1.** This is the headline. Your EVM/BTC keys are
  secp256k1; Solana uses ed25519 (Edwards curve). Different key generation,
  different signing primitive. @noble/curves supports ed25519, but it's a
  distinct path from everything you've built.
- **Derivation:** Solana uses `m/44'/501'/0'/0'` with **ed25519 SLIP-0010**
  derivation (all-hardened), NOT BIP-32 secp256k1 derivation. Phantom/Solflare
  conventions matter for interop (see decision below).
- **Addresses:** base58-encoded ed25519 public keys (e.g. `7xKX...`), not hex/
  bech32. No checksum-casing like EVM.
- **Account model:** balances in "lamports" (1 SOL = 1e9 lamports). Account-based
  but with rent + the system program; sending SOL ≠ sending an ERC-20.
- **Transactions:** built against a recent blockhash (expire quickly), signed
  with ed25519, sent via the Solana JSON-RPC. Fees are different (very low,
  priority fees optional).
- **SPL tokens** (Solana's token standard) are a SEPARATE concern again
  (Associated Token Accounts) — OUT of scope for v1; native SOL only.

The only thing shared with your stack is the BIP-39 mnemonic/seed; everything
after is new.

---

## Design decisions (settle in spec, not mid-build)

### 1. Derivation → ed25519 SLIP-0010, path `m/44'/501'/0'/0'`
- Use the **Phantom/Solflare-compatible** derivation so an imported seed yields
  the SAME address users would see in mainstream Solana wallets (interop =
  recoverable). Confirm the exact path convention against a reference wallet
  during verification — Solana wallets have historically varied
  (`m/44'/501'/0'/0'` vs `m/44'/501'/0'`), so VERIFY, don't assume.
- ed25519 SLIP-0010 (hardened-only derivation), NOT BIP-32 secp256k1.

### 2. Libraries → audited where possible
- **@solana/web3.js** — the standard official SDK for tx building, RPC,
  broadcast. Widely used; evaluate version/maintenance at build time.
- **@noble/curves (ed25519)** and **@noble/hashes** (already in project) for the
  key/derivation primitives; **@scure/bip39** (already present) for the mnemonic.
- **@scure/base** for base58 if needed.
- Prefer the @noble/@scure primitives for key handling (consistency with your
  audited stack) and @solana/web3.js for the chain/tx layer.

### 3. Network → untrusted Solana JSON-RPC
- Use a Solana RPC endpoint for **devnet** first (Solana's testing network is
  "devnet"; there's also testnet — use devnet for app testing). Treat as
  UNTRUSTED (read + broadcast only); overridable. Pick a reputable endpoint.

### 4. Blockhash / tx expiry
- Solana txs reference a recent blockhash and EXPIRE quickly (~minutes). Fetch a
  fresh blockhash at send time; handle "blockhash expired" with a clear retry.
  This is a Solana-specific UX/correctness detail with no EVM analogue.

### 5. Rent / minimum balance
- Solana accounts need a rent-exempt minimum balance. Sending your whole balance
  can fail or close the account. Surface/handle the rent-exempt minimum so a
  user can't accidentally brick their account. Document the policy.

---

## Architecture (parallel module set, like evm/ and btc/)

`src/wallet-core/sol/`:
- `derivation.js` — ed25519 SLIP-0010, `m/44'/501'/0'/0'`, base58 address from
  the shared seed.
- `provider.js` — untrusted Solana RPC client (balance, recent blockhash,
  broadcast). Read/broadcast only.
- `send.js` — build transfer tx → fresh blockhash → sign (ed25519) locally →
  broadcast → confirm.
- assets entry: SOL, family `sol`, `coming_soon` → `receive_only` → `live` only
  after a verified devnet send.

Reuse: BIP-39 seed (shared) + vault (stores the seed). NO change to EVM or BTC
code. Keys on device; signing local; same self-custody invariants.

---

## Verification gates (hands-on, like ETH/BTC — none skipped)
- [ ] Derived address from the standard test seed matches an INDEPENDENT Solana
      wallet (Phantom/Solflare) for the chosen path — interop = recoverable.
      CONFIRM the path convention here (Solana path history is messy).
- [ ] Address is valid base58 ed25519 pubkey.
- [ ] Balance read (lamports → SOL) works against devnet for a funded address.
- [ ] Fresh-blockhash fetch + tx build works; expired-blockhash handled.
- [ ] Rent-exempt minimum handled (can't accidentally brick the account).
- [ ] **Real DEVNET send proven end-to-end BY HAND** — derive → fund from a
      Solana devnet faucet (airdrop) → sign → broadcast → confirm on a Solana
      explorer (devnet). Same bar ETH/BTC cleared.
- [ ] Mainnet gated (no real SOL until audit). SOL receive_only until verified
      send, then live.
- [ ] check:rng green; RNG guard extended to cover sol/ (ed25519 key gen must
      use the CSPRNG, never Math.random).
- [ ] Existing EVM + BTC tests untouched and green.
- [ ] SOL stack added to docs/Audit.scope.md.

---

## Out of scope for Phase SOL
- SPL tokens (Associated Token Accounts) — separate future work.
- Staking, programs/smart-contract interaction, NFTs.
- No mainnet. Native SOL send/receive/store only, single account.

## Honest cost note
ed25519 + a new SDK + Solana-specific correctness (blockhash expiry, rent) make
this a full new stack, comparable to Phase A and distinct from BTC. It further
expands the audit scope (new curve, new signing path = new attack surface).
After EVM + BTC + SOL, re-confirm the audit scope/quote — you'll be auditing
THREE distinct cryptographic families, not one.

## Briefing note for Claude Code (when ready, after BTC verified)
"Execute Phase SOL per docs/PhaseSOL.md. ed25519 SLIP-0010 path m/44'/501'/0'/0'
(Phantom-compatible — VERIFY against a reference wallet), @solana/web3.js +
@noble ed25519, DEVNET first, mainnet gated. Build sol/ parallel to evm/ and
btc/ — do NOT change EVM or BTC code or crypto. Handle fresh blockhash + rent-
exempt minimum. Extend check:rng to sol/. Keep SOL receive_only (no live until a
verified devnet send). Run check:rng + tests (must stay green). Open a PR, do
not merge."
