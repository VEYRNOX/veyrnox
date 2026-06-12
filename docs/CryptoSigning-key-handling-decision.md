# Design decision: CryptoSigning key handling (clipboard, "(Live)" label, DOM exposure)

**Status:** DECISION — recommendations below; no code changed in this pass.
**Owner:** Al · **Reviewer (suggested):** independent audit (clipboard posture is app-wide)
**Framing:** PRE-AUDIT. Scope: `src/pages/CryptoSigning.jsx` (route `/crypto-signing`).

---

## Summary / verdict

`/crypto-signing` is a **client-side ethers.js playground**: generate a random wallet,
import a typed mnemonic, derive HD accounts, sign EIP-191 messages, build EIP-1559 raw
txs. Every key it touches is **ephemeral and user-generated on the page itself**
(`ethers.Wallet.createRandom()` at `CryptoSigning.jsx:38`, or a phrase the user pastes into
the Import tab at `:56`). **The vault HD seed is never read or involved here.**

Three residual issues, none of which is an I1 vault-key leak:

1. **Clipboard has no auto-clear** — the copy helper leaves the private key / mnemonic on
   the OS clipboard indefinitely.
2. **"(Live)" label** in the side-nav reads as a shipped/audited capability on a tool that
   is a local signing utility.
3. **DOM exposure** of the private key while `showKey` is on (screenshot / a11y tree /
   devtools), bounded but real.

**Severity: LOW, and explicitly NOT an I1 violation.** The keys here never come from the
vault and never leave the device of their own accord (no network call — consistent with the
classification note). This is a residual-secret-hygiene and honesty-labelling question, not
key exfiltration. The clipboard point is an **app-wide** pattern, not specific to this page.

---

## Finding 1 — Clipboard with no auto-clear

`CryptoSigning.jsx:34`:

```js
const copy = (text, key) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };
```

The `setTimeout` only resets the *UI* "copied" tick after ~1.5s. The secret stays on the OS
clipboard until something else overwrites it — readable by any other app, clipboard-history
managers (Windows `Win+V`), and cross-device clipboard sync. On a coercion-resistant wallet
that is a residual-secret surface. It is reachable here for the **mnemonic** (`:145`) and the
**private key** (`:170`, only rendered while `showKey` is on).

**Consistency check (the important part): this is the app's universal pattern, not a
CryptoSigning bug.** No copy/reveal surface in the repo auto-clears. Same shape, same UI-only
timeout, including the *real seed-backup reveals*:

| Surface | Location | What it copies | Auto-clear? |
|---|---|---|---|
| Vault seed backup (returning/new user) | `src/components/WalletEntry.jsx:371` (`copySeed`) | the **real generated vault seed** | no |
| Recovery-phrase reveal | `src/pages/WalletPortfolioPage.jsx:56` | wallet mnemonic | no |
| HD Wallet Manager | `src/pages/HDWalletManager.jsx:138` | addresses / keys | no |
| CryptoSigning | `src/pages/CryptoSigning.jsx:34` | ephemeral mnemonic / privkey | no |
| Address / link copies (AddressBook, ReceiveCrypto, PaymentLinks, etc.) | various | public data | no |

So the real seed-backup flow at `WalletEntry.jsx:371` has the **same** non-clearing
behaviour on a genuinely sensitive secret. Any recommendation should therefore be a **shared
helper**, applied app-wide and prioritised at the seed-backup surfaces — not a one-off bolted
onto this playground (which would be the *least* sensitive place to fix first).

