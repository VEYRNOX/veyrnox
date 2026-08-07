# Security Diff — 2026-08-07 (BACKLOG catch-up, 2026-08-02 → 08-05)

Commits scanned: 97 (`cf5882bd`..`21df6ad9~1`)
Security-sensitive files changed: 66 of 234
Scan ref: `origin/main` at `65e1cb45`

This is the catch-up pass for the coverage gap recorded in
`diff-2026-08-07.md`: the daily scan did not run between the 2026-07-31 report
(merged `cf5882bd`, 08-02) and 2026-08-07, leaving four days of commits
unscanned. The window ends where the 08-07 daily window begins, so the two
reports together now cover `cf5882bd`..`65e1cb45` with no hole.

Two of the 97 (`78beb111`, `c00d574f`) were already covered as an out-of-window
addendum in the 08-07 daily report and are not re-analysed here.

## ⚠️ REGRESSION DETECTED

**`functions/api/_middleware.js:30` — the `/api/*` CORS allowlist admits any
`*.pages.dev` origin.** `*.pages.dev` is a free, self-service namespace, so the
allowlist does not constrain anyone willing to deploy a Pages project. Detail
below.

---

## Flagged changes

### `functions/api/_middleware.js:30` — REGRESSION
**Commit:** new file in this window (`functions/api/**` edge layer)

**Change summary:** New shared middleware for every `/api/*` edge route,
providing CORS with an origin allowlist, preflight handling and an error
envelope.

**Assessment:** The preview-deployment allowance is written as

```js
const match = allowed.find(o => origin === o || origin.endsWith('.pages.dev'));
return { 'Access-Control-Allow-Origin': match ? origin : allowed[0], … }
```

The second test **ignores `o`**, the element it is nominally comparing against.
It is therefore constant-true for any origin ending in `.pages.dev`, `.find()`
matches on the first array element, and the caller's own origin is reflected
into `Access-Control-Allow-Origin`. Demonstrated rather than reasoned about:

| Origin | `Access-Control-Allow-Origin` |
|---|---|
| `https://veyrnox.com` | `https://veyrnox.com` |
| `https://evil-attacker.pages.dev` | **`https://evil-attacker.pages.dev`** |
| `https://totally-not-veyrnox.pages.dev` | **`https://totally-not-veyrnox.pages.dev`** |
| `https://evil.com` | `https://veyrnox.com` (correctly refused) |

Anyone can create a `*.pages.dev` project for free, so the allowlist imposes no
real constraint — it refuses `evil.com` and waves through
`evil.pages.dev`.

**Why it matters here specifically.** `_middleware.js` sits in `functions/api/`,
so it covers every route beneath it, and those routes are not inert:

- **`functions/api/rpc/[fn].js`** — injects `SUPABASE_ANON_KEY` server-side and
  proxies eight RPCs including the writes `track_event`,
  `generate_referral_code`, `register_referral_code`, `increment_referral` and
  `record_attribution`. The proxy exists precisely so the anon key never ships
  in the bundle; the origin allowlist is the control that decides who may drive
  it from a browser.
- **`functions/api/buy/session.js`** — mints a one-time Transak widget URL.

Bounding the claim honestly: these endpoints take no cookies and no session, so
an attacker can already call them **server-side** without a victim. What the
hole actually buys is the ability to drive them *from a victim's browser and
read the responses*, and it defeats the origin restriction the file documents
as its purpose. The severity is in the control being absent rather than in a
novel capability.

**Same class as the L-9 finding in the 08-07 daily report** (`http://localhost`
re-added to `tip-screen`'s allowlist), but wider: a wildcard rather than one
extra entry. Two independent CORS allowlists in this codebase drifted open
within the same window.

**Fix opened:** anchored regex scoped to this project's own deployments —
`^https://(?:[a-z0-9-]+\.)?veyrnox-(?:prod|staging)\.pages\.dev$`. The slug
charset matches the `tr -c 'a-zA-Z0-9-'` sanitiser in `deploy-preview.yml` and
excludes `.`, so `veyrnox-prod.pages.dev.attacker.com` cannot match. Backed by a
new test under `functions/api/__tests__/` — which now executes in CI, because
`65e1cb45` added `functions/**` to the vitest glob.

---

### `src/wallet-core/shamir.js:341-360` — NEEDS-REVIEW (documentation)
**Commit:** new file in this window (527 lines)

**Change summary:** New 2-of-3 Shamir secret sharing over GF(2^8) for 32-byte
DEK material, with a v2 envelope carrying a SHA-256 commitment.

**Assessment of the implementation: sound.** Checked directly rather than
assumed:

- `sha256` from `@noble/hashes` — the mandated audited source; no custom
  primitive.
- `crypto.getRandomValues` for the set ID and every polynomial coefficient; no
  `Math.random`.
- `split()` assigns `x = i + 1`, so evaluation points are distinct and never 0
  (which would hand over the secret), and `n ≤ 255` keeps `x` in range.
- `combine()` validates version, `k`/`n` bounds, set-ID equality, per-share
  commitment equality, CRC, x-bounds and **duplicate x** before interpolating,
  then recomputes the commitment over the reconstructed secret and rejects a
  mismatch — the H-6 authentication — *before* the extra-share cross-check, so a
  forgery among the first `k` is caught even with no extra shares supplied.
- `gfMul` is branch-free and table-free; `gfInv` is a fixed 13-multiply
  square-and-multiply chain. I verified the chain computes `a^254` and that the
  reduction masks are correct.
- Intermediate buffers zeroed in `finally`; defensive copies against
  SharedArrayBuffer TOCTOU.

**The defect is the `combine()` JSDoc, which now contradicts the code it sits
on — in four places, each pointing a future maintainer at undoing a fix:**

1. *"integrity rests on CRC32 (corruption detection only — not cryptographic
   authentication) … The caller MUST authenticate the reconstructed DEK against
   the vault's AES-256-GCM AAD"* — the H-6 commitment check is now **inside**
   `combine()`. The module header says so explicitly and calls the old advisory
   contract "not a control".
