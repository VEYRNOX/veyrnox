# Runbook — iOS Hardware KEK device session (Mac day)

**Drafted:** 2026-07-06 (plan, not evidence — nothing below has been executed)
**Requires:** a Mac with Xcode (iOS 26 SDK) + Apple developer signing, the iPhone 17
Pro Max, USB cable. This session CANNOT run from the Windows environment.
**Companion docs:** `docs/hardware-audit-handoff.md` §A (iOS-F5/F3 acceptance
criteria), `docs/audit-2026-07-01-kek-internal.md`, `docs/Feature-Status.md` §4.

## Why this is a Mac day (build-first, not capture-first)

The SE-trace instrumentation that iOS-F9 needs (`[VEYRNOX-KEK]` os_log lines,
subsystem `com.veyrnox`, category `HardwareKek` — `ios/App/App/HardwareKekPlugin.m:37-56`)
landed on main 2026-07-04 (`41aa806f`), AFTER the build installed on the test iPhone
during the 2026-07-01/02 verification. The installed app has only NSLog, which is not
reliably streamable on iOS 26 — that is why the F9 trace was never captured. There is
no way to close F9 against the installed build; the session starts with a rebuild,
which also compiles the merged-but-never-built iOS-F5/F3 patches (#526/#531).

| # | Item | Current status | This session's bar |
|---|------|----------------|--------------------|
| P1 | iOS-F9 (HIGH, evidence gap) — SE-unlock trace never captured | Architectural proof only; iOS device-verified PARTIAL | Contemporaneous `[VEYRNOX-KEK]` unlock trace + coreauthd/ctkd correlation, tied to a KEK-gated send |
| P2 | iOS-F5 (HIGH) — H in NSData not zeroed | ObjC text edit on main, never compiled | Builds clean + device behavior per handoff §A |
| P3 | iOS-F3 (MEDIUM) — deprecated kSecUseOperationPrompt → LAContext | Same state as F5 | Same bar |
| P4 | H-2/iOS-F11 iOS half — biometric re-enroll invalidation | ACL flag in code; runtime test device-blocked (Face ID enrollment restricted) | Re-enroll → key invalidated → fail-closed → recovery, mirroring Android PR #516/#518 |

**Honesty bars, fixed up front:**
- Closing F9 is PROSPECTIVE: the new trace proves the SE path executes for the NEW
  unlock/send. The two 2026-07-01/02 sends keep their architectural + OS-daemon META
  proof basis — do not retro-promote them.
- iOS flips from device-verified PARTIAL to full ONLY if P1 AND P4 both pass. P2/P3
  passing alone does not move the headline status.
- Everything stays INTERNAL. Independent audit unaffected.

---

## Phase 0 — pre-session gates (do before booking the Mac)

1. **Face ID restriction diagnosis (unblocks P4):** on the iPhone, check
   Settings → Screen Time → Content & Privacy Restrictions → "Passcode & Face ID"
   (or equivalent on iOS 26). If it is a Screen Time restriction, lift it for the
   session and restore after. If the device is MDM-supervised and the restriction is
   profile-enforced, P4 needs a different, unrestricted iPhone — decide this BEFORE
   the Mac day so the session isn't half-wasted.
2. **Signing:** confirm the Apple developer team used for the 2026-07-01 install is
   available; same team + bundle id means the reinstall keeps Keychain data (see
   Phase 2 vault note).
3. **Testnet ETH:** ensure the iOS test vault's Sepolia address is funded (needed for
   the P1 correlated send).
4. Print/open `docs/hardware-audit-handoff.md` §A — it is the acceptance list for P2/P3.

## Phase 1 — build current main and install

1. `git pull` on main; `npm ci && npm run build && npx cap sync ios`.
2. Open in Xcode. Build must compile `HardwareKekPlugin.m` with ZERO deprecation
   warnings about `kSecUseOperationPrompt` (P3 acceptance starts at compile time) and
   with the F5 `NSMutableData` zeroing present (`34289591` + `b1b4a715` fixups).
3. Install to the iPhone over the existing app (same team/bundle — do NOT delete the
   app: Keychain items, including the SE key reference and vault ciphertext, persist
   across reinstall, and keeping the existing enrolled vault gives P1 continuity with
   the 2026-07-01 evidence vault).
4. Smoke check: app launches, vault present, badge unchanged. If the vault did NOT
   survive (fresh-install state), note it and fall back to a fresh throwaway
   enrollment — P1 evidence then applies to the new vault only (record which).

## Phase 2 — P1: iOS-F9 SE-unlock trace + correlated send

1. On the Mac, start capture BEFORE touching the app:
   `log stream --device --info --predicate 'subsystem == "com.veyrnox"' > veyrnox-kek.log`
   and a second, broader stream for daemon correlation:
   `log stream --device --info --predicate 'process IN {"coreauthd","ctkd","biometrickitd"}' > daemons.log`
   (If daemon lines come out `<private>`, install Apple's LocalAuthentication/Security
   logging profiles from developer.apple.com/bug-reporting/profiles-and-logs and
   repeat — note in evidence whether a profile was needed.)
