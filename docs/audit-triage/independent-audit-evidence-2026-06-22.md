# Independent audit evidence — status-tag honesty + provisional/audit-gated map (2026-06-22)

> **WHAT THIS IS:** the evidence record for two independent, read-only audit passes
> run against the feature-status tracking. Each pass was performed by a *fresh*
> `veyrnox-honest-reviewer` instance (adversarial, refute-first) plus first-party
> re-derivation of every falsifiable claim. **This document flips no status.**
>
> **WHAT THIS IS NOT:** an independent *third-party* audit. Per `CLAUDE.md` /
> `docs/Audit.scope.md`, the project's own reviewer is internal and is **never
> presented as independent third-party**. The §24 audit gate remains OPEN. A green
> test suite / clean review is **BUILT at most, never verified** ("verify, don't assert").

| | |
|---|---|
| **Date** | 2026-06-22 |
| **Method** | read-only status-tag sweep + first-party re-derivation + fresh adversarial `veyrnox-honest-reviewer` pass |
| **Scope** | (1) KEK/ACL/RASP no-drift gate doc; (2) the "provisional + audit-gated" feature map |
| **Outcome** | (1) no-drift CONFIRMED; (2) premise PARTIALLY REFUTED — 4 findings (F1–F4) |

---

## Audit 1 — KEK / ACL / RASP "no status-tag drift" — CONFIRMED TRUE

Target: `docs/audit-triage/kek-acl-rasp-status-gate-2026-06-22.md`. The reviewer tried
to refute the central claim and could not; first-party re-derivation matched.

Every falsifiable claim re-verified:

| Claim | Independent check | Result |
|---|---|---|
| `native.js` honesty header at line 42 | line 42 = `// IMPORTANT HONESTY ABOUT THE GUARANTEE` | ✅ |
| 5 RASP files (`conditions/degrade/detect/index/browserProbe`) | `ls src/rasp/` = exactly those 5 | ✅ |
| verdict enum `'live'\|'disabled'\|'cut'` (line 9) | confirmed | ✅ |
| `featureClassification.js:281` `verdict:'live'` for `/rasp-security` | confirmed; produces NO registry entry (`:380-387`), never surfaces as "verified" | ✅ |
| `VERIFIED 2026-06-20` markers = 5× classification, 9× Feature-Status | `grep -c` = 5 and 9 | ✅ |
| RASP catalogue status `'built'`, never verified | `featureCatalogue.js:276` `'built'`; not in `verified-evidence.json` | ✅ |
| `biometric.js:4` honest negation | `PROVISIONAL UI — NOT AUDITED-SECURE, NOT OS-ENFORCED` | ✅ |
| PRF spike harness 14/14 | `vitest run` → 14 passed (14) | ✅ |

**Structural basis (stronger than convention):** `resolveStatus()`
(`featureCatalogue.js:535-539`) downgrades any hand-typed `'verified'` to `'built'`
unless the feature is listed in `docs/verified-evidence.json` — and RASP is not (that
file holds only on-chain send txids). RASP therefore *cannot* render as "verified"
regardless of a note string.

Minor bookkeeping nits (not status over-claims): off-by-one citations in the gate doc
(`featureCatalogue.js:275/165` point at the `name:` line; the `status:` value is +1);
the `✅` glyph appears in `Feature-Status.md` but not in `featureClassification.js`; the
gate-doc header's `Branch` field is stale. None affect the conclusion.

---

## Audit 2 — "provisional + audit-gated" feature map — premise PARTIALLY REFUTED

A reviewer-built table listed 11 features as "built-but-gated, exist in code, held
behind the independent audit." Per-row classification against the doc tag **and** source
found the premise holds for 8 rows and breaks on 2, with one wording overstatement.

### F1 — Row 6 (decoy/hidden Action-Password parity): DOC-DRIFT — storage built, **enforcement pending**

The §6 line previously read `🎯 TARGET / do not build blind`. Code is ahead of that:
the **storage groundwork is built** — decoy (`duress.js`) and hidden (`stealth.js`) sets
now wrap the seed in a **fixed-length container** (`makeContainer`/`serializeContainer`)
that carries a per-set Action-Password record, and `makeChaff` sizes every fake blob to
`FIXED_LEN`, resolving the chaff-length distinguisher that previously blocked it.

