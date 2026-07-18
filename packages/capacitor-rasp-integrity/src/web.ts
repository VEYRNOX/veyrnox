import { WebPlugin } from '@capacitor/core';
import type { RaspIntegrityPlugin, RaspVerdict } from './definitions';

/**
 * Web fallback — detects browser-level automation signals only.
 * On native platforms the Kotlin/ObjC plugin is used instead.
 */
export class RaspIntegrityWeb extends WebPlugin implements RaspIntegrityPlugin {
  async checkIntegrity(): Promise<RaspVerdict> {
    const hooked =
      navigator.webdriver === true ||
      document.documentElement.hasAttribute('webdriver') ||
      'callPhantom' in window ||
      '_phantom' in window ||
      '__nightmare' in window ||
      'domAutomation' in window;

    return {
      rooted: false,
      hookedProcess: hooked,
      emulator: false,
      tampered: false,
      debuggerAttached: false,
      screenCapture: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: false,
      suspiciousPackage: false,
      thirdPartyKeyboard: false,
      mockLocation: false,
      networkProxy: false,
      accessibilityService: false,
    };
  }
}
