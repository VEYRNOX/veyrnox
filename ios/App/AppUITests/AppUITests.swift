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

    /// Golden path a reviewer would walk on first launch.
    /// If this test ever fails on a stock simulator the app is NOT ready to submit.
    func test_freshInstall_createsWalletWithoutFailureBanner() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--uitest-fresh-install"]
        app.launch()

        // A Capacitor app renders inside a WKWebView; XCUITest matches HTML
        // buttons by their aria-label OR visible text. Every predicate below
        // matches BOTH via NSPredicate on `label` (label reflects both).
        let webView = app.webViews.firstMatch
        XCTAssertTrue(
            webView.waitForExistence(timeout: 20),
            "WebView never rendered — app did not launch."
        )

        // 1. Telemetry consent screen may appear before the entry tiles
        //    (2026-07-26 addition). Dismiss it with the deny path — the smoke
        //    is not opting real data into anything. Tolerate its absence: on
        //    a device with prior consent state the screen is skipped.
        //    "No thanks" is telemetry_consent.cta_deny in
        //    src/i18n/locales/en/security.json.
        tapButtonIfPresent(app: app, label: "No thanks", timeout: 6)

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
        tapButton(
            app: app,
            label: "New wallet",
            timeout: 15,
            failureMessage: "Entry tiles / 'New wallet' never appeared."
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

        // 5. The exact banner Play rejected build 5 for. Assert absence.
        //    Wait explicitly — the banner appears when KEK/RASP fails
        //    closed, which is what we want to catch.
        let failureBanner = app.staticTexts[
            "Wallet setup couldn't finish securely, so nothing was saved. Please set your PIN and try again."
        ]
        XCTAssertFalse(
            failureBanner.waitForExistence(timeout: 20),
            "KEK/RASP fail-closed banner appeared — this is the exact defect Play rejected on Android."
        )
    }

    // MARK: - helpers

    /// Match a button by aria-label OR visible text (both surface as `label`
    /// on XCUIElement). Returns the query even if no match yet — caller
    /// decides whether to wait.
    private func buttonMatching(_ app: XCUIApplication, label: String) -> XCUIElement {
        let predicate = NSPredicate(format: "label == %@", label)
        return app.buttons.matching(predicate).firstMatch
    }

    private func tapButton(app: XCUIApplication, label: String, timeout: TimeInterval, failureMessage: String) {
        let button = buttonMatching(app, label: label)
        XCTAssertTrue(button.waitForExistence(timeout: timeout), failureMessage)
        button.tap()
    }

    private func tapButtonIfPresent(app: XCUIApplication, label: String, timeout: TimeInterval) {
        let button = buttonMatching(app, label: label)
        if button.waitForExistence(timeout: timeout) {
            button.tap()
        }
    }

    /// Tap each digit on the on-screen keypad. Digit buttons carry only their
    /// text (no aria-label), so we match on the digit character.
    private func enterPin(app: XCUIApplication, digits: String, stage: String) {
        for ch in digits {
            let key = buttonMatching(app, label: String(ch))
            XCTAssertTrue(
                key.waitForExistence(timeout: 5),
                "PIN \(stage): keypad button '\(ch)' never appeared."
            )
            key.tap()
        }
    }

    /// PinPad's submit renders text of `submitLabel` (defaults to "Continue")
    /// and carries `aria-label="Submit PIN"`. Match either.
    private func submitPin(app: XCUIApplication, stage: String) {
        let predicate = NSPredicate(format: "label == %@ OR label == %@", "Submit PIN", "Continue")
        let submit = app.buttons.matching(predicate).firstMatch
        XCTAssertTrue(
            submit.waitForExistence(timeout: 5),
            "PIN \(stage): submit button never appeared."
        )
        submit.tap()
    }
}
