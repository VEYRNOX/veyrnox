// AppUITests.swift
//
// Minimal XCUITest smoke. Walks the current first-run flow — consent →
// "New wallet" tile → 8-digit PIN → confirm PIN — and hard-fails if the
// KEK/RASP fail-closed banner ever appears (that banner is the exact string
// Play rejected build 5 for under Broken Functionality policy).
//
// Every label below is UI copy, which means this file rots silently whenever
// the app's copy changes. It already did once: Slice D1 replaced the welcome
// hero with entry tiles on 2026-08-10 and this test kept waiting for a button
// that no longer existed (#2109). If you change a label here, change it in
// src/__tests__/firebase-test-lab-onboarding.test.js too — that guard runs on
// every PR and is what catches the drift while this suite is unreliable.
//
// Run locally with `xcodebuild test` against a booted simulator or a paired
// device. Runs in CI via .github/workflows/ios-xcuitest-smoke.yml. Real-
// device crash + hang signal for shipped builds still comes from TestFlight
// Crashes and Xcode Organizer → Metrics / Hangs; this smoke is the
// pre-submission catcher for the reviewer-tap failure mode.

import XCTest

final class AppUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Hand-off between tests, on EVERY exit path. XCUITest relaunches by
    /// killing the previous instance, and on four CI runs (#2543:
    /// 34483371568, 34598062623, 34625908307, 34643353906) that kill failed
    /// within ~1 s — "Failed to terminate com.veyrnox.app:<pid>" — so the next
    /// test died inside launch() with no screenshot. Doing it here attributes
    /// any such failure to the test that left the process. It must be teardown,
    /// not the end of a test body: continueAfterFailure = false aborts the body
    /// on the first failed assertion, which would skip a body-level terminate
    /// and hand the next test a live process again.
    override func tearDownWithError() throws {
        let app = XCUIApplication()
        guard app.state != .notRunning else { return }
        app.terminate()
        XCTAssertTrue(
            app.wait(for: .notRunning, timeout: 30),
            "App did not reach .notRunning within 30s of terminate() in teardown. Harness/runner hand-off failure (#2543), NOT an app result."
        )
    }

    /// Unsigned-build smoke — NOT a test of the DEVICE_NOT_SECURE
    /// passcode/biometric gate. `.github/workflows/ios-xcuitest-smoke.yml`
    /// builds this target with `CODE_SIGNING_ALLOWED=NO`, so the binary has
    /// no `__entitlements` section and every Keychain write fails with
    /// errSecMissingEntitlement (-34018) regardless of device state. This
    /// asserts onboarding fails closed on THAT error. It cannot exercise the
    /// real gate: Simulator's `.deviceOwnerAuthentication` reports the
    /// device as secure unconditionally, so `checkBiometry()` never returns
    /// false here (#2714). Verifying the real gate needs a physical device
    /// with passcode and biometrics disabled.
    func test_unsignedBuildKeychainWriteFailsClosed() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--uitest-fresh-install"]
        app.launch()
        snap(app: app, name: "create-01-cold-launch")

        // A Capacitor app renders inside a WKWebView; XCUITest matches HTML
        // buttons by their aria-label OR visible text. Every predicate below
        // matches BOTH via NSPredicate on `label` (label reflects both).
        // 1. Startup coordinator — race the entry tile against any consent
        //    screen that may appear ahead of it. Two prior sequential probes
        //    ("No thanks" for telemetry, "Not now" for biometric) burned up to
        //    12 s of wall clock before the 15 s entry-tile wait even started
        //    (#2477), leaving cold WKWebView paints indistinguishable from
        //    consent-state faults. This waits for whichever surface actually
        //    renders first, dismisses any consent seen, and loops until the
        //    entry tile is visible — one fixed budget, deterministic dwell.
        waitForEntryTile(app: app, tile: "New wallet")
        snap(app: app, name: "create-02-entry-tiles")

        // 2. Entry tiles — the fresh-device landing. Slice D1 (2026-08-10)
        //    replaced WelcomeHero's single "Get Started" action with a 4-tile
        //    picker; "New wallet" is the create path and hands off to
        //    PIN-create exactly as Get Started used to. WalletEntry.jsx still
        //    contains the old hero, but its `view === "welcome"` branch is
        //    documented there as dead — "no live path sets this view any
        //    more" — so the button this test used to wait for could never
        //    appear. It waited 15s for it on every run from 2026-08-10 until
        //    #2109, and nobody saw, because the job never completed.
        //
        //    The label is EntryTiles.jsx's explicit `aria-label={label}`, so
        //    the accessible name is exactly this string rather than a
        //    concatenation of the tile's title and subtitle. Source of truth
        //    is the TILES array in src/components/EntryTiles.jsx, and the
        //    guard in src/__tests__/firebase-test-lab-onboarding.test.js ties
        //    the two together so they cannot drift apart again.
        //
        //    Android's Robo script already clicked "New wallet"; only iOS was
        //    left behind. Both platforms render the same web UI — if these two
        //    ever disagree again, one of them is wrong.
        //
        //    Retry-on-no-advance: the first press against a cold WKWebView
        //    on iOS 26 Simulator is intermittently swallowed at the click
        //    layer (run 33529062151: PIN pad never rendered despite the
        //    press succeeding at the AX layer). If the PIN pad hasn't
        //    appeared shortly after the tap, re-press the tile before the
        //    enterPin helper's own wait times out. Cheap and honest — the
        //    tile is idempotent, a second press produces no user-visible
        //    change if the first landed.
        tapButtonUntilAdvanced(
            app: app,
            label: "New wallet",
            waitFor: app.buttons["1"],
            appearTimeout: 15,
            perAttemptWait: 6,
            maxAttempts: 3,
            failureMessage: "Entry tiles / 'New wallet' never advanced to the PIN pad."
        )
        snap(app: app, name: "create-03-pin-pad")

        // 3. PIN pad: 8 digits, then tap the submit button. PinPad's submit
        //    aria-label tracks its visible submitLabel (defaults to "Continue").
        // Must satisfy PinSetup's strength guard: sequential patterns such as
        // 24681024 are intentionally rejected before the confirmation step.
        let pin = "19283746"

        // 4. Both stages, with recovery. See setPinCeremony's own notes for why
        //    a swallowed digit press cannot be detected per-digit and is instead
        //    recovered by re-running the ceremony.
        setPinCeremony(app: app, pin: pin)

        // 5. This build is unsigned (CODE_SIGNING_ALLOWED=NO), so it has no
        //    __entitlements section and every Keychain write fails with
        //    errSecMissingEntitlement (-34018) — the same failure regardless
        //    of Simulator passcode/biometric state, which
        //    .deviceOwnerAuthentication reports as satisfied unconditionally
        //    on Simulator anyway (#2714). The only honest outcome here is an
        //    explicit fail-closed result with no usable wallet; the real
        //    DEVICE_NOT_SECURE gate is real-device-only (#2714). See
        //    assertFailedClosed for what that outcome now looks like on
        //    screen, and why it stopped being "the entry tiles came back".
        assertPinFlowLeftPinSetup(app: app)
        assertFailedClosed(app: app, action: "create")
        snap(app: app, name: "create-04-post-fail-closed")
    }

    /// Import counterpart to test_unsignedBuildKeychainWriteFailsClosed:
    /// same unsigned-build Keychain-write failure, not the DEVICE_NOT_SECURE
    /// gate — see that test's doc comment for why (#2714).
    func test_unsignedBuildImportKeychainWriteFailsClosed() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--uitest-fresh-install"]
        app.launch()
        snap(app: app, name: "import-01-cold-launch")

        // Same startup coordinator as the create path — see the create test
        // for the rationale (#2477).
        waitForEntryTile(app: app, tile: "Have a wallet")
        snap(app: app, name: "import-02-entry-tiles")
        // Same retry rationale as the create path.
        tapButtonUntilAdvanced(
            app: app,
            label: "Have a wallet",
            waitFor: app.buttons["1"],
            appearTimeout: 15,
            perAttemptWait: 6,
            maxAttempts: 3,
            failureMessage: "Entry tiles / 'Have a wallet' never advanced to the PIN pad."
        )
        snap(app: app, name: "import-03-pin-pad")

        let pin = "19283746"
        setPinCeremony(app: app, pin: pin)
        assertPinFlowLeftPinSetup(app: app)
        snap(app: app, name: "import-04-seed-entry")

        let words = [
            "abandon", "abandon", "abandon", "abandon",
            "abandon", "abandon", "abandon", "abandon",
            "abandon", "abandon", "abandon", "about",
        ]
        for (index, word) in words.enumerated() {
            let field = app.textFields["Recovery phrase entry \(index + 1)"]
            XCTAssertTrue(field.waitForExistence(timeout: index == 0 ? 15 : 3), "Seed word box \(index + 1) never appeared.")
            focusTextField(app: app, field: field, name: "Seed word box \(index + 1)")
            field.typeText(word)
        }
        // Confirmed press, not a single tap (#2543, run 34825618785): one press
        // with the keyboard still focused on word 12 never submitted. The
        // failure screenshot + AX tree showed the filled form, no banner and no
        // dashboard, so the fail-closed path was never exercised at all.
        pressUntilAccepted(app: app, label: "Restore / Import", accepted: { failClosedBanner(app: app).exists })

        // Same terminal check as the create path.
        assertFailedClosed(app: app, action: "import")
        snap(app: app, name: "import-05-post-fail-closed")
    }

    // MARK: - helpers

    /// Run PinSetup's two-stage ceremony — set, then confirm — and re-run the
    /// whole thing if the confirm stage came back mismatched.
    ///
    /// Why not verify each digit press instead: PinPad's position dots are
    /// `aria-hidden="true"` ON PURPOSE (src/components/security/PinPad.jsx,
    /// Codex P3 2026-08-15) so assistive tech cannot count keystrokes and learn
    /// the PIN length, and the submit button is deliberately NOT gated on a
    /// digit count for the same reason ("carries no length oracle", §9 line-item
    /// 5). So there is no per-digit progress signal available to XCUITest, and
    /// there must not be one — publishing the dots to satisfy this test would
    /// weaken a deliberate anti-oracle control to make CI greener. That trade is
    /// not available.
    ///
    /// What IS observable is the stage transition: PinSetup renders an `<h2>`
    /// of "Choose an 8-digit PIN" at stage one and "Confirm your PIN" at stage
    /// two, and on a mismatch it clears BOTH buffers and returns to stage one
    /// (PinSetup.jsx:86). So a swallowed digit press is not detectable when it
    /// happens, but its consequence is — and because the reset clears both
    /// buffers, the recovery is simply to run the ceremony again from the top
    /// rather than to re-press individual keys (which would risk entering a
    /// digit twice and desyncing in the other direction).
    ///
    /// Bounded at 3 attempts, and the bound is a TIME budget, not a taste
    /// judgement. Three attempts exceeded the former 300s allowance in run
    /// 33623177119 and reported "Executed 0 tests", losing the assertion.
    /// The allowance is now 600s; run 34622660295 used 320s for two failed
    /// attempts, leaving room for one final retry under the 1000s watchdog.
    ///
    /// If all attempts are consumed the caller's assertPinFlowLeftPinSetup()
    /// reports the desync honestly rather than letting it masquerade as a
    /// fail-closed provisioning result.
    private func setPinCeremony(app: XCUIApplication, pin: String, maxAttempts: Int = 3) {
        let confirmHeading = app.staticTexts["Confirm your PIN"]
        let mismatch = app.staticTexts["PINs didn't match. Start again."]
        // PinSetup's stage-one rejection copy for a lost-digit buffer. Source of
        // truth is checkPinStrength in src/lib/pinStrength.js; the copy-drift
        // guard in src/__tests__/firebase-test-lab-onboarding.test.js checks
        // both strings against it.
        let padRejected = app.staticTexts.matching(
            NSPredicate(format: "label == %@ OR label == %@", "Use at least 8 digits.", "Enter a numeric PIN.")
        ).firstMatch

        for attempt in 1...maxAttempts {
            enterPin(app: app, digits: pin, stage: "set")

            // A swallowed submit press does not advance, so it is re-pressed.
            // A SHORT buffer (dropped digit presses) does not advance either,
            // but PinSetup has already rejected it and cleared the pad
            // (PinSetup.jsx `setRealPin("")`), so a re-press submits nothing and
            // only earns "Enter a numeric PIN." — run 34643406215 spent ~50 s
            // doing that before an AX-snapshot stall killed the test (#2543).
            // `rejected` short-circuits straight to a fresh ceremony instead.
            guard submitPinUntilAdvanced(app: app, stage: "set", advanced: { confirmHeading.exists }, rejected: { padRejected.exists }) else {
                NSLog("[VEYRNOX-XCUITEST] PIN attempt \(attempt): stage one never advanced to confirm; retrying")
                clearPinPadIfPossible(app: app)
                continue
            }

            enterPin(app: app, digits: pin, stage: "confirm")

            // The confirm submit needs the same treatment, and until run
            // 33626090694 it did not get it. There, the press at t=452.7s was
            // swallowed at the WebKit layer, PinSetup stayed on screen with all
            // eight dots filled through the entire 45s window (frames at t=470s
            // and t=505s are identical), and the flow fell through to the
            // fail-closed assertion — which then accused the app of having
            // provisioned a wallet without a secure store. Nothing had been
            // provisioned; the submit press simply never landed.
            //
            // Done means PinSetup is gone (success) OR the mismatch banner is
            // up (reset — the outer loop's job, not this one's).
            // Kept on ONE line, with the predicate hoisted, so the call site
            // stays greppable for the drift guard in
            // src/__tests__/firebase-test-lab-onboarding.test.js: that guard
            // matches call-site text and asserts stage ordering. Splitting this
            // across lines forces the guard to match raw indentation and the
            // whole predicate body instead, which is how it looked before.
            // Do NOT quote the matched call text in a comment anywhere in this
            // file — the guard greps the entire source, so a comment containing
            // it satisfies the guard on its own and the check keeps passing
            // with the real call deleted. That was caught by mutation-testing
            // an earlier draft of this very block.
            let confirmDone: () -> Bool = { !confirmHeading.exists || mismatch.exists }
            let left = submitPinUntilAdvanced(app: app, stage: "confirm", advanced: confirmDone)

            if left && !mismatch.exists { return }
            if mismatch.exists {
                NSLog("[VEYRNOX-XCUITEST] PIN attempt \(attempt): confirm mismatched, PinSetup reset both buffers; retrying")
            } else {
                NSLog("[VEYRNOX-XCUITEST] PIN attempt \(attempt): confirm submit never advanced past PinSetup; retrying")
                clearPinPadIfPossible(app: app)
            }
        }
    }

    /// Press the PIN submit control and confirm the flow actually moved, re-pressing if it
    /// did not. Same failure and same remedy as tapButtonUntilAdvanced: on a
    /// cold WKWebView the press succeeds at the AX layer while WebKit swallows
    /// the click, so the only honest confirmation is an observable state change.
    ///
    /// Re-presses only while `advanced` is still false, so a press that landed
    /// but rendered slowly is not double-submitted. PinSetup fires onDone once
    /// per stage (see its header), so a duplicate press on a stage that has
    /// already advanced would be inert anyway.
    ///
    /// Budget: 3 presses x 8s = 24s worst case per stage. Run 33626090694 used
    /// 532s of the 600s allowance with no re-presses, so this fits — but it is
    /// the tightest thing in the file. If the allowance moves, re-do this sum.
    ///
    /// `rejected` returns false immediately, without re-pressing, when the app
    /// has visibly refused the buffer — re-pressing cannot help there.
    ///
    /// Query rate: every `exists` is a full WebKit AX snapshot, and on a slow
    /// runner those stall (~31 s each in run 34643406215, three in a row, which
    /// XCTest turns into "Failed to get matching snapshots"). The old loop made
    /// 2 queries/s. With `rejected` supplied each tick makes TWO queries, so the
    /// tick is 2 s — 1 query/s combined; without it, 0.5 queries/s.
    @discardableResult
    private func submitPinUntilAdvanced(
        app: XCUIApplication,
        stage: String,
        advanced: () -> Bool,
        rejected: () -> Bool = { false },
        maxPresses: Int = 3,
        perPressWait: TimeInterval = 8
    ) -> Bool {
        for press in 1...maxPresses {
            if advanced() { return true }
            submitPin(app: app, stage: stage)

            let deadline = Date().addingTimeInterval(perPressWait)
            while Date() < deadline {
                if advanced() { return true }
                if rejected() {
                    NSLog("[VEYRNOX-XCUITEST] PIN \(stage): pad rejected the buffer (digit presses lost); restarting the ceremony instead of re-pressing")
                    return false
                }
                Thread.sleep(forTimeInterval: 2.0)
            }
            if press < maxPresses {
                NSLog("[VEYRNOX-XCUITEST] PIN \(stage): submit press \(press) did not advance the view; re-pressing")
            }
        }
        return advanced()
    }

    /// Clear the pad so a retry starts from a known-empty buffer. The control is
    /// disabled at zero digits, so absence or a disabled state is a no-op rather
    /// than a failure — the point is only to avoid appending to a partial entry.
    private func clearPinPadIfPossible(app: XCUIApplication) {
        let clear = app.buttons["Clear — re-enter PIN"]
        if clear.waitForExistence(timeout: 2), clear.isEnabled {
            webViewSafeTap(clear)
        }
    }

    /// Fails fast, and with an accurate message, when the PIN-create flow reset
    /// itself instead of moving on to provisioning.
    ///
    /// Both fail-closed assertions below read the SAME signal — "the entry tile
    /// came back" — for two different situations, and cannot tell them apart:
    ///
    ///   A. provisioning ran, hit the missing secure store, failed closed, and
    ///      routed back to the tiles. This is the pass the test is written for.
    ///   B. the flow never reached provisioning at all, so the tile never came
    ///      back and the 45 s wait expired.
    ///
    /// Both produce the same red, and that red asserts A's failure mode — "the
    /// flow may have provisioned a wallet on a device with no secure store".
    /// That is a security-shaped accusation, and in case B it is simply untrue.
    ///
    /// Case B is real and is the common one on CI. Run 33617705223: the
    /// confirm-PIN entry desynced against a slow WKWebView (8 digits spread over
    /// 39 s, then a 28 s stall before the submit button resolved), PinSetup.jsx
    /// showed "PINs didn't match. Start again." and reset to stage one, and the
    /// app sat on the PIN pad for the whole 45 s window. The recorded frames
    /// show a PIN pad, not a dashboard — nothing was ever provisioned.
    ///
    /// Unlike the sonner toast described above, this string IS published to the
    /// accessibility tree — verified as a `StaticText` in that run's AX dump at
    /// failure time — so it can be asserted on directly. Source of truth is the
    /// `setError(...)` call in src/components/PinSetup.jsx; if that copy changes,
    /// this string must change with it.
    ///
    /// Deliberately NOT a retry or a longer timeout: the wait was never too
    /// short, the app was never going to leave that screen. Widening it would
    /// only turn an inaccurate red into a slower inaccurate red.
    private func assertPinFlowLeftPinSetup(app: XCUIApplication) {
        let mismatch = app.staticTexts["PINs didn't match. Start again."]
        XCTAssertFalse(
            mismatch.waitForExistence(timeout: 5),
            "PIN confirm desynced and PinSetup reset to stage one, so the flow never reached provisioning. This is a test-harness failure against a slow WKWebView, NOT a fail-closed result and NOT evidence about secure-store handling — the run proves nothing either way about provisioning."
        )

        // The mismatch banner is only ONE of the ways the flow can still be
        // sitting in PinSetup. Run 33626090694 ended on "Confirm your PIN" with
        // all eight dots filled and no banner at all, because the submit press
        // was swallowed — and this guard, checking only the banner, let it fall
        // through to the fail-closed assertion and its accusation.
        // Either heading still being on screen means the same thing: the
        // ceremony did not finish, so the run says nothing about provisioning.
        for heading in ["Choose an 8-digit PIN", "Confirm your PIN"] {
            XCTAssertFalse(
                app.staticTexts[heading].exists,
                "PinSetup is still showing '\(heading)' after the ceremony, so the flow never reached provisioning. This is a test-harness failure against a slow WKWebView, NOT a fail-closed result and NOT evidence about secure-store handling."
            )
        }
    }

    /// HTML aria-labels surface as XCUIElement identifiers. A direct identifier
    /// query avoids WebKit's full accessibility snapshot walk, which can stall
    /// on cold CI simulators when evaluating a broad predicate.
    private func buttonMatching(_ app: XCUIApplication, label: String) -> XCUIElement {
        app.buttons[label]
    }

    /// Press a submit button until the web app takes the press. A press counts
    /// as taken once `accepted()` holds, or the button goes disabled (the form's
    /// `disabled={busy}`) or disappears. A re-press while busy hits a disabled
    /// button and does nothing, so retrying cannot start a second submission.
    private func pressUntilAccepted(
        app: XCUIApplication,
        label: String,
        accepted: () -> Bool,
        maxAttempts: Int = 3,
        perAttemptWait: TimeInterval = 10
    ) {
        let button = buttonMatching(app, label: label)
        XCTAssertTrue(button.waitForExistence(timeout: 5), "\(label) button never appeared.")
        for attempt in 1...maxAttempts {
            webViewSafeTap(button)
            let deadline = Date().addingTimeInterval(perAttemptWait)
            while Date() < deadline {
                if accepted() || !button.exists || !button.isEnabled { return }
                Thread.sleep(forTimeInterval: 0.5)
            }
            NSLog("[VEYRNOX-XCUITEST] '\(label)' press attempt \(attempt) was not accepted; re-pressing")
        }
        // Not asserted here: assertFailedClosed runs next and attaches the
        // screenshot + AX tree, which is the evidence a reader needs.
    }

    /// EntryShell's inline role="alert" banner for either known fail-closed
    /// message. See assertFailedClosed for why both are accepted.
    private func failClosedBanner(app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(
            NSPredicate(
                format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@",
                "device passcode",
                "nothing was saved"
            )
        ).firstMatch
    }