2. *"a hash commitment would leak information about the secret"* — the header
   argues the exact opposite (*"This does NOT leak the secret"*) and the code
   implements the commitment. A maintainer trusting this line would **remove
   H-6 as a perceived leak**.
3. *"NOT constant-time: gfMul branches on zero, table lookups are
   cache-visible"* — M-7 removed both the branch and the tables. This line
   describes the pre-M-7 code and invites a "re-optimise with tables" change,
   undoing it.
4. `@param`/`@returns` both say *"envelope v1"*; the format is v2 and v1 is
   explicitly rejected.

Same class as **L-3** in the 2026-07-28 internal audit (`PlayIntegrityPlugin`
KDoc still describing a pre-#1097 bypass), which was treated as a finding and
fixed. Documentation that describes a security property the code no longer has
is a trap, and here it points in the dangerous direction — toward removing two
controls that were added deliberately.

**No runtime exposure:** the module header states nothing calls it yet, and
`git grep` confirms no importer outside its own tests.

---

## Controls ADDED in this window (no action needed)

The window is strongly net-positive. Verified from the diffs:

- **`src/lib/copySecret.js` (H-2)** — the clipboard wipe committed itself and
  tore down the TTL timer *and* both listeners **before** the write resolved,
  then swallowed the rejection. Since `writeText` rejects without focus and the
  hidden-page trigger fires exactly when focus is lost, the most common real
  flow — copy seed phrase, switch apps to paste it — dismantled every retry path
  and left the seed on the clipboard indefinitely. Now teardown happens only on
  a *confirmed* successful write, with a `visible` retry and an 8-attempt bound
  so a permanently unwritable clipboard cannot pin the closed-over secret.
- **`src/wallet-core/vault.js`** — structural blob validation with a stable
  `VAULT_ERR.MALFORMED` code kept deliberately distinct from the wrong-password
  sentinel. The reasoning is right and the honest direction: conflating them
  would tell a user with a truncated backup to retype their PIN. Closes a silent
  path where `atob()` coerces a numeric `salt: 123` into a 2-byte salt that
  fails much later as "wrong password".
- **`src/wallet-core/keystore/kek.js`** — `parseVaultBlob` now rejects `null`,
  arrays and non-objects that `JSON.parse` accepts.
- **`.github/workflows/rollback.yml`** — all three actions SHA-pinned, and the
  workflow retargeted from `veyrnox-staging` to `veyrnox-prod` so its
  "Rollback Production" title matches what it does. The previous mismatch was
  the kind of thing discovered mid-incident.
- **`android/app/src/main/AndroidManifest.xml`** — `/buy/return` deep link added
  with `autoVerify`, a path prefix, and an explicit note that the return payload
  is not trusted as proof of purchase. Consistent with `BuyInProgress.jsx`,
  which reads nothing from the payload.
- Zeroization tests added for `keystore/native.js` and `keystore/web.js`;
  new `shamir.constant-time` and `shamir.forgery` suites; new
  `vault-incomplete-blob` and `evm-broadcast-failure` suites.

## Non-security changes (summary)

168 of the 234 changed files are UI, i18n, docs, store-listing assets and
unrelated tests.

---

## Method note

The window was derived from absolute commit boundaries, not a relative
`--since`. The Bash tool in this environment reports a clock **24 hours behind**
the system clock, so `--since="24 hours ago"` silently selects the wrong window;
this is what let the 08-07 daily run initially see 2 commits instead of 6. Use
`cf5882bd..<tip>`-style explicit ranges here.

## Post-scan re-check

Verified against `origin/main` at `6d884759` (2026-08-07, post-merge of the
08-07 daily report). Both findings above were confirmed present at that ref.

---
*Automated backlog scan. INTERNAL static analysis only — no dynamic testing, no
device verification, no on-chain confirmation. Not the outstanding independent
third-party audit.*