**Runtime evidence** (`npx vitest run`, under the `vitest.setup.js` localStorage shim so
the Node-26 false-green trap does not apply):

```
✓ H2 (A2) … DECOY session: setActionPassword persists a verifiable record to the duress blob   (3753ms)
✓ H2 (A2) … HIDDEN session: setActionPassword persists a verifiable record to the stealth slot (7835ms)
  Tests  23 passed (23)   [h2-migration-and-per-set-ap, multivault-action-password, twoFactorGate]
```

The multi-second durations are real Argon2id work (not a skipped no-op). The records
round-trip and verify under the *same* `credentialVerifier` the gate uses.

**Honest scope correction:** an earlier draft of this finding said "built **and
enforced**." That was one notch too strong. The runtime tests prove **record
persistence + verification** for decoy/hidden sets — they do **not** prove
enforce-at-action in a live decoy session. The enforcement wiring is still
**primary-only** (`twoFactorGate.js` defaults `actionPasswordConfigured = true`; a
decoy/hidden enforce path must first source the record from the unlocked container), and
no UI yet collects a decoy/hidden Action Password (`setDuressPin` provisions `null`).
The correct tag is therefore **🟡 PARTIAL — storage shape landed, enforcement + UI
pending**, *not* "built and enforced", and *not* ✅/"verified" (no on-chain txid, no
audit). The Row 6 retag and the full write-up landed in
`docs/audit-triage/h2-decoy-hidden-2fa-parity.md`; this audit corroborates it.

### F2 — Row 10 (native RASP detection / remote attestation): MISCATEGORIZED

The native probe source is **zero shipped code** — `src/rasp/detect.js:16` self-discloses
"no native probe implementation in this build"; the only Swift in the tree is Capacitor /
keychain scaffolding (no jailbreak/root/Frida/tamper detector). It is `📋 specced-not-built`
and belongs in the **exclusion list** alongside M2c/M2d OS-enforced key binding — which the
same table *correctly* excluded. Including one and excluding its structural sibling is
inconsistent.

### F3 — Row 8 (hardware wallet) gate is misdescribed

`HardwareWalletPage.jsx` gates the flip to `live` on an **on-device testnet txid**, not on
"the independent audit." The table's blanket "held behind the independent audit" framing
overstates the gate; per the owner gate (`CLAUDE.md`) the independent audit is
RECOMMENDED-not-required, and the real blocks here are device-verification / native work.

### F4 — one built-but-gated row omitted

The last-unlock-timestamp / login-activity successor (`Feature-Status.md` §6, formerly
`🟡 BUILT / UNAUDITED-PROVISIONAL`; `multiVault.js` `lastUnlockAt`, `/login-activity`) fits
the table's premise as well as Rows 2/3 and was left out. Completeness gap, not an over-claim.

### Rows that held

1 (native secure storage M2b), 4 (composite RISK gate #137) are the genuine `🟡`
built-but-gated pair; 2, 3, 5, 7, 9, 11 are correctly characterised. The whole-stack
PROVISIONAL caveat and the exclusion of Crypto Will / encrypted cloud backup / M2c-d are
correct (Row 10 should join that exclusion list per F2).

---

## Independence caveat (binding)

Both passes used the project's own `veyrnox-honest-reviewer`, run fresh (no memory of the
prior session) — independent of the authoring session, **not** independent of the project.
This is **not** the independent third-party audit the §24 gate requires; that gate stays
OPEN. Nothing here flips any asset or feature status.

## Cross-references

- KEK/ACL/RASP gate: `docs/audit-triage/kek-acl-rasp-status-gate-2026-06-22.md`
- Decoy/hidden 2FA parity (F1): `docs/audit-triage/h2-decoy-hidden-2fa-parity.md`
- Status source of truth: `docs/Feature-Status.md`
- Audit scope (internal ≠ independent): `docs/Audit.scope.md`; policy `CLAUDE.md`
