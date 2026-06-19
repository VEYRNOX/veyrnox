# AI Security Review — Unaudited High-Risk Features (2026-06-19)

> **WHAT THIS IS:** an AI-assisted security *code review* of the highest-risk
> unaudited modules (vault crypto, key-at-rest, second-factor auth, EVM/BTC/SOL
> signing, the deniability stack, and PIN auth). Produced by a multi-agent
> review pass, then **every finding ground-truthed by hand against the source**.
>
> **WHAT THIS IS NOT:** the independent third-party audit. Per `CLAUDE.md` (I4
> honesty) and `docs/Audit.scope.md`, only a human independent audit gives the
> strongest assurance and gates nothing here. This document **does not change any
> feature `status`, does not flip anything to "audited," and is not "independent."**
> It is a triage aid for the real audit, nothing more.
>
> | | |
> |---|---|
> | **Branch reviewed** | `fix/csp-dedupe-meta` @ `42258a9` |
> | **Date** | 2026-06-19 |
> | **Scope** | crypto/key-material · deniability stack · PIN auth (highest-risk first) |
> | **Method** | 11 module-group reviewers → adversarial verifier per finding → **manual ground-truth of all 16** |
> | **Reviewer** | Claude (Opus 4.8), Claude Code |

---

## Two caveats you must read before trusting any severity below

**1. The automated severities were unreliable; the ones in this report are my
hand-regrade.** The multi-agent pass reported **1 critical / 5 high / 6 medium /
4 low**. On manual analysis that distribution does not survive. The headline
"critical" (stealth salt encoding) is in reality a **low** cosmetic defect: the
automated reviewer *and* its adversarial verifier both claimed the bug "reduces
entropy from 128 to ~16 bits," which is mathematically false — the encoding is a
bijective, entropy-preserving transform of a **non-secret** salt (details in
F-01). Because both the generator and the checker mis-analysed the same finding,
I re-graded **all 16** by reading the code directly. The grades in this report
are mine.

