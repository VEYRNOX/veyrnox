// FirstPaintNotBlankTests.swift
//
// Regression guard for Apple 1.0.1 rejection #3 (2026-09-10, iPad Air 11-inch
// M3 iPadOS 26.6.1): "We were unable to access the app because it displayed a
// blank page upon launch." The exact failure mode we cannot reproduce on
// iPadOS 26.5, but we CAN pin its symptoms: something known-good from
// WalletEntry has to render within a bounded window after cold launch, and
// neither the RootErrorBoundary nor the boot watchdog fallback screens are
// allowed to appear.
//
// Runs on the iPad Air 11-inch (M3) / iOS 26.5 destination added to Xcode
// Cloud's "Default" workflow on 2026-09-10 (ciWorkflows/50ECE1E6-…). If Xcode
// Cloud ever exposes iPadOS 26.6+ runtimes, bump the workflow destination
// there — this test file needs no change.

import XCTest

final class FirstPaintNotBlankTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Cold-launch smoke: something recognisable from WalletEntry must render,
    /// and neither fallback UI (RootErrorBoundary or boot watchdog) may show.
    func test_coldLaunchRendersWalletEntry_notBlank() throws {
        let app = XCUIApplication()
        app.launchFresh()

        // 1. WalletEntry has a "Veyrnox" wordmark rendered as static text and
        //    a "New wallet" tile as a button. Either signals real JS mount.
        //    Use New wallet — the tile is the actionable proof that React
        //    hydrated, not just that the raw HTML shell painted.
        let entryTile = app.buttons["New wallet"]
        let appeared = entryTile.waitForExistence(timeout: UITestTimeouts.firstElement)
        XCTAssertTrue(
            appeared,
            "WalletEntry never rendered — no 'New wallet' tile within " +
            "\(UITestTimeouts.firstElement)s. This is the exact failure Apple " +
            "flagged as blank-page on iPad Air 11-inch (M3) iPadOS 26.6.1."
        )

        // 2. RootErrorBoundary must NOT be visible. Its heading is unique.
        let rootBoundary = app.staticTexts["Veyrnox couldn’t start"]
        XCTAssertFalse(
            rootBoundary.exists,
            "RootErrorBoundary is rendering on cold launch — something threw " +
            "during App tree mount. Read Sentry for the exception."
        )

        // 3. Boot watchdog fallback must NOT be visible. The watchdog swaps
        //    identical fallback markup into #root at 5s if React never mounted,
        //    so its heading matches the boundary's heading. If we reached the
        //    New-wallet tile above, React mounted and the watchdog stayed
        //    dormant — the below is belt-and-braces in case a late throw
        //    somehow unmounts everything before the assertion window closes.
        XCTAssertFalse(
            app.buttons["Reload Veyrnox"].exists,
            "Boot watchdog fallback is showing after WalletEntry rendered — " +
            "the tree unmounted mid-run. Investigate."
        )
    }
}
