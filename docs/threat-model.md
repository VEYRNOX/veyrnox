# Veyrnox — Threat Model

> For the independent third-party security audit (Track 2 — App Store submission).
> See `docs/Audit.scope.md` for scope boundaries and sequencing context.

---

## 1. System overview

Veyrnox is a **client-side, non-custodial, coercion-resistant HD wallet** for EVM chains
(ETH, MATIC, ARB, OP, AVAX, BNB), Bitcoin (BIP-84 native SegWit), and Solana (ed25519
SLIP-0010). The BIP-39 seed is the sole identity; no server ever holds key material.

**Tech stack:** Vite + React (web) + Capacitor (iOS/Android). Crypto: @scure/bip39,
@scure/bip32, @scure/btc-signer, @noble/curves, @noble/hashes, ethers v6, hash-wasm
(Argon2id). Storage: IndexedDB (web/Capacitor WebView).

---

## 2. Assets being protected

| Asset | Description | Severity if compromised |
|-------|-------------|------------------------|
| **BIP-39 seed** | Root of all key material; loss = full funds access | Critical |
| **Derived private keys** | Per-chain/account signing keys | Critical |
| **Vault password (PIN / passphrase)** | KDF input; exposure enables offline vault attack | High |
| **Action Password (2FA)** | Second factor for send; bypassing enables unauthorised sends | High |
| **Transaction intent** | Recipient address + amount; manipulation = theft | High |
| **Deniability state** | Which wallet set is active (primary vs decoy vs hidden) | High (I3) |
| **Wallet existence** | Whether the user has a wallet at all | Medium (deniability) |

---

## 3. Adversary profiles

### 3a. Remote / network adversary
- **Malicious RPC provider**: controls JSON-RPC responses (balances, nonces, gas).
  - Mitigation: all RPCs treated as untrusted (I5). ChainId verified at sign time.
    Keys never sent to RPC. Amounts parsed with `parseUnits`; signed locally.
  - Residual risk: RPC can feed a wrong nonce or stale gas price but cannot alter
    the signed payload or redirect funds without the private key.
- **Supply-chain compromise**: malicious package in node_modules (especially
  `@solana/web3.js`, which has a large transitive tree).
  - Mitigation: `npm audit`; crypto deps limited to audited @scure/@noble/ethers stack.
    `check:rng` CI tripwire for CSPRNG regression.
  - Residual: a subtle supply-chain backdoor that passes `npm audit` is not caught
    by automated scans — requires human review of critical dep upgrades.
- **Phishing / scam transaction**: attacker induces user to sign a malicious tx.
  - Mitigation: calldata decode + unlimited-approval warning (anti-blind-signing);
    address-poisoning similarity warning; self-send warning; ENS resolution shown.
  - Residual: social engineering remains possible; wallet cannot prevent all scams.

### 3b. Device-access adversary
- **Stolen/seized unlocked device**: attacker has physical OS access while vault is
  unlocked (in-memory key present).
  - Mitigation: auto-lock on idle/backgrounding; Action Password (2FA) as second
    factor on send; in-memory key cleared on lock. I2 (no silent egress) means the
    key cannot be exfiltrated silently while the app is open.
  - Residual: JS heap is not cryptographically zeroised (platform limitation,
    documented); a heap dump from a compromised OS could recover the key.
    M2 (native Keystore/Secure Enclave binding) is the long-term mitigation —
    currently TARGET.
- **Stolen locked device**: attacker has the encrypted vault (IndexedDB) but not the
  PIN or passphrase.
  - Mitigation: Argon2id KDF (tuned parameters), AES-256-GCM authenticated
    encryption, fresh random salt+IV per encryption. Brute-force is hard; wrong
    password fails closed (GCM auth tag).
  - Residual: weak or guessable PIN (6-digit) limits KDF work to ~1M candidates;
    Argon2id parameters should be tuned for the target device class.
