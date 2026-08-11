# Slice G + H — WalletCreatedFlash, duplicate-hero fix, back-button chip, backup nag (PLAN v2)

**Date:** 2026-08-10
**Worktree:** `/var/folders/l3/4f36t9jn439c8fk_1zqgx8pc0000gn/T/veyrnox-slice-g`
**Status on ship:** BUILT (code + tests green). NOT verified — no real-device recovery trip. Independent audit still outstanding.

**Codex plan-review v1 findings, all addressed in v2 below.** 4 P1 + 2 P2. See "Codex fixes" section at bottom for line-by-line resolutions.

## Goal (one line)

Replace the FirstReceiveCard post-CREATE with an honest wallet-created celebration + backup nudge, fix the duplicate hero on the entry-tiles view, upgrade the back-button style, and add a decoy-safe post-unlock nag scheduler.

## Ground truth from recon

- `src/components/WalletEntry.jsx:1227` is the CREATE post-onboard branch (`isUnlocked && !generatedSeed && !kekGatePending && justOnboarded && !isDeniabilityOrDemoActive()`) — currently renders `<FirstReceiveCardWithTelemetry>` inside `<EntryShell>`. Swap point for CREATE. IMPORT does NOT set `justOnboarded` the same way — verify before wiring.
- `WalletEntry.jsx:1316-1317` already documents the "EntryTiles renders its own logo/wordmark" duplicate-hero problem (comment present, fix not yet in). Port fix from `veyrnox-tap-reduction` worktree.
- `src/pages/PersonalBackup.jsx:245` — success path is the "Save backup" click producing the `.enc` file. `markBackupCompleted()` fires there. Recon the callback boundary before hooking.
- `src/lib/consent.js` establishes the K-2 two-chokepoint pattern: both READ (`shouldShow*`) and WRITE (`mark*`) branch on `isDeniabilityOrDemoActive()`. Mirror exactly.
- `src/lib/featureCatalogue.js:259` confirms `/personal-backup` today is `.enc` file export. Shamir/2-of-3 is `docs/cloud-recovery-shard-spec.md` — spec, not built. Copy gate non-negotiable.
- WalletEntry.jsx has 17 total `text-xs text-muted-foreground` uses. The 5 back-buttons need identification by JSX context (`<button>` with `ArrowLeft` + "Back"). Extract a `<BackButton>` local component during the change to eliminate blind sed risk.

## Files touched

**NEW**
- `src/components/WalletCreatedFlash.jsx`
- `src/components/BackupNagSheet.jsx` — reuses `WalletCreatedFlash` internals via `compact` prop
- `src/lib/backupNag.js`
- `src/components/__tests__/WalletCreatedFlash.test.jsx`
- `src/components/__tests__/BackupNagSheet.test.jsx`
- `src/lib/__tests__/backupNag.test.js`

**EDIT**
- `src/components/WalletEntry.jsx` — `EntryShell` gains `chromeless` prop; entry-tiles path passes it; CREATE post-onboard branch swaps FirstReceiveCard → WalletCreatedFlash; extract local `<BackButton>` replacing 5 sites; post-unlock nag mount point. (Codex v3 P2: NO changes to a local residue list here — panic residue lives in `panic.js` only.)
- `src/wallet-core/panic.js` — add 2 keys to `METADATA_RESIDUE_KEYS` (line 264), add 1 key to `SESSION_RESIDUE_KEYS` (line 369).
- `src/pages/PersonalBackup.jsx` — platform-branched completion per §5 above; add "I saved it" confirmation card for `pending_confirmation` state.
- `src/lib/WalletProvider.jsx` — call `backupNag.onVaultKeySetChanged(publicAddresses)` inside `createWallet` (910), `importWallet` (964), `addWallet` (1052), `importAdditionalWallet` (1074), `removeWallet` (1095).
- `src/wallet-core/vaultBackup.js` (Codex v7 P1 fix) — `downloadBackupFile()` currently returns `{saved:true, path:'Shared via '+activityType}` on iOS, discarding the discrete `activityType`. Change return shape to `{saved: boolean, activityType?: string, path: string}` so PersonalBackup can decide save-verified vs pending. Android/web branches unchanged (activityType absent). All 3 call sites in PersonalBackup handle the new shape.
- **New hook** `src/lib/useBackupNag.js` (Codex v7 P1 + v8 P1 fix) — `useBackupNag()` returns `{ shouldShow, dismissForSession, promoteToCompleted }`; uses `useSyncExternalStore` against `backupNag.subscribe()`. `recordUnlock()` (and every other writer) calls `notify()` after mutation.

   **`markBackupNagShown()` fires ONLY on user action** (CTA click OR "Not now" click) — NOT on mount. Mounting the sheet itself does not touch cadence state, so the "sheet unmounts itself before user sees it" race is impossible. `shouldShow` remains true across renders until the user acts, at which point either `dismissForSession()` (sets session-skip flag + timestamp/counter reset → shouldShow flips false for the session) or `promoteToCompleted()` (navigates to `/personal-backup`, sheet unmounts naturally when route changes) fires. Regression test: mount sheet → assert it stays visible across N re-renders with no user action → assert it disappears when `dismissForSession()` called.

