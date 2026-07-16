# Building a full RASP capability for Veyrnox — analysis + native-signing spike

**Status:** ANALYSIS / architecture spike · not a commitment, not a build record
**Owner:** —
**Date:** 2026-07-13
**Related:** `docs/rasp-vs-commercial-shielding.md` (the capability gap list vs Promon), `docs/rasp-validation-roadmap.md` (the validate-what-exists axis), `src/rasp/`, `src/plugins/veyrnoxEnclave.js`, `src/wallet-core/*/send.js`, invariants I1–I5.

> This doc is the deeper companion to the gap analysis. The gap doc *lists* the missing
> categories; this doc analyses **what building a full RASP capability actually entails in
> this stack**, and writes up the one item worth building in its own right — **native
> signing enforcement** — as an architecture spike. Nothing here is BUILT or verified; it is
> a design artifact for an owner decision.

---

## Part A — Analysis: what "full RASP" means for a Capacitor wallet

### A1. The fact that dominates everything: enforcement lives in the WebView

Veyrnox is a Capacitor app. The **entire security-critical decision path runs as JavaScript
in a WebView**:

- `detect(probeSource) → degrade() → presignGate() → compose.js` — all JS (`src/rasp/`).
- Signing itself runs in JS (ethers v6): `src/wallet-core/evm/send.js:32` does
  `new Wallet(privateKey, provider)` — **the private key is held as a JS string** in the
  WebView heap (the internal audit's M-1 / issue #746: architecturally unzeroable under
  ethers v6).

The native `RaspIntegrityPlugin` (Kotlin/ObjC) only *supplies signals*. It does **not**
enforce anything. The sign/refuse decision is a JavaScript `if`.

**Consequence.** An attacker who hooks the WebView JS — remote-debugging a debuggable build,
patching the shipped bundle, or injecting a script that overrides `detect`/`presignGate` —
**bypasses 100% of RASP**, no matter how good the native probes are. They don't defeat the
probe; they defeat the JS branch that reads it. This is the ceiling on every RASP investment
until enforcement moves out of the WebView.

**Reframing:** "full RASP" for Veyrnox is *not primarily* a better-probes project. It is an
**enforcement-layer** project — move the sign decision (and ideally the key) into native code
co-located with the signing operation. Everything else is secondary.

### A2. Capability decomposition and each item's ceiling in this stack

| Capability | "Full" means | Feasibility in Capacitor | Effort |
|---|---|---|---|
| **Native enforcement of the gate** | sign/refuse decided in native, JS can request but native holds veto | **The critical one** — see Part B | XL |
| Anti-tamper / integrity | binary + **JS-bundle** integrity self-check, refuse if modified | native shell easy; JS bundle must be hashed & verified *by native* at load | L |
| Anti-debug / anti-hook | prevent (not just notice) debugger/Frida; kill on detect | native partial; **WebView remote-debug hard-off in release** is one critical line | M |
| Environment detection | hardened, evasion-resistant root/jailbreak/emulator | already BUILT-weak; Magisk-Hide beats Java-layer checks; needs native `stat`/mount-ns + realistically **attestation** to win | M |
| Code obfuscation / anti-analysis | raise RE cost on native shell **and JS bundle** | R8/ProGuard easy; **JS obfuscation is the big absent category**, always defeatable | M–L |
| Runtime memory protection | keys not extractable from a heap dump | **capped** — key is a JS string in the WebView heap; only fixable by native signing (row 1) | XL (=row 1) |
| Remote attestation | Play Integrity / App Attest device verdict | feasible, already scoped (Phase 2b); **highest-leverage single addition** | M |
| Reactive response | wipe/lock on hostile detection | easy; constrained by I2 (no egress) + I3 (deniability) | S |
| Protecting the protection | RASP can't be trivially unhooked | in JS: effectively impossible; in native: partial | — |

Every row that matters is capped by the WebView until keys/signing move native. Rows 1 and 6
are the same problem. Obfuscation (the headline gap) is a cost-raiser, not a fix.