- **Coerced unlock (duress scenario)**: adversary knows the user has a wallet and
  forces them to unlock under threat.
  - Mitigation: Duress PIN opens a plausible single-wallet decoy (deniability). Hidden
    wallets provide additional cover. Fixed-length container padding (H2, #230) makes
    all wallet blobs byte-length-identical to prevent forensic tells. Action Password
    parity (H2) means the decoy enforces 2FA identically to the real set — no tell.
  - Residual: the duress-setup UI does not yet prompt for a *separate* decoy Action
    Password (TODO in code, flagged in PR #230 reviewer must-checks). Until that UI
    is built, the decoy AP record is provisioned null and set later in-session.

### 3c. Insider / developer adversary
- **Demo mode leaks into production**: VITE_DEMO_MODE=1 caches the vault password in
  plaintext localStorage; if this shipped in a release build, all funds would be at
  risk.
  - Mitigation: H-1 BUILD-TIME GUARD in `vite.config.js` — a build with
    `VITE_RELEASE=1 AND VITE_DEMO_MODE=1` throws and refuses to emit a bundle.
    The guard is in the build pipeline, not in runtime code.
- **Mainnet gate bypassed prematurely**: `ALLOW_MAINNET` flipped without audit.
  - Mitigation: The audit harness (`npm run audit:eth`) asserts the gate is closed
    and fails CI if opened without the internal-audit sign-off doc present. The sign-
    off doc (`docs/audit-triage/internal-audit-2026-06-17.md`) is the hard gate.
- **`Math.random()` introduced into crypto paths**: breaks CSPRNG guarantee.
  - Mitigation: `npm run check:rng` scans the repo for `Math.random` in key/signing
    paths and is wired into CI as a required gate.

### 3d. Audit-log adversary (deniability threat)
An opt-in audit log (S4, OFF by default) is stored as an AES-GCM blob in the same
IndexedDB store as all other vault blobs, under a neutral key, byte-shaped identically
to every other blob. The threat: a log that records duress/stealth/panic events
defeats the deniability guarantee.
- Mitigation: a compile-time denylist in `auditLog.js` prevents any duress/stealth/
  hidden/panic/decoy/seed event from being recorded. The log is destroyed by panic
  wipe (same store is cleared). Disabled by default = nothing written.
- Review focus: confirm the denylist is complete and cannot be bypassed; confirm the
  blob is forensically identical to non-log blobs; confirm panic clears it.

---

## 4. Trust boundaries

```
┌─────────────────────────────────────────────────────────┐
│  User device (browser / Capacitor WebView)              │
│                                                         │
│  ┌───────────────┐   ┌────────────────────────────┐    │
│  │  React UI     │   │  wallet-core               │    │
│  │  (untrusted   │   │  (trusted — signs locally) │    │
│  │   user input) │   │                            │    │
│  └──────┬────────┘   └────────────┬───────────────┘    │
│         │                         │                     │
│         ▼                         ▼                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  IndexedDB  (only AES-GCM ciphertext persisted)  │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────┘
                                 │  signed tx bytes only
                         ════════╪═══════ trust boundary
                                 │  (backend treated as UNTRUSTED — I5)
                    ┌────────────▼──────────────┐
                    │  RPC / Esplora / price API │
                    │  (read + broadcast only;   │
                    │   no key material ever)    │
                    └───────────────────────────┘
```

**Key invariants:**
- I1: Keys never cross the trust boundary (no key to RPC/server).
- I2: No silent data egress from the device.
- I3: Deniability mode (duress/hidden sessions) makes zero backend calls.
- I4: Fail honest, fail closed — mock security controls are never used.
- I5: The backend (RPC, price API) is untrusted by design.

---

## 5. Out-of-scope threats (for this audit pass)

- **Smart contract / DeFi protocol bugs**: Veyrnox is a wallet, not a protocol.
- **WalletConnect / arbitrary dApp calldata** (Phase D, not yet built).
- **Denial-of-service against the user's RPC**: degrades UX but cannot steal funds.
- **Side-channel attacks requiring physical hardware access** (EM, power analysis):
  out of scope for a client-side JS wallet; M2 Secure Enclave work may reduce surface.
- **Social engineering of the user** (phishing sites, fake Veyrnox apps): mitigated
  by UI warnings but not eliminable at the wallet layer.

---

## 6. Security invariants summary (for auditor reference)

| ID | Invariant |
|----|-----------|
| I1 | Keys never leave the device |
| I2 | No silent data egress |
| I3 | Deniability mode makes zero backend calls |
| I4 | Fail honest, fail closed — no mock/fake security controls |
| I5 | Backend is untrusted by design |
| H-1 | Build-time guard: RELEASE + DEMO simultaneously is unbuildable |
| H2 | Decoy/hidden 2FA parity: gate fires identically across all session types |
| D1–D3 | No wallet-count tell in dashboard/analytics/notifications |
| S1 | ChainId verified at sign time |
| S2 | Address screening (OFAC + blocklist) — advisory, no phone-home |
| S3 | Self-send warning |
| S4 | Audit log — OFF by default, denylist-guarded, panic-cleared |
