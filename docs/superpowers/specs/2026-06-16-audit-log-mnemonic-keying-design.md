# Design: Audit-log mnemonic-keying + primary-session wiring

**Date:** 2026-06-16
**Status:** DESIGN — pre-implementation. On build: **BUILT / UNAUDITED-PROVISIONAL** (no on-chain
artifact, so never "verified"). The D1–D7 multi-set storage shape stays **audit-gated** and out of scope.
**Owner:** Al · **Reviewer (required for the audit-gated remainder):** independent audit
**Cross-refs:** `docs/audit-log-login-activity-deniability-decision.md` (the gate this respects),
`docs/Feature-Status.md` §7 (the WIRING-BLOCKED item this unblocks), `src/wallet-core/auditLog.js` (PR #72 primitive).

---

## 1. Problem (one sentence)

The audit-log primitive `recordAuditEvent(type, password)` needs a secret to read-modify-write its
encrypted blob, but `WalletProvider` **deliberately does not retain the vault password** after unlock
(`src/lib/WalletProvider.jsx` — "By design we do NOT keep the password in memory"), so passive events
(`send_completed`, `settings_changed`, `approval_granted/revoked`) have no key to encrypt under and
cannot be logged without an intrusive re-prompt.

## 2. Root cause (verified against code on this branch)

- `recordAuditEvent` / `readAuditLog` in `src/wallet-core/auditLog.js` take the vault **password** and feed
  it to `encryptVault(plaintext, password)` / `decryptVault(blob, password)` (`vault.js:139/160`), which
  Argon2id-stretch the second argument into the AES-GCM key.
- `WalletProvider` keeps only the **mnemonic container** resident while unlocked
  (`containerRef.current = { wallets: [{ id, mnemonic }, ...] }`), exposed via `getActiveMnemonic()`. The
  password is re-prompted for each vault mutation and never cached.
- Therefore the fix is to **re-key the log off the in-memory mnemonic** instead of the password.

## 3. Settled decisions (from brainstorming, 2026-06-16)

1. **Decoy/hidden behavior: HARD-OFF.** Logging runs in the **primary session only**. In decoy
   (`isDecoy`) or hidden (`isHidden`) sessions `recordAudit` is a strict no-op and never reads/writes the
   `quaternary` blob. This sidesteps the D1–D7 multi-set storage shape (sub-decision #1 of the decision
   doc), which remains audit-gated.
2. **Call-site scope: all four allowlisted events** — `send_completed`, `approval_granted`,
   `approval_revoked`, `settings_changed`.
3. **Keying mechanism: Approach A** — HKDF-SHA256 of the primary mnemonic → derived secret → `encryptVault`
   verbatim. Chosen over passing the raw mnemonic (keeps the live seed off the auditLog API boundary;
   adds domain separation) and over caching the password (rejected: violates the no-password-in-memory
   invariant).

## 4. Architecture

Single moving part at a time. The crypto module changes its **key input**; the provider gains one gated
helper; call sites emit through that one helper.

### 4.1 `src/wallet-core/auditLog.js` — interface change
- New exported pure helper:
  `deriveAuditSecret(primaryMnemonic)` →
  `bytesToHex(hkdf(sha256, utf8Bytes(primaryMnemonic), undefined /*salt*/, 'veyrnox-audit-v1', 32))`
  using `@noble/hashes/hkdf` + `@noble/hashes/sha256` (already in the dependency tree).
- `recordAuditEvent(type, auditSecret)` and `readAuditLog(auditSecret)`: parameter renamed `password →
  auditSecret`; **body otherwise unchanged** — same allowlist + hard denylist gate, same `encryptVault`/
  `decryptVault` calls (now receiving `auditSecret` as the key input), same `quaternary` key, same
  100-entry ring buffer, same `{ type, ts }` shape, same byte-shape guard. The blob stays byte-identical to
  every other vault blob (no new tell).
- `clearAuditLog()`, `isAuditLogEnabled()`, `setAuditLogEnabled()`, `ALLOWED_EVENT_TYPES`, `DENY_TERMS`:
  untouched.

### 4.2 `src/lib/WalletProvider.jsx` — one gated helper
- `recordAudit(type)`:
  1. `if (isDecoy || isHidden) return;` — the hard-off gate (decision 1).
  2. Read the stable per-set identity: the container's **first wallet** mnemonic,
     `containerRef.current?.wallets?.[0]?.mnemonic`. (First wallet, not the *active* wallet, so switching
     active wallet mid-session does not change the key. The plan should check `multiVault.js` for a
     canonical primary accessor and prefer it if one exists.)
  3. `if (!mnemonic) return;` — fail-safe no-op.
  4. `recordAuditEvent(type, deriveAuditSecret(mnemonic))` inside `try/catch` — a logging failure must
     never break the user's actual action (this is a non-security-critical convenience aid).
- The derived secret is computed per-call and not retained; no new long-lived secret enters memory.
- `isAuditLogEnabled()` is still checked **inside** `recordAuditEvent`, so `recordAudit` is a no-op unless
  the user has opted in.

### 4.3 Call sites (primary session only, all via `recordAudit`)
- `send_completed` — after a confirmed broadcast in `src/pages/SendCrypto.jsx`.
- `approval_granted` / `approval_revoked` — after the allowance tx confirms in `src/pages/TokenApprovals.jsx`.
- `settings_changed` — on a settings mutation in `src/pages/Settings.jsx`.

Routing every call through the provider's `recordAudit` keeps the decoy/hidden gate and the enable-pref in
one place; call sites never touch `auditLog.js` directly.

## 5. Surfacing & honesty boundary (deliberate, unchanged)

- **No UI toggle.** The `veyrnox-audit-log` localStorage pref stays **unsurfaced**, so in shipped builds
  nothing logs unless a user manually sets the pref. The `src/lib/__tests__/featureCatalogue.test.js`
  "not surfaced" guard stays green.
- Wiring ≠ surfacing. This unblocks the WIRING-BLOCKED item in Feature-Status §7; the **surfacing** (a real
  UI toggle) plus the **multi-set D1–D7 storage shape** remain audit-gated and explicitly out of scope.
- No on-chain artifact is involved → nothing earns a "verified" tag. Status caps at
  BUILT / UNAUDITED-PROVISIONAL.

## 6. Migration / edge cases

- **No migration code.** The feature never shipped enabled or surfaced (OFF by default, unwired,
  unsurfaced), so no production `quaternary` blob keyed under the old password exists. Only test fixtures
  reference the old keying; those are updated. This is documented rather than coded around.
- A wrong `auditSecret` on read still makes `decryptVault` throw (the wrong-key signal is preserved — not
  swallowed).
- Transient mnemonic zeroization (`' '.repeat(...)` hygiene): `recordAudit` only runs in an unlocked
  primary session with a live container, so `wallets[0].mnemonic` is valid at call time; the `!mnemonic`
  guard covers any edge.

## 7. Testing (TDD — write tests first)

- `deriveAuditSecret`: deterministic & stable across calls for one mnemonic; differs across mnemonics;
  correct hex encoding and 32-byte length.
- Re-keyed `src/wallet-core/__tests__/audit-log.test.js`: record→read round-trip under a derived secret;
  wrong-secret read throws; allowlist + hard denylist still bite (duress/stealth/hidden/panic/decoy/seed
  refused; only the 4 allowed types land); ring buffer caps at 100; off-pref → strict no-op.
- New provider-level test: decoy/hidden session → `recordAudit` writes **nothing** (no `quaternary` blob
  created); primary session + opt-in → blob written and readable.
- The existing `src/__tests__/audit-log-honest-disabled.test.js` surfacing guard stays green.

## 8. Scope guard (files touched)

`src/wallet-core/auditLog.js`, `src/lib/WalletProvider.jsx`, `src/pages/SendCrypto.jsx`,
`src/pages/TokenApprovals.jsx`, `src/pages/Settings.jsx`, plus their tests. **No** vault-crypto internals,
**no** new surfacing, **no** decoy/hidden log storage, **no** change to the allowlist/denylist.

## 9. Out of scope (stays audit-gated)

- D1–D7 multi-set storage shape (decoy/hidden each keeping an own log without a real-vs-decoy distinguisher).
- Any UI surfacing / catalogue entry for the audit log.
- Login Activity (remains HONEST-DISABLED per the decision doc).
