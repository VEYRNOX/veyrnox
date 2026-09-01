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
        enterPin(app: app, digits: pin, stage: "set")
        submitPin(app: app, stage: "set")

        // 4. Confirm PIN — same digits, same submit.
        enterPin(app: app, digits: pin, stage: "confirm")
        submitPin(app: app, stage: "confirm")

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
        enterPin(app: app, digits: pin, stage: "set")
        submitPin(app: app, stage: "set")
        enterPin(app: app, digits: pin, stage: "confirm")
        submitPin(app: app, stage: "confirm")

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