### A3. Build vs. buy

In-house "full RASP" is a specialist, never-finished arms race — the wrong build for a small
team. The realistic split:

- **Buy the shielding layer.** For *this stack*: **Talsec freeRASP/DeviceGuard** targets
  Capacitor/Cordova/RN/Flutter directly (lowest-friction); **Guardsquare (DexGuard/iXGuard)**,
  **Appdome** (no-code binary wrap), or **Promon SHIELD** are heavier options. These give
  obfuscation + anti-tamper + anti-debug + repackaging detection + hardened root/hook checks
  on the native shell with little source change.
- **Keep in-house the two things a vendor can't supply:** (1) the deniability-safe,
  fail-closed **gate policy** (`degrade.js`/`compose.js`) — no vendor understands I3/duress;
  (2) **native signing enforcement** (Part B) — Veyrnox-specific wallet architecture.
- **Build attestation regardless** — cheap relative to impact, already scoped.

Hard limit even with a bought shield: it hardens the container but **the key-in-JS-string
problem persists** unless signing moves native.

### A4. Sequenced build-out (leverage-ordered)

1. **Release-build hygiene (days, huge ROI).** Disable WebView debugging in release
   (`setWebContentsDebuggingEnabled(false)` / non-inspectable `WKWebView`), enforce
   `RELEASE_CERT_SHA256`, `FLAG_SECURE` on seed-reveal/PIN screens, R8/ProGuard full mode.
2. **Remote attestation (weeks).** Land the parked Phase 2b — the real answer to
   root/re-sign evasion.
3. **Buy + integrate a shield (weeks).** Obfuscation + anti-tamper + anti-debug on the
   native + WebView container.
4. **Native-verified JS-bundle integrity (weeks).** Native computes/verifies the bundle
   hash before handing control to the WebView.
5. **Native signing enforcement (months) — Part B.** The one item that turns RASP from
   advisory into enforcing *and* closes the key-in-JS-heap class.
6. **Evasion-hardening + hostile-device testing** (ongoing; Mac + rooted/Frida devices),
   then **independent audit** (gates any "validated" claim).

Steps 1–2 capture most of the honest value cheaply. Step 5 is where "full RASP" actually
lives.

### A5. The strategic question — is full RASP even the right investment?

An honest analysis questions the premise:
- Veyrnox's moat is **coercion-resistance + deniability + hardware-bound keys**, none of
  which RASP provides. Keys are already protected by SE/StrongBox/WebAuthn, not by RASP.
- RASP's honest job is a **fail-closed pre-sign tripwire** — steps 1–2 give most of that
  value for a fraction of steps 3–5's cost.
- The **outstanding independent audit** is a bigger credibility gate than any RASP feature.

**Recommendation:** do not chase Promon-parity in-house. Do steps 1–2 now; *buy* the
shielding layer if the threat model demands anti-RE; treat **native signing enforcement
(Part B) as the one genuinely worth-building item**, because it is the only thing that makes
RASP real while also fixing the key-in-JS-heap weakness.

---

## Part B — Architecture spike: native signing enforcement

**Goal.** Move the transaction-signing operation — and the RASP/biometric gate that guards
it — out of the WebView JS and into the native process, so that (a) the sign/refuse decision
is enforced where an injected script or WebView debugger cannot reach it, and (b) the signing
key is never materialised as a JavaScript string in the WebView heap.

### B1. Problem statement (precisely)

Today, for an EVM send (`src/wallet-core/evm/send.js`):
1. JS unlocks the vault → derives the private key → holds it as a JS string.
2. JS runs `selectPresignProbeSource → detect → degrade → presignGate` and decides to sign.
3. JS calls `new Wallet(privateKey, provider).signTransaction(tx)`.

Two structural weaknesses, both in the WebView:
- **W1 — enforcement is JS.** Steps 2–3 are hookable; the gate is bypassable independent of
  probe quality (A1).
