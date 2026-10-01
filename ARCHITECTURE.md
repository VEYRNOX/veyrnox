# Veyrnox Architecture

One-page map of how the pieces connect. It is deliberately a map, not the territory: each
section links to the doc or code that owns the detail. Where a spec and the code disagree,
**the code wins**; the notes below say where that is known to happen.

Veyrnox is a self-custody, coercion-resistant wallet: Vite + React, shipped to iOS/Android
through Capacitor (and as a web app). **The seed is the identity and keys never leave the
device.** There is no hosted account and no server-side custody.

## Security invariants

Every design decision is checked against these. They are the reason the architecture looks
the way it does.

| | Invariant |
|---|---|
| I1 | Keys never leave the device |
| I2 | No silent data egress (every off-device byte is an explicit, disclosed opt-in) |
| I3 | Deniability mode makes zero backend calls |
| I4 | Fail honest, fail closed. Never mock a control to look real |
| I5 | The backend is untrusted by design. Total backend compromise loses zero funds |
| I6 | Hardware binding: KEK = HKDF(H ‖ C), an ordered concatenation, not XOR |

## System overview

```
┌───────────────────────────── Device (trusted) ─────────────────────────────┐
│                                                                            │
│  UI (React pages/components)                                               │
│     │                                                                      │
│     ▼                                                                      │
│  WalletProvider ── unlocked session: mnemonic held in memory, never        │
│     │              persisted, keys derived on demand to sign               │
│     │                                                                      │
│     ├── Send / WalletConnect  ──►  risk scoring ──► sign-gate ──► signer   │
│     │      (the two signing chokepoints)   │            │                   │
│     │                                  src/risk     src/sign-gate          │
│     │                                  src/policy   src/rasp (RASP gate)   │
│     ▼                                                                      │
│  wallet-core                                                               │
│     vault.js (AES-256-GCM + Argon2id)                                      │
│     keystore/ ── web | native ── hardware KEK (Secure Enclave / StrongBox) │
│     evm/ btc/ sol/ + derivation.js  (one HD seed, per-chain paths)        │
│     duress / stealth / panic / multiVault  (deniability stack)             │
│                                                                            │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │ only explicit, disclosed, opt-in calls (never in decoy/duress)
               ▼
   Untrusted edge: Cloudflare Pages Functions + Supabase Edge Functions
   (price/gas/news proxies, RPC allowlist, TIP screening + chat, Buy, IAP webhooks)
```

## Layers

### 1. Vault and key custody (`src/wallet-core/`)
The seed is encrypted at rest in a vault: **AES-256-GCM** with a fresh IV per write and the
header bound as AAD, key derived with **Argon2id** via @noble/@scure (never Web Crypto, never
`Math.random`). KDF parameters are stored in the blob so they can migrate: new vaults use
**96 MiB / t=6**; older vaults keep **192 MiB / t=3** (same total work) until a migration
flag flips. The KDF constants live in `src/wallet-core/vault.js` (`KDF_PARAMS`), and that file
is the authority.

### 2. Hardware-bound unlock (`src/wallet-core/keystore/`)
A platform seam (`keystore/index.js`) selects web or native storage. On native, the seed's
key-encryption-key combines a PIN-derived factor with a hardware factor:
**iOS** Secure Enclave ECIES, **Android** AndroidKeyStore HMAC (StrongBox preferred),
**web** WebAuthn PRF where available. Both factors must be present to unlock. Design:
[`docs/kek-architecture-spec.md`](docs/kek-architecture-spec.md); build and verification
record: [`docs/hardware-kek-phase-plan.md`](docs/hardware-kek-phase-plan.md).

### 3. Unlocked session (`src/lib/WalletProvider.jsx`)
The decrypted mnemonic lives in memory, outside React state, and `lock()` clears it
best-effort. Per-chain keys are derived only inside `withPrivateKey`-style helpers at signing
time. Honest limit: **signing still happens in the JS/WebView path**, not a native signer
([`docs/mobile-security-architecture.md`](docs/mobile-security-architecture.md) §1, §6).

