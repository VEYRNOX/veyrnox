# Veyrnox — Technical & Security Architecture (High-Level Design)

**Date:** 2026-06-05 · **Status:** DESIGN reference — provisional, PRE-AUDIT.
**Scope:** Mobile application, thin untrusted backend, user-owned infrastructure, trust
boundaries, technical feature set.

> ⚠️ THIS IS A DESIGN DOCUMENT, NOT A SECURITY CERTIFICATION. It describes the intended
> architecture and is a brief for the independent security audit (a tracked launch blocker).
> No security property here is verified. Build of any backend / seed-touching component is
> GATED on that audit. "Built" in the feature section means present in code (testnet,
> provisional), NOT production-certified. Do not market anything herein as "secure" or
> "audited" until the audit completes.
>
> Diagrams (trust zones, mobile defense-in-depth stack, signing key lifecycle) are rendered
> in the companion PDF (Veyrnox-Technical-Security-Architecture.pdf). This markdown is the
> textual HLD; diagram sections below describe each.

## 1. Product summary
Veyrnox is a self-custody crypto wallet (web + mobile via Capacitor) positioned as a
coercion-resistant wallet for high-risk holders facing physical and digital targeting. Core
principle: the seed phrase is the identity — no hosted account, no server custody, no default
address leakage. The differentiator (the "wedge") is the deniability stack; the backend, where
present, is thin and untrusted by design.
- Stack: Vite + React 18 + Capacitor; ethers v6; @noble / @scure crypto primitives.
- Constraints: testnet/devnet only; mainnet gated on audit; all security PROVISIONAL pending
  independent audit; warns-not-blocks; never claims "safe"/"audited".

## 2. Architecture overview — three trust zones
1. On-device (trusted). Keys, seed, signing, sensitive computation. Never leaves.
2. User-owned infrastructure (user-trusted, not Veyrnox). The user's own RPC endpoint and
   personal cloud. Veyrnox never sees these.
3. Thin backend (untrusted by design). Stateless glue; handles only ciphertext or
   non-sensitive data. Architected as if breached.

**Diagram 1 — Trust zones (see PDF):** three zones; on-device holds keystore/signing,
on-device compute, and deniability+client-encryption; user-owned infra holds user-RPC and
personal cloud (encrypted artifact); thin backend holds stateless functions/push and
opaque-blob storage. Sensitive data stays on-device; the backend receives only ciphertext.

## 3. Security invariants (non-negotiable)
- I1 — Keys never leave the device. Seed/keys/signing on-device only. Total backend
  compromise loses ZERO funds.
- I2 — No silent data egress. Nothing leaves without explicit, per-feature, informed opt-in.
  Egress allowlist + user-inspectable log.
- I3 — Deniability mode is sacred. Duress/decoy/hidden sessions make ZERO backend calls;
  egress is structurally hard-disabled.
- I4 — Fail honest, fail closed. If a feature can't be delivered without violating the above,
  honest-disable it — never fake or silently degrade.
- I5 — Backend untrusted by design. Architect as if the backend (and any provider behind it)
  is honest-but-curious at best, breached at worst. Minimise what it is given.

## 4. Mobile application architecture
The mobile app is the React web app wrapped by Capacitor, with native plugins for the
security-sensitive parts. Defense-in-depth, each layer assuming the one below can fail.

**Diagram 2 — Mobile defense-in-depth stack (see PDF), top to bottom:**
- Network boundary (honest): egress allowlist, user-inspectable log, TLS — nothing leaves silently.
- Deniability layer: duress PIN, decoy balances, panic wipe, egress cutoff.
- App crypto core (sensitive boundary, on-device): vault decrypt (KDF, in-memory only),
  signing (keys never serialised out), CSPRNG enforced (no Math.random; CI guard).
- Secure storage: encrypted vault blob; biometric/passkey unlock gate (FIDO2).
- Device + OS (platform, untrusted-by-app): hardware keystore (Secure Enclave/StrongBox),
  OS sandbox, app isolation. If the device is rooted/compromised, layers above cannot fully
  compensate — stated honestly.

**Diagram 3 — Signing key lifecycle (see PDF):** biometric unlock → encrypted vault →
[exposure window: seed decrypted in RAM only → sign → wipe buffers immediately] → signed tx
leaves via user RPC. The seed never crosses the boundary; only the signature does (I1).
NOTE: reliable memory-wiping in a JS/managed runtime is hard to guarantee — an explicit audit
line-item.

**Mobile-specific threat surface (honest):** rooted/compromised device, malicious keyboard,
screen recording, clipboard sniffing, the Capacitor JS-bridge boundary. These sit beneath the
app's control; the app mitigates where it can (sensitive-field handling, no clipboard for
seeds) but cannot fully defend a compromised OS — true of every mobile wallet.

