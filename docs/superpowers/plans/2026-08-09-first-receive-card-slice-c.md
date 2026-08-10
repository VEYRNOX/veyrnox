# Plan: FirstReceiveCard + first_receive_shown telemetry (Slice C)

**Date:** 2026-08-09
**Owner:** Al (via Claude Code orch-add-feature)
**Status on landing:** BUILT (code + unit tests + panic-residue regression + build clean). NOT verified — no real on-chain first-receive walkthrough on device.
**Branch:** `claude/first-receive-slice-c`, worktree `/var/folders/l3/4f36t9jn439c8fk_1zqgx8pc0000gn/T/veyrnox-first-receive/`

## Intent

One-time post-onboarding screen showing the newly-created wallet's primary EVM receive address + QR + copy + "You're set" CTA. Renders after PIN + KEK resolve, before `Outlet` hands off to main wallet. Fires `first_receive_shown` telemetry event (metric-stop for time-to-first-mainnet-receive per `/sc:design`).

## Non-goals

- Multi-chain address picker (BTC, SOL) — EVM address only, single QR. Follow-up.
- Revisit-from-Settings entry — one-time only. Main wallet's receive page continues to work as normal after dismiss.
- Route-based `/first-receive` — blocked by WalletGate (same Slice A + B finding). Uses WalletEntry render-ladder branch.
- Fire on non-`finishPinSetup` paths — restore-from-file / advanced (Shamir) may not go through `finishPinSetup`; those paths NOT covered this slice. Follow-up if telemetry shows gap.
- Onboarding tile-selected start event (`onboarding_tile_selected` per design) — Slice D territory. `first_receive_shown` ships now regardless; timedelta becomes computable once Slice D lands.

## Files touched

| File | Change | New? |
|---|---|---|
| `src/components/FirstReceiveCard.jsx` | Reusable card: QR + address + copy + "You're set" CTA. Composes `QRCodeDisplay` + inline copy-to-clipboard block copied from `ReceiveCrypto.jsx:65-75,192-221`. Props: `address`, `onDismiss`. | NEW |
| `src/components/__tests__/FirstReceiveCard.test.jsx` | Unit tests (TDD RED first). | NEW |
| `api/trackEvent.js` | Add `FIRST_RECEIVE_SHOWN: 'first_receive_shown'` to `EVENT` allowlist (~L56-101). | EDIT |
| `src/lib/analytics.js` | Mirror `FIRST_RECEIVE_SHOWN` in `FunnelEvent` (~L21-58) per dual-listing convention. | EDIT |
| `src/lib/tracking-integration.jsx` | Add `useFirstReceiveShown(fn)` hook mirroring `useFirstInbound`/`useFirstSend` shape (~L124-168). Wraps `fireOnce('veyrnox-first-receive-shown-fired', fn)`. | EDIT |
| `src/components/WalletEntry.jsx` | (a) Add `justOnboarded` state (`const [justOnboarded, setJustOnboarded] = useState(false)`); (b) set `true` in `finishPinSetup` (~L917-924) — only when `kekOrigin === 'fresh'` OR the path is a fresh onboarding call, NOT on `handlePinRecover`; (c) new render branch between consent (~L1172) and FirstRunTour+Outlet (~L1197): `if (isUnlocked && !generatedSeed && !kekGatePending && justOnboarded && !isDeniabilityOrDemoActive()) { return <FirstReceiveCard address={resolveReceive('ETH', {accounts,...}).address} onDismiss={() => setJustOnboarded(false)} /> }`; (d) `useFirstReceiveShown` fires on card mount, gated by hook's own `fireOnce`. | EDIT |
| `src/wallet-core/panic.js` | Add `'veyrnox-first-receive-shown-fired'` to `METADATA_RESIDUE_KEYS` (~L286-289) alongside sibling fire-once markers. Per-key comment: "components/FirstReceiveCard.jsx via useFirstReceiveShown — PRESENCE asserts fresh onboarding reached the first-receive screen here." | EDIT |
| `src/wallet-core/__tests__/panic-residue-first-receive.test.js` | Regression test mirroring `panic-residue-first-run-tour.test.js` shape: pre-seed the key, run wipe, assert `localStorageResidue` empty + `.clean === true`. RED before residue-list add. | NEW |

## Security invariants involved

