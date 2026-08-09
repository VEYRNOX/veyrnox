# Plan: SeedInputGrid component (Slice A of onboarding fast-path)

**Date:** 2026-08-09
**Owner:** Al (via Claude Code orch-add-feature)
**Status on landing:** BUILT (code + unit tests). NOT verified — no on-chain import via new UI yet, no device verification.

## Intent

Extract a `SeedInputGrid` component that renders per-word BIP-39 input boxes, and swap it into `WalletEntry`'s existing `view === "import"` state in place of the raw `<textarea id="wallet-seed-import">` at `src/components/WalletEntry.jsx:1806`. Targets the password-cohort import path (`importWallet`, `WalletProvider.jsx:950`) only.

## Non-goals

- No route added (recon showed `/import` unreachable when locked due to `WalletGate` collapsing all paths to `WalletEntry`). Component-swap only, no `App.jsx` change.
- No touch to `importWallet` itself.
- No touch to PIN-cohort path (`importWalletForPendingPin`, `WalletEntry.jsx:1594` textarea, `doImportWallet`).
- No touch to password field (stays as sibling `<PasswordInput>` in WalletEntry).
- No touch to WelcomeHero/PIN/KEK/receive tail.
- No `veyrnox-onboarding-progress` key — dropped per user decision.
- No per-word BIP-39-wordlist highlighting (defer — new oracle-adjacent surface, YAGNI for v1).
- No paste-distribution UX in v1 (defer — nice-to-have, not required for metric).

Deferring paste-distribution has one real cost: crypto-natives who paste a whole seed will get an unhelpful "all in box 1" experience. Add it in a follow-up if the drop-off telemetry shows it.

## Files touched

| File | Change | New? |
|---|---|---|
| `src/components/SeedInputGrid.jsx` | Component: word-count selector + N per-word inputs + submit button. Props: `onSubmit(mnemonic: string)`, `disabled`, `submitLabel`. | NEW |
| `src/components/__tests__/SeedInputGrid.test.jsx` | Unit tests (TDD RED first). | NEW |
| `src/components/WalletEntry.jsx` | Replace `<textarea id="wallet-seed-import">` block (~L1806) with `<SeedInputGrid onSubmit={...}>`. **`handleImport` gained an optional `mnemonicOverride` param** — needed because `setImportPhrase(mnemonic)` doesn't flush before a same-tick read. Local var renamed `importPhrase` → `phrase`. Password field, error banner, Cancel button, `BiometricOffer`, view-state transitions untouched. PIN-cohort textarea at ~L1594 untouched. | EDIT |
| `src/rasp/__tests__/g4-callsite-pins.test.js` | **Pin literal updated** from `importWallet(importPhrase` → `importWallet(phrase` at L115 to match the arg rename above. Still asserts call-site ordering (sensitiveGate index < importWallet index), same guarantee as before. | EDIT |

**Not touched:** `WalletProvider.jsx`, `App.jsx`, `WalletGate.jsx`, `SeedGrid.jsx`, `importWallet` itself, `importWalletForPendingPin`, all PIN-cohort code paths.

## Security invariants involved

| Invariant | How this change respects it |
|---|---|
| I1 keys on device | No new key handling. Component gathers mnemonic, hands to existing `importWallet`. |
| I2 no silent egress | No new network calls. |
| I3 decoy-safe | Import happens pre-vault → no decoy session yet. No new writers to shared localStorage. |
| I4 fail honest / no oracle | Component MUST NOT expose per-word/checksum/length diagnostics on submit failure. Displays only the string returned by `importWallet` verbatim ("Invalid recovery phrase"). No per-word red/green state pre-submit. |
| I5 backend untrusted | N/A. |
| I6 KEK hardware binding | Untouched. |

## TDD RED tests (write first, watch fail)

`src/components/__tests__/SeedInputGrid.test.jsx`:

1. **word-count selector renders correct box count.** Given `wordCount={12}`, expect 12 inputs. Switch to 24, expect 24. Default = 12.
2. **submit concatenates words with single space.** Fill 12 boxes with `word1..word12`, click submit, expect `onSubmit` called with `"word1 word2 ... word12"`.
3. **submit disabled when any box empty.** Leave one box blank, submit button disabled.
4. **no-oracle error display.** `onSubmit` rejects with `new Error("Invalid recovery phrase")`; expect the exact string rendered verbatim. Assert NO per-word red state applied (no `.error` / `data-invalid` on individual inputs). Assert NO substring like "word 3" or "position" in the DOM.
5. **whitespace-trim per word.** Filling a box with `" abandon "` sends `"abandon"` in the concatenated string.
6. **no writes to `localStorage`.** Spy on `localStorage.setItem`; interact with the form fully; assert zero calls.

## Acceptance criteria

- All 6 new tests green.
- All existing `WalletEntry.*.test.jsx` tests still green (they mock `importWallet`; import-flow unit tests unchanged).
- WalletEntry `view === "import"` renders SeedInputGrid; password field still adjacent; `handleImport` unchanged.
- `g4-callsite-pins.test.js` still green (call site at WalletEntry.jsx:1108 untouched).
- Lint clean.
- Preview-rendered in dev server: 12-word input UI renders and interacts (no submission, no import). This is a render check, NOT verification. Per Veyrnox rules, "verified" is reserved for on-chain-txid evidence the user supplies.

## Honest scope

- **BUILT on landing:** code + unit tests + preview render. No claim of "verified".
- **NOT verified:** would require the user to import a real testnet seed via the new UI and receive on-chain, with a txid the user supplies. Only then does this flip to "verified" per Veyrnox status-tag rules.
- **NOT device-verified:** would require a real-device (iOS + Android) run of the same import.
- **NOT audit-covered:** the outstanding independent third-party audit does not cover this component.

## Rollback

Single-commit revert: delete `SeedInputGrid.jsx` + test file, restore `<textarea>` block at `WalletEntry.jsx:1806`. No schema, no storage, no build changes.

## Follow-ups (deliberately left)

- Paste-distribution (paste 12 words → distribute across boxes).
- Per-word BIP-39-wordlist highlight (public wordlist, not an oracle) — needs security-owner sign-off first.
- PIN-cohort import (`importWalletForPendingPin`) migration to same component.
- Route-based deep-linkability — needs WalletGate architecture change; different piece of work.
