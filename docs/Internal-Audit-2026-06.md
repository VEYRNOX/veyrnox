# Internal Security Audit — Veyrnox (2026-06-17)

> Internal audit performed against the scope in `docs/Audit.scope.md`. Per the
> revised gate policy, the **internal audit is the hard pass that opens the mainnet
> gate** (flips `ALLOW_MAINNET`); the independent third-party audit is additional
> depth. This report is that internal audit's findings and verdict.
>
> **VERDICT: GATE STAYS CLOSED.** `ALLOW_MAINNET` must remain `false`. The review
> found 1 CRITICAL, 3 HIGH, and several MEDIUM issues that are blockers for a
> real-funds flip. Remediate (and re-review) the blockers below first.

Method: adversarial read-only review of the security-critical code, area by area
(crypto core, EVM, BTC, SOL, deniability/access, app/integration), plus
`check:rng` (pass) and `npm audit` (supply chain). No code was modified during the
audit. Nothing here is "verified" in the project sense (no on-chain txid is
involved) — these are review findings.

---

## Verdict at a glance

| Area | Verdict | Worst finding |
|---|---|---|
| Cryptographic core | ✅ clears on its own merits | LOW (JS zeroization; biometric cache OS-ACL) |
| EVM operations + screening | ⚠️ conditional | INFO foot-gun (ungated `signing.js` export) |
| Bitcoin operations | ❌ blocker | **HIGH** — uncapped fee + no fee preview |
| Solana operations | ❌ blocker | **MEDIUM** — double-send on retry |
| Deniability / access stack | ❌ blocker | **CRITICAL** — panic-wipe residue |
| App / integration layer | ❌ blocker | **HIGH** — ENS/SNS egress from deniable session |
| Native secure storage (§3) | ⛔ not assessable here | requires real devices (M2c/d unbuilt) |
| Supply chain (`npm audit`) | ⚠️ 21 vulns (8 high) | transitive `ws`/`jayson` via ethers/web3.js |

---

## Remediation status — round 1 (2026-06-17)

> First remediation pass on branch `claude/internal-audit-remediation`. Each fixed
> item landed as its own commit with a regression test where unit-testable. **The
> gate verdict is UNCHANGED: still closed** — the round-1 fixes do not clear it
> because H-2 (hardware KEK), the native §3 items, and several MEDIUMs remain open
> and require native/real-device work, UI/design, or an explicit accepted-guarantee
> decision. A re-review pass is still owed on the fixed items.

