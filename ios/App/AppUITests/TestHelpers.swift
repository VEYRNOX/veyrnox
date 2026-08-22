import XCTest

// Shared helpers for Veyrnox XCUITests.
// The app is a Capacitor webview — all UI elements are web content
// exposed through WKWebView's accessibility bridge.

enum TestPin {
    static let standard = "24681024"
    static let alternate = "13579135"
    static let backupPin = "246810246810"  // 12-digit backup PIN
}

// Known BIP-39 test mnemonic (DO NOT use with real funds).
// "abandon" x11 + "about" is the standard all-zero-entropy test vector.
enum TestSeed {
    static let words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    static let wordArray = words.split(separator: " ").map(String.init)
}

extension XCUIApplication {
    /// Launch with fresh-install state (clears vault/storage).
    func launchFresh() {
        launchArguments += ["--uitest-fresh-install"]
        launch()
    }

    /// Launch preserving existing state (for unlock/post-create tests).
    func launchPreserving() {
        launchArguments = launchArguments.filter { $0 != "--uitest-fresh-install" }
        launch()
    }
}

extension XCTestCase {
    /// Tap each digit on the on-screen PinPad keypad.
    func enterPin(app: XCUIApplication, digits: String) {
        let pinPad = app.otherElements["PIN entry"]
        XCTAssertTrue(pinPad.waitForExistence(timeout: 5), "PinPad group 'PIN entry' not found.")

        for ch in digits {
            tapPinPadDigit(ch, in: pinPad, app: app)
        }
    }

    /// Tap the PinPad submit button. Label varies by context.
    func submitPin(app: XCUIApplication, label: String = "Submit PIN") {
        let pinPad = app.otherElements["PIN entry"]
        XCTAssertTrue(pinPad.waitForExistence(timeout: 5), "PinPad group 'PIN entry' not found.")

        let submit = pinPad.buttons[label]
        XCTAssertTrue(
            submit.waitForExistence(timeout: 3),
            "Submit button '\(label)' not found."
        )
        tapWebButton(submit, in: app, failureMessage: "Submit button '\(label)' was not tappable.")
    }

    /// Focus the PinPad's keyboard-accessible group and type digits through its
    /// onKeyDown path. This is more stable than tapping WKWebView digit buttons
    /// for long backup PIN flows in the simulator.
    func enterPinByKeyboard(app: XCUIApplication, digits: String, ariaLabel: String = "PIN entry") {
        let pinPad = app.otherElements[ariaLabel]
        XCTAssertTrue(
            pinPad.waitForExistence(timeout: 5),
            "PinPad group '\(ariaLabel)' not found."
        )
        pinPad.tap()
        pinPad.typeText(digits)
    }

    /// Full PIN set+confirm cycle (used during wallet creation).
    func setPinFull(app: XCUIApplication, pin: String) {
        enterPin(app: app, digits: pin)
        submitPin(app: app)
        enterPin(app: app, digits: pin)
        submitPin(app: app)
    }

    /// Create a fresh wallet via the New Wallet tile + PIN flow.
    /// Leaves the app on the WalletCreatedFlash screen.
    func createFreshWallet(app: XCUIApplication, pin: String = TestPin.standard) {
        let tile = app.buttons["New wallet"]
        XCTAssertTrue(tile.waitForExistence(timeout: 10), "New wallet tile missing.")
        tile.tap()

        setPinFull(app: app, pin: pin)

        // Fail-closed banner must NOT appear
        let failBanner = app.staticTexts[
            "Wallet setup couldn't finish securely, so nothing was saved. Please set your PIN and try again."
        ]
        XCTAssertFalse(failBanner.waitForExistence(timeout: 8), "KEK/RASP fail-closed banner appeared.")

        let created = app.staticTexts["Created."]
        XCTAssertTrue(created.waitForExistence(timeout: 30), "Wallet created screen never appeared.")
    }

    /// Dismiss the WalletCreatedFlash by skipping backup.
    func skipBackupAndEnterWallet(app: XCUIApplication) {
        let skip = app.buttons["Skip for now — take me to my wallet"]
        if skip.waitForExistence(timeout: 5) {
            skip.tap()
        }
    }

