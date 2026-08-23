# Gemini weekly sweep — 2026-08-23

> **Internal long-context pass.** Conducted by Gemini 3.1 Pro.
> INTERNAL only. Does NOT close the independent audit gate.

- Target: `src/hooks/`
- Files: 13
- Bytes: 42250 (~10562 tokens)
- Model: gemini-3.1-pro-preview
- Base commit: `dd8fb285561692d1c50ed97b83ea842cdd8c6a49`

## Findings

[HIGH] src/hooks/useAnalytics.js:44 (cross-ref src/hooks/useBasketPrices.js:29) — Missing DEMO egress suppression: the `enabled` gate checks `!isDeniabilitySessionActive()` but omits `!DEMO`, causing a confirmed network egress leak (via `fetchAssetHistory`) for static demo wallet addresses — add `&& !DEMO` to the condition.

[HIGH] src/hooks/useBackgroundSecurity.js:32 (cross-ref src/hooks/usePriceAlertNotifier.js:89) — Effect dependency array `[enabled]` misses reactive deniability state changes. If the session flips to a decoy mid-mount, the effect won't re-run to stop the background monitor and clear alerts, leaking real-session approval data to the decoy session — import `useWallet` and add its reactive deniability flags (`isDecoy`, `isHidden`) to the dependencies instead of relying solely on the non-reactive `isDeniabilityOrDemoActive()`.

[MEDIUM] src/hooks/useDeriveAddress.js:11 (cross-ref src/hooks/usePriceAlertNotifier.js:56) — Corrupted JSDoc tags across multiple files: a bad find-and-replace has mutated `@param` into `@src/lib/__tests__/unlockTimingLegacyParams.p1.test.jsx` and `@type` into `@src/wallet-core/evm/typed-data.js`, breaking IDE tooling and type checks — restore the standard `@param` and `@type` tags.

[LOW] src/hooks/usePriceAlertNotifier.js:58 (cross-ref src/hooks/useRecentPages.js:79) — Hardcoded lock event string `'veyrnox:app-lock'` bypasses the shared constant, creating drift — import and use `APP_LOCK_EVENT` from `@/lib/copySecret`.

## Ref verification (Claude, same run)

Gemini's `file:line` refs were checked against the base commit before this
report was filed. Every line number cited above is wrong; two findings are
nonetheless real, one is plausible, one is fabricated. Treat the sections
below as the triage verdict, not the raw block above.

**REAL — `useAnalytics` is the only egress hook that does not suppress on demo.**
Cited as `useAnalytics.js:44`; the actual gate is `src/hooks/useAnalytics.js:63`:

```js
enabled: isUnlocked && wallets.length > 0 && !isDeniabilitySessionActive(),
```

`isDeniabilitySessionActive()` does not cover demo. Every sibling egress hook
folds demo in — `useBasketPrices.js:44` (`!isDecoy && !isHidden && !DEMO`),
`usePriceAlertNotifier.js:102` and `:133` (`|| DEMO`), and
`useBackgroundSecurity.js:46` (`isDeniabilityOrDemoActive()`). The reasoning is
already written down in `useBasketPrices.js:34-37`: the pref is device-global
and `isDecoy`/`isHidden` are both false in demo. `useAnalytics` calls
`fetchAssetHistory({ asset, address, demo: false })` with `demo` hardcoded
false, so a demo tour on a device with real wallets emits real-address history
requests.

Note before fixing: `src/hooks/__tests__/useAnalytics.i3-egress.test.js:19-20`
asserts the current clause by regex (`enabled:[^\n]*!isDeniabilitySessionActive\(\)`).
That test pins the present shape rather than the invariant, so it must be
updated with the fix — the same "test asserts the current behaviour" pattern
recorded in the 2026-07-27 review.

**PLAUSIBLE, unconfirmed — non-reactive deniability read in `useBackgroundSecurity`.**
Cited as `:32`; the effect gate is `:46` and its dependency array is `:65`
(`}, [enabled]`). `isDeniabilityOrDemoActive()` is called inside the effect but
is not a dependency, so a session flipping to decoy without `enabled` changing
would not re-run the effect. Whether that transition is reachable was not
traced in this pass. Gemini's proposed fix (depend on `useWallet`'s `isDecoy`/
`isHidden`) is a suggestion, not a verified remedy.

**REAL — hardcoded lock-event string.** Cited as `:58`; actual
`src/hooks/usePriceAlertNotifier.js:84` uses the literal `'veyrnox:app-lock'`
while `src/hooks/useRecentPages.js:108` uses `APP_LOCK_EVENT` imported from
`@/lib/copySecret`. Same event, two spellings. Cosmetic drift, real.

**FABRICATED — the "corrupted JSDoc tags" MEDIUM.** No such text exists.
`grep -rn "@src/" src/hooks/` returns zero matches at base commit
`dd8fb285`. `useDeriveAddress.js:11` and `usePriceAlertNotifier.js:56` carry
ordinary `@param`/`@type` tags. Disregard this finding entirely.

Nothing here is verified in the Veyrnox sense — no test was run, no device, no
on-chain confirmation. This is a static read plus a grep-level ref check.