## Implementation order

1. **`backupNag.js` first, tests first.** Pure module. Storage keys:
   - `veyrnox-backup-state-v1` (JSON: `{ fp, status, ts }` where `fp` = vault fingerprint, `status ∈ {none|pending_confirmation|completed}`, `ts` = ms epoch of last state change)
   - `veyrnox-backup-nag-v1` (JSON: `{ lastShownTs, unlockCountSinceShown }`)
   - `veyrnox-backup-nag-session-skip` in `sessionStorage`

   **Container-fingerprint-scoped completion (Codex v3 P1 #b + v6 P1 fix — MULTI-SEED, no-seed-exposure interface):** Model is multi-seed: `WalletProvider.addWallet` (line 1052) and `importAdditionalWallet` (line 1074) both insert additional mnemonics into `container.wallets[]`.

   `backupNag.js` NEVER receives seeds or containers. Interface is:
   ```
   backupNag.getVaultFingerprint(publicAddresses: string[]): string
   backupNag.onVaultKeySetChanged(publicAddresses: string[]): void
   backupNag.markBackupCompleted(publicAddresses: string[]): void
   backupNag.shouldShowBackupNag(publicAddresses: string[]): boolean
   ```
   `WalletProvider` — which already holds the container — computes `publicAddresses = container.wallets.map(w => deriveEvmAddress0(w)).sort()` at each of the 5 mutation chokepoints and passes it in. `backupNag.getVaultFingerprint(addrs)` returns `sha256(addrs.length + ':' + addrs.join(','))`. No seed material crosses the module boundary. Module is pure w.r.t. its inputs.

   Any wallet add/import/remove changes the address list → fingerprint mismatch → prior backup marked stale.

   `markBackupCompleted()` stores `{ fp, status: completed, ts }` under key `veyrnox-backup-state-v1`. `shouldShowBackupNag()` returns true if `state.fp !== currentFp` OR `state.status !== completed`.

   **Chokepoints wired** (Codex v4 P1 fix — real names verified in `WalletProvider.jsx`): `createWallet` (line 910), `importWallet` (964), `addWallet` (1052), `importAdditionalWallet` (1074), `removeWallet` (1095). NO `resetWalletState` — that name does not exist. Panic-wipe path uses the residue clear + reload; the fingerprint auto-mismatches on the next mount because `container.wallets` is empty (currentFp differs from any recorded fp). Tests assert each of the 5 named mutations flips `shouldShowBackupNag()` from false → true.

   **Nag cadence** (Codex v4 P2 fix): `shouldShowBackupNag()` returns true if `state.status !== "completed"` OR `state.fp !== currentFp`, AND (no `lastShownTs` OR `unlockCountSinceShown >= 5` OR `now - lastShownTs >= 3 * 86400_000` OR `now < lastShownTs` (clock rollback treated as "show it, reset counters")). First-time show: `unlockCountSinceShown = 0, lastShownTs = null` → `!lastShownTs` clause fires. `markBackupNagShown()` sets `{ lastShownTs: now, unlockCountSinceShown: 0 }`. `recordUnlock()` increments `unlockCountSinceShown` by 1 (bounded at 10 to avoid unbounded growth). Session skip flag (in `sessionStorage`) short-circuits to false regardless of counters. Tests: initial-show, five-unlock threshold, three-day threshold, clock-rollback path, session-skip path.

   **Two-tier verified state (Codex P1 #3 fix):** `markBackupPendingConfirmation()` writes `pending_confirmation` — set by PersonalBackup after `verifyBackupEnvelope + downloadBackupFile` on web/desktop path only (iOS's `result.saved:true` is a real signal and jumps straight to `completed`). Nag continues to fire while `pending_confirmation` with different copy ("Did you save the backup file?"). `markBackupCompletedFromConfirmation()` bumps to `completed` only after explicit user click of a "Yes, I saved it" confirmation control on the PersonalBackup page.

   **Atomic scheduler (Codex P1 #4 + v6 P1 fix):** `WalletEntry.jsx` exposes only `isUnlocked` (boolean), no unlock counter. Real transition detection:
   ```
   const prevUnlockedRef = useRef(false);
   useEffect(() => {
     if (isUnlocked && !prevUnlockedRef.current) {
       prevUnlockedRef.current = true;
       backupNag.recordUnlock();
     } else if (!isUnlocked && prevUnlockedRef.current) {
       prevUnlockedRef.current = false; // arm for the NEXT lock→unlock transition
     }
   }, [isUnlocked]);
   ```
   The ref survives StrictMode double-mount because it's initialised only once; the effect only calls `recordUnlock()` on genuine false→true transitions. `recordUnlock()` internally reads-modifies-writes the counter atomically (single-tab expectation stated in module header). `shouldShowBackupNag()` is a pure read; it does NOT mutate. `markBackupNagShown()` is called ONLY by user-action handlers (CTA or "Not now") — NOT by any mount effect — so the self-unmount race is impossible.

   **I3 chokepoints (Codex P2 #5 + v10 P1 fix):** EVERY read AND EVERY write in this module first checks `isDeniabilityOrDemoActive()`. Writers no-op silently. `shouldShowBackupNag()` returns `false` (bare boolean matching the declared signature — NOT an object; `{shouldShow:false}` is truthy in JS and would defeat the gate). There are NO storage mutations outside this module — the sheet's handlers call `backupNag.dismissForSession()` / `backupNag.markBackupNagShown()`, never `sessionStorage.setItem` directly. Grep-guard test asserts zero direct `localStorage.setItem`/`sessionStorage.setItem` outside this file for the 3 key names.

   **Panic-wipe wiring (Codex P2 #6 + v2 #c fix):** Split by storage backend.
   - `veyrnox-backup-state-v1` + `veyrnox-backup-nag-v1` → `src/wallet-core/panic.js` `METADATA_RESIDUE_KEYS` (line 264, `localStorage.removeItem`).
   - `veyrnox-backup-nag-session-skip` → `src/wallet-core/panic.js` `SESSION_RESIDUE_KEYS` (line 369, `sessionStorage.removeItem`).
   - Regression test mirrors `panic-residue-first-run-tour.test.js`: for EACH backend, write the corresponding keys → run wipe → assert `inspectKeyMaterial().clean === true` AND the specific backend's `.residue` array is empty.
2. **`WalletCreatedFlash.jsx`.** Full-screen. Accepts `compact` for BackupNagSheet reuse. Props include **required** `onDismiss` and `onPrimary` handlers (Codex v10 P1 fix — flash MUST clear `justOnboarded` on either CTA, else it keeps intercepting after user action). WalletEntry passes `onDismiss={() => { setJustOnboarded(false); backupNag.dismissForSession(); }}` and `onPrimary={() => { setJustOnboarded(false); backupNag.markBackupNagShown(); navigate('/personal-backup'); }}`. (Codex v11 P1 fix — without `dismissForSession()` on the flash's Skip CTA, the first-time cadence would immediately re-open the nag sheet on the dashboard, creating a flash→nag loop.) SVG check-ring stroke-draw, gated behind `prefers-reduced-motion`. Copy is fixed strings; grep-guard test asserts absence of `/shard|shamir|2-of-3|three shards/i`. Regression test: after `onPrimary` fires, flash is no longer rendered on next parent render.
3. **`BackupNagSheet.jsx`.** Wraps `<WalletCreatedFlash compact />` in a sheet container. Mount effect does NOT touch cadence state (avoids self-unmount race). "Not now" click → `dismissForSession()` (which internally calls both `markSessionSkip()` AND `markBackupNagShown()`). "Set up now" click → `promoteAndNavigate()` (calls `markBackupNagShown()` then navigates to `/personal-backup`).
4. **`WalletEntry.jsx` edits, one pass:**
   - Add `chromeless` prop to `EntryShell`; when true, skip outer hero block. Entry-tiles branch passes `chromeless`.
   - Replace CREATE branch (~line 1227): render `<WalletCreatedFlash>` inside `<EntryShell chromeless>` (Flash owns its own hero).
   - Extract `<BackButton>` local component; wire 5 call sites through it. New class: `inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-foreground/90 hover:bg-white/[0.08] hover:text-foreground`.
   (Panic-residue keys go into `panic.js`, not here — see below.)
   - Post-unlock nag mount: after successful unlock, before dashboard render, if `shouldShowBackupNag()` → render `<BackupNagSheet>` above dashboard content.
5. **`PersonalBackup.jsx`** (Codex v2 P1 #a fix — platform-explicit):
   Decision table by platform (Codex v3 + v13 P1 fix — unified, no conflicting rules):
   - **Android** — `FileSaver.saveToDownloads` returns a real filesystem path. `result.saved === true` → `markBackupCompleted()`.
   - **iOS with Save-to-Files activityType** — `result.activityType` matches `/^com\.apple\.(UIKit\.activity\.SaveToFiles|DocumentManager\.)/`. → `markBackupCompleted()`.
   - **iOS with any other or absent activityType** (mail, message, copy, ambiguous) — `Share.share()` resolving is NOT proof of durable storage. → `markBackupPendingConfirmation()`.
   - **Web / desktop** (anchor-click download) — → `markBackupPendingConfirmation()`.
   - **All pending_confirmation paths** render an "I saved it" confirmation card with `Yes, I saved it` (→ `markBackupCompletedFromConfirmation()`) and `Not yet — remind me` (dismisses card, leaves `pending_confirmation`).
   - On failure or user-cancel: no state mutation.
   - Regression tests: (1) web-path unit test asserts state = `pending_confirmation` immediately after `runExport`, only flips to `completed` when the confirmation button fires; (2) iOS unit test asserts ambiguous `activityType` → `pending_confirmation`, save-activity → `completed`; (3) Android unit test asserts `saved:true` → `completed`.

## Test invariants (must all pass)

- `WalletCreatedFlash` grep-guard: no `/shamir|shard|2-of-3|three shards/i` in rendered text.
- WalletEntry CREATE post-onboard renders `WalletCreatedFlash`; IMPORT branch unchanged.
- `shouldShowBackupNag()` returns `false` when decoy/demo active, regardless of counters.
- `markBackupNagShown()` writes nothing to localStorage when decoy/demo active.
- `markBackupCompleted()` writes nothing to localStorage when decoy/demo active.
- Session skip: after `markBackupNagShown()` + session flag, `shouldShowBackupNag()` returns false for rest of session; new session (sessionStorage cleared) re-evaluates.
- Backup completion: `veyrnox-backup-state-v1` = `{ fp: currentFp, status: "completed", ts: * }` → `shouldShowBackupNag()` returns false.
- **Fingerprint mismatch** (Codex v3 P2 #d fix): after `markBackupCompleted()`, run one of the 5 mutation chokepoints (`createWallet`/`importWallet`/`addWallet`/`importAdditionalWallet`/`removeWallet`) → assert `shouldShowBackupNag()` flips back to true and state's `fp` no longer matches current.
- Panic-wipe residue test (mirror Slice F pattern): all 3 backup-nag keys are in `ALL_RESIDUE_KEYS` and cleared by wipe.
- Duplicate-hero fix: entry-tiles renders exactly ONE VeyrnoxLogo and ONE wordmark.
- Back-button chip: grep test asserts zero `text-xs text-muted-foreground` classes remain in back-button JSX (via `data-testid="back-button"` at 5 sites with new class).

## Security invariants preserved

- **I1** keys-on-device — unchanged.
- **I2** no silent egress — nag is UI only, no network.
- **I3** deniability — nag scheduler no-ops in decoy/demo at BOTH read and write chokepoints (K-2). Nag never appears in decoy; decoy session never mutates real-session nag counters.
- **I4** fail honest — copy describes today's `.enc` file model, not Shamir spec.
- **PIN-first** — unchanged.

## Honest copy (locked strings) — Codex P1 #1 fix

Ground-truth from `PersonalBackup.jsx:88`: `canExport = password.length >= MIN_PASSWORD_LENGTH && pin.length >= 8 && pin === pinConfirm`. Backup is decryptable by **backup password OR backup PIN** (either one, per `runExport` verify path). No QR export path exists.

- Headline: `WALLET` / `Created.`
- Sub: `Your keys were generated and encrypted on this device. Your seed never leaves it.` (Codex v12 P1 fix — "nothing left your phone" was dishonest: `createWallet`/`importWallet` fire an anonymous device-id ping to the referral backend via `initCode(generateServerCode)` at `WalletProvider.jsx:949, 994`. That's not seed material — I1 holds — but the "nothing" claim doesn't. Copy now names the invariant we actually keep: keys/seed on-device.)
- Callout title: `Set up Personal Backup`
- Callout body: `Encrypted backup file. You set a backup password and a backup PIN — either one decrypts the file. Store at least one safely.`
- Primary CTA: `Set up Personal Backup`
- Secondary CTA: `Skip for now — take me to my wallet`
- Fine print: `Advanced: view raw seed later under More → Show recovery phrase`

**Pending-confirmation nag copy (post-download, awaiting user confirm on PersonalBackup):**
- Callout title: `Confirm your backup`
- Callout body: `You started an encrypted export. Open the file where you saved it, unlock with your backup password or backup PIN, then tap "I saved it" on the backup screen.`
- Primary CTA: `Open backup screen`
- Secondary CTA: `Not now`

## Non-goals

- No Shamir/2-of-3 implementation.
- No changes to IMPORT flow.
- No changes to `/personal-backup` page structure — only add success hook.
- No changes to Advanced restore-file path.
- No mainnet flag changes.

## Codex plan-review v2 fixes (defence + resolutions)

- **v2 P1 (a) browser export still marked complete prematurely** — fixed. Implementation step 5 now explicitly splits by platform: iOS calls `markBackupCompleted()` only when the OS returns `result.saved === true`; web/desktop calls `markBackupPendingConfirmation()` and requires a `Yes, I saved it` click before promoting to `completed`. Regression test pins the state machine.
- **v2 P1 (b) completion insufficiently scoped — DEFENDED, not accepted.** Veyrnox is Model B (single HD seed, per `CLAUDE.md` §Wallet model). Backups export the encrypted seed — every derivable account (`deriveAccounts()` in `WalletProvider.jsx:793`) comes from that seed deterministically. Adding derived accounts does NOT invalidate a prior backup because the seed already contains them. The only mutations that DO invalidate are: (1) `importWallet` with a different seed (new seed → new first EVM address → fingerprint mismatch, correctly invalidates), (2) `createWallet` after a wipe (same). First-EVM-address hash therefore IS a correct fingerprint under Model B. Wiring `onVaultKeySetChanged()` remains — it fires on `createWallet` / `importWallet` / `resetWalletState` (already-central chokepoints in `WalletProvider.jsx`), with a fail-closed test asserting that a new seed after an existing backup returns `shouldShowBackupNag() === true`. If Veyrnox ever switches from Model B to multi-seed, revisit.
- **v2 P2 (c) sessionStorage key in wrong panic list** — fixed. `veyrnox-backup-nag-session-skip` goes into `SESSION_RESIDUE_KEYS` at `panic.js:369`; the two localStorage keys stay in `METADATA_RESIDUE_KEYS`. Split regression tests per backend.
- **v2 P2 (d) "remember both" contradicts "either one decrypts"** — fixed. Copy rewritten to `Store at least one safely.`

## Codex plan-review v1 fixes (resolutions)

- **P1 #1 dishonest copy** — fixed. New copy names backup password + backup PIN, drops "PIN decrypts it" and "print as a QR". Grounded in `PersonalBackup.jsx:88, 99`.
- **P1 #2 global completion bit** — fixed. Vault-fingerprint scoped state. `onVaultKeySetChanged()` invalidates on key-set mutation. Recon TODO in implement step: find all wallet-add call sites and wire the hook.
- **P1 #3 browser download ≠ verified** — fixed. Two-tier `pending_confirmation → completed` state. Web path only reaches `completed` via explicit user "I saved it" click on PersonalBackup page. iOS `result.saved:true` still jumps straight to `completed` (already a real signal).
- **P1 #4 scheduler race** — fixed. `recordUnlock()` sole mutation point, ref-guarded once-per-unlock-transition. StrictMode-safe. Single-tab expectation stated.
- **P2 #5 I3 write leak** — fixed. All storage mutations routed through `backupNag.js`. Grep-guard test asserts zero external writes to the 3 key names.
- **P2 #6 wrong panic file** — fixed. Keys added to `src/wallet-core/panic.js` `METADATA_RESIDUE_KEYS` (line 264), not `WalletEntry.jsx`.

## Open honest gaps (record in Feature-Status on ship)

- Copy assumes today's `.enc` file model. Shamir 2-of-3 spec exists but is not shipped. When Shamir ships, revisit copy.
- Nag cadence (5 unlocks OR 3 days) is a first guess. Not tuned against user data. Comment as `ponytail: heuristic, tune with real usage`.
- BackupNagSheet is post-unlock only. Does not re-fire on same-session app foreground return.
