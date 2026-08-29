import XCTest

final class RestoreFromFileTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// "File backup" tile on fresh install → Recovery Bay UI.
    func test_fileBackupTile_showsRecoveryBay() throws {
        let app = XCUIApplication()
        app.launchFresh()

        let fileTile = app.buttons["File backup"]
        XCTAssertTrue(fileTile.waitForExistence(timeout: 10), "File backup tile missing.")
        fileTile.tap()

        // Recovery Bay should appear with its dropzone and instructions
        let selectBtn = app.buttons["Select backup file"]
        XCTAssertTrue(
            selectBtn.waitForExistence(timeout: 10),
            "Recovery Bay file select button not shown."
        )

        // Verify instructional bullets
        waitForText("Read your .enc file locally — nothing uploaded.", in: app, timeout: 5)
        waitForText("Set a fresh device PIN for this app.", in: app, timeout: 3)
    }

    /// "Recovery Shares" tile on fresh install → Restore from shares page.
    func test_recoverySharesTile_showsRestorePage() throws {
        let app = XCUIApplication()
        app.launchFresh()

        let sharesTile = app.buttons["Recovery Shares"]
        XCTAssertTrue(sharesTile.waitForExistence(timeout: 10), "Recovery Shares tile missing.")
        sharesTile.tap()

        // Should show the restore from shares page
        let heading = app.staticTexts["Restore from recovery shares"]
        XCTAssertTrue(
            heading.waitForExistence(timeout: 10),
            "Restore from shares heading not shown."
        )

        // Should show file pickers for Share 1 and Share 2
        let share1 = app.staticTexts["Share 1"]
        let share2 = app.staticTexts["Share 2"]
        XCTAssertTrue(share1.waitForExistence(timeout: 5), "Share 1 label missing.")
        XCTAssertTrue(share2.waitForExistence(timeout: 5), "Share 2 label missing.")

        // Pick file buttons
        let pickBtns = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Pick file'"))
        XCTAssertGreaterThanOrEqual(pickBtns.count, 2, "Need at least 2 Pick file buttons.")
    }

    /// Recovery Bay → back button returns to entry tiles.
    func test_recoveryBay_backReturnsToTiles() throws {
        let app = XCUIApplication()
        app.launchFresh()

        let fileTile = app.buttons["File backup"]
        XCTAssertTrue(fileTile.waitForExistence(timeout: 10))
        fileTile.tap()

        let selectBtn = app.buttons["Select backup file"]
        XCTAssertTrue(selectBtn.waitForExistence(timeout: 10))

        // Tap back
        let backBtn = app.buttons["Back"]
        if backBtn.waitForExistence(timeout: 3) {
            backBtn.tap()
        }

        // Should return to entry tiles
        let newWallet = app.buttons["New wallet"]
        XCTAssertTrue(
            newWallet.waitForExistence(timeout: 5),
            "Entry tiles not shown after back from Recovery Bay."
        )
    }

    /// Restore from shares page → back returns to entry tiles.
    func test_restoreShares_backReturnsToTiles() throws {
        let app = XCUIApplication()
        app.launchFresh()

        let sharesTile = app.buttons["Recovery Shares"]
        XCTAssertTrue(sharesTile.waitForExistence(timeout: 10))
        sharesTile.tap()

        let heading = app.staticTexts["Restore from recovery shares"]
        XCTAssertTrue(heading.waitForExistence(timeout: 10))

        let backBtn = app.buttons["Back"]
        if backBtn.waitForExistence(timeout: 3) {
            backBtn.tap()
        }

        let newWallet = app.buttons["New wallet"]
        XCTAssertTrue(
            newWallet.waitForExistence(timeout: 10),
            "Entry tiles not shown after back from shares restore."
        )
    }
}
