// AppUITests.swift
//
// Minimal XCUITest smoke. Walks the current first-run flow — fresh install →
// entry tiles → New wallet → 8-digit PIN → confirm PIN — and hard-fails if
// the KEK/RASP fail-closed banner ever appears (that banner is the exact
// string Play rejected build 5 for under Broken Functionality policy).
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
        app.launchFresh()

        // Capacitor's WKWebView accessibility bridge can lag the native shell
        // on hosted simulator images. Wait for it first so we fail on the
        // actual onboarding surface, not on startup timing.
        XCTAssertTrue(
            app.webViews.firstMatch.waitForExistence(timeout: 30),
            "WebView never rendered — app did not launch."
        )

        createFreshWallet(app: app)
    }
}