    /// From WalletCreatedFlash, enter the Personal Backup screen.
    func openPersonalBackup(app: XCUIApplication) {
        let backupBtn = app.buttons["Set up Personal Backup"]
        XCTAssertTrue(backupBtn.waitForExistence(timeout: 5), "Backup CTA missing.")
        backupBtn.tap()

        let heading = app.staticTexts["Encrypted Personal Backup"]
        if heading.waitForExistence(timeout: 12) {
            return
        }

        // Fresh installs can surface the one-time telemetry consent screen
        // before the routed app shell renders. Dismiss it so backup tests can
        // exercise the real Personal Backup flow deterministically.
        let consentHeading = app.staticTexts["Help improve Veyrnox"]
        if consentHeading.waitForExistence(timeout: 1) {
            let denyConsent = app.buttons["No thanks"]
            XCTAssertTrue(
                denyConsent.waitForExistence(timeout: 5),
                "Telemetry consent screen appeared, but its dismiss CTA was missing."
            )
            denyConsent.tap()

            XCTAssertTrue(
                heading.waitForExistence(timeout: 12),
                "Personal Backup screen did not appear after dismissing telemetry consent."
            )
            return
        }

        let tierLocked = app.staticTexts["Safety Plus feature"]
        XCTAssertFalse(
            tierLocked.waitForExistence(timeout: 1),
            "Personal Backup route is still tier-locked. Confirm the simulator is pointed at the staging server with VITE_FORCE_TIER=safety_plus."
        )

        XCTFail("Personal Backup screen did not appear after tapping the backup CTA.")
    }

    /// Open the paid Advanced shares tab if it is present, returning false when
    /// the feature is unavailable in the current build or tier.
    @discardableResult
    func openAdvancedRecoveryShares(app: XCUIApplication) -> Bool {
        let advancedTab = app.buttons["Advanced (2-of-3)"]
        guard advancedTab.waitForExistence(timeout: 5) else { return false }
        advancedTab.tap()
        return true
    }

    /// Wait for text to appear, with a custom failure message.
    func waitForText(_ text: String, in app: XCUIApplication, timeout: TimeInterval = 10, message: String? = nil) {
        let el = app.staticTexts[text]
        XCTAssertTrue(
            el.waitForExistence(timeout: timeout),
            message ?? "Text '\(text)' never appeared."
        )
    }

    /// Wait for a button to appear.
    func waitForButton(_ label: String, in app: XCUIApplication, timeout: TimeInterval = 10) -> XCUIElement {
        let btn = app.buttons[label]
        XCTAssertTrue(btn.waitForExistence(timeout: timeout), "Button '\(label)' never appeared.")
        return btn
    }

    /// Dismiss the iOS software keyboard so WKWebView controls underneath
    /// become tappable again.
    func dismissKeyboardIfPresent(app: XCUIApplication) {
        let doneLabels = ["Done", "Return", "Hide keyboard"]
        for label in doneLabels {
            let toolbarButton = app.toolbars.buttons[label]
            if toolbarButton.waitForExistence(timeout: 1) {
                toolbarButton.tap()
                return
            }

            let keyboardButton = app.keyboards.buttons[label]
            if keyboardButton.waitForExistence(timeout: 1) {
                keyboardButton.tap()
                return
            }
        }

        let heading = app.staticTexts["Encrypted Personal Backup"]
        if heading.waitForExistence(timeout: 1) {
            heading.tap()
        }
    }

    /// WKWebView controls can report exists=true but hittable=false even when
    /// their frame is visibly on-screen. Fall back to a center coordinate tap
    /// against the main window so simulator runs can drive the visual button.
    func tapWebButton(_ element: XCUIElement, in app: XCUIApplication, failureMessage: String) {
        if element.isHittable {
            element.tap()
            return
        }

        let frame = element.frame
        XCTAssertFalse(frame.isEmpty, failureMessage)

        let coordinate = element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        coordinate.tap()
    }

    /// Tap a digit using the stable 3x4 PinPad layout instead of re-querying
    /// each WKWebView button between taps.
    func tapPinPadDigit(_ digit: Character, in pinPad: XCUIElement, app: XCUIApplication) {
        let offsets: [Character: CGVector] = [
            "1": CGVector(dx: 0.16, dy: 0.17),
            "2": CGVector(dx: 0.50, dy: 0.17),
            "3": CGVector(dx: 0.84, dy: 0.17),
            "4": CGVector(dx: 0.16, dy: 0.36),
            "5": CGVector(dx: 0.50, dy: 0.36),
            "6": CGVector(dx: 0.84, dy: 0.36),
            "7": CGVector(dx: 0.16, dy: 0.55),
            "8": CGVector(dx: 0.50, dy: 0.55),
            "9": CGVector(dx: 0.84, dy: 0.55),
            "0": CGVector(dx: 0.50, dy: 0.74),
        ]

        guard let offset = offsets[digit] else {
            XCTFail("Unsupported PinPad digit '\(digit)'.")
            return
        }

        let frame = pinPad.frame
        XCTAssertFalse(frame.isEmpty, "PinPad group 'PIN entry' had an empty frame.")

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 1), "Main app window missing.")

        let tapX = frame.minX + (frame.width * offset.dx)
        let tapY = frame.minY + (frame.height * offset.dy)
        let windowOrigin = window.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        windowOrigin.withOffset(CGVector(dx: tapX, dy: tapY)).tap()
    }
}