**Recommendation.** Introduce one small shared clipboard helper (e.g.
`copySecretToClipboard(text)`) that, for **secret** values only:
- writes the text, then schedules a best-effort clear after a bounded window
  (~20–30s) via `navigator.clipboard.writeText("")`, guarded in a `try/catch` (clipboard
  access can reject when the tab isn't focused — fail honest, never throw into the UI);
- does **not** claim the clipboard is wiped (the OS/clipboard-history caveat still holds, and
  Windows clipboard history / sync can retain a copy regardless) — surface a one-line
  plain-language caution near secret copy buttons instead of a false guarantee.

Keep the existing `copy()` for public values (addresses, links) as-is. Wire the secret
variant first at `WalletEntry.jsx:371`, `WalletPortfolioPage.jsx:56`, `HDWalletManager.jsx`,
then `CryptoSigning.jsx` mnemonic/privkey copies. Note the zero-write tests
(`src/notify/__tests__/zeroWrite.test.js:37`, `src/rehearsal/.../rehearsalZeroWrite.test.js`)
flag `writeText`/`navigator.clipboard` in their guarded modules — the helper must respect
those boundaries (deniability/rehearsal paths must stay clipboard-free).

## Finding 2 — "(Live)" labelling

- Side-nav label: `src/lib/navigation.js:84` →
  `{ path: "/crypto-signing", label: "Crypto Signing (Live)", icon: Pen }`.
- Classification: `src/lib/featureClassification.js:142` → `verdict: 'live'`,
  `dataSource: 'on-device'`, note: "Entirely local … no external call. Standard
  cryptographic signing utility." (Path also listed at `:32`.)

The page's own H1 is "Real Cryptographic Signing" (`CryptoSigning.jsx:118`). The functionality
is genuinely real and on-device, so `featureClassification`'s `verdict: 'live'` is defensible
**in the audit's "does this do a real thing / leak data" sense** — it does a real thing and
leaks nothing.

The problem is the **user-facing "(Live)" suffix** in the nav. Against the project status
tags, "Live" is not one of BUILT / TARGET / PLANNED / HONEST-DISABLED, and "verified" is
reserved for an on-chain explorer txid (none applies — this page broadcasts nothing; the tx
tab hardcodes `nonce: 0`, `chainId: 1n` and only *builds* a raw tx, `:92`–`:97`, `:254`).
A "(Live)" badge on a generate/import/sign sandbox reads to a user as "this is the shipped,
production signing path," which overstates it. Per the tags this is at most **BUILT** (in
code, on-device, provisional), and functionally it is a developer/utility sandbox.

**Recommendation: relabel, don't gate.** Drop the "(Live)" suffix — call it
**"Crypto Signing"** (or "Signing Utility"). It is a real, harmless on-device tool, so gating
to dev is unnecessary; the fix is honesty in the label, not removal. The
`featureClassification` `verdict: 'live'` may stay (its semantics = "real + no egress"), but
consider tightening the note to call it a **utility/sandbox** so the "Live" word doesn't leak
back into UI. Do not write "verified" anywhere for this page.

## Finding 3 — DOM exposure of the private key

While `showKey` is true, the full private key is rendered as plain text at
`CryptoSigning.jsx:168`:

```jsx
{showKey ? wallet.privateKey : "••••…"}
```

**Exposure window:** from the user pressing the eye toggle (`:169`) until they toggle it off,
navigate away, or regenerate. While visible the key is in the **DOM text**, so it appears in:
screenshots / screen-share, the **accessibility tree**, and **devtools / `document` queries**.
Masking is presentational only — even when masked, the live key already exists in JS memory on
`wallet.privateKey` (an inherent property of doing signing in-page).

**Does it matter here?** Low. The key is **user-generated on this page** (or a phrase the user
themselves typed), not the vault seed — there is no derivation from the protected seed. The
toggle is **default-off** (`showKey` initialises `false`, `:22`) and the page is explicit that
keys are client-side and discarded on reload (`:133`). So the exposure is opt-in, scoped to a
throwaway key, and equivalent to any "reveal private key" tool.

**Recommendation:** acceptable as-is for an ephemeral-key sandbox; no blocking change. Optional
hardening if touched anyway: auto-hide `showKey` on tab switch / after a timeout, and add the
`aria-label`s that `docs/UI-audit-findings.md:181` already flagged so the reveal controls are at
least labelled (a11y), not silent. Don't over-engineer — this is a throwaway key.

---

## Severity framing (explicit)

- **NOT an I1 violation.** I1 = "keys never leave the device." Nothing here exfiltrates a key,
  and crucially **no vault seed is ever read** — every key is ephemeral, created on the page or
  typed in by the user. No network call exists on this route (matches the classification note).
- The clipboard gap (Finding 1) is the only one with broader weight, and that's because it is an
  **app-wide** pattern that also affects the *real* seed-backup copy at `WalletEntry.jsx:371` —
  fix it there as a shared helper, not as a CryptoSigning special case.
- Findings 2 and 3 are honesty/hygiene polish, not security holes.

Overall: **LOW severity.** Top action = ship a shared secret-clipboard helper with bounded
best-effort auto-clear (and an honest "OS clipboard may retain this" caution), applied at the
seed-backup surfaces first. Second = drop the misleading "(Live)" suffix in `navigation.js:84`.
