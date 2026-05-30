# EVM Slice — Security Review Checklist (your sign-off, pre-audit)

You own verification of the crypto paths. This is the checklist to work
through before a testnet launch, and to hand (with the code) to the
independent auditor before any mainnet use. None of this is satisfied by
"an AI wrote it carefully."

## Entropy & key generation
- [ ] Mnemonic entropy comes only from the platform CSPRNG (via @scure/bip39).
      Confirm no `Math.random()` anywhere in crypto paths (`npm run check:rng`).
- [ ] 12/24-word options produce valid BIP-39 (checksum) mnemonics.
- [ ] Generated mnemonic imports successfully into an INDEPENDENT wallet
      (e.g. MetaMask) and yields the SAME first address. (Interop = recoverable.)

## Derivation correctness
- [ ] m/44'/60'/0'/0/0 address for the all-abandon/about test mnemonic matches
      the published value `0x9858EfFD232B4033E47d90003D41EC34EcaEda94`.
- [ ] Account indices 0..n produce distinct, correct addresses vs. an
      independent reference.

## Vault / encryption
- [ ] Argon2id parameters reviewed for your target devices (memory/iterations).
- [ ] AES-256-GCM: fresh random salt AND iv per encryption; never reused.
- [ ] Wrong password and tampered blob both FAIL closed (GCM auth) — verified.
- [ ] Only ciphertext is persisted (IndexedDB). Grep the codebase: no plaintext
      mnemonic/private key written to storage, logs, analytics, or network.
- [ ] vaultStore refuses to persist non-encrypted objects (guard test passes).

## Key lifetime / memory
- [ ] Decrypted mnemonic held only in a ref while unlocked; cleared on lock,
      tab-hide, and idle timeout.
- [ ] Private keys derived transiently for signing and not stored in state,
      context, query cache, or component props.
- [ ] Documented JS memory-zeroization limitation in the threat model; plan for
      device-keystore wrapping noted.

## Signing & broadcast
- [ ] Signing happens locally; private key never sent to any server/RPC.
- [ ] chainId verified against intended network before broadcast.
- [ ] Mainnet gated (`ALLOW_MAINNET=false`); gating test passes.
- [ ] Returned tx hash is the REAL network hash (not fabricated); confirmed on
      a block explorer.
- [ ] Balances/history read from chain (source of truth), not DB writes.

## Anti-phishing UX (UI layer)
- [ ] Recipient address shown in full; address-poisoning warning wired.
- [ ] ENS resolution result displayed for user confirmation before send.
- [ ] (When ERC-20/contract calls are added) calldata decoded + unlimited
      approval warnings — tracked as follow-up, not in this native-send slice.

## Supply chain / build
- [ ] Dependencies pinned; `npm audit` / Snyk clean or triaged.
- [ ] Crypto deps limited to audited libs (@scure/@noble/ethers/hash-wasm).
- [ ] RNG guard wired into CI as a required check.

## Gate to mainnet (all required)
- [ ] Every box above checked.
- [ ] Independent third-party audit completed and findings remediated.
- [ ] Re-test confirms remediations.
- [ ] Only then: set ALLOW_MAINNET with explicit sign-off.