| Invariant | How this change respects it |
|---|---|
| I1 keys on device | No key material touched. Reads already-derived public EVM address from `WalletProvider` context. |
| I2 no silent egress | Only egress = `first_receive_shown` event via existing `trackEvent.js` chokepoint (consent-gated, allowlist-checked, decoy-suppressed already). No new endpoints. |
| I3 decoy-safe | Render branch gated with `!isDeniabilityOrDemoActive()` (matches sibling `TelemetryConsent`/`FirstRunTour` branches at `:1172`, `:1201`). Structurally unreachable in decoy anyway (post-KEK ladder branch order), but defensive-in-depth per the two-chokepoint pattern. Copy-to-clipboard writes REAL address only when render branch reached (which means non-decoy already). |
| I4 fail honest / fail closed | If `resolveReceive` returns null (never should — recon confirms no race), card renders honest error state ("Address unavailable — refresh"), NOT a fake address. Copy button disabled when address absent. |
| I5 backend untrusted | N/A. Address is client-derived. |
| I6 KEK hardware binding | Untouched. |

## `justOnboarded` signal — why not `autoEnrollPinRef`

Recon flagged `autoEnrollPinRef` is the WRONG signal:
- It's a ref (no re-render trigger)
- Holds a transient PIN value (privacy)
- Zeroized at multiple points (`kekEnroll` success, `kekSkip`, `:1198`, `:1637`, `:933`, `:1015`)
- Also set on the restore/recover path — doesn't distinguish fresh from recover

Correct signal = new React state `justOnboarded`. Set to `true` in `finishPinSetup` (recon `:917-924`), NOT in `handlePinRecover`. Cleared on `FirstReceiveCard.onDismiss`.

## TDD RED tests

### `src/components/__tests__/FirstReceiveCard.test.jsx` (6 tests)

1. **Renders address + QR + copy button + CTA.** Given `address="0xAbC...deF"`, all four elements present in DOM.
2. **Copy button writes address to clipboard.** Click → `navigator.clipboard.writeText` called with the exact address string.
3. **Copy button shows success feedback + fades.** Click → CheckCircle2 icon appears (matches `ReceiveCrypto.jsx:196-206` `AnimatePresence` pattern).
4. **"You're set" CTA fires `onDismiss`.** Click → `onDismiss` callback invoked once, no `onDone`-shaped calls anywhere.
5. **Address absent = honest error state.** `address={null}` → error text visible, copy button disabled, CTA still fires `onDismiss`.
6. **No localStorage writes from the card itself.** Spy `setItem`; interact fully; zero calls. (`fireOnce` marker is written by the parent hook via `useFirstReceiveShown`, not by the card.)

### `src/wallet-core/__tests__/panic-residue-first-receive.test.js` (1 test)

- Pre-seed `localStorage.setItem('veyrnox-first-receive-shown-fired', '1')`, invoke `panicWipe()`, assert:
  - `localStorage.getItem('veyrnox-first-receive-shown-fired') === null`
  - `inspectKeyMaterial().localStorageResidue` does NOT contain the key
  - `inspectKeyMaterial().clean === true`
- **RED before residue-list add** — key isn't in the sweep list so wipe misses it.

## Acceptance criteria

- All 7 new tests green (6 FirstReceiveCard + 1 panic-residue).
- All existing panic tests still green (47+/47+).
- All existing WalletEntry tests still green.
- `EVENT.FIRST_RECEIVE_SHOWN` present in allowlist (asserted implicitly by not being silently dropped in the `trackEvent` allowlist check).
- Lint clean.
- Build clean.
- Preview-render (dev server, best-effort): fresh-create walkthrough shows card once, dismiss lands on main wallet, refresh does NOT re-show card, telemetry event visible in `trackEvent` mock. **Note:** UI agent preview verify continues to be a known gap (no browser tool). Same as Slice A/B.

## Rollback

Single-commit revert: delete FirstReceiveCard + test + panic-residue test, revert WalletEntry branch + state addition, revert `useFirstReceiveShown` hook + EVENT/FunnelEvent entries + panic.js residue add. `fireOnce` marker key becomes orphaned if any writer remained — but the hook is the only writer and it's the same revert.

## Deliberate simplifications

- **EVM only** — one QR, one address, fastest to first-receive. Multi-chain follow-up.
- **path metadata omitted from telemetry v1** — recon confirms it's a NEW pattern (no existing precedent). Since Slice D adds the matching start-event and the split-entry surface, defer `path` until Slice D can populate it correctly.
- **No revisit affordance** — main wallet's own receive page covers this; keeps the metric event clean (once per device, never re-fired).
- **No copy-to-clipboard decoy suppression** at the button-handler level — render branch guard is the chokepoint; card is structurally unreachable in decoy.

## Follow-ups (deliberately left)

- Multi-chain first-receive (BTC + SOL) — either a chain-picker inside the card or 3 tabs.
- `path` metadata on `first_receive_shown` event (populated by Slice D's `onboarding_tile_selected` symmetry).
- Restore-from-file / Advanced-Shamir path coverage (may not go through `finishPinSetup`).
- Live "address just received funds" pulse (a follow-up polls balance; if it changes, celebrate).
- A11y pass — screen-reader announcement of address on render (currently just visible).