- **W2 — key is in the JS heap.** The key exists as a string in WebView memory (M-1), so a
  heap dump / injected script / debugger can lift it. RASP cannot mitigate this from JS.

Native signing addresses both: the gate check and the signing both happen in native, and the
decrypted key lives only in native process memory for the signing call.

### B2. Honesty boundary — what "native signing" is and is NOT

This must be stated up front or the feature will be overclaimed:

- It is **native-process signing**, NOT hardware/Enclave signing of the transaction. Secure
  Enclave and StrongBox do **P-256 / AES / HMAC**, not **secp256k1** (EVM/BTC) or **ed25519**
  (SOL) transaction signing. The chain keys cannot live *inside* the Enclave.
- What the Enclave/StrongBox *can* do — and what the existing M2c path
  (`src/plugins/veyrnoxEnclave.js`, `ios/App/CapApp-SPM/Sources/CapApp-SPM/EnclaveKeyService.swift`,
  gated OFF via `M2C_ENABLED=false`) already scaffolds — is **wrap the vault key** (hardware
  KEK) and **gate access with biometrics**. Native signing builds on that: the seed/DEK is
  unwrapped in native under the hardware KEK + biometric, the chain key is derived and used to
  sign **in native memory**, and it is zeroed after.
- Therefore the honest claim is: *"the signing key never enters the WebView JS heap, and the
  sign decision is enforced in native"* — NOT *"the key never exists in extractable form"* (a
  privileged native attacker on a compromised device can still reach native memory; that is
  the residual the shield + attestation + biometric gate are for).

### B3. Existing seams to build on

- **`VeyrnoxEnclavePlugin` (iOS Swift, present but OFF).** `EnclaveKeyService.swift` +
  `veyrnoxEnclave.js` already implement a Secure-Enclave key-wrap plugin, fail-closed and
  triple-gated (`M2C_ENABLED` / `M2C_HARDWARE_WRAP_ENABLED` / Swift `m2cEnabled`, all false).
  This is the natural host for a native signer on iOS.
- **`HardwareKekPlugin` (iOS ObjC + Android Kotlin).** Hardware KEK = HKDF(H‖C) unlock is
  device-verified (INTERNAL). The native signer consumes the same unwrapped-secret path.
- **`RaspIntegrityPlugin` (both platforms).** Supplies the verdict the native gate must check
  *before* releasing a signature — the enforcement point that closes W1.
- **The send path (`src/wallet-core/{evm,btc,sol}/send.js`, `hw-send.js`).** The JS signer is
  the call site to replace with a native-signer bridge call; `hw-send.js` (Ledger/Trezor)
  already models "JS builds the tx, an external signer returns the signature" — the native
  signer follows the same shape.

### B4. Proposed data flow

```
JS (WebView)                          Native (Kotlin / Swift)
────────────                          ───────────────────────
build unsigned tx  ───────────────▶   NativeSigner.signTransaction({
                                        chain, unsignedTx, vaultRef })
                                          │
                                          ├─ 1. checkIntegrity()  (RASP verdict, IN NATIVE)
                                          │      hostile → reject SIGN_BLOCKED_RASP  (closes W1)
                                          │
                                          ├─ 2. biometric prompt (LAContext / BiometricPrompt)
                                          │      + hardware-KEK unwrap of DEK  (SE/StrongBox)
                                          │      cancel/fail → reject fail-closed
                                          │
                                          ├─ 3. derive chain key IN NATIVE, sign
                                          │      (secp256k1 / ed25519 native lib)
                                          │
                                          └─ 4. zero key material, return { signature }
◀─────────────────  { signature }  ──────┘
broadcast signed tx
```

Key never crosses the bridge; only the **unsigned tx in** and the **signature out** do.

### B5. Threat model — what it closes, what it does not

**Closes / strongly mitigates:**
- W1 — injected-script / WebView-debugger gate bypass: the verdict is checked in native
  after the JS call, so hooking the JS gate no longer authorises a signature.
