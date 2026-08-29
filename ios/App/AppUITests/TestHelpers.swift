import XCTest

// Shared helpers for Veyrnox XCUITests.
// The app is a Capacitor webview — all UI elements are web content
// exposed through WKWebView's accessibility bridge.

enum TestPin {
    // Must remain accepted by checkPinStrength() for the real create flow.
    static let standard = "19283746"
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

/// Timeouts for the first actionable UI query after launch.
///
/// `XCUIApplication.launch()` returns when the process is idle, not when the
/// Capacitor surface has exposed web-backed controls through accessibility.
/// On cold CI runners, the first real button query can lag far behind launch.
enum UITestTimeouts {
    /// First actionable element inside the Capacitor surface.
    static let firstElement: TimeInterval = 60
}

extension XCTestCase {
    /// Tap each digit on the on-screen PinPad keypad.
    func enterPin(app: XCUIApplication, digits: String) {
        for ch in digits {
            let key = app.buttons[String(ch)]
            XCTAssertTrue(
                key.waitForExistence(timeout: 3),
                "PinPad digit '\(ch)' not found."
            )
            key.tap()
        }
    }

    /// Tap the PinPad submit button. Label varies by context.
    func submitPin(app: XCUIApplication, label: String = "Submit PIN") {
        let submit = app.buttons[label]
        XCTAssertTrue(
            submit.waitForExistence(timeout: 3),
            "Submit button '\(label)' not found."
        )
        submit.tap()
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
        XCTAssertTrue(
            tile.waitForExistence(timeout: UITestTimeouts.firstElement),
            "New wallet tile missing."
        )
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
}