2. Unlock the KEK vault (PIN + Face ID). Expected `[VEYRNOX-KEK]` sequence
   (`HardwareKekPlugin.m:250-326`):
   - `getHardwareFactor: loaded ciphertext … bytes, retrieving SE key…`
   - `getHardwareFactor: SE key retrieved, decrypting (Face ID prompt now)…`
   - `getHardwareFactor: SUCCESS — Face ID passed, H recovered (32 bytes)`
   with coreauthd/biometrickitd evaluation lines for the app's pid between the second
   and third line. That interleaving IS the literal SE-unlock app-trace F9 asks for.
3. With capture still running: full UI-path KEK-gated Sepolia send. Owner records the
   txid after explorer confirmation. The trace + txid time-correlation is the P1
   evidence package.
4. Cold-start the app (swipe away, relaunch) and repeat the unlock once — two traces,
   one session, same vault.
5. Negative check (fail-closed on cancel): trigger unlock, CANCEL the Face ID prompt →
   expect `DECRYPT FAILED` line and NO unlock, no fallback. (I4 check; also exercises
   the F3 LAContext path's error branch.)

**P1 pass:** steps 2–5 all as expected, txid confirmed. iOS-F9 recorded CLOSED
(prospective) with the log artifacts.

## Phase 3 — P2/P3: iOS-F5 + iOS-F3 device verification

Work through `docs/hardware-audit-handoff.md` §A verbatim; at minimum:
- [ ] Build clean of the deprecated-API warning (P3).
- [ ] Enroll/unlock/unenroll cycle works end-to-end on the new build (regression bar —
      the ObjC edits must not have broken the flow; this is their first compile).
- [ ] F5: code-inspection sign-off that the shipped binary's source zeroes H via
      `NSMutableData` on all paths (device-side memory inspection is out of scope —
      record honestly that verification is source + build level, not a heap dump).
- [ ] F3: Face ID prompt presents via LAContext (`reuseDuration=0`) — observable as a
      fresh biometric prompt on EVERY unlock, no grace-period reuse. Verify two
      back-to-back unlocks both prompt.

**Status language if green:** iOS-F5/F3 move from "code-complete, not compiled" to
"device-verified (INTERNAL)". If the build surfaces problems, they become dated
findings; do not ship a partial fix silently.

## Phase 4 — P4: biometric re-enrollment invalidation (needs Phase 0 gate passed)

Mirrors the Android evidence (PR #516/#518). Use a THROWAWAY testnet vault if the
evidence vault matters for continuity — this test intentionally destroys the KEK wrap.

1. Baseline: KEK-enrolled vault unlocks with Face ID + PIN. Capture os_log as in P1.
2. Settings → Face ID & Passcode → "Set Up an Alternate Appearance" (or Reset Face ID
   + re-enroll — record which; both change the enrolled set).
3. Attempt vault unlock. EXPECTED (`.biometryCurrentSet` ACL, `HardwareKekPlugin.m:13`):
   SE key invalidated → decrypt fails → app fails CLOSED with the honest error path —
   NO unlock, no silent bare fallback.
4. Recovery: seed-phrase (or documented PIN recovery) path restores access; fresh KEK
   enrollment on the new biometric set succeeds; unlock works again.
5. Restore the device's Face ID state and any Screen Time restriction lifted in Phase 0.

**P4 pass:** step 3 fails closed and step 4 recovers. H-2/iOS-F11 iOS half moves to
RESOLVED / device-verified (INTERNAL) — the last half-open finding of that pair.

## After the session — recording rules

- Append dated entries to `docs/audit-2026-07-01-kek-internal.md` (iOS-F9, iOS-F5,
  iOS-F3, H-2/iOS-F11 rows) — regression history and the old proof-basis notes stay.
- `docs/Feature-Status.md` §4 + `CLAUDE.md`: iOS headline moves to device-verified
  (full) ONLY if P1 and P4 both passed; otherwise it stays PARTIAL with the passed
  items individually annotated.
- Evidence pack: both log captures (redact nothing from `[VEYRNOX-KEK]` lines — they
  carry no key material by design; ciphertext LENGTHS only), txid (owner-supplied),
  timestamps, Xcode build settings screenshot for the P3 warning check.
- The two historical iOS sends remain META/non-promoting evidence. Independent audit
  remains outstanding.

## Abort criteria

Any unlock failure on the NEW build against the surviving vault that the plan doesn't
predict → stop, capture logs, do NOT unenroll/re-enroll to "fix" it (that would
destroy the evidence vault). A build that won't compile the F5/F3 edits → P2/P3 become
findings; P1 can still proceed by reverting `HardwareKekPlugin.m` to the last
compiling state WITH the os_log commit (`41aa806f`) — F9 capture must not be lost to
an unrelated build fight.
