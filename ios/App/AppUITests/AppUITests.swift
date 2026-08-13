// AppUITests.swift
//
// Minimal XCUITest smoke — the iOS analogue to Firebase Test Lab's Android
// Robo crawl. Walks fresh install → PIN → Create Wallet → seed reveal, and
// hard-fails if the KEK/RASP fail-closed banner ever appears (that banner is
// what got Play build 5 rejected under Broken Functionality).
//
// Runs in Firebase Test Lab on real iPhones via the ios-smoke job in
// .github/workflows/firebase-test-lab.yml.

import XCTest

final class AppUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Golden path a reviewer would walk on first launch.
    /// If this test ever fails on a stock device the app is NOT ready to submit.
    func test_freshInstall_reachesSeedScreen() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--uitest-fresh-install"]
        app.launch()

        // 1. PIN entry — set + confirm.
        let pin = "246810"
        enterPin(app: app, digits: pin, stage: "set")
        enterPin(app: app, digits: pin, stage: "confirm")

        // 2. Create Wallet must appear on the entry screen.
        let createButton = app.buttons["Create Wallet"]
        XCTAssertTrue(
            createButton.waitForExistence(timeout: 10),
            "Create Wallet button never appeared — same screen Play reviewer saw."
        )
        createButton.tap()

        // 3. The fail-closed banner MUST NOT appear. This is the exact string
        //    Play rejected build 5 for. Assert absence, not silence.
        let failureBanner = app.staticTexts[
            "Wallet setup couldn't finish securely, so nothing was saved. Please set your PIN and try again."
        ]
        XCTAssertFalse(
            failureBanner.waitForExistence(timeout: 8),
            "KEK/RASP fail-closed banner appeared — this is the exact defect Play rejected on Android."
        )

        // 4. Seed reveal screen must appear within a reasonable window.
        //    Matches any header containing 'seed' (case-insensitive) so a
        //    copy tweak doesn't break the smoke — only a broken flow does.
        let seedHeader = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] 'seed'")
        ).firstMatch
        XCTAssertTrue(
            seedHeader.waitForExistence(timeout: 15),
            "Seed reveal screen never appeared — Create Wallet path is broken."
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
}
