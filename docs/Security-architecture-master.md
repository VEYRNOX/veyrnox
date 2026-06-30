# Veyrnox — Security Architecture (Master)

**Date:** 2026-06-05 · **Status:** DESIGN reference — provisional, PRE-AUDIT.
**Baseline:** OWASP MASVS / MASTG · **Standards:** BIP-32/39/44, NIST SP 800-57, FIDO2/WebAuthn.
**Stack:** Vite + React 18 + Capacitor; ethers v6; @noble / @scure.
**Supersedes/consolidates:** the Technical & Security HLD and the detailed Mobile Security Design
into one authoritative reference.

> ⚠️ DESIGN + IMPLEMENTATION-GUIDANCE DOCUMENT — NOT A SECURITY CERTIFICATION. It describes the
> intended architecture and is the brief for the independent security audit (a tracked launch
> blocker). No security property here is verified. Code snippets are ANNOTATED REFERENCE PATTERNS,
> not drop-in production code. Crypto parameters for seed-touching paths (KDF cost, cipher mode,
> nonce scheme) are deliberately left as AUDIT DECISIONS. Build of any backend / seed-touching
> component is GATED on the audit. "Built" means present in code (testnet, provisional), NOT
> production-certified. Do not market anything herein as "secure"/"audited" until the audit
> completes. "WEDGE NOTE" marks deliberate Veyrnox-specific divergence from generic wallet patterns.
>
> Diagrams (trust zones, webview split, defense-in-depth stack, KEK model, duress flow, signing
> lifecycle) are rendered in the companion PDF (Veyrnox-Security-Architecture-Master.pdf). This
> markdown is the textual master; bracketed [DIAGRAM: ...] markers indicate where each sits.

---

# PART A — SYSTEM ARCHITECTURE

## 1. Product summary
Veyrnox is a self-custody crypto wallet (web + mobile via Capacitor) positioned as a
coercion-resistant wallet for high-risk holders facing physical and digital targeting. Core
principle: the seed phrase is the identity — no hosted account, no server custody, no default
address leakage. The differentiator (the "wedge") is the deniability stack; the backend, where
present, is thin and untrusted by design.
- Constraints: testnet/devnet only; mainnet gated on audit; security PROVISIONAL pending audit;
  warns-not-blocks; never claims "safe"/"audited".

## 2. Three trust zones
1. On-device (trusted). Keys, seed, signing, sensitive computation. Never leaves.
2. User-owned infrastructure (user-trusted, not Veyrnox). The user's own RPC endpoint and
   personal cloud. Veyrnox never sees these.
3. Thin backend (untrusted by design). Stateless glue; handles only ciphertext or non-sensitive
   data. Architected as if breached.
[DIAGRAM: trust zones]

## 3. Security invariants (canonical — apply system-wide)
- I1 — Keys never leave the device. Seed/keys/signing on-device only. Total backend compromise
  loses ZERO funds.
- I2 — No silent data egress. Nothing leaves without explicit, per-feature, informed opt-in.
  Egress allowlist + user-inspectable log.
- I3 — Deniability mode is sacred. Duress/decoy/hidden sessions make ZERO backend calls; egress
  is structurally hard-disabled.
- I4 — Fail honest, fail closed. If a feature can't be delivered without violating the above,
  honest-disable it — never fake or silently degrade.
- I5 — Backend untrusted by design. Architect as if the backend (and any provider behind it) is
  honest-but-curious at best, breached at worst. Minimise what it is given.

## 4. Thin backend architecture (untrusted)
Does the LEAST possible. Recommended at scale: Cloudflare Workers (stateless functions, push) +
R2/D1 (opaque blobs, zero egress); Supabase (managed or self-hosted) is the alternative.
Self-hosting maximises I5.
- Does: stateless orchestration; tokenised/address-decoupled push; storage of CLIENT-ENCRYPTED
  blobs only; non-sensitive feature glue.
- Never does: hold keys/seeds (I1); see raw address↔identity↔balance; persist an address↔account
  map; sign; act as a data lake.
- Controls: TLS 1.3; cert pinning on Veyrnox-owned endpoints; signed-challenge auth; device-bound
  tokens; HSM/KMS for server secrets; rate limiting; replay protection; audit logs; zero-trust S2S.
- Cheap AND safe — the same decision: no per-user wallet data on the server → low load/egress
  (small bill at millions of users) AND a breach exposes no keys and no targeting list. The
  expensive, dangerous data never reaches the centre.
