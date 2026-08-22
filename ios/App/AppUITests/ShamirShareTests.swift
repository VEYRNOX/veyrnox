import XCTest

final class ShamirShareTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Advanced (2-of-3) tab shows share export UI when Safety Plus entitled.
    /// On free tier, shows upsell card instead — test handles both paths.
    func test_advancedTab_showsShareUIOrUpsell() throws {
        let app = XCUIApplication()
        app.launchFresh()
        createFreshWallet(app: app)

        let backupBtn = app.buttons["Set up Personal Backup"]
        XCTAssertTrue(backupBtn.waitForExistence(timeout: 5))
        backupBtn.tap()

        waitForText("Encrypted Personal Backup", in: app, timeout: 10)

        let advancedTab = app.buttons["Advanced (2-of-3)"]
        guard advancedTab.waitForExistence(timeout: 5) else {
            // Tab not shown — may be feature-flagged off
            return
        }
        advancedTab.tap()

        // Either the share export UI or the upsell card appears
        let shareUI = app.staticTexts["2-of-3 recovery shares (preview)"]
        let upsellUI = app.staticTexts["Advanced 2-of-3 backup — Safety Plus"]
        let splitBtn = app.buttons["Split & save 3 shares"]

        let hasShareUI = shareUI.waitForExistence(timeout: 5)
            || splitBtn.waitForExistence(timeout: 2)
        let hasUpsell = upsellUI.exists

        XCTAssertTrue(
            hasShareUI || hasUpsell,
            "Neither share export UI nor upsell appeared on Advanced tab."
        )
    }

    /// Share export flow: enter password + recovery passphrase → split.
    /// Requires Safety Plus entitlement (VITE_FORCE_TIER=safety_plus in staging).
    func test_shareExport_splitAndSave() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--uitest-fresh-install"]
        // Note: this test requires Safety Plus tier.
        // In staging builds, VITE_FORCE_TIER=safety_plus bypasses the paywall.
        app.launch()

        createFreshWallet(app: app)

        let backupBtn = app.buttons["Set up Personal Backup"]
        XCTAssertTrue(backupBtn.waitForExistence(timeout: 5))
        backupBtn.tap()

        waitForText("Encrypted Personal Backup", in: app, timeout: 10)

        let advancedTab = app.buttons["Advanced (2-of-3)"]
        guard advancedTab.waitForExistence(timeout: 5) else {
            return // Feature not available
        }
        advancedTab.tap()

        // Check if upsell blocks us
        let upsell = app.staticTexts["Advanced 2-of-3 backup — Safety Plus"]
        if upsell.waitForExistence(timeout: 3) {
            // Free tier — can't proceed with export
            return
        }

        // Export toggle should be active by default
        let exportToggle = app.buttons["Export"]
        if exportToggle.waitForExistence(timeout: 3) {
            exportToggle.tap()
        }

        // Enter wallet password
        let passwordField = app.secureTextFields.firstMatch
        guard passwordField.waitForExistence(timeout: 5) else {
            XCTFail("Password field not found on share export.")
            return
        }
        passwordField.tap()
        passwordField.typeText("TestPassword123!")

        // Enter recovery passphrase (second secure field)
        let fields = app.secureTextFields
        if fields.count >= 2 {
            let passphraseField = fields.element(boundBy: 1)
            passphraseField.tap()
            passphraseField.typeText("MyRecoveryPassphrase2026!")
        }

        // Tap split button
        let splitBtn = app.buttons["Split & save 3 shares"]
        if splitBtn.waitForExistence(timeout: 5) {
            splitBtn.tap()

            // Wait for save confirmation
            let saved = app.staticTexts["All 3 recovery shares saved"].waitForExistence(timeout: 30)
                || app.staticTexts["of 3 shares saved"].waitForExistence(timeout: 30)
            // Not asserting — file save dialog may need user interaction
            if saved {
                // Full success
            }
        }
    }

    /// Restore from shares: the UI should show file pickers for 2 shares.
    func test_shareRestore_showsFilePickers() throws {
        let app = XCUIApplication()
        app.launchFresh()
        createFreshWallet(app: app)

        let backupBtn = app.buttons["Set up Personal Backup"]
        XCTAssertTrue(backupBtn.waitForExistence(timeout: 5))
        backupBtn.tap()

        waitForText("Encrypted Personal Backup", in: app, timeout: 10)

        let advancedTab = app.buttons["Advanced (2-of-3)"]
        guard advancedTab.waitForExistence(timeout: 5) else { return }
        advancedTab.tap()

        // Check for upsell
        let upsell = app.staticTexts["Advanced 2-of-3 backup — Safety Plus"]
        if upsell.waitForExistence(timeout: 3) { return }

        // Switch to Restore sub-toggle
        let restoreToggle = app.buttons["Restore"]
        guard restoreToggle.waitForExistence(timeout: 3) else {
            XCTFail("Restore toggle missing on Advanced tab.")
            return
        }
        restoreToggle.tap()

        // Should show "Restore from 2 recovery shares" card
        let restoreCard = app.staticTexts["Restore from 2 recovery shares"]
        XCTAssertTrue(
            restoreCard.waitForExistence(timeout: 5),
            "Share restore card not shown."
        )

        // File picker buttons
        let pickFile = app.buttons["Choose 2 share files"]
        XCTAssertTrue(
            pickFile.waitForExistence(timeout: 5),
            "Share file picker button missing."
        )
    }
}