## 5. Thin backend architecture (untrusted)
Recommended at scale: Cloudflare Workers (stateless functions, push) + R2/D1 (opaque blobs,
zero egress); Supabase (managed or self-hosted) is the alternative. Self-hosting maximises I5.
- Does: stateless orchestration; tokenised, address-decoupled push delivery; storage of
  CLIENT-ENCRYPTED blobs only; non-sensitive feature glue.
- Never does: hold keys/seeds (I1); see raw address↔identity↔balances; persist an
  address↔account map; act as a data lake.
- Cheap AND safe (same decision): no per-user wallet data on the server → low load/egress
  (small bill at millions of users) AND a breach exposes no keys and no targeting list (low
  blast-radius). The expensive, dangerous data never reaches the centre.

## 6. User-owned infrastructure
- User-controlled RPC. Chain reads default to an endpoint the user picks (own node / privacy
  RPC). Removes the backend from the chain-read path.
- Personal cloud (self-recovery). The user may store the encrypted backup artifact in their
  OWN iCloud/Drive/OneDrive. Veyrnox holds nothing; the cloud holds ciphertext. Manual (no
  cloud-API integration), portable (not app-locked), passphrase is the whole defence.

## 7. Technical feature set
"Built" = present in code (testnet, provisional pending audit). "Planned" = designed/roadmap,
not yet real. Unverified classifier estimates are NOT promoted to "built" here.

### Built — wallet core
Multi-account HD wallets, seed import, written seed backup, ETH/Sepolia send, receive,
multi-chain balance display, gas-fee control, transaction history, encrypted vault,
biometric/passkey unlock, auto-lock.

### Built — security stack (provisional, pre-audit)
Transaction simulation, anomaly detection, security dashboard, spending limits/policies,
approval revoke, calldata decode, address validation, address-poisoning/spam warnings,
suspicious-address + OFAC screening (local), audit log, stealth/hidden wallets.

### Built — deniability stack (the wedge; provisional)
Duress PIN, decoy balances, panic wipe, constant-time KDF handling.

### Built — honest-disabled (no fabrication)
AI assistant/advisor/rebalancer (disabled until rebuilt on-device or stripped — never raw
wallet data). Hardware-wallet page (honest "planned").

### Planned — designed, gated
Encrypted seed backup + cloud self-recovery (audit-gated, seed-touching). Full multi-asset
send (gated on per-asset verification; 1 of 10 verified). Inheritance/crypto-will (audit +
legal gated). Real fraud-detection wiring to the on-device anomaly engine.

### Planned — salvageable feature shells (wire to real data; not yet built)
On-device/safe: net worth, P&L, spending patterns, snapshots, watchlist, price/smart alerts,
fee analytics, tax report, invoice generator. External-data (opt-in + privacy-disclosed, or
honest-disabled): analytics-by-address, NFT/token enrichment & discovery, ERC-20 discovery.

### Cut — removed on principle (security + positioning)
Leaderboard, public profiles (targeting/identity exposure). Shared portfolio → kept only as
signed local export. Referral tracker → only if fully serverless. Hosted-account/login pages
(no account in self-custody).

## 8. Data-source privacy posture (summary)
Default to the most private tier a feature can use: (1) on-device compute; (2) user-controlled
RPC; (3) privacy-preserving patterns (proxy/Tor, broad-fetch-filter-local); (4) off-by-default
+ disclosure for anything that inherently leaks. Never a silent address-revealing call.
Deniability mode = zero external calls that could deanonymise.

## 9. Residual risk (honest)
- Enabled opt-in features still leak to their server when on — disclosed, not hidden.
- Metadata (IP/timing) leaks without proxy/Tor.
- Mobile: a compromised OS/device defeats app-layer defenses (true of all mobile wallets).
- Memory-wipe guarantees in JS/managed runtimes are hard — an audit line-item.
- NONE of this is audited; all ratings are pre-audit estimates.

## 10. Build gates
1. Independent security audit reviews this architecture BEFORE backend / seed-touching build.
2. Crypto constructions (KDF/AEAD/params) chosen and reviewed before coding.
3. Per-asset send verification before multi-asset goes live; mainnet gated on audit.
4. Legal entity (gates billing + iOS + inheritance feature).
This document is the brief for that audit, not a substitute for it.

## Related
- docs/Backend-security-architecture.md · docs/Data-source-privacy-posture.md ·
  seed-backup + cloud-recovery spec · docs/Feature-Status.md · positioning-scope-design spec ·
  companion PDF: Veyrnox-Technical-Security-Architecture.pdf