/// Press a button and confirm the next-view element appears. Retries the
    /// press if it doesn't — a cold WKWebView on iOS 26 Simulator sometimes
    /// swallows the first click at the WebKit layer even though XCUITest's
    /// press succeeded at the AX layer (idempotent tile taps make retry safe).
    private func tapButtonUntilAdvanced(
        app: XCUIApplication,
        label: String,
        waitFor next: XCUIElement,
        appearTimeout: TimeInterval,
        perAttemptWait: TimeInterval,
        maxAttempts: Int,
        failureMessage: String
    ) {
        let button = buttonMatching(app, label: label)
        if !button.waitForExistence(timeout: appearTimeout) {
            attachFailureDiagnostics(app: app, reason: "entry-tile-\(label)-missing")
            XCTFail("Entry tile '\(label)' never appeared.")
            return
        }
        for attempt in 1...maxAttempts {
            webViewSafeTap(button)
            if next.waitForExistence(timeout: perAttemptWait) { return }
            if attempt < maxAttempts { NSLog("[VEYRNOX-XCUITEST] '\(label)' press attempt \(attempt) did not advance the view; retrying") }
        }
        attachFailureDiagnostics(app: app, reason: "entry-tile-\(label)-no-advance")
        XCTFail(failureMessage)
    }

    /// Race the entry tile against any consent surface that may appear ahead of
    /// it. Dismisses whichever consent is currently on screen and re-polls,
    /// returning as soon as the entry tile is visible. One fixed budget replaces
    /// the previous two sequential 6 s optional probes, whose 0–12 s variable
    /// dwell coupled a cold WKWebView paint to the entry-tile assertion (#2477).
    ///
    /// On timeout, attaches a screenshot and the accessibility tree so the
    /// failure separates "WKWebView never rendered" from "consent state /
    /// routing was wrong" — the log alone could not tell them apart.
    private func waitForEntryTile(
        app: XCUIApplication,
        tile: String,
        budget: TimeInterval = 45
    ) {
        let entryTile = app.buttons[tile]
        // Consent surfaces the app may render before the entry tiles. Order is
        // not asserted — whichever is currently on screen gets dismissed. The
        // deny path is the honest choice for both on a stock simulator (no real
        // data opt-in, no biometric enrolled).
        // "No thanks" is telemetry_consent.cta_deny in
        // src/i18n/locales/en/security.json. "Not now" is BiometricConsent's
        // decline path (#2129, 2026-08-27). Fresh-install marker reset is via
        // --uitest-fresh-install (#2149).
        let consentDismissals = ["No thanks", "Not now"]

        let deadline = Date().addingTimeInterval(budget)
        var loops = 0
        while Date() < deadline {
            loops += 1
            if entryTile.exists { return }
            var dismissed = false
            for label in consentDismissals {
                let btn = app.buttons[label]
                if btn.exists {
                    NSLog("[VEYRNOX-XCUITEST] startup: dismissing consent '\(label)' (loop \(loops))")
                    webViewSafeTap(btn)
                    dismissed = true
                    break
                }
            }
            if !dismissed { Thread.sleep(forTimeInterval: 0.5) }
        }

        // Final chance — the tile may have painted in the last poll interval.
        if entryTile.exists { return }

        attachFailureDiagnostics(app: app, reason: "entry-tile-\(tile)-startup-timeout")
        XCTFail(
            "Entry tile '\(tile)' never appeared within \(budget)s, and no consent surface was on screen at timeout. "
            + "Check the attached screenshot + AX tree to distinguish 'WKWebView never rendered' from 'consent state or routing was wrong'."
        )
    }

    /// Terminal fail-closed assertion, shared by the create and import smokes.
    ///
    /// WHAT THE SIGNAL IS NOT, any more: "the entry-tiles picker came back".
    /// Both tests polled for their entry tile until 2026-09-10, and that only
    /// ever worked by accident on one of the two paths:
    ///   - create: doCreateWallet's catch runs `setChosenPath(null)`
    ///     unconditionally BEFORE any branch (WalletEntry.jsx), which used to
    ///     let Slice L's auto-heal route to entry-tiles. #2487 added `!error`
    ///     to both Slice L guards — deliberately, so an actionable message is
    ///     not driven past — so the create flow now STAYS on the failing
    ///     screen and the tile poll can only time out.
    ///   - import: doImportWallet's catch has NO setChosenPath(null), so
    ///     `chosenPath === "have"` keeps the seed form mounted and the tile
    ///     never returned in the first place. That assertion had never once
    ///     been true; it went red the moment #2485 put the test in CI
    ///     (run 34369955287, AppUITests.swift:181).
    ///
    /// WHAT THE SIGNAL IS: EntryShell's inline `role="alert"` banner. That is
    /// real DOM, so WKWebView publishes it — unlike the sonner toast that
    /// fires alongside, which renders in a portal-mounted <li> that XCUITest
    /// cannot see (runs 33524731172 + 33526853634) and must never be polled.
    ///
    /// Both known fail-closed messages are accepted, though on THIS job only
    /// one is reachable (#2714):
    ///   - DEVICE_NOT_SECURE — createVault's userMessage when
    ///     checkBiometry() reports deviceIsSecure false
    ///     (src/wallet-core/keystore/native.js). Unreachable on Simulator:
    ///     `.deviceOwnerAuthentication` reports the device as secure
    ///     unconditionally there, so checkBiometry() never returns false and
    ///     this banner can never fire in this job. Kept in the accepted set
    ///     only so a future signed/device run does not need a new matcher.
    ///   - the generic "nothing was saved" banner — the Play build-5
    ///     rejection string this file's header exists to catch, and the one
    ///     an unsigned build's Keychain-write failure actually produces.
    /// Both mean the vault was refused, which is the security property under
    /// test; WHICH one appears is a UX question, and asserting a guess would
    /// be a red test dressed up as a finding. A third, unknown message is not
    /// silently tolerated — it times out here and the AX tree is attached, so
    /// the next run names it and this predicate can be tightened.
    ///
    /// Copy-drift rule from this file's header applies: if either string
    /// changes, change it here AND in
    /// src/__tests__/firebase-test-lab-onboarding.test.js.
    private func assertFailedClosed(app: XCUIApplication, action: String) {
        let banner = failClosedBanner(app: app)

        // Diagnostics BEFORE the assertion, not after. setUpWithError sets
        // continueAfterFailure = false, so the first XCTAssert to fail aborts
        // the test body — anything attached on the line below it never runs.
        // That is how run 34369955287 failed on exactly this check and left no
        // screenshot and no AX tree to explain it.
        let shown = banner.waitForExistence(timeout: 45)
        if !shown { attachFailureDiagnostics(app: app, reason: "\(action)-no-fail-closed-banner") }
        XCTAssertTrue(
            shown,
            "Simulator \(action) must fail closed with a visible error banner. No banner means the flow either never finished provisioning, or provisioned a wallet on a device with no secure store — check the attached screenshot + AX tree for a dashboard."
        )

        // Ordering matters for the same reason: capture the evidence for THIS
        // assertion before it can abort the body.
        let created = app.staticTexts["Created."].exists
        if created { attachFailureDiagnostics(app: app, reason: "\(action)-provisioned-on-insecure-device") }
        XCTAssertFalse(created, "A simulator without secure storage must not \(action) a wallet.")
    }

    /// Unconditional milestone screenshot — attached to the result bundle even
    /// on green runs so a reader can see what the flow actually looked like.
    /// `.keepAlways` because default retention drops attachments from passing
    /// tests, which is exactly the case we want them for here.
    private func snap(app: XCUIApplication, name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "milestone-\(name)"
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// Attach a screenshot plus the current accessibility-tree dump to the test
    /// result on failure. Kept small on purpose: screenshot first (never blocks
    /// on AX snapshot), then the tree (which can stall on a wedged webview —
    /// #2477 records a 338 s AX-query timeout that would swallow the diagnostic
    /// if the order were reversed). Both are `.keepAlways` so they survive a
    /// green re-run's artifact retention.
    ///
    /// A second screenshot follows the tree, because the tree can describe a
    /// DIFFERENT moment: in run 34747267714 the first screenshot showed a boot
    /// spinner, the AX snapshot then took ~10 s, and the tree it returned
    /// already contained "New wallet" — which read as "the query missed a
    /// present button" when the tile had simply painted late (#2543). The
    /// pair brackets the tree in time.
    private func attachFailureDiagnostics(app: XCUIApplication, reason: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "failure-screenshot-\(reason)"
        shot.lifetime = .keepAlways
        add(shot)

        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "failure-ax-tree-\(reason)"
        tree.lifetime = .keepAlways
        add(tree)

        let after = XCTAttachment(screenshot: app.screenshot())
        after.name = "failure-screenshot-after-ax-tree-\(reason)"
        after.lifetime = .keepAlways
        add(after)
    }

    /// Give a WKWebView `<input>` keyboard focus before typing into it.
    ///
    /// Bare `.tap()` is an AXPress (see webViewSafeTap), and on a slow runner it
    /// intermittently leaves focus on the PREVIOUS input: runs 34479474536 and
    /// 34589591007 (#2543) show box N-1 still "Keyboard Focused" after tapping
    /// box N, and typeText then retried "Neither element nor any descendant has
    /// keyboard focus" until the 10-minute allowance killed the test.
    /// SeedInputGrid.jsx does no focus management of its own, so the tap is the
    /// only thing that moves focus. First attempt uses the real-touch press;
    /// the second falls back to `.tap()`, since press-focuses-an-input has not
    /// been proven on this simulator the way press-clicks-a-button has.
    ///
    /// The 5 s / 10 s deadlines bound the POLLING, not each query: the
    /// `hasKeyboardFocus` read is a synchronous AX snapshot that XCTest cannot
    /// cancel. A wedged bridge is bounded instead by XCTest's own snapshot
    /// timeout (~30 s x 3 retries, then "Failed to get matching snapshots") —
    /// a named failure in well under the 10-minute allowance, which is what
    /// the old typeText retry loop consumed.
    private func focusTextField(app: XCUIApplication, field: XCUIElement, name: String) {
        for attempt in 1...2 {
            if attempt == 1 { webViewSafeTap(field) } else { field.tap() }
            let deadline = Date().addingTimeInterval(attempt == 1 ? 5 : 10)
            while Date() < deadline {
                if (field.value(forKey: "hasKeyboardFocus") as? Bool) == true { return }
                Thread.sleep(forTimeInterval: 1.0)
            }
            NSLog("[VEYRNOX-XCUITEST] \(name): focus attempt \(attempt) did not take")
        }
        attachFailureDiagnostics(app: app, reason: "no-keyboard-focus")
        XCTFail("\(name) never took keyboard focus after a press and a tap. Harness failure against a slow WKWebView (#2543), NOT an app result.")
    }

    /// XCUITest's `.tap()` on a WKWebView button dispatches an accessibility
    /// press (AXPress). On iOS 26 Simulator against a shadcn/Radix `<button>`
    /// this only paints the CSS `:active` state — no `click` event ever fires,
    /// so React `onClick` handlers never run and the view never advances (run
    /// 33508180774: "New wallet" tile stuck pressed for 30+ s).
    ///
    /// `.coordinate(withNormalizedOffset:).tap()` should synthesise a real
    /// touch, but on this project's WKWebView the frame-resolution snapshot
    /// times out (run 33520465094: "Failed to get matching snapshot: Timed
    /// out while evaluating UI query", 423 s stall).
    ///
    /// `.press(forDuration:)` is the middle path: it fires touchDown +
    /// touchUp at the element's own hit-point without re-snapshotting, and it
    /// produces a real `click` event in the WebView (bypasses AXPress).
    /// Anything under ~0.2 s is registered as a tap, not a long-press.
    private func webViewSafeTap(_ element: XCUIElement) {
        element.press(forDuration: 0.05)
    }

    /// Tap each digit on the on-screen keypad. Digit buttons carry only their
    /// text (no aria-label), so we match on the digit character.
    private func enterPin(app: XCUIApplication, digits: String, stage: String) {
        for (index, ch) in digits.enumerated() {
            let key = buttonMatching(app, label: String(ch))
            // WKWebView publishes the first control in the newly rendered PIN
            // screen asynchronously. The CI trace reached New wallet but the
            // bridge had not exposed "1" within the old five-second window.
            // Once the first key exists, the rest of the keypad is one DOM
            // render and should remain promptly available.
            let timeout: TimeInterval = index == 0 ? 20 : 5
            XCTAssertTrue(
                key.waitForExistence(timeout: timeout),
                "PIN \(stage): keypad button '\(ch)' never appeared."
            )
            webViewSafeTap(key)
        }
    }

    /// PinSetup's create/confirm PinPad always submits with the default
    /// submitLabel "Continue" (ONB-02/A11Y-01 fix: the submit control's
    /// accessible name tracks its visible label, both stages included).
    private func submitPin(app: XCUIApplication, stage: String) {
        let submit = app.buttons["Continue"]
        XCTAssertTrue(
            submit.waitForExistence(timeout: 5),
            "PIN \(stage): submit button never appeared."
        )
        webViewSafeTap(submit)
    }
}
