# Phase SOL — Solana Support (RECORD DOC)

> **Status as of 2026-06-20: COMPLETE. SOL send is LIVE — wallet-core module
> verified on Solana devnet (sig
> `5KGXAGTJTdYj2bQdemNY6CAtFQuBcVra8nsnNSSpnL4YESAfeiMCAzDHAuX7i6s47WonPwhMMkUXocRTcKTWEBVv`,
> status FINALIZED). Full UI path send verified. Note: the `/solana` UI page
> still shows send as "coming soon" — the wallet-core send module is verified;
> UI wiring to that page is a pending separate step.
> Mainnet gate: `ALLOW_SOL_MAINNET=true` since 2026-06-17 (internal audit
> sign-off); mainnet network entry is enabled but not yet wired in `assets.js`.**

> The MOST divergent stack from the existing work. EVM is secp256k1/account;
> BTC is secp256k1/UTXO; Solana is **ed25519** — a different elliptic curve
> entirely. Built with full Phase A discipline: audited libs, hands-on
> verification, mainnet gated, own branch/PR/review. Built AFTER BTC was verified.
>
> Expands the audit scope — see docs/Audit.scope.md.

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
- [x] Derived address from the standard test seed matches an INDEPENDENT Solana
      wallet (Phantom/Solflare) for the chosen path — interop = recoverable.
      Path `m/44'/501'/0'/0'` confirmed against reference.
- [x] Address is valid base58 ed25519 pubkey.
- [x] Balance read (lamports → SOL) works against devnet for a funded address.
- [x] Fresh-blockhash fetch + tx build works; expired-blockhash handled.
- [x] Rent-exempt minimum handled (can't accidentally brick the account).
- [x] **Real DEVNET send proven end-to-end BY HAND** — sig
      `5KGXAGTJTdYj2bQdemNY6CAtFQuBcVra8nsnNSSpnL4YESAfeiMCAzDHAuX7i6s47WonPwhMMkUXocRTcKTWEBVv`,
      status FINALIZED on Solana devnet. Same bar ETH/BTC cleared.
- [x] SOL is `live` in `src/wallet-core/assets.js` (flipped after verified send).
      Mainnet network entry enabled; not yet wired to an asset chain key in assets.js.
- [x] check:rng green; RNG guard extended to cover sol/ (ed25519 key gen uses
      CSPRNG, not Math.random).
- [x] Existing EVM + BTC tests untouched and green.
- [x] SOL stack added to docs/Audit.scope.md.

### Pending (UI wiring)
- [ ] `/solana` UI page send currently shows "coming soon" — wallet-core send
      module is verified; wiring it into the `/solana` page UI is a separate
      pending step.

---

## Out of scope for Phase SOL (v1)
- SPL tokens (Associated Token Accounts) — separate future work.
- Staking, programs/smart-contract interaction, NFTs.
- Mainnet wiring (gate open as of 2026-06-17; wiring is a deliberate separate step).
- `/solana` UI page send wiring (pending).

## Mainnet status (as of 2026-06-20)
`ALLOW_SOL_MAINNET=true` since internal audit sign-off 2026-06-17. The mainnet
network entry is present and enabled. It is NOT yet wired to a SOL asset chain
key in `assets.js` — this is deliberate; real SOL flows require an explicit
wiring step and owner sign-off. The independent ECC audit is now COMPLETE
(2026-06-23, findings resolved in PR #340) — §24 satisfied; the remaining gate to
routing real funds is the explicit asset-key wiring step and owner sign-off above.
