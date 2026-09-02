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

    /// Simulator smoke: native provisioning must fail closed when the simulator
    /// cannot provide a passcode-backed secure store. A real device is required
    /// to verify successful wallet creation and hardware-gated unlock.
    func test_simulatorFailsClosedWithoutSecureStore() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--uitest-fresh-install"]
        app.launch()

        // A Capacitor app renders inside a WKWebView; XCUITest matches HTML
        // buttons by their aria-label OR visible text. Every predicate below
        // matches BOTH via NSPredicate on `label` (label reflects both).
        // 1. Telemetry consent screen may appear before the entry tiles
        //    (2026-07-26 addition). Dismiss it with the deny path — the smoke
        //    is not opting real data into anything. Tolerate its absence: on
        //    a device with prior consent state the screen is skipped.
        //    "No thanks" is telemetry_consent.cta_deny in
        //    src/i18n/locales/en/security.json.
        tapButtonIfPresent(app: app, label: "No thanks", timeout: 6)

        // 1b. BiometricConsent (#2129, 2026-08-27) — rendered between telemetry
        //     consent and the entry tiles when Capacitor.isNativePlatform() is
        //     true and the seen-marker is absent. Before #2149 wired the
        //     --uitest-fresh-install flag through AppDelegate the marker leaked
        //     across runs and this screen never re-appeared in CI, which is why
        //     the test could reach New wallet without dismissing it. On a stock
        //     simulator the "Not now" path is the honest choice: no biometric is
        //     enrolled. Tolerate its absence — the probe silently skips when
        //     getBiometricStatus() reports available: false.
        tapButtonIfPresent(app: app, label: "Not now", timeout: 6)

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

        // 3. PIN pad: 8 digits, then tap the submit button. PinPad's submit
        //    aria-label is "Submit PIN"; the visible text is the scheme's
        //    submitLabel (defaults to "Continue"). Match either.
        // Must satisfy PinSetup's strength guard: sequential patterns such as
        // 24681024 are intentionally rejected before the confirmation step.
        let pin = "19283746"

        // 4. Both stages, with recovery. See setPinCeremony's own notes for why
        //    a swallowed digit press cannot be detected per-digit and is instead
        //    recovered by re-running the ceremony.
        setPinCeremony(app: app, pin: pin)

        // 5. iOS Simulator has no device passcode or enrolled biometrics, so it
        //    cannot satisfy the native secure-store precondition. The only
        //    honest simulator outcome is an explicit fail-closed result with no
        //    usable wallet. Successful provisioning remains real-device-only.
        // The user-visible fail-closed signal on this simulator flow is a
        // sonner toast (`toast.error(...)` in WalletEntry.doCreateWallet).
        // Sonner renders inside a portal-mounted <li> that WKWebView does
        // NOT publish to XCUITest's accessibility tree — confirmed twice
        // (runs 33524731172 + 33526853634): the banner IS visible on the
        // recorded screen but every staticTexts label/identifier query
        // returned false through the entire poll window. The toast also
        // auto-dismisses in ~4 s, and WalletEntry then clears chosenPath +
        // routes back to `entry-tiles`, so there is no persistent inline
        // banner to poll either.
        //
        // The AX-visible fail-closed signal is: after PIN confirm, the app
        // has returned to the entry-tiles view rather than moved forward to
        // a dashboard. On success the "New wallet" tile is gone; on failure
        // it re-appears. Give the flow long enough to complete provisioning
        // + failure routing (~30 s on cold CI simulators).
        let entryTileAfterFailure = app.buttons["New wallet"]
        XCTAssertTrue(
            entryTileAfterFailure.waitForExistence(timeout: 45),
            "Simulator provisioning must fail closed and return the user to the entry-tiles picker. If this fails, the flow may have provisioned a wallet on a device with no secure store — check the recording for a dashboard."
        )
        XCTAssertFalse(app.staticTexts["Created."].exists, "A simulator without secure storage must not create a wallet.")
    }

    /// Import follows the same native secure-store rule as new-wallet creation:
    /// simulators must fail honestly rather than provisioning a usable vault.
    func test_simulatorImportFailsClosedWithoutSecureStore() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--uitest-fresh-install"]
        app.launch()

        tapButtonIfPresent(app: app, label: "No thanks", timeout: 6)
        tapButtonIfPresent(app: app, label: "Not now", timeout: 6)
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

        let pin = "19283746"
        setPinCeremony(app: app, pin: pin)

        let words = [
            "abandon", "abandon", "abandon", "abandon",
            "abandon", "abandon", "abandon", "abandon",
            "abandon", "abandon", "abandon", "about",
        ]
        for (index, word) in words.enumerated() {
            let field = app.textFields["Recovery phrase entry \(index + 1)"]
            XCTAssertTrue(field.waitForExistence(timeout: index == 0 ? 15 : 3), "Seed word box \(index + 1) never appeared.")
            field.tap()
            field.typeText(word)
        }
        tapButton(
            app: app,
            label: "Restore / Import",
            timeout: 5,
            failureMessage: "Restore / Import button never appeared."
        )

        // Same reasoning as the create path: sonner toast is not AX-visible
        // in WKWebView, and after failure the app routes back to entry tiles.
        let entryTileAfterFailure = app.buttons["Have a wallet"]
        XCTAssertTrue(
            entryTileAfterFailure.waitForExistence(timeout: 45),
            "Simulator import must fail closed and return the user to the entry-tiles picker."
        )
        XCTAssertFalse(app.staticTexts["Created."].exists, "A simulator without secure storage must not import a wallet.")
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
    /// Bounded at 2 attempts, and the bound is a TIME budget, not a taste
    /// judgement. One ceremony measured ~280s (run 33617705223); at 3 attempts
    /// run 33623177119 was killed at the then-300s per-test allowance mid-retry
    /// and reported "Executed 0 tests", losing the assertion entirely — a retry
    /// that cannot finish is worse than no retry at all. The allowance is now
    /// 600s (ios-xcuitest-smoke.yml) and two attempts fit in ~420s. Raising
    /// this count means raising that allowance in the same commit, and
    /// re-checking it still clears the 900s watchdog in that file.
    ///
    /// If both attempts are consumed the caller's assertPinFlowLeftPinSetup()
    /// reports the desync honestly rather than letting it masquerade as a
    /// fail-closed provisioning result.
    private func setPinCeremony(app: XCUIApplication, pin: String, maxAttempts: Int = 2) {
        let confirmHeading = app.staticTexts["Confirm your PIN"]
        let mismatch = app.staticTexts["PINs didn't match. Start again."]

        for attempt in 1...maxAttempts {
            enterPin(app: app, digits: pin, stage: "set")

            // A short buffer at stage one does not advance, and neither does a
            // swallowed submit press. Re-press before spending a whole ceremony
            // attempt on it — a re-press costs seconds, a ceremony costs ~140s.
            guard submitPinUntilAdvanced(app: app, stage: "set", advanced: { confirmHeading.exists }) else {
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

    /// Press "Submit PIN" and confirm the flow actually moved, re-pressing if it
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
    @discardableResult
    private func submitPinUntilAdvanced(
        app: XCUIApplication,
        stage: String,
        advanced: () -> Bool,
        maxPresses: Int = 3,
        perPressWait: TimeInterval = 8
    ) -> Bool {
        for press in 1...maxPresses {
            if advanced() { return true }
            submitPin(app: app, stage: stage)

            let deadline = Date().addingTimeInterval(perPressWait)
            while Date() < deadline {
                if advanced() { return true }
                Thread.sleep(forTimeInterval: 0.5)
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

    private func tapButton(app: XCUIApplication, label: String, timeout: TimeInterval, failureMessage: String) {
        let button = buttonMatching(app, label: label)
        XCTAssertTrue(button.waitForExistence(timeout: timeout), failureMessage)
        webViewSafeTap(button)
    }

    private func tapButtonIfPresent(app: XCUIApplication, label: String, timeout: TimeInterval) {
        let button = buttonMatching(app, label: label)
        if button.waitForExistence(timeout: timeout) {
            webViewSafeTap(button)
        }
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
        XCTAssertTrue(button.waitForExistence(timeout: appearTimeout), "Entry tile '\(label)' never appeared.")
        for attempt in 1...maxAttempts {
            webViewSafeTap(button)
            if next.waitForExistence(timeout: perAttemptWait) { return }
            if attempt < maxAttempts { NSLog("[VEYRNOX-XCUITEST] '\(label)' press attempt \(attempt) did not advance the view; retrying") }
        }
        XCTFail(failureMessage)
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

    /// PinPad always exposes the explicit submit control as `Submit PIN`.
    private func submitPin(app: XCUIApplication, stage: String) {
        let submit = app.buttons["Submit PIN"]
        XCTAssertTrue(
            submit.waitForExistence(timeout: 5),
            "PIN \(stage): submit button never appeared."
        )
        webViewSafeTap(submit)
    }
}