### 4. Deniability stack (`duress.js`, `stealth.js`, `panic.js`, `multiVault.js`)
Wallet sets (real, decoy, hidden) sit in a fixed-length container of 256 byte-identical
slots, so wallet count is not observable. A duress PIN opens a decoy; Face ID resolves to the
**decoy** by design (a biometric can be compelled, knowledge cannot); panic wipe destroys key
material. Decoy and hidden sessions make zero backend calls (I3). Design rationale:
[`docs/kek-architecture-spec.md`](docs/kek-architecture-spec.md) §2.

### 5. Signing pipeline (`src/risk/`, `src/policy/`, `src/sign-gate/`, `src/rasp/`)
The rule (from `CLAUDE.md`) is that every signing request goes through `presignGateOrReject`
(called from `WalletConnectProvider.jsx` and `src/rasp/getFreshRaspArtifact.js`), and a
missing or errored gate result is a BLOCK. Local risk signals (address poisoning, calldata, known-bad dApps, simulation) compose
into one verdict; RASP runtime-integrity probes can block signing outright. The two
chokepoints are `src/pages/SendCrypto.jsx` and `src/lib/WalletConnectProvider.jsx`.
Unification of these two paths is the active roadmap item:
[`docs/transaction-intelligence-architecture.md`](docs/transaction-intelligence-architecture.md).

### 6. Advisor (`src/components/SecurityAdvisor.jsx`)
AI Security Protection is **advisory-only**. It sits outside the custody and signing trust
core, never holds keys, never signs, and makes no calls in deniability sessions. Chat goes
client → Supabase `tip-chat` edge function (entitlement-gated) → TIP worker. There is no
client-side signing of those requests.

### 7. Backend (untrusted, `functions/`, `supabase/`, `workers/`, `services/`)
- `functions/api/data/*`: price, gas, kline and news proxies (one-host, holdings-decoupled).
- `functions/api/rpc/[fn].js`: server-side RPC with an **allowlist (`ALLOWED_RPCS`) as the only
  boundary**. Never add a passthrough, table proxy or wildcard.
- `functions/api/buy/*` and `services/transak-proxy`: Buy flow. Owner-only, hands off.
- `supabase/functions/`: `tip-chat`, `tip-screen`, `rc-webhook`, `first-referral-bonus`.
- Two wallet Supabase projects (prod and staging); see `CLAUDE.md` for refs and rules.

Design and threat model: [`docs/Backend-security-architecture.md`](docs/Backend-security-architecture.md).

## Where to find things

| Question | Look at |
|---|---|
| Full security design | [`docs/Security-architecture-master.md`](docs/Security-architecture-master.md) |
| How mobile actually behaves today | [`docs/mobile-security-architecture.md`](docs/mobile-security-architecture.md) |
| Auth and vault flows | [`docs/vault-auth-architecture-brief.md`](docs/vault-auth-architecture-brief.md) |
| Per-feature status and evidence | [`docs/Feature-Status.md`](docs/Feature-Status.md) |
| What an auditor should read | [`docs/Audit.scope.md`](docs/Audit.scope.md) |
| Why a choice was made | [`DECISIONS.md`](DECISIONS.md) |

## Known divergences between docs and code

- The Argon2id numbers in `docs/mobile-security-architecture.md` (192 MiB / t=3 for new
  vaults) and `docs/kek-architecture-spec.md` (64 MiB / t=3 shipped) are out of date. Use
  `KDF_PARAMS` in `vault.js`.
- `docs/Security-architecture-master.md` is a 2026-06-05 design reference; some of its "TARGET"
  items have since been built. Check `docs/Feature-Status.md`.
- The EVM private key cannot be zeroed after use (ethers v6 limitation). Recorded as an open
  residual in `CLAUDE.md`.
