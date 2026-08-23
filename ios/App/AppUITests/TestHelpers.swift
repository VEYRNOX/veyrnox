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

/// Timeouts for the first UI query after a launch.
///
/// `XCUIApplication.launch()` returns when the PROCESS is idle, not when the
/// Capacitor WKWebView has painted. On a warm dev simulator the gap is
/// invisible; on a cold CI runner it is not, and the first element query
/// races the paint.
///
/// Measured, not guessed — CI run 32623310002: the test was allowed 10s to
/// find the entry tile and the whole test took 70.5s, so launch consumed the
/// best part of a minute and the tile wait then expired against a webview
/// that had not painted. The tile itself was never missing:
/// src/components/EntryTiles.jsx defines "New wallet".
enum UITestTimeouts {
    /// WKWebView existing at all. Generous: this covers cold-simulator boot.
    static let webViewPaint: TimeInterval = 90
    /// A specific element inside an already-painted webview. Covers React
    /// mount + first render, which is fast once the webview is up.
    static let firstElement: TimeInterval = 60
}

extension XCTestCase {
    /// Block until the Capacitor webview exists, before querying anything in it.
    ///
    /// Worth its own assertion rather than folding into the element wait: it
    /// splits one ambiguous failure into two actionable ones. "Webview never
    /// appeared" means the app launched but never painted — a broken bundle,
    /// a missing `cap sync`, or a runner too slow. "Tile never appeared"
    /// then means what the test says it means: a real UI regression. Before
    /// this, both read as "New wallet entry tile never appeared".
    func waitForWebView(app: XCUIApplication, timeout: TimeInterval = UITestTimeouts.webViewPaint) {
        XCTAssertTrue(
            app.webViews.firstMatch.waitForExistence(timeout: timeout),
            "Capacitor webview never appeared within \(Int(timeout))s — the app launched but never painted."
        )
    }

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
        waitForWebView(app: app)
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