| Finding | Sev | Status | Note |
|---|---|---|---|
| C-1 panic-wipe residue | CRITICAL | ✅ FIXED | `panicWipeLocal` clears decoy-salt/auth-model/audit-pref; `inspectKeyMaterial` honest; test added |
| H-1 BTC uncapped fee | HIGH | ✅ FIXED (r1+r4) | fee-rate ceiling clamped (`clampFeeRate`, tested, r1) **and** BTC fee/plan preview now rendered in the confirm screen before signing (r4) |
| H-2 6-digit PIN sole at-rest factor (web) | HIGH | ⛔ OPEN | needs the hardware-bound KEK (native + audit); honestly documented, unbuilt |
| H-3 ENS/SNS egress from deniable session | HIGH | ✅ FIXED | resolution fails closed when `isDecoy \|\| isHidden` |
| M-1 SOL double-send on retry | MEDIUM | ✅ FIXED | `getSignatureLanding` recheck before rebuild; uncertain → no resend |
| M-2 BTC preview/risk gate not wired | MEDIUM | ✅ FIXED (r4+r7) | BTC tx preview (inputs/outputs/change/**fee** + decode-only risk flags) rendered at the verify step (r4); a **high-severity BTC flag now gates the send** behind an explicit acknowledgement (r7) — a dedicated `btcRiskBlocked` → `RISK_CONFIRM` path in the pure `evaluateSendGate` (unit-tested), enforced in both the UI and the sign-time re-check. (A purpose-built BTC gate rather than forcing BTC through the EVM-shaped `score()` engine.) |
| M-3 untrusted ENS resolver → signing target | MEDIUM | ✅ FIXED (r3) | resolved address is held pending; user must click "Use this address" before it becomes the signing target |
| M-4 verifier-KDF timing distinguisher | MEDIUM | ✅ FIXED (r2) | password-cohort total-miss now spends an equal verifier KDF before throwing; miss == hit cost. Caller-level timing harness still a follow-up. |
| M-5 password-cohort storage footprint | MEDIUM | ✅ FIXED (r2) | createWallet + importWallet now provision duress/panic chaff (best-effort, idempotent), matching the PIN cohort; blob count is config-independent. |
| M-6 stealth slot-collision overwrite | MEDIUM | ✅ FIXED (r3) | explicit "back up each hidden wallet's seed — a new one can rarely overwrite an old one" warning added to StealthWallets |
| EVM-#1 gate-bypassing signing.js | INFO (pre-mainnet) | ✅ FIXED | dead module + barrel export deleted |
| OFAC snapshot age not surfaced | LOW | ✅ FIXED (r5) | `ofacSnapshotAgeDays`/`ofacSnapshotDisclosure` (pure, tested); the sanctions warning now states "OFAC data as of <date> — N days old; a more recent sanctioning may not be reflected" |
| §3 native secure storage | — | ⛔ OPEN | not assessable here; real-device verification |
| Supply chain (21 vulns, 8 high) | — | 🟡 PARTIAL (r6) | runtime `ws` highs (ethers + rpc-websockets, the wallet's RPC layer) patched to 8.21.0 via scoped `overrides` — jayson untouched (its ws@7 was never in range). Remaining 7 highs are **dev/build tooling** (esbuild/rollup/vite/lodash/minimatch/picomatch/flatted), not shipped runtime — fixable via plain `npm audit fix`, deferred as dev-hygiene. |

**Round-1 (2026-06-17):** C-1, H-1 (partial), H-3, M-1, EVM-#1.
**Round-2 (2026-06-17):** M-4, M-5 (deniability hardening).
**Round-3 (2026-06-17):** M-3, M-6 (UI: ENS confirm + stealth backup warning).
**Round-4 (2026-06-17):** H-1 completed (BTC fee/plan preview wired) + M-2 partial (same).
**Round-5 (2026-06-17):** OFAC snapshot-age disclosure (LOW).
**Round-6 (2026-06-17):** supply chain — runtime `ws` highs patched (scoped override).
**Round-7 (2026-06-17):** M-2 completed — high-severity BTC flag now gates the send (ack).
**Running total:** 1 CRITICAL fixed, **3 of 3 HIGH fixed** (H-2 excepted — see below),
5 of 6 MEDIUM fixed (M-2 partial), the foot-gun removed.

Correction for clarity: of the THREE HIGH findings, **H-1 and H-3 are fixed**; **H-2
(6-digit PIN sole at-rest factor) remains OPEN** — it needs the hardware-bound KEK
(native + audit). Remaining overall: native/real-device (**H-2**, **§3**), the M-2 hard-gate
integration for BTC, OFAC age, and supply chain. **Gate still closed** — a mainnet flip
needs H-2 + §3 cleared (the load-bearing blockers) plus a re-review pass.

---

## Blockers (must fix + re-review before `ALLOW_MAINNET`)

### CRITICAL

**C-1 — Panic wipe leaves deniability tells in localStorage and falsely reports "clean".**
`WalletProvider.jsx:600-616` (`panicWipe`) clears the IndexedDB vault store, biometric
cache, wallet metadata, and portfolios — but does NOT clear `veyrnox-pin-decoy-salt`
(`decoyFallback.js`), `veyrnox-auth-model` (`authModel.js`), or the audit-log pref
(`auditLog.js`). The rollback path `discardIncompleteWallet()` *does* clear the salt +
auth-model, proving the omission is a bug, not design. Surviving keys reveal the
coercion-resistance stack was in use, and the decoy salt + a coerced PIN reproduces the
deterministic decoy. Worse, `inspectKeyMaterial()` reports `clean: true` without
enumerating these keys — false reassurance. **Fix:** `panicWipe` must clear all
deniability-relevant localStorage keys and `inspectKeyMaterial` must enumerate them so
`clean` is honest. (Fixable code bug, no architecture change.)

### HIGH

**H-1 (BTC) — Uncapped fee from an untrusted indexer, with no fee preview/approval on BTC sends.**
`btc/provider.js:111-122` (`getFeeRate`) clamps only a lower floor and returns the
Esplora-reported rate uncapped; the BTC branch in `SendCrypto.jsx:576-586` signs with an
auto fee-rate and **no fee UI**. A malicious/compromised indexer can dictate an
arbitrarily large fee that consumes the UTXO. The honest preview (`btc/simulate.js`
`describeBtcPlan`, `btc/send.js` `estimateBtcSend`) exists but is **not wired** into the
flow, and BTC is excluded from the pre-sign risk gate (`SendCrypto.jsx:470`). **Fix:** add
a fee ceiling in `getFeeRate`; render the BTC fee + plan and require approval; include BTC
in the pre-sign risk/limits gate.

**H-2 (Deniability) — 6-digit PIN is the sole at-rest factor on web; seized ciphertext is offline-brute-forceable.**
In the PIN cohort on web, the vault is encrypted directly under the 6-digit PIN
(`pinOnboarding.js` → `vault.js encryptVault`). Keyspace 10^6, with Argon2id (192 MiB) as
the only barrier — crackable in hours-to-days on a rig, defeating the whole deniability
stack on a seized device. **Honestly documented** (`docs/kek-architecture-spec.md`,
TARGET) and the hardware-bound KEK that fixes it is correctly audit-gated/unbuilt — so not
"fake security", but a real shipped gap. **Fix/gate:** web PIN-cohort wallets must not hold
mainnet value, and must not be presented as coercion-resistant, until the hardware KEK
ships and is audited.

**H-3 (App) — ENS/SNS resolution leaks recipient intent off-device, reachable from a deniable session.**
`SendCrypto.jsx:103-119` sends the entered name to third parties (`api.ensideas.com`,
Bonfida proxy) on field blur, before any gate, with no opt-in/disclosure, and reachable
while `isDecoy`/`isHidden` is active — an **I3 (deniability = zero backend calls)** boundary
violation and an undisclosed egress (I2). **Fix:** disclose it like the remote-screening
opt-in, and disable it when `isDecoy || isHidden`.

### MEDIUM (fix or explicitly document the reduced guarantee)

- **M-1 (SOL) — double-send on retry.** `sol/send.js:283-304`: if a tx is accepted but
  `confirmTx` then throws a blockheight-exceeded error, the loop rebuilds with a fresh
  blockhash/signature and re-broadcasts — no `getSignatureStatus` recheck, so funds can move
  twice. **Fix:** confirm the prior signature is genuinely absent before rebuilding (or use a
  durable nonce).
- **M-2 (BTC) — honest preview/risk gate not wired** (enabling condition for H-1). Wire
  `describeBtcPlan` into the confirm screen; add BTC to the pre-sign gate.
- **M-3 (App) — untrusted ENS/SNS resolver output flows to the signing target** without a
  "this name resolved to X — confirm" step (`SendCrypto.jsx:108-116`); the ENS-mismatch risk
  input can't catch a malicious resolver (self-consistent by construction). **Fix:** require
  explicit confirmation of the resolved 0x address before it can be signed.
- **M-4 (Deniability) — verifier-KDF timing distinguisher (password cohort).** A successful
  unlock runs one extra Argon2id (`captureVerifierSafe`) that a total miss skips, leaking
  "a real secret was entered" by ~one KDF of latency. **Fix:** run an equivalent dummy KDF on
  the miss path; add a timing test over {wrong, duress-hit, hidden-hit}.
- **M-5 (Deniability) — password-cohort storage footprint** reveals whether duress/panic is
  configured (chaff isn't always provisioned for that cohort, unlike PIN). **Fix:** always
  provision chaff for the password cohort too, or document the weaker guarantee.
- **M-6 (Deniability) — stealth slot-collision residual.** The SAST-M1 fix holds, but a
  different-secret hidden wallet hashing to an occupied slot still silently overwrites the
  prior one (~2.3% at 4 hidden wallets, grows quadratically). **Fix/document:** require an
  explicit per-hidden-wallet backup warning in `StealthWallets.jsx`.

---

## Areas that clear (with notes)

- **Cryptographic core — clears.** CSPRNG-only entropy (`check:rng` green), AES-256-GCM with
  fresh per-encryption salt/nonce + verified tags, only ciphertext persisted, no key material
  logged, BIP-44/SLIP-0010 derivation pinned to authoritative vectors, fail-closed errors,
  conservative Argon2id (192 MiB) with safe upgrade-only migration. Residual LOWs: JS strings
  can't be truly zeroized (inherent; native keystore is the mitigation); the biometric one-tap
  password cache needs an OS-bound biometric ACL before it's "audited-secure" (native, §3).

- **EVM operations + screening — conditional.** Mainnet gate genuine and unbypassable on the
  live paths; chainId verified at sign time; exact `parseUnits` math with on-chain decimals
  cross-check; calldata decode fails safe and flags unlimited approvals (UI enforces the ack —
  confirmed in the app-layer review); screening is local-only (no egress), advisory, never
  claims "safe", with well-provenanced OFAC data. **Two pre-mainnet items:** (a) the ungated
  `signing.js` `sendNativeTransfer`/`makeSigner` export is a dead but gate-bypassing foot-gun —
  delete it or route it through `getNetwork()` and drop it from the public barrel; (b) surface
  OFAC snapshot age at runtime.

---

## Not assessable in this environment

- **Native secure storage (§3).** iOS Secure Enclave/Keychain + Android Keystore/StrongBox,
  OS-enforced biometric ACL (M2c/M2d), and "keys never in webview/IndexedDB on native" require
  **real devices** and are explicitly unbuilt/PROVISIONAL. These remain real-device verification
  items and are a hard dependency for any mobile mainnet scope.

## Supply chain (`npm audit`)

21 vulnerabilities (1 low, 12 moderate, 8 high), predominantly **transitive**: `ws`
(uninitialized-memory disclosure / DoS) via `ethers`, and `jayson` via `@solana/web3.js`.
These sit in the RPC/network layer, not the key/signing path, but should be triaged and
patched (or the deps pinned/upgraded) before mainnet. `check:rng` passes.

---

## What must be true to flip `ALLOW_MAINNET`

1. Remediate **C-1, H-1, H-2, H-3** and the **MEDIUM** items (or document an accepted,
   honestly-disclosed reduced guarantee for the ones that are inherent).
2. Re-review pass confirming the fixes don't regress.
3. Native secure-storage (§3) verified on real devices if mobile is in the mainnet scope.
4. Supply-chain highs triaged.
5. Per `docs/Audit.scope.md`: the independent third-party audit is additional depth, not the
   gate — but the gate is THIS internal audit, and it does not clear today.

Until then: **testnet only, `ALLOW_MAINNET = false`.**

---

## Remediation ordering — NATIVE work parked to LAST (decision 2026-06-17)

By decision, all **NATIVE** audit/verification work is sequenced **LAST** in the
remediation order — it is the final gate to clear, after everything web/JS-fixable
is done (and that web/JS scope is now complete; see the round 1–6 status above).

Parked-to-last (native — require Swift/Kotlin + **real iOS/Android devices** + audit;
not buildable or honestly verifiable in this JS/web environment):
- **H-2** — hardware-bound KEK (so a 6-digit PIN is not the sole at-rest factor).
- **§3** — native secure storage: iOS Secure Enclave/Keychain + Android Keystore/
  StrongBox OS-enforced ACL (M2c/M2d), and "keys never in webview/IndexedDB on native".
- **Native manual-test items** — e.g. `docs/biometric-keychain-binding.manual-test.md`,
  `docs/multi-wallet-portfolio.manual-ios.md`, and the M2c/d adversarial device tests.

These are the **load-bearing blockers** for a mainnet flip and should be tackled as a
single dedicated native-device session. Non-native remainders still open but ahead of
native in priority: the **M-2 BTC hard-gate** integration (architectural) and the
**dev-tooling** supply-chain bumps (not shipped; defer as hygiene).
