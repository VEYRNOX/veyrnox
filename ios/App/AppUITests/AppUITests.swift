// AppUITests.swift
//
// Minimal XCUITest smoke. Walks fresh install → New wallet → PIN → wallet
// created, and hard-fails if the KEK/RASP fail-closed banner ever appears
// (that banner is what got Play build 5 rejected under Broken Functionality).
//
// Run locally with `xcodebuild test` against a booted simulator or a paired
// device. No cloud runner is wired up — iOS crash + hang signal comes from
// TestFlight → Crashes and Xcode Organizer → Metrics / Hangs on real installs.

import XCTest

final class AppUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Golden path a reviewer would walk on first launch.
    /// If this test ever fails on a stock device the app is NOT ready to submit.
    func test_freshInstall_createsWalletWithoutFailureBanner() throws {
        let app = XCUIApplication()
        app.launchArguments += [
            "--uitest-fresh-install",
        ]
        app.launch()

        // 0. launch() returns on process idle, not on webview paint. Assert the
        //    webview separately so a slow/blank runner cannot masquerade as a
        //    missing tile — see UITestTimeouts in TestHelpers.swift.
        waitForWebView(app: app)

        // 1. Fresh installs land on the entry tiles. Pick the new-wallet path;
        //    it auto-creates after PIN confirmation, so there is no later
        //    "Create Wallet" button on this path.
        let newWalletButton = app.buttons["New wallet"]
        XCTAssertTrue(
            newWalletButton.waitForExistence(timeout: UITestTimeouts.firstElement),
            "New wallet entry tile never appeared on a fresh install."
        )
        newWalletButton.tap()

        // 2. PIN entry — the app requires exactly eight digits and PinPad
        //    completion is explicit, never auto-submitted by digit count.
        let pin = "24681024"
        enterPin(app: app, digits: pin, stage: "set")
        submitPin(app: app, stage: "set")
        enterPin(app: app, digits: pin, stage: "confirm")
        submitPin(app: app, stage: "confirm")

        // 3. The fail-closed banner MUST NOT appear. This is the exact string
        //    Play rejected build 5 for. Assert absence, not silence.
        let failureBanner = app.staticTexts[
            "Wallet setup couldn't finish securely, so nothing was saved. Please set your PIN and try again."
        ]
        XCTAssertFalse(
            failureBanner.waitForExistence(timeout: 8),
            "KEK/RASP fail-closed banner appeared — this is the exact defect Play rejected on Android."
        )

        // 4. The current new-wallet path auto-creates after PIN confirmation
        //    and lands on WalletCreatedFlash. Raw seed reveal was deliberately
        //    moved out of onboarding, so waiting for a seed header is stale.
        let createdHeader = app.staticTexts["Created."]
        XCTAssertTrue(
            createdHeader.waitForExistence(timeout: 30),
            "Wallet-created screen never appeared — fresh-create path is broken."
        )
    }

    /// Tap each digit on the on-screen keypad. Falls back to a text field
    /// (some layouts use SecureField instead of a custom keypad).
    private func enterPin(app: XCUIApplication, digits: String, stage: String) {
        for ch in digits {
            let key = app.buttons[String(ch)]
            if key.waitForExistence(timeout: 3) {
                key.tap()
                continue
            }
            let field = app.secureTextFields.firstMatch
            if field.exists {
                field.tap()
                field.typeText(digits)
                return
            }
            XCTFail("PIN \(stage): no keypad button '\(ch)' and no secure field.")
            return
        }
    }

    /// PinPad deliberately does not auto-submit at eight digits. Tap its
    /// accessibility-labelled submit button after both setup stages.
    private func submitPin(app: XCUIApplication, stage: String) {
        let submit = app.buttons["Submit PIN"]
        XCTAssertTrue(
            submit.waitForExistence(timeout: 3),
            "PIN \(stage): Submit PIN button never appeared."
        )
        submit.tap()
    }
}