- W2 — key lifted from the WebView JS heap: the key is never a JS string.
- Silent-sign malware in the WebView: every sign now forces a native biometric prompt the
  attacker cannot satisfy.

**Does NOT close (be explicit):**
- A privileged attacker on a **fully compromised native OS** (root + defeated attestation +
  defeated shield) can still reach native process memory during the signing window. Native
  signing raises the bar from "hook a JS `if`" to "defeat native RASP + attestation + shield
  + biometric + win a memory race" — a categorical increase, not invulnerability.
- It is not MPC / threshold signing (out of scope by design; the wallet is BIP-39 seed-based).

### B6. Scope of work

1. **Native secp256k1 + ed25519 signer** in Kotlin and Swift (vetted libs; deterministic
   ECDSA / RFC 6979; must match existing chain test vectors exactly).
2. **`NativeSigner` Capacitor plugin** — `signTransaction({chain, unsignedTx, vaultRef})`,
   RASP-verdict-gated + biometric-gated + hardware-KEK-unwrap, fail-closed on every branch.
3. **Send-path integration** — replace the `new Wallet(pk)` call sites with the native-signer
   bridge on native platforms; keep the JS signer on **web only** (web is testing-only). Route
   through the `hw-send.js`-style "external signer returns signature" shape.
4. **Deniability (I3).** The native signer must be **set-blind**: identical trigger, timing,
   and prompt for real vs decoy/hidden — no wallet-set argument that could become an oracle.
   The decoy set signs through the same native path (it is a real, if low-value, key).
5. **Parity + migration.** Every chain's native signature must byte-match the current JS
   signer against the existing spec vectors before cutover; feature-flagged, fail-closed to
   "cannot sign" (never silently back to the JS signer) on native.
6. **Zeroization.** Key material zeroed in native (`resetBytesInRange` / explicit clear) on
   all paths; document the residual base64/bridge-copy limitation honestly (cf. iOS-F5 M-6).

### B7. Risks & open questions

- **secp256k1/ed25519 in Swift/Kotlin** — must be a vetted implementation; a hand-rolled
  signer is a critical-severity footgun. Prefer an audited native lib; pin and integrity-check
  it.
- **Signature parity** — any divergence from the JS signer's output is a fund-loss bug; gate
  cutover on full spec-vector + differential testing.
- **Biometric UX** — a native prompt per sign is correct for security but is friction; must
  reconcile with the existing KEK-unlock prompt cadence (recall the triple-Face-ID regression
  — avoid stacking a *second* prompt on top of the unlock prompt).
- **BTC PSBT / SOL blockhash** — native signer must handle PSBT construction and SOL
  blockhash-expiry semantics already solved in JS; re-implement or pass through carefully.
- **Web fallback honesty** — web keeps the JS signer and therefore keeps W1/W2; the surface
  must not imply web has native-signing protection (web is testing-only, but say so).
- **Does it move the needle enough to justify months of work** vs. simply doing A4 steps 1–2
  + attestation + an independent audit? This is the owner call the spike exists to inform.

### B8. Effort & honesty gate

- **Effort:** XL — multi-month; a native-crypto + native-plugin project touching the whole
  sign path on both platforms, with a hard parity/differential-testing bar.
- **Status if built:** BUILT at most, per-platform, until each chain's native signer is
  device-verified with a real on-chain testnet txid from the native path AND the construction
  passes the outstanding **independent audit**. An emulator/unit-test green is not verification
  (CLAUDE.md "verify, don't assert"). The residual native-memory exposure (B5) must remain
  disclosed even after verification — native signing is a categorical bar-raise, never
  "unbypassable."

---

## Recommendation (one line)

Do A4 steps 1–2 now (cheap, honest, high-value); *buy* the shielding layer if the threat
model demands anti-RE; and take **Part B (native signing enforcement)** to the owner as the
single worth-building item — it is the only work that makes RASP genuinely enforcing while
simultaneously closing the key-in-JS-heap weakness the internal audit already flagged (M-1).
