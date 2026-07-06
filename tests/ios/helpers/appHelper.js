// Helper utilities for Appium / XCUITest testing on iOS.
//
// Veyrnox on iOS is a Capacitor app: the UI lives inside a WKWebView. XCUITest
// exposes the DOM to the accessibility tree, so a DOM `id="unlock-password"` or
// an `aria-label` surfaces as an accessibility id / element name. That means the
// cross-platform WDIO accessibility-id selector (`~unlock-password`) is the most
// portable way to reach the same elements the Android suite reaches via
// `resource-id`. When the accessibility tree is not enough (dynamic web content,
// duplicate labels), switch into the webview context — see `withWebview()` below.
import { ethers } from 'ethers';

class AppHelper {
  constructor() {
    this.testVaultPassword = 'TestPassword123!@#'; // Min 12 chars per Veyrnox requirements (H-A)
    // iOS debug installs commonly keep the release bundle id. Override with
    // VEYRNOX_IOS_BUNDLE_ID if your debug scheme appends a suffix.
    this.bundleId = process.env.VEYRNOX_IOS_BUNDLE_ID || 'com.veyrnox.app';
  }

  /**
   * Find an element by accessibility id (DOM id / aria-label bridged to a11y).
   * Works in both native and webview contexts.
   */
  async findByAccessibilityId(accessibilityId) {
    return await driver.$(`~${accessibilityId}`);
  }

  /**
   * Find element by visible text/label using an iOS NSPredicate.
   * Matches buttons, static text, and other elements whose label/name equals text.
   */
  async findByText(text) {
    return await driver.$(
      `-ios predicate string:label == "${text}" OR name == "${text}" OR value == "${text}"`
    );
  }

  /**
   * Find element by a partial (contains) label — useful for badges/status text.
   */
  async findByPartialText(text) {
    return await driver.$(
      `-ios predicate string:label CONTAINS "${text}" OR name CONTAINS "${text}"`
    );
  }

  /**
   * Input text into a field.
   */
  async typeText(element, text) {
    await element.clearValue();
    await element.setValue(text);
  }

  /**
   * Wait for element to be visible.
   */
  async waitForElement(element, timeout = 10000) {
    await element.waitForDisplayed({ timeout });
    return element;
  }

  /**
   * Tap/click an element.
   */
  async tap(element) {
    await element.click();
  }

  /**
   * Get text from element.
   */
  async getText(element) {
    return await element.getText();
  }

  /**
   * Get current app state (1=not running, 4=running foreground, etc.).
   */
  async getAppState() {
    return await driver.execute('mobile: queryAppState', { bundleId: this.bundleId });
  }

  /**
   * Cold-restart the app: terminate then relaunch. Mirrors the Android
   * "force-close + cold restart" step used by the biometric re-enroll test.
   */
  async coldRestart() {
    await driver.execute('mobile: terminateApp', { bundleId: this.bundleId });
    await this.pause(1000);
    await driver.execute('mobile: launchApp', { bundleId: this.bundleId });
    await this.pause(1500);
  }

  /**
   * Run a callback inside the WKWebView context, then restore native context.
   * Use when accessibility bridging is insufficient and you need raw DOM access.
   */
  async withWebview(fn) {
    const contexts = await driver.getContexts();
    const webview = contexts.find((c) => String(c).includes('WEBVIEW'));
    if (!webview) {
      console.log('⚠️ No WEBVIEW context available — staying native');
      return await fn();
    }
    await driver.switchContext(webview);
    try {
      return await fn();
    } finally {
      await driver.switchContext('NATIVE_APP');
    }
  }

  /**
   * Attempt to grab an iOS log buffer. NOTE (iOS-F9): on iOS 26 the app's own
   * NSLog lines are NOT streamable via Appium `syslog`/`log collect` — see
   * project memory `ios26-nslog-not-capturable-se-daemon-evidence.md`. The
   * authoritative SE-unlock `os_log(public)` trace must be captured on the Mac
   * with `log stream --predicate 'process=="Veyrnox"'`. This helper returns
   * whatever Appium can see, which is used only for the leak canary.
   */
  async tryGetLogs(type = 'syslog') {
    try {
      return await driver.getLogs(type);
    } catch (e) {
      console.log(`Could not retrieve iOS "${type}" logs: ${e.message}`);
      return [];
    }
  }

  /**
   * Navigate back (iOS has no hardware back; tap a nav-bar Back button if present).
   */
  async goBack() {
    try {
      const back = await driver.$(
        '-ios predicate string:type == "XCUIElementTypeButton" AND (name == "Back" OR label == "Back")'
      );
      if (await back.isExisting()) await back.click();
    } catch (e) {
      // no-op — already at root
    }
  }

  /**
   * Pause execution (for waiting on animations / biometric prompts).
   */
  async pause(ms = 1000) {
    await driver.pause(ms);
  }
}

export default new AppHelper();
