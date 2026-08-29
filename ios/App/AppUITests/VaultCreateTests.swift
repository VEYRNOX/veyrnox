import XCTest

final class VaultCreateTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Fresh install → New Wallet tile → PIN set/confirm → wallet created.
    func test_createWallet_pinFlow_succeeds() throws {
        let app = XCUIApplication()
        app.launchFresh()
        createFreshWallet(app: app)
    }

    /// Wallet created screen shows backup prompt and skip option.
    func test_walletCreated_showsBackupPrompt() throws {
        let app = XCUIApplication()
        app.launchFresh()
        createFreshWallet(app: app)

        waitForText("Your keys were generated and encrypted on this device. Your seed never leaves it.", in: app)
        let backupBtn = app.buttons["Set up Personal Backup"]
        XCTAssertTrue(backupBtn.exists, "Backup CTA missing on created screen.")
        let skipBtn = app.buttons["Skip for now — take me to my wallet"]
        XCTAssertTrue(skipBtn.exists, "Skip button missing on created screen.")
    }

    /// Skip backup → lands on main wallet view (portfolio visible).
    func test_skipBackup_entersWallet() throws {
        let app = XCUIApplication()
        app.launchFresh()
        createFreshWallet(app: app)
        skipBackupAndEnterWallet(app: app)

        // Main wallet view should show portfolio or asset list.
        // Wait for any asset row or portfolio header.
        let walletLoaded = app.staticTexts["ETH"].waitForExistence(timeout: 15)
            || app.staticTexts["Total Balance"].waitForExistence(timeout: 5)
        XCTAssertTrue(walletLoaded, "Wallet main view never loaded after skip.")
    }

    /// Entry tiles show all four options on fresh install.
    func test_entryTiles_allOptionsPresent() throws {
        let app = XCUIApplication()
        app.launchFresh()

        let tiles = ["New wallet", "Have a wallet", "File backup", "Recovery Shares"]
        for tile in tiles {
            let btn = app.buttons[tile]
            XCTAssertTrue(
                btn.waitForExistence(timeout: 10),
                "Entry tile '\(tile)' missing."
            )
        }
    }

    /// PIN too short — submit should be disabled or rejected.
    func test_createWallet_shortPin_blocked() throws {
        let app = XCUIApplication()
        app.launchFresh()

        let tile = app.buttons["New wallet"]
        XCTAssertTrue(tile.waitForExistence(timeout: 10))
        tile.tap()

        // Enter only 4 digits (need 8)
        enterPin(app: app, digits: "1234")

        // Submit PIN button should exist but not advance
        // (PinPad enables submit only at full length)
        let submit = app.buttons["Submit PIN"]
        if submit.exists {
            submit.tap()
            // Should still be on PIN entry — "Choose an 8-digit PIN" still visible
            let heading = app.staticTexts["Choose an 8-digit PIN"]
            XCTAssertTrue(heading.exists, "Should remain on PIN entry with short PIN.")
        }
    }
}