**2. The working tree was switched mid-review.** During the session the checkout
moved `fix/csp-dedupe-meta` → `fix/ios-viewport-zoom-clip` →
`feat/multi-wallet-portfolio` (the unmerged PR #69 base, ~272 commits behind).
The review targeted `fix/csp-dedupe-meta`; all line numbers below are valid there
and **will not match** `feat/multi-wallet-portfolio`. If you read this on another
branch, `git checkout fix/csp-dedupe-meta` first.

---

## Bottom line

- **No confirmed critical or high-severity *new* vulnerability.** The automated
  "critical" and most "highs" were over-graded.
- **The genuinely actionable result is a cluster of panic-wipe deniability gaps**
  (F-02, F-03, F-04, F-05): the panic wipe leaves several localStorage
  "deniability tell" keys behind, and its own post-wipe `clean:true` check can't
  see them. The module's own comment says these arrays must hold *every* such key
  — it lists three and misses two-plus of the same class. **Two-to-five–line
  fix; worth doing.** This is an I3 (deniability) gap, not a key-disclosure bug.
- Everything else is low / informational / already-documented-and-accepted
  (the 6-digit-PIN offline-exhaustibility and the stealth slot-collision residual
  are both already the project's own flagged audit items, not discoveries).
- **Three units were clean** (vault crypto core, keystore/at-rest, second-factor
  auth) and three more had no real findings (BTC, SOL, constant-KDF timing).

### Severity summary (my regrade)

| Severity | Count | Findings |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 3 | F-02, F-03, F-04 (panic-wipe residue cluster) |
| Low | 8 | F-01, F-05, F-06, F-07, F-08, F-09, F-10, F-11 |
| Info | 4 | F-12, F-13, F-14, F-15 |
| Known/accepted (already flagged by project) | 2 | F-16 (PIN offline), F-09 overlaps |

---

## Actionable cluster — panic-wipe deniability residue (Medium)

The panic wipe (`src/wallet-core/panic.js`) defines the keys it must erase in
`LOCAL_RESIDUE_KEYS` + `DENIABILITY_RESIDUE_KEYS` (→ `ALL_RESIDUE_KEYS`, line 126)
and uses that one list for **both** the erase (`clearLocalAddressResidue`, line
251) **and** the post-wipe inspection (`readLocalAddressResidue`, line 260, feeding
`inspectKeyMaterial().clean`, line 303). Anything not in the list is therefore
**neither erased nor detected** — and the inspection still reports `clean:true`.
The comment at lines 109-118 states the intent precisely: these are "DENIABILITY
TELLS in localStorage that a wipe MUST also destroy … each is a forensic artifact
that betrays the coercion-resistance stack was in use." It then lists
`veyrnox-pin-decoy-salt`, `veyrnox-auth-model`, `veyrnox-audit-log` — and omits
the following keys of the **same class**:

### F-02 — panic wipe omits `veyrnox-stealth-slot-salt` (Medium)
- **Where:** key defined `stealth.js:236`; absent from `panic.js:119-123`.
- **Real:** yes. The stealth slot-mapping salt is the strongest tell in the set —
  its presence proves the **hidden-wallet** feature was provisioned, the exact
  fact the deniability stack exists to hide. Survives the wipe; invisible to
  `clean:true`.
- **Fix:** add `'veyrnox-stealth-slot-salt'` to `DENIABILITY_RESIDUE_KEYS`.

### F-03 — panic wipe omits `veyrnox-audit-device-salt` (Medium)
- **Where:** key defined `auditLog.js:90`; absent from `panic.js:119-123`.
- **Real:** yes. The wipe clears the audit-log *pref* key (`veyrnox-audit-log`)
  and the data blob (`quaternary` via `clearVaultStore`), but leaves the
  per-device salt used to derive the audit-log key. It is a tell that the audit
  feature was configured (and, with a recovered seed, allows re-deriving the
  audit-log key to read any blob that escaped the store wipe).
- **Fix:** add `'veyrnox-audit-device-salt'` to `DENIABILITY_RESIDUE_KEYS`.

### F-04 — `inspectKeyMaterial()` can report `clean:true` while F-02/F-03/F-05 residue remains (Medium)
- **Where:** `panic.js:286-304` (inspection keyed on `ALL_RESIDUE_KEYS`, line 260).
- **Real:** yes — structural consequence of the omissions. The post-wipe
  "nothing recoverable remains" assurance is only as complete as the key list.
  Fixing F-02/F-03/F-05 fixes this automatically. Consider deriving the wipe set
  from a single authoritative registry so a new persisted key can't be forgotten
  in three places at once.

### F-05 — panic wipe omits passkey config keys (Low)
- **Where:** keys `veyrnox-passkey-unlock`, `veyrnox-passkey-cred`,
  `veyrnox-2fa-passkey` defined `src/lib/passkey.js:73,74,79`; absent from
  `panic.js`.
- **Real:** yes, but **Low** not Medium — "a passkey/2FA was configured" is a
  common, non-incriminating posture signal, unlike the hidden-wallet salt. Worth
  clearing for thoroughness; not a coercion-resistance break on its own.

> Recommended single change: extend `DENIABILITY_RESIDUE_KEYS` with the four keys
> above and update the pin-test (`panic.test.js`) that asserts the membership.

---

## Other confirmed findings (Low / Info)

### F-01 — Stealth/audit salt built with `utf8ToBytes(hex)` instead of `hexToBytes(hex)` (Low — was auto-graded "critical")
- **Where:** `stealth.js:238-249` (`getOrCreateStealthSalt`, lines 241 & 249);
  identical pattern `auditLog.js:90-104` (lines 95 & 104).
- **What's real:** the code stores 16 random bytes as a 32-char hex string, then
  reconstructs the HKDF salt with `utf8ToBytes(hexString)` — i.e. it uses the 32
  **ASCII bytes of the hex digits**, not the 16 decoded bytes. So the salt is not
  what the author intended (the comment wants the decoded bytes).
- **Why it is Low, not Critical:** (a) the transform is a **bijection** on the 16
  random bytes → the salt still carries the full ~128 bits of entropy; (b) an
  HKDF salt's job is domain-separation/device-specificity, which a stable
  128-bit-entropy value fully serves; (c) the salt is **not secret** — it sits in
  plaintext localStorage, so "offline precomputation" needs a storage dump, at
  which point the attacker has the salt regardless of encoding; (d) it is stable
  across calls, so slot mapping still works correctly. The auto-grader's
  "entropy → 16 bits" and "defeats dictionary defense" claims are wrong.
- **Fix (cosmetic/correctness):** switch both sites to `hexToBytes` for clarity
  and intent, or store/return the raw bytes directly. **Note:** changing the salt
  encoding re-maps existing stealth slots; since chaff is indistinguishable this
  leaks nothing, but existing hidden wallets would need re-creating — so treat as
  a deliberate migration, not a silent patch. Given near-zero security benefit,
  low priority.

### F-06 — `applyEstimatedGasLimit` swallows estimateGas errors (Low — was "high")
- **Where:** `preflight.js:46-59` (empty `catch`, line 55).
- **What's real:** on estimation failure the catch keeps the hinted gasLimit or
  lets ethers auto-fill. **Why Low:** ethers `sendTransaction` *re-estimates* when
  no gasLimit is set and throws if that fails — there is no silent broadcast of a
  hard-coded 21000 underpriced tx (the auto-grader's stated impact). Worst case is
  a loud failure at send, not a silent stall. Optional hardening: log/surface the
  estimation failure rather than swallowing it.

### F-07 — user-supplied gasLimit not re-clamped to `MAX_GAS_ESTIMATE` (Low)
- **Where:** `preflight.js:52-54`.
- **What's real:** the 1M ceiling (line 50) is applied to the **RPC** estimate
  only; a larger *user-entered* custom gasLimit passes through. **Why Low:** the
  documented threat for this clamp is the **untrusted RPC** (I5), which *is* fully
  covered; a user inflating their own gasLimit is user-error, not the modelled
  threat. Defense-in-depth nit: also clamp the user override.

### F-08 — `decoyFallback` doesn't zeroize the Argon2id output buffer (Low)
- **Where:** `decoyFallback.js:80-81` — `raw.slice(0,16)` then return, no
  `raw.fill(0)`, unlike `vault.js` / `credentialVerifier.js`.
- **What's real:** yes; best-effort secret-hygiene inconsistency. `raw` is GC'd
  eventually; JS can't guarantee zeroization anyway. Low — match the codebase
  pattern by adding `raw.fill(0)`.

### F-09 — stealth slot-collision can clobber a hidden wallet (Low/Medium — already SAST M1)
- **Where:** `stealth.js:338-341`, `POOL_SIZE = 256` (line 177).
- **What's real:** yes, but this is the **already-documented** SAST M1 residual
  (header lines 82-109). At POOL_SIZE 256 the birthday probability is ~k(k-1)/512
  (~1.2% at 3 wallets). Tracked, accepted, audit-flagged — not a new finding.

### F-10 — chaff word-count distribution differs from real default (Low)
- **Where:** `stealth.js:279` samples 12/24 words ~50/50; `createHiddenWallet`
  defaults to 12 (line 352).
- **What's real:** yes — a weak length-based statistical prior on real-vs-chaff
  blobs. The module header already scopes length/statistical attacks out, but the
  mismatch is self-inflicted and trivially removed (sample chaff from the same
  distribution as real). Low.

### F-11 — PIN-confirm uses `p !== realPin` (non-constant-time) (Low)
- **Where:** `WalletEntry.jsx:897, 953` (setup + recovery confirm steps).
- **What's real:** yes, a non-constant-time compare exists. **Why Low:** this is
  the one-time PIN-*confirmation* UI (user comparing their own freshly-entered PIN
  against itself), not the unlock path; both operands are local to the session and
  no attacker is on the other side. The actual unlock path is Argon2id-gated and
  constant-work (`deniabilityUnlock.js`). Use `constantTimeEqual` for consistency.

### F-12–F-15 — Informational
- **F-12** `fees.js:74` `BigInt(Math.max(21000, Math.floor(Number(gasLimit)…)))` —
  precision loss only above 2^53, unreachable for gas values. Info.
- **F-13** `evm/send.js:53` nonce sanity window `> 1_000_000` is generous; a
  tighter bound is defensible. Fail-closed already (it throws). Info.
- **F-14** `stealth.js` `await slotForSecret(...)` on a sync function — no-op,
  clarity only. Info.
- **F-15** General: best-effort JS memory zeroization is inherently incomplete;
  documented in-code. Info / no action.

---

## Units reviewed clean (no substantiated findings)

- **Vault crypto core** (`vault.js`, `multiVault.js`, `vaultBackup.js`) — fresh
  per-encryption salt/IV, correct Argon2id+AES-256-GCM, KDF migration, fail-closed
  errors, backup seal leaks no real-vs-chaff distinguisher.
- **Keystore / at-rest** (`keystore/{keyStore,web,native}.js`) — ciphertext-only,
  192 MiB Argon2id, CSPRNG IV/salt, generic errors, biometric gate honestly
  disclosed as app-layer (M2b) not OS-ACL.
- **Second-factor + step-up** (`actionPassword.js`, `credentialVerifier.js`,
  `sendReauth.js`) — XOR-accumulate constant-time compare, fail-closed, matching
  KDF params, transient-hash zeroization, one-shot token, window boundary correct.
- **EVM signing** — live `eth_chainId` replay guard (`preflight.js:17-27`) is
  correct (uses `provider.send`, not the static-network `getNetwork`); only the
  Low gas items above.
- **BTC** (`btc/{derivation,send,coinselect}.js`) — BIP-84 vectors pinned, BigInt
  sats, value-conservation asserts at plan/build/signed levels, dust handling.
- **SOL** (`sol/{derivation,slip10,send}.js`) — ed25519/SLIP-0010 correct,
  rent-exempt + blockhash-expiry guards present.
- **Constant-KDF unlock timing** (`deniabilityUnlock.js`, `mnemonic.js`) — runs a
  fixed KDF count on every non-primary path; CSPRNG mnemonics; documented residual
  (primary-success is faster) does not leak feature presence.

---

## Appendix — auto-grade vs. hand-grade

| ID | Finding | Auto | **Hand** | Why changed |
|---|---|---|---|---|
| F-01 | stealth/audit salt `utf8ToBytes` | critical | **Low** | entropy-preserving bijection; non-secret salt |
| F-02 | panic omits stealth-slot-salt | high | **Medium** | real I3 tell, but not key disclosure |
| F-03 | panic omits audit-device-salt | high | **Medium** | real I3 tell |
| F-04 | inspect `clean:true` w/ residue | medium | **Medium** | confirmed |
| F-05 | panic omits passkey keys | medium | **Low** | passkey presence not incriminating |
| F-06 | gas estimate empty catch | high | **Low** | ethers re-estimates; no silent underprice |
| F-07 | user gasLimit not clamped | medium | **Low** | RPC threat (I5) already covered |
| F-08 | decoyFallback no zeroize | medium | **Low** | hygiene nit |
| F-09 | stealth slot collision | medium | **Low/Med** | already SAST M1, accepted |
| F-10 | chaff word-count distinguisher | low | **Low** | confirmed |
| F-11 | PIN-confirm non-constant-time | medium | **Low** | setup/recovery UI, not unlock path |
| F-16 | 6-digit PIN offline-exhaustible | high | **Known** | already the docs' "#1 audit item" |
| F-12–15 | precision / nonce window / await / zeroize | low | **Info** | not practically exploitable |

> Findings located by a multi-agent pass (11 reviewers + per-finding adversarial
> verifier); **all 16 ground-truthed by hand** against `fix/csp-dedupe-meta`
> before grading. Two automated findings were dropped entirely as code-misreads
> (not listed). Re-grading is the reviewer's, and should itself be checked by the
> human auditor — this document informs the independent audit, it does not replace it.
