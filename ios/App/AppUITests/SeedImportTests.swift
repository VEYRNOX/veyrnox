import XCTest

final class SeedImportTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Import known test seed → PIN setup → wallet created.
    func test_importSeed_pinFlow_succeeds() throws {
        let app = XCUIApplication()
        app.launchFresh()

        // Tap "Have a wallet" tile
        let importTile = app.buttons["Have a wallet"]
        XCTAssertTrue(importTile.waitForExistence(timeout: 10), "Import tile missing.")
        importTile.tap()

        // PIN setup first (PIN cohort)
        setPinFull(app: app, pin: TestPin.standard)

        // Should show "Import an existing seed" button on the choose screen
        let importBtn = app.buttons["Import an existing seed"]
        XCTAssertTrue(
            importBtn.waitForExistence(timeout: 5),
            "Import seed button not shown after PIN setup."
        )
        importBtn.tap()

        // SeedInputGrid — enter each word into its field.
        // Fields have aria-label "Recovery phrase entry N"
        for (i, word) in TestSeed.wordArray.enumerated() {
            let fieldLabel = "Recovery phrase entry \(i + 1)"
            let field = app.textFields[fieldLabel]
            if field.waitForExistence(timeout: 3) {
                field.tap()
                field.typeText(word)
            } else {
                // Webview may expose fields differently — try generic query
                let anyField = app.textFields.element(boundBy: i)
                if anyField.exists {
                    anyField.tap()
                    anyField.typeText(word)
                } else {
                    XCTFail("Seed word field \(i + 1) not found.")
                    return
                }
            }
        }

        // Submit the seed
        let submitSeed = app.buttons["Restore / Import"]
        XCTAssertTrue(submitSeed.waitForExistence(timeout: 5), "Import submit button missing.")
        submitSeed.tap()

        // Should create wallet — wait for wallet view or created confirmation
        let imported = app.staticTexts["Created."].waitForExistence(timeout: 30)
            || app.staticTexts["ETH"].waitForExistence(timeout: 30)
        XCTAssertTrue(imported, "Wallet not created after seed import.")
    }

    /// PIN-recovery flow: Forgot PIN → enter seed → new PIN → wallet restored.
    func test_forgotPin_seedRecovery_succeeds() throws {
        let app = XCUIApplication()

        // Phase 1: create wallet
        app.launchFresh()
        createFreshWallet(app: app, pin: TestPin.standard)
        skipBackupAndEnterWallet(app: app)

        // Phase 2: relaunch
        app.terminate()
        let app2 = XCUIApplication()
        app2.launchPreserving()

        let pinHeading = app2.staticTexts["Enter your PIN"]
        XCTAssertTrue(pinHeading.waitForExistence(timeout: 10))

        // Tap forgot PIN
        let forgotLink = app2.buttons["Restore from seed phrase"]
        guard forgotLink.waitForExistence(timeout: 5) else {
            XCTFail("Forgot PIN link not found.")
            return
        }
        forgotLink.tap()

        // Enter seed in textarea
        let seedField = app2.textViews["Recovery seed phrase"]
        if seedField.waitForExistence(timeout: 5) {
            seedField.tap()
            seedField.typeText(TestSeed.words)
        } else {
            // Try textarea by ID
            let textArea = app2.textViews.firstMatch
            if textArea.waitForExistence(timeout: 3) {
                textArea.tap()
                textArea.typeText(TestSeed.words)
            }
        }

        // Continue
        let continueBtn = app2.buttons["Continue"]
        if continueBtn.waitForExistence(timeout: 5) {
            continueBtn.tap()
        }

        // Set new PIN
        setPinFull(app: app2, pin: TestPin.alternate)

        // Should reach wallet
        let restored = app2.staticTexts["ETH"].waitForExistence(timeout: 30)
            || app2.staticTexts["Created."].waitForExistence(timeout: 15)
            || app2.staticTexts["Total Balance"].waitForExistence(timeout: 15)
        XCTAssertTrue(restored, "Wallet not restored after seed recovery.")
    }
}
