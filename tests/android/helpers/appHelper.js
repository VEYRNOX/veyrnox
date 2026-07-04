// Helper utilities for Appium testing
import { ethers } from 'ethers';

class AppHelper {
  constructor() {
    this.testVaultPassword = 'TestPassword123!@#'; // Min 12 chars per Veyrnox requirements
    this.appPackage = 'com.veyrnox.app.debug'; // Debug build package
  }

  /**
   * Wait for an element by accessibility id and return it
   */
  async findByAccessibilityId(accessibilityId, timeout = 10000) {
    const selector = `~${accessibilityId}`;
    return await driver.$(`android=${selector}`);
  }

  /**
   * Find element by text using Android UiAutomator selector
   */
  async findByText(text) {
    // Use Android's native UiAutomator selector
    return await driver.$(`android=new UiSelector().text("${text}").instance(0)`);
  }

  /**
   * Input text into a field
   */
  async typeText(element, text) {
    await element.clearValue();
    await element.setValue(text);
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(element, timeout = 10000) {
    await element.waitForDisplayed({ timeout });
    return element;
  }

  /**
   * Tap/click an element
   */
  async tap(element) {
    await element.click();
  }

  /**
   * Get text from element
   */
  async getText(element) {
    return await element.getText();
  }

  /**
   * Wait for and dismiss a specific dialog/toast
   */
  async dismissDialog(title = null) {
    await driver.pause(500); // Let dialog appear
    const dismissBtn = await this.findByText('Dismiss') || await this.findByText('OK');
    if (dismissBtn) {
      await this.tap(dismissBtn);
    }
  }

  /**
   * Get current app state
   */
  async getAppState() {
    return await driver.queryAppState('com.veyrnox.wallet');
  }

  /**
   * Navigate back
   */
  async goBack() {
    await driver.back();
  }

  /**
   * Pause execution (for debugging)
   */
  async pause(ms = 1000) {
    await driver.pause(ms);
  }
}

export default new AppHelper();
