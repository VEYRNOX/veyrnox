# Open issue closure checklist - 2026-09-25

Snapshot: seven open issues, checked against GitHub and main `4a39a87e`.
This is a test plan, not a record of completed device tests. Use production-mode
native builds for acceptance. No store submission is required by this checklist
without the owner's release instruction. Code PRs must reference issues without
auto-closing them while acceptance evidence remains outstanding.

## Evidence to record for every run

- Device model, OS, app version/build, native commit and any installed OTA version.
- Install source (Play internal, TestFlight, or locally signed release artifact).
- Exact steps, expected result, actual result, time in UTC, and pass/fail.
- Sanitized logs or storage key/count checks. Never record PINs, seeds, hardware
  factors, vault contents, customer identifiers, or tokens in public evidence.
- Use disposable wallets with no funds for wipe and passcode-removal tests.
  Check restoration materials before removing security from any device.
- Keep demo mode off. A fresh real wallet should have zero balances; simulated
  sends or a demo banner invalidate production acceptance evidence.

## #2750 - R8 optimization and resource shrinking

Status: configuration change proposed in this branch; hardware tests pending.

Local validation: web build and Capacitor sync passed; 13 existing release and
configuration tests passed; release-hygiene/RASP-bypass checks passed. Java 21
`:app:minifyGoogleReleaseWithR8` completed (239 tasks) and produced a mapping,
resource report and resolved configuration without `-dontoptimize`. This was
compile/shrink validation only, not a signed installable release or an AAB
mapping comparison. R8 emitted stack-map warnings from the transitive Amazon
Appstore SDK; no physical device was connected. Keep hardware acceptance open.

1. Review the optimizing default ProGuard file and AGP 8.13 resource-shrinking
   flag. AGP 9 is a separate compatibility upgrade, not a prerequisite for these
   two settings. Record whether its recommendation will be separately tracked
   before treating all of this issue's scope as complete.
2. Review reflection rules against actual installed Capacitor annotations.
   `PluginMethod` lives in `com.getcapacitor`, while activity and permission
   callbacks live in `com.getcapacitor.annotation`. Preserve constructors,
   callbacks and the JNI method/class names used by the RASP native library.
3. Build the production-mode Google release APK and AAB with the real intended
   signing configuration. Keep the artifact SHA and corresponding source SHA.
4. Confirm R8 completed and the resolved configuration has no `-dontoptimize`.
   Check the resource shrinker completed. Compare the nonempty generated
   `mapping.txt` byte-for-byte with
   `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` in the AAB.
   The CI guard in this branch performs that comparison and retains diagnostics.
5. Install the correctly signed release on a physical Android device. Complete
   create/import, PIN unlock, biometric cancellation and successful unlock,
   hardware KEK enrollment and cold restart, backup save/open, and the enclave
   operations exposed by the app. Confirm there are no missing-plugin errors.
6. On a disposable test installation, exercise the existing induced RASP-failure
   procedure for this build. Confirm the expected native block and that wallet
   interaction/signing is unavailable. A normal launch alone does not test this.
7. Test every distributed store flavor affected by the shared release settings;
   Google-device results alone do not establish Huawei/Samsung/F-Droid behavior.
8. After review and passing acceptance, squash-merge. A future authorized Play
   release needs a fresh versionCode. Check its recommendations when processed.
   Leave unresolved AGP/Play recommendations explicitly tracked rather than
   claiming that all three warnings are necessarily cleared.

