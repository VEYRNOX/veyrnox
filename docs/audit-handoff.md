# Veyrnox — Independent Audit Handoff

> This document is addressed to the external security firm performing the
> independent third-party audit. It covers build/run, test suite, scope
> pointers, and known-annotated items so auditor hours focus on what matters.

---

## Quick start

```bash
git clone <repo>
cd veyrnox
npm install
npm test            # full suite (~1100+ tests, all should pass)
npm run check:rng   # CSPRNG tripwire — must be green
npm run audit:eth   # automated pre-audit harness — see §A notes below
npm run dev         # dev server on http://localhost:5173
npm run build:uat   # production-equivalent UAT build
npx vite preview --port 4173   # serve UAT build
```

**Node version:** use the LTS version declared in `.nvmrc` / `package.engines`.
**Platform note:** the build is cross-platform (CI runs Linux); `npm.cmd` on Windows.

---

## Scope documents

| Document | Purpose |
|----------|---------|
| `docs/Audit.scope.md` | Full audit scope, out-of-scope items, candidate firms, sequencing |
| `docs/threat-model.md` | Assets, adversary profiles, trust boundaries, invariants |
| `docs/Security-architecture-master.md` | Architecture deep-dive |
| `docs/audit-triage/internal-audit-2026-06-17.md` | Internal audit sign-off (gate doc) |
| `docs/audit-triage/h2-decoy-hidden-2fa-parity.md` | H2 design rationale |
| `docs/SECURITY_REVIEW_CHECKLIST.md` | Self-review checklist (pre-audit) |
| `docs/SAST-PASS-FULL.md` / `docs/SAST_FINDINGS.md` | SAST results and triage |

---

## Key source locations

| Area | Path | Notes |
|------|------|-------|
| Crypto core | `src/wallet-core/` | Start here |
| EVM (networks, send, tokens) | `src/wallet-core/evm/` | |
| Bitcoin (BIP-84, PSBT) | `src/wallet-core/btc/` | Separate UTXO stack |
| Solana (ed25519 SLIP-0010) | `src/wallet-core/sol/` | Third curve family |
| Vault / KDF | `src/wallet-core/vault.js`, `multiVault.js` | Argon2id + AES-GCM |
| Deniability stack | `src/wallet-core/duress.js`, `stealth.js`, `panic.js` | H2 (#230) |
| Action Password (2FA) | `src/wallet-core/actionPassword.js` | |
| Audit log | `src/wallet-core/auditLog.js` | See deniability threat in threat model |
| Address screening | `src/wallet-core/evm/suspicious.js`, `data/` | Advisory only |
| Session / in-memory unlock | `src/lib/WalletProvider.jsx` | React context |
| Unit tests | `src/wallet-core/__tests__/` | 1000+ tests covering core |

---

## §A — Automated harness (`npm run audit:eth`) — known items

Run `npm run audit:eth` before starting. Expected output:

**A1–A5 (gate integrity):** These report `[INFO]` rather than `[FAIL]` because the
internal audit sign-off (`docs/audit-triage/internal-audit-2026-06-17.md`) explicitly
authorises `ALLOW_MAINNET=true`. The mainnet gate was open under a documented owner
policy after the internal audit cleared. The harness detects the sign-off doc and
downgrades to INFO automatically — this is expected-open state, not a bypass.
**Auditor focus:** verify the *gate mechanism* itself is sound (code path from
`ALLOW_MAINNET` to actual network enable/disable/throw), not whether the flag is
currently `true` or `false`.

**B1 (64-hex literals):** All 10 hits are testnet tx hashes in `assets.js` comments
(evidence of verified testnet sends). No private keys.

**B2 (test-vector mnemonic):** The `abandon × 11 + about` all-zero mnemonic appears
in `src/pages/StealthWallets.jsx` — used as a visible, clearly-labelled demo placeholder
in the stealth-wallets UI. It is the most public zero-entropy vector that exists
(no funds, no secret). Confirm it is never used as a wallet default.

**B5 (network calls in wallet-core):** Two `fetch()` calls in `src/wallet-core/btc/provider.js` —
one for Esplora UTXO lookup, one for broadcast. Both are RPC-only (no key material on
the same line — B3 passes). Confirm no key material reaches these call sites.

**C1 (Math.random):** Excluded after annotation — `src/lib/snapshotStore.js:82` uses
`Math.random()` for a UI snapshot dedup ID (display key only, not a secret or entropy
source for any cryptographic operation). Annotated in source with `// audit:` note.

**C3 (dangerouslySetInnerHTML):** One hit in `src/components/ui/chart.jsx:61` —
generates CSS custom-property declarations from a hardcoded `THEMES` config object.
No user input reaches `__html`. Annotated in source with `// audit:` note.

---

## §B — Architecture highlights for auditors

### Key lifetime
Decrypted seed/keys are held only as React refs in `WalletProvider` context. They are
cleared on lock, tab-hide, and idle timeout. **Known limitation:** JS `ArrayBuffer`
and string memory is not cryptographically zeroised (no `memset` equivalent in
browser JS). A heap dump from a compromised OS could recover in-memory key material.
This is a platform constraint documented in the threat model (§3b). The long-term
mitigation is M2 (native Keystore/Secure Enclave binding — TARGET, not yet built).

### Vault format (post-H2)
Every wallet set (primary, duress/decoy, hidden) is serialised as a fixed-length
container (`FIXED_LEN = 8192 B`) padded before AES-GCM encryption. This makes all
vault blobs byte-identical in length — the ciphertext length cannot reveal wallet
count or Action Password presence. See `multiVault.js → serializeContainer`.

### Deniability audit log
`auditLog.js` stores entries as an AES-GCM blob in the same IndexedDB store, under a
neutral key, byte-shaped identically to other vault blobs. A compile-time denylist
prevents recording any duress/stealth/panic/decoy/seed/key event — the log can never
betray the deniability features. Disabled by default (opt-in only). Destroyed by panic
wipe. Confirm: (a) denylist is complete; (b) blob is a forensic non-tell; (c) panic
clears it.

### Mainnet gate
`ALLOW_MAINNET` in `src/wallet-core/evm/networks.js` is the single flip that opens
EVM mainnet. `ALLOW_BTC_MAINNET` and `ALLOW_SOL_MAINNET` are analogous. The *mechanism*
is what matters: confirm that flipping the flag actually enables networks (and that it
cannot be circumvented via a secondary code path).

---

## §C — What is explicitly NOT in scope

See `docs/Audit.scope.md §out-of-scope`. Summary: smart contracts, DeFi, WalletConnect
(Phase D, not built), SPL tokens, social recovery / multi-sig (removed from app, never
shipped), Base44 backend/billing. Keeping these out keeps the scope (and cost) tight.

---

## §D — Known open items (flagged for auditor awareness, not blocking)

| Item | Location | Status |
|------|----------|--------|
| M2 native Keystore/Secure Enclave | `docs/M2.secure-storage.md` | TARGET — not built; JS memory-zeroisation limitation documented |
| Decoy Action Password UI | `src/wallet-core/duress.js` (TODO comment) | Decoy AP record is provisioned null; duress-setup UI to collect a separate decoy AP is not yet built |
| Panic blob length differs from duress | `src/wallet-core/panic.js` | Panic stayed a bare-mnemonic marker; duress is now a padded container — acceptable but asymmetric |
| OFAC screening needs legal review | `src/wallet-core/data/` | The OFAC sanctions snapshot cannot ship without independent legal sign-off (separate from this security audit) |