- WEDGE NOTES: risk/anomaly detection runs ON-DEVICE, not as backend services; cert pinning does
  NOT apply to user-chosen RPC endpoints — that path trades pinning for user-controlled privacy.

## 5. User-owned infrastructure
- User-controlled RPC. Chain reads default to an endpoint the user picks; removes the backend from
  the chain-read path; the address is revealed only to the party the user chose.
- Personal cloud (self-recovery). The user may store the encrypted backup artifact in their OWN
  iCloud/Drive/OneDrive. Veyrnox holds nothing; the cloud holds ciphertext. Manual (no cloud-API),
  portable (not app-locked), passphrase is the whole defence.

## 6. Technical feature set (verified build state)
"Built" = present in code (testnet, provisional). "Planned" = designed/roadmap. Unverified
classifier estimates are NOT promoted to "built".
- Built — wallet core: multi-account HD wallets, seed import, written seed backup, ETH/Sepolia
  send, receive, multi-chain balance display, gas-fee control, tx history, encrypted vault,
  biometric/passkey unlock, auto-lock.
- Built — security stack (provisional): tx simulation, anomaly detection, security dashboard,
  spending limits/policies, approval revoke, calldata decode, address validation, address-poisoning/
  spam warnings, suspicious-address + OFAC screening (local), audit log, stealth/hidden wallets.
- Built — deniability stack (the wedge; provisional): duress PIN, decoy balances, panic wipe,
  constant-time KDF handling.
- Built — honest-disabled: AI assistant/advisor/rebalancer (until rebuilt on-device/stripped);
  hardware-wallet page (honest "planned").
- Planned — designed, gated: encrypted seed backup + cloud self-recovery (audit-gated); full
  multi-asset send (per-asset verification; 1 of 10);
  real fraud-detection wiring to the on-device anomaly engine.
- Planned — salvageable shells: on-device/safe — net worth, P&L, spending patterns, snapshots,
  watchlist, price/smart alerts, fee analytics, tax report, invoice generator. External-data
  (opt-in + disclosed, or honest-disabled) — analytics-by-address, NFT/token enrichment & discovery,
  ERC-20 discovery.
- Cut — on principle: leaderboard, public profiles; shared portfolio → signed local export only;
  referral tracker → only if fully serverless; hosted-account/login pages (no account in self-custody).

---

# PART B — MOBILE IMPLEMENTATION ARCHITECTURE

## 7. Implementation reality: this is a webview wallet
Veyrnox runs as JavaScript in a Capacitor WebView, not native Swift/Kotlin — the single most
important fact for the design, because it sets where the trust boundary actually sits:
- The sensitive crypto (seed derivation, signing) runs in JS (@noble/@scure, ethers) inside the
  WebView VM. The hardware keystore can't run JS, so it does NOT hold the seed; it holds a
  key-encryption key (KEK) that unwraps the at-rest vault.
- Native capability is reached over the Capacitor bridge via three plugins:
  @aparajita/capacitor-secure-storage, @aparajita/capacitor-biometric-auth, @capacitor/app.
- Therefore the real attack surface includes the JS↔native bridge and the GC'd JS heap — a native
  wallet keeps the seed in C memory it controls; we decrypt into a JS Uint8Array in a garbage-
  collected heap (see §11). An honest design states this rather than hiding it.
[DIAGRAM: webview split]

## 8. Mobile defense-in-depth stack
Top (network) to base (hardware); each layer assumes the one below can fail.
- Network boundary (honest): egress allowlist, user-inspectable egress log, TLS 1.3.
- Deniability layer: duress PIN, decoy balances, panic wipe, hidden wallets; hard-cuts ALL egress
  in duress/decoy/hidden mode (I3).
- Policy & risk engine (ON-DEVICE): velocity/amount limits, device-integrity score, step-up auth.
- Transaction review: human-readable intent, address validation, fee/chain/dApp preview, simulation.
- Wallet core / signing (sensitive boundary): HD derivation, tx construction, signing; no key
  logging/export; CSPRNG enforced (no Math.random; CI guard).
- Secure storage: Keychain + Secure Enclave (iOS); Keystore/StrongBox (Android); local AEAD vault.
- Device + OS (platform, untrusted-by-app): hardware keystore, OS sandbox, app isolation. A rooted/
  compromised OS defeats layers above — true of every mobile wallet, stated honestly.
