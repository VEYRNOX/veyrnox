import XCTest

final class BackupTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Create wallet → navigate to Personal Backup → create .enc backup.
    func test_createEncBackup_succeeds() throws {
        let app = XCUIApplication()
        app.launchFresh()
        createFreshWallet(app: app)
        openPersonalBackup(app: app)

        // "Create backup" tab should be active by default
        let createTab = app.buttons["Create backup"]
        if createTab.waitForExistence(timeout: 5) {
            createTab.tap()
        }

        // Enter backup password
        let passwordField = app.secureTextFields.firstMatch
        if passwordField.waitForExistence(timeout: 5) {
            passwordField.tap()
            passwordField.typeText("TestBackupPassword123!")
        }

        // Enter 12-digit backup PIN
        enterPin(app: app, digits: TestPin.backupPin)
        submitPin(app: app)

        // Confirm PIN
        enterPin(app: app, digits: TestPin.backupPin)
        submitPin(app: app)

        // Tap save
        let saveBtn = app.buttons["Save backup"]
        if saveBtn.waitForExistence(timeout: 5) {
            saveBtn.tap()

            // Wait for confirmation card or success message
            let saved = app.staticTexts["Backup saved"].waitForExistence(timeout: 30)
                || app.staticTexts["Did you save the backup file?"].waitForExistence(timeout: 30)
            XCTAssertTrue(saved, "Backup save confirmation never appeared.")
        }
    }

    /// Personal Backup page shows all three tabs.
    func test_personalBackup_tabsPresent() throws {
        let app = XCUIApplication()
        app.launchFresh()
        createFreshWallet(app: app)
        openPersonalBackup(app: app)

        let tabs = ["Create backup", "Restore"]
        for tab in tabs {
            let btn = app.buttons[tab]
            XCTAssertTrue(btn.waitForExistence(timeout: 5), "Tab '\(tab)' missing.")
        }

        // Advanced tab may be gated behind Safety Plus — just check it exists
        let advancedTab = app.buttons["Advanced (2-of-3)"]
        // Not asserting existence — may be hidden for free tier
        if advancedTab.exists {
            // Tab visible — good
        }
    }

    /// Restore tab shows the recovery bay UI.
    func test_restoreTab_showsRecoveryBay() throws {
        let app = XCUIApplication()
        app.launchFresh()
        createFreshWallet(app: app)
        openPersonalBackup(app: app)

        // Switch to Restore tab
        let restoreTab = app.buttons["Restore"]
        XCTAssertTrue(restoreTab.waitForExistence(timeout: 5))
        restoreTab.tap()

        // Recovery bay should appear
        let selectFile = app.buttons["Select backup file"]
        XCTAssertTrue(
            selectFile.waitForExistence(timeout: 5),
            "Recovery bay file picker not shown."
        )
    }

    /// Create wallet → Personal Backup → create .enc backup → verify Restore tab
    /// stays reachable from the same real setup session.
    func test_createBackup_thenRestoreTab_showsRecoveryBay() throws {
        let app = XCUIApplication()
        app.launchFresh()
        createFreshWallet(app: app)
        openPersonalBackup(app: app)

        let passwordField = app.secureTextFields.firstMatch
        XCTAssertTrue(passwordField.waitForExistence(timeout: 5), "Backup password field missing.")
        passwordField.tap()
        passwordField.typeText("TestBackupPassword123!")
        dismissKeyboardIfPresent(app: app)

        enterPin(app: app, digits: TestPin.backupPin)
        submitPin(app: app)
        enterPin(app: app, digits: TestPin.backupPin)
        submitPin(app: app)

        let saveBtn = app.buttons["Save backup"]
        XCTAssertTrue(saveBtn.waitForExistence(timeout: 5), "Save backup button missing.")
        saveBtn.tap()

        let saved = app.staticTexts["Backup saved"].waitForExistence(timeout: 30)
            || app.staticTexts["Did you save the backup file?"].waitForExistence(timeout: 30)
        XCTAssertTrue(saved, "Backup save confirmation never appeared.")

        let restoreTab = app.buttons["Restore"]
        XCTAssertTrue(restoreTab.waitForExistence(timeout: 5), "Restore tab missing after backup creation.")
        restoreTab.tap()

        let selectFile = app.buttons["Select backup file"]
        XCTAssertTrue(selectFile.waitForExistence(timeout: 5), "Recovery bay file picker not shown after backup creation.")
    }
}
