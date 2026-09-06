# Gemini weekly sweep — 2026-09-06

> **Internal long-context pass.** Conducted by Gemini 3.1 Pro.
> INTERNAL only. Does NOT close the independent audit gate.

- Target: `src/components/`
- Files: 269
- Bytes: 1557060 (~389265 tokens)
- Model: gemini-3.1-pro-preview
- Base commit: `99b432edda95d046b920efecddc4b0ec12e3ed1a`
- Delivery: `@corpus.txt` file reference, **not** stdin (see Methodology note)

## Methodology note — runbook Step 3 deviation

The runbook pipes the corpus on stdin (`gemini ... < "$CORPUS"`). That path is
**broken** on gemini CLI 0.54.4 on this machine: piping source code to stdin pegs one
core at 100% CPU and never returns. Measured, same 5,000-byte payload:

| stdin payload | result |
|---|---|
| 5,000 bytes plain prose | returns in 4s |
| 5,000 bytes JSX | hangs, SIGKILLed at 90s |
| 2,000 bytes JSX | returns in 7s |
| 2,500 bytes JSX | hangs |

So it is code content volume, not total size — and the cliff is ~2.5 KB, three orders of
magnitude below this corpus. A first attempt ran 55 minutes at 100% CPU and produced zero
bytes. `--approval-mode plan`, `-o json` and a deny-all tool policy did not help. The
process also ignores SIGTERM; it needs SIGKILL.

Passing the corpus as `@corpus.txt` instead uses a different code path and works:
the full 1.5 MB corpus returned in under a minute. Comprehension was spot-checked before
the real run (asked for the identifier bound to `VITE_TIP_BASE_URL`; answered
`TIP_CONFIGURED`, correct).

**The runbook's Step 3 needs updating to the `@file` form, or every future sweep
repeats this failure.**

## Findings (Gemini raw output, verbatim)

```
[HIGH] src/components/BackupPaywallNudge.jsx:509 (cross-ref src/components/PaywallNudge.jsx:4922) — handleDismiss writes to shared localStorage without an explicit deniability check, leaking interaction if the session flipped to decoy while mounted — Wrap localStorage.setItem in if (!isDeniabilityOrDemoActive())
[MEDIUM] src/components/ReferralPrompt.jsx:6059 (cross-ref src/components/SecurityPosture.jsx:8361) — dismissPrompt writes to shared localStorage without a deniability check, risking state pollution if called outside the render lifecycle — Add if (isDeniabilityOrDemoActive()) return; inside dismissPrompt
[CRITICAL] src/components/SeedVerification.jsx:8939 — Component processes raw seed state but lacks an isDeniabilityOrDemoActive() gate, risking exposure of seed state during a decoy/demo session — Add if (isDeniabilityOrDemoActive()) return null; gate at the component root
[CRITICAL] src/components/SeedGrid.jsx:8552 — Component receives and renders mnemonic seed state without verifying !isDeniabilityOrDemoActive(), risking seed exposure in decoy sessions — Add if (isDeniabilityOrDemoActive()) return null; gate at the component root
[CRITICAL] src/components/SeedInputGrid.jsx:8692 — Component handles seed state input without an isDeniabilityOrDemoActive() check, risking exposure in decoy sessions — Add if (isDeniabilityOrDemoActive()) return null; gate at the component root
[LOW] src/components/SeedVerification.jsx:8859 — Dead file with no imports or route (noted in comments) — Remove the file and its test or wire it into a route
```

## Verification notes (Claude, post-hoc)

Per the runbook: Gemini's `file:line` refs must be checked before any finding is treated
as actionable. They did not survive.

- **Every line number above is wrong.** They are offsets into the concatenated corpus, not
  file lines. The largest file cited is 242 lines; the findings cite 8939, 8552, 8692,
  8361, 6059, 4922. Use the file names, ignore the numbers.
- **The LOW finding is false.** `SeedVerification.jsx` is not a dead file — it is imported
  by `src/App.jsx`, `src/pages/SeedVerificationPage.jsx`, `src/pages/WalletPortfolioPage.jsx`,
  `src/lib/seedVerifyGate.js`, `src/lib/tracking-integration.jsx` and
  `src/lib/bugReport/recordableRoutes.js`, and it has a test.
- **The three CRITICALs are unconfirmed and probably misfiled.** `SeedVerification.jsx`,
  `SeedGrid.jsx` and `SeedInputGrid.jsx` do lack their own `isDeniabilityOrDemoActive()`
  call, but they are presentational children; the gate sits upstream in
  `WalletEntry.jsx` (6 call sites) and `WalletPortfolioPage.jsx` (3). The one gap worth a
  human look is `src/pages/SeedVerificationPage.jsx`, which has **zero** gate call sites —
  Gemini did not flag it, because pages were outside this week's target.
- **The HIGH and MEDIUM are plausible and match a known precedent in this repo.**
  `BackupPaywallNudge.jsx` gates render (`shouldShowBackupNudge`, line 18) but its
  `handleDismiss` writes `localStorage.setItem(KEY, '1')` at line 41 with no gate of its
  own; `visible` is seeded once at mount, so a session that flips to decoy while the
  component is mounted can write to shared localStorage from a decoy session.
  `ReferralPrompt.jsx` has the same shape (gate line 19, ungated write line 28). This is
  the two-chokepoint pattern already established by `lib/consent.js` (PR #1410) and the
  K-2 referral finding (PR #1262): gate the render **and** the write.
  Not fixed here — this report is triage input, not a fix.

No status tag was changed and nothing here is verified. Static long-context read only.