[DIAGRAM: defense stack]

## 9. Key management — derivation & protection
Derivation: BIP-39 mnemonic (128/256-bit entropy from crypto.getRandomValues, never Math.random —
CI-enforced), optional BIP-39 passphrase; BIP-32 HD tree, BIP-44 paths (m/44'/60'/0'/0/i EVM);
secp256k1 via @noble/curves; no key logging/export.

REFERENCE PATTERN (not production code; illustrates the boundary, not the crypto params):
  generateMnemonic(wordlist, 256)            // CSPRNG only (check:rng guard)
  mnemonicToSeedSync(mnemonic, passphrase)   // BIP-39 (+optional passphrase)
  HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0")  // BIP-44 EVM
  // seed / mnemonic / privateKey are SENSITIVE — see §11 memory hygiene.

Protection (KEK pattern — hardware can't hold a JS wallet's seed):
  mnemonic/seed → AEAD-encrypt with vault key → vault ciphertext (at rest)
  vault key → wrapped by KEK; KEK generated/held in hardware, released only after biometric/PIN
- iOS: KEK as Secure Enclave key (kSecAttrTokenIDSecureEnclave), SecAccessControlCreateWithFlags
  (.privateKeyUsage | .biometryCurrentSet); Keychain items kSecAttrAccessibleWhenUnlockedThisDeviceOnly.
- Android: KeyGenParameterSpec with setIsStrongBoxBacked(true) (TEE fallback),
  setUserAuthenticationRequired(true), setInvalidatedByBiometricEnrollment(true); key attestation.
- Capacitor: reached via capacitor-secure-storage + capacitor-biometric-auth; the JS side never sees
  the KEK, only the unwrapped vault after the native auth gate passes.
- WEDGE NOTE — no backend/third-party key share. I1 forbids key material off-device. MPC/multisig
  only across the user's own devices; a backend/HSM share is prohibited (compellable party).
- Lifecycle per NIST SP 800-57: generation (CSPRNG), protection (hardware KEK), use (transient),
  rotation (re-wrap on credential change), destruction (panic wipe).
[DIAGRAM: KEK model]

## 10. Vault encryption (at-rest — parameters audit-gated)
The seed is sealed with an authenticated (AEAD) construction; the vault key is derived from the user
passphrase via a memory-hard KDF.
- REQUIREMENTS (specified): authenticated (tamper ⇒ fail, never wrong-seed); per-vault CSPRNG salt +
  nonce; versioned self-describing container; round-trip verified at creation (decrypt+derive+compare
  before reporting "success" — the direct lesson from the removed fake seed-QR).
- DECISIONS (audit-gated, NOT fixed here): the specific AEAD and the KDF + cost parameters. Writing
  concrete numbers would create false authority on the one thing that must be audited.

## 11. Secure storage & memory hygiene
- Store (encrypted vault): ciphertext, metadata, labels, chain config, public addresses, tx cache.
  Never: plaintext seed/keys, un-hardware-bound tokens, seed screenshots, secrets in logs/clipboard/
  unencrypted OS backups. Exclude vault from cloud backup (allowBackup=false, iOS isExcludedFromBackup).
- WEDGE NOTE — storage indistinguishability: hidden/decoy vault material is stored so its existence
  cannot be inferred (uniform container shape, no hidden-wallet-count key, decoy and real structurally
  identical). A forensic dump must not reveal a hidden wallet exists.
- Memory hygiene (the honest hard part of a JS wallet): keep plaintext seed/keys as Uint8Array (not
  String — immutable, lingers in heap); zero immediately after use (buf.fill(0)); never store the
  decrypted seed in React state/context. Honest limit (audit line-item): JS/WebView GC may copy buffers;
  fill(0) reduces but cannot guarantee eradication — a genuine webview-vs-native weakness we do not overstate.

## 12. Authentication
- Unlock: biometric (BiometricPrompt / LAContext.evaluatePolicy) or PIN; short session TTL; re-auth on
  @capacitor/app resume after background.
- Signing: explicit confirmation + biometric/PIN bound to KEK use (CryptoObject on Android,
  SecAccessControl on iOS) so auth and key-use are cryptographically linked, not just a UI gate.
- WEDGE NOTE — duress auth: a duress credential authenticates into the DECOY and silently engages
  deniability mode (egress cut, no telemetry). Auth success must be timing- and response-indistinguishable
  between real and decoy (no oracle). No server-side risk review in the auth path.
- Principle: biometrics gate access to a hardware key; they are not the cryptographic owner.
[DIAGRAM: duress flow]

## 13. Transaction security
Before signing, decode & display: intent, recipient, chain ID, asset+amount, fee, contract method
(4-byte selector → name), token approvals incl. unlimited-approval flag, dApp origin; simulate where
possible. Flag: unlimited/unknown-spender approvals, unverified contract, chain-ID mismatch,
address-poisoning (visual diff), fresh recipient, phishing domain, transfer-all, suspicious token/NFT.
Signing boundary: core signs only after (1) tx constructed, (2) human-readable summary shown, (3) user
authenticates, (4) on-device policy engine permits.
WEDGE NOTE: decode/simulation/risk run on-device or via the user's RPC — never a Veyrnox-server simulator
that would see address+intent. Chain-ID validation mandatory (replay defense).

## 14. Panic wipe & deniability mechanics
- Panic wipe: zeroizes vault ciphertext + the hardware KEK (deleting the Keystore/Keychain entry renders
  all vault copies — including any cloud artifact — permanently undecryptable). Idempotent, irreversible,
  no network call (works offline / under duress).
- Deniability mode (duress credential or explicit toggle): hard-disables ALL backend egress at the
  network-boundary layer (structural gate, not per-call), suppresses notifications/telemetry, surfaces
  only the decoy.
- WEDGE NOTE: no log, metric, crash field, or persisted flag may record deniability state, the decoy/real
  distinction, or hidden-wallet counts — that metadata is itself a leak.

## 15. Device integrity & runtime protection
- Android: Play Integrity, hardware key attestation, root/debugger/emulator detection, overlay &
  accessibility-abuse detection, repackaging detection. iOS: jailbreak/debugger/hook detection,
  app-integrity, Secure-Enclave availability, Keychain access-group validation.
- Runtime: obfuscation, anti-tamper/anti-hook, risk scoring; disable signing on high-risk devices;
  redact app-switcher snapshot (FLAG_SECURE Android; obscure-view iOS); block screen capture on sensitive
  screens; clear clipboard fast after address/seed ops (prefer never clipboarding a seed).
- WEDGE NOTES: integrity scoring is on-device and must not phone home deanonymisingly; sensitive screens
  include duress/decoy and seed screens; verify FLAG_SECURE/capture-blocking actually apply to the WebView
  (a common hybrid-app gap — MASTG test target).

## 16. Network security
TLS 1.3 + HSTS; SPKI cert pinning on Veyrnox endpoints (backup pins + rotation); signed requests +
nonce/timestamp replay protection. Blockchain RPC: prefer user-controlled RPC; validate chain ID, nonce,
token contract; validate simulation output; cross-check high-value tx across providers where the user
permits; never trust a single RPC response blindly.
WEDGE NOTE: user-RPC removes Veyrnox from the address-leak path but forgoes pinning on that leg —
conscious privacy-over-pinning tradeoff.

## 17. App hardening & build security
Controlled/reproducible builds; CI/CD signing-key protection; separate dev/staging/prod signing;
dependency scanning + SCA + SBOM; SAST/DAST; secret scanning. Release: store signing controls,
code-signing key protection, release approval, tamper detection, forced upgrade for critical vulns.
Logging — never: seeds, keys, PINs, tokens, sensitive signed messages, address↔PII, recovery data, and
(WEDGE) anything revealing deniability state or hidden-wallet existence. The check:rng CI guard is the
model for additional guards: a "no keystore import from backend-client" guard and an egress-allowlist guard.

---

# PART C — CROSS-CUTTING

## 18. Recovery (deliberately narrow — WEDGE)
No server-mediated, social-graph, or support recovery (for the coercion persona, "notify trusted contacts"
is a threat, not a safeguard). Supported: encrypted backup artifact (AEAD-sealed on-device, passphrase-
derived key, authenticated, versioned, round-trip-verified); user-stored incl. own cloud (manual, portable/
standard not app-locked, ciphertext only, passphrase is the whole defence, assume file exfiltrated);
hidden/decoy wallets excluded from any cloud path. Safeguards: strong re-auth, block screenshots on seed
screens, typed-verification quiz, honest "lose passphrase ⇒ funds gone". Explicitly NOT used: Shamir/
social-via-server, MPC backend-share, support-agent recovery.

## 19. Signing key lifecycle (end-to-end)
[DIAGRAM: signing lifecycle]
Create → CSPRNG entropy → BIP-39 mnemonic → BIP-32/44 derive in core → AEAD-seal seed with vault key →
wrap vault key with hardware KEK → backup verification → optional device PUBLIC key to backend.
Unlock → on-device integrity check → biometric/PIN → native releases KEK → unwrap vault → decrypt into JS
heap (transient) → short session. Duress → decoy + deniability mode.
Sign → build tx locally → risk/simulation (on-device/user-RPC) → decode+display → re-auth (CryptoObject-
bound) → core signs (seed in Uint8Array, wiped after) → broadcast via user RPC → log locally (never
sensitive fields). Seed never crosses the bridge; only the signature does (I1).

## 20. Threat model (canonical)
| Threat | Control |
|---|---|
| Private-key extraction | Hardware KEK (Enclave/StrongBox), AEAD vault, no export/logging, Uint8Array+wipe |
| Malware on device | On-device tx preview + policy engine, biometric-bound signing, runtime protection, signing-disable on high risk |
| Root/jailbreak | On-device integrity scoring + key attestation; restrict signing |
| Phishing dApp | On-device/user-RPC simulation, 4-byte decode, approval warnings |
| Address poisoning | Address book, visual diff, fresh-recipient flag |
| Backend compromise | No keys, no linkage stored (I1/I5); HSM/KMS; least privilege |
| MITM | TLS 1.3, SPKI pinning (Veyrnox endpoints), signed requests |
| Clipboard theft | Avoid clipboard for secrets; auto-clear; warnings |
| Malicious update | Signed releases, pipeline security, tamper detection |
| JS-heap seed residue | Uint8Array + immediate wipe; minimized lifetime (residual — audit item) |
| Bridge interception | Never pass plaintext seed over the bridge; native gate releases unwrapped vault post-auth |
| Lost/stolen device | Device-bound vault, biometric/PIN, panic wipe |
| Social-engineering "support" | No support-based recovery; passphrase-only by design |
| Physical coercion ($5-wrench) | Duress PIN → decoy; panic wipe; deniability egress cut; no hidden-wallet telemetry (WEDGE) |
| Compelled device/cloud unlock | Hidden wallets excluded from cloud; decoy plausibility; ciphertext backup, passphrase duress-refusable (WEDGE) |

## 21. Data-source privacy posture
Default to the most private tier a feature can use: (1) on-device compute; (2) user-controlled RPC;
(3) privacy-preserving patterns (proxy/Tor, broad-fetch-filter-local); (4) off-by-default + disclosure for
anything that inherently leaks. Never a silent address-revealing call. Deniability mode = zero external
calls that could deanonymise.

## 22. MASVS/MASTG verification plan (test, don't assert)
Map controls to MASVS categories — STORAGE (vault encryption, no plaintext at rest, backup exclusion),
CRYPTO (CSPRNG, KDF/AEAD via audit, key lifecycle), AUTH (biometric-bound key use, session, re-auth),
NETWORK (TLS, pinning, RPC validation), PLATFORM (bridge handling, clipboard, screenshot/FLAG_SECURE,
deep-link safety), RESILIENCE (root/jailbreak, anti-tamper/hook, integrity, MITM). Each is a MASTG test
executed on a rooted test device, not a checkbox. WEDGE additions: verify deniability egress cutoff, decoy
indistinguishability, no-telemetry-of-hidden-state, panic-wipe irreversibility.

## 23. Residual risk (honest)
A compromised OS/device defeats app-layer controls (universal). JS/WebView memory hygiene is imperfect vs
native — explicit audit item. Cert pinning doesn't cover user-chosen RPC. Enabled opt-in features leak to
their provider. Seed-crypto parameters unset pending audit. None of this is audited; all ratings pre-audit.

## 24. Build gates
1. Independent audit reviews this architecture BEFORE backend / seed-touching build.
2. Crypto constructions (KDF/AEAD/params) chosen + reviewed before coding.
3. Per-asset send verification before multi-asset live; mainnet gated on audit.
4. Legal entity gates billing + iOS.
This document is the brief for that audit and the MASVS test plan, not a substitute for the audit.

## Related
- docs/Backend-security-architecture.md · seed-backup + cloud-recovery spec ·
  docs/Data-source-privacy-posture.md · docs/Feature-Status.md · positioning-scope-design spec ·
  companion PDF: Veyrnox-Security-Architecture-Master.pdf
