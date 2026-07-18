/**
 * Raw verdict returned by the native bridge.
 * Each field is true ONLY when actively detected — absence means "not detected",
 * NOT "clean". The JS gate must treat an unavailable probe as TIER.WARN, not TIER.ALLOW.
 *
 * Android fields: all 14 (rooted through accessibilityService)
 * iOS fields: jailbroken, hookedProcess, emulator, tampered, screenCapture,
 *             overlayActive, debuggerAttached
 */
export interface RaspVerdict {
  /** Root/jailbreak detected (file paths, boot state, sandbox escape, fork()) */
  rooted?: boolean;
  /** Legacy iOS alias for rooted */
  jailbroken?: boolean;
  /** Frida / Xposed / substrate / JDWP debugger attached */
  hookedProcess: boolean;
  /** Android emulator / iOS Simulator */
  emulator: boolean;
  /** Signing cert mismatch vs RELEASE_CERT_SHA256 */
  tampered: boolean;
  /** JDWP / sysctl P_TRACED debugger attached (platform-symmetry field) */
  debuggerAttached?: boolean;
  /** Miracast/WFD/AirPlay screen mirroring active */
  screenCapture?: boolean;
  /** Accessibility overlay / AssistiveTouch active */
  overlayActive?: boolean;
  /** Android: ADB enabled or Developer Options on */
  developerMode?: boolean;
  /** Android: app running inside VirtualApp / Parallel Space container */
  virtualApp?: boolean;
  /** Android: Magisk Manager / LSPosed Manager / SuperSU installed */
  suspiciousPackage?: boolean;
  /** Android: non-system IME active (potential keylogger) */
  thirdPartyKeyboard?: boolean;
  /** Android: mock location provider enabled */
  mockLocation?: boolean;
  /** Android: HTTP/HTTPS proxy configured on device (Burp / Charles) */
  networkProxy?: boolean;
  /** Android: non-system accessibility service active (potential tapjack vector) */
  accessibilityService?: boolean;
}

/** Normalised signal set produced by nativeProbeSource() from RaspVerdict */
export interface RaspSignals {
  rooted: boolean;
  hooked: boolean;
  emulator: boolean;
  tampered: boolean;
  /** Soft environment signals (developer mode, accessibility, third-party keyboard…) */
  elevated: boolean;
}

/** Enumeration of environment conditions, ordered by severity */
export type RaspCondition =
  | 'CLEAN'
  | 'ELEVATED'
  | 'ROOTED'
  | 'EMULATOR'
  | 'HOOKED'
  | 'TAMPERED'
  | 'INTEGRITY_FAIL'
  | 'INTEGRITY_UNAVAILABLE';

/** Action tiers produced by classifyEnvironment() */
export type RaspTier = 'ALLOW' | 'WARN' | 'BLOCK';

/** Full RASP artifact consumed by UI surfaces and the presign gate */
export interface RaspArtifact {
  tier: RaspTier;
  condition: RaspCondition;
  /** Human-readable sentence for the security banner */
  sentence: string;
  /** Action keys blocked at this tier (e.g. 'seed-reveal', 'export', 'import') */
  blockedActions: string[];
  /** True when biometric re-confirm is required before the blocked action */
  requiresBiometric: boolean;
  /** True when requiresConfirmation checkbox is shown before signing */
  requiresConfirmation: boolean;
}

/** Plugin bridge interface */
export interface RaspIntegrityPlugin {
  /**
   * Run all native integrity checks and return a raw verdict.
   * Each field is true only when actively detected.
   * Throws if the native probe is unavailable — the JS layer must treat
   * a thrown probe as INTEGRITY_UNAVAILABLE → TIER.WARN, never TIER.ALLOW.
   */
  checkIntegrity(): Promise<RaspVerdict>;
}