Sources: [Android optimization setup](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)
and [mapping-file packaging](https://developer.android.com/topic/performance/app-optimization/troubleshoot-the-optimization).

## #2749 - Edge-to-edge warnings

Status: diagnosis/device evidence pending; this branch corrects misleading comments
and adds mapping retention, but does not claim to repair visual behavior.

1. Recheck the current Play release. Repository release records now identify
   versionCode 57 as shipped; the issue's warning was recorded against 56.
   Record which version actually displays the warning today.
2. Obtain the exact mapping for the artifact named in that warning. Resolve
   `p50.a`, `q50.a`, `v50.a`, `z50.a` only against the version-56 mapping if the
   warning still refers to 56. A rebuilt or version-57 mapping is not equivalent.
3. Identify the owning app/dependency classes and the API-level conditions under
   which they call the deprecated APIs. Obfuscated names alone do not prove
   dependency ownership or prove that Play lacks a mapping file.
4. Test a physical Android 15+ device in gesture and three-button navigation:
   onboarding, unlock, wallet, send confirmation, settings, bottom sheets,
   keyboard open/closed, rotation where supported, and the RASP block screen.
   Check top text and bottom controls remain visible and tappable; record results
   without disabling screenshot protection on the production app.
5. If overlap reproduces, fix its actual inset/layout owner in a focused PR,
   build again, and repeat the affected matrix. If a dependency causes the
   deprecated calls, assess an upstream update independently of visual overlap.
6. Close only with the tested version and resolved warning explanation. A clean
   screenshot alone does not explain the deprecated API warning. If an upstream
   issue remains, explicitly document the accepted residual and tracking link.

## #2715 - iOS smoke-test flakiness

Status: draft PR #2764 fixes a concrete PIN mismatch-recovery defect found on September 25.
The test searched for obsolete mismatch text and considered disappearance of
the confirmation heading sufficient, even when the first PIN stage returned.

1. Merge the focused mismatch-recovery fix after review and targeted tests.
   It must retry when the first PIN stage returns, rather than report success.
2. Validate the mismatch path and normal path in the iOS test harness. Keep
   unsigned-Keychain tests honestly named; these do not verify device security.
3. Run at least 30 smoke executions against one unchanged main SHA containing
   the fix. Record SHA, run URL, outcome, failing test and failure signature.
   Exclude cancellations from the denominator and show their count separately.
4. Require zero secure-store-timing failures, as specified by the issue. Use
   zero unexplained failures as the proposed overall acceptance threshold;
   obtain an explicit decision if a nonzero flake allowance is desired.
5. Investigate remaining missing-banner, startup, accessibility IPC, termination
   and timeout failures independently. Preserve screenshots/AX artifacts and
   test results; increasing sleeps is not evidence of a root-cause fix.
6. Close with the fixed-SHA run report and explanation of every failure.

Read-only sample on September 25: after the September 21 rename, 15/42
non-cancelled runs failed (35.7%), with seven cancellations. Main alone failed
9/18. Different SHAs were involved, so this is diagnosis, not the acceptance run.

## #2714 - Physical iPhone device-security gate

Status: CI description correction merged in #2723; hardware evidence pending.

1. Install the relevant production-mode build on a disposable physical iPhone.
   Record the build and ensure there is no wallet whose keys could be lost.
2. Disable the device passcode and biometrics. Relaunch the app.
3. Attempt wallet creation. Require the specific message:
   "Please set a device passcode or biometric before creating a wallet."
4. Independently attempt import with a disposable seed. Require the same gate;
   a generic "couldn't finish securely" error does not establish this result.
5. Confirm neither attempt creates a usable wallet or leaves provisioned key
   material. Capture sanitized diagnostic evidence where available.
6. Re-enable device security and confirm normal creation/import succeeds.
7. Attach both negative and positive results, then close. Simulator and unsigned
   Keychain failures cannot substitute for this physical-device test.

## #2713 - Chaff written after panic wipe

Status: fix #2725 merged, harness regression/mutation tests passed; device pending.

1. Install a production-mode build containing #2725 on a disposable device.
2. Create a throwaway wallet and immediately invoke the supported panic wipe.
3. Wait for all background provisioning to finish. Confirm clean storage using
   the existing key-material inspection facilities in an appropriate test setup.
   Check IndexedDB, local/session storage and native secure-store key presence;
   an empty wallet screen alone is insufficient.
4. Restart the app and repeat the check. No chaff should reappear.
5. Repeat for import and file restore; exercise incomplete-onboarding discard
   as well. Preserve separate results for each entry point.
6. If manual actions miss the race window, use a controlled device test harness
   to order wipe during provisioning. Record that limitation and do not call a
   slow manual wipe proof of the original race.
7. Attach timing and sanitized storage evidence, then close. If release storage
   cannot be inspected, record that evidence gap rather than bypass protection.

## #2676 - Advisor cold-start entitlement checks

Status: #2726 merged and previously deployed; meaningful observation pending.

1. Verify the currently deployed function still has the independent timeout
   budgets and safe diagnostic logs; do not assume September 21's v43 is current.
2. Use a legitimate entitled test account in a real session to ask an Advisor
   question after idle, then another immediately. Record streaming result and
   latency. Idle alone does not prove a cold isolate; correlate boot/execution
   logs when distinguishing cold from warm requests.
3. Repeat across several days and include non-entitled controls. They must be
   denied without access to the upstream answer. Each RevenueCat call gets 3s;
   the pair may take more than 3s overall after the fix.
4. Count actual tip-chat POST requests as well as timeout/network/upstream-error
   logs. Investigate every unexplained entitled denial. Zero errors with zero
   traffic does not establish success.
5. Record the traffic sample, observed time window, current deployment and any
   residual failures. Close when the issue's several-day real-traffic criterion
   is met. The old promotional grant's recorded expiry was September 21; do not
   require manual revocation of an already expired grant.

September 25 read-only check: September 22 had one tip-chat GET returning 405,
and no POSTs. September 23 and 24 had no function traffic in the returned logs.
This does not supply the needed entitled-traffic sample. No production changes
or new promotional entitlements were made during this check.

## #2639 - First referral must remain pending

Status: first-write-wins #2644 and redemption retry #2727 merged; device pending.
The September 25 code review also found that native DeepLinkHandler discarded
the `already_pending` result, so the second-link explanation was absent on that
route. A focused follow-up PR supplies it before device acceptance.

1. Prepare two real, valid referral codes A and B with recorded baseline counts.
   Do not use the example placeholder code from the UI.
2. Start on a disposable fresh installation and confirm a new device ID. Do not
   assume uninstall clears iOS Keychain state; verify freshness explicitly.
3. Apply A, then open B before the first primary-wallet unlock. Record whether
   the second-code explanation is visible and that pending attribution stays A.
4. Complete onboarding and unlock the primary wallet. Compare production results:
   exactly one increment for A, none for B, associated with the new test device.
5. Reopen A and B, lock/unlock and restart. No additional increment should occur.
6. With isolated test sessions, try referral entry in decoy, hidden and demo
   modes. Confirm no real referral state or attribution event is created.
7. If any route lacks the explanation or violates first-write-wins, reproduce
   that route in a focused code test and fix it before closure. Otherwise attach
   sanitized app/backend evidence and close; no duplicate implementation PR.
