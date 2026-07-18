/**
 * JS gate layer — presign gate, classify, degrade.
 *
 * This is the full RASP decision engine extracted from Veyrnox:
 *   - classifyEnvironment(signals) → RaspCondition
 *   - detect(probeSource) → RaspCondition (fail-closed to INTEGRITY_UNAVAILABLE)
 *   - degrade(condition) → RaspArtifact (fail-closed to TIER.BLOCK)
 *   - nativeProbeSource() → ProbeSource (maps RaspVerdict to normalised signals)
 *   - getFreshRaspArtifact() → RaspArtifact (fresh probe with 1500ms timeout)
 *
 * Invariants enforced:
 *   I3: degrade() takes condition ONLY — no wallet-set handle — so the artifact
 *       is byte-identical in real and decoy sessions.
 *   I4: any unrecognised condition → TIER.BLOCK; timeout/throw → TIER.BLOCK;
 *       available !== true → INTEGRITY_UNAVAILABLE (never CLEAN).
 */

import { Capacitor } from '@capacitor/core';
import { RaspIntegrity } from './index';
import type { RaspArtifact, RaspCondition, RaspSignals, RaspVerdict } from './definitions';

// ── Constants ──────────────────────────────────────────────────────────────

export const CONDITION = Object.freeze({
  CLEAN: 'clean',
  ROOTED: 'rooted',
  ELEVATED: 'elevated',
  EMULATOR: 'emulator',
  HOOKED: 'hooked',
  TAMPERED: 'tampered',
  INTEGRITY_FAIL: 'integrity_fail',
  INTEGRITY_UNAVAILABLE: 'integrity_unavailable',
} as const);

export const TIER = Object.freeze({
  ALLOW: 'allow',
  WARN: 'warn-before-sign',
  BLOCK: 'block-signing',
} as const);

const SENSITIVE = Object.freeze(['sign', 'seed-reveal', 'export', 'import']);

// ── Degradation policy ─────────────────────────────────────────────────────

const SPECS: Record<string, Omit<RaspArtifact, 'condition'>> = {
  [CONDITION.CLEAN]: {
    tier: TIER.ALLOW,
    sentence: '',
    blockedActions: [],
    requiresBiometric: false,
    requiresConfirmation: false,
  },
  [CONDITION.ROOTED]: {
    tier: TIER.WARN,
    sentence:
      'This device looks modified (rooted or jailbroken), which can weaken its protections — continue only if you trust it.',
    blockedActions: ['seed-reveal', 'export', 'import'],
    requiresBiometric: true,
    requiresConfirmation: true,
  },
  [CONDITION.ELEVATED]: {
    tier: TIER.WARN,
    sentence:
      'A device setting that can weaken protection is on (for example developer mode or an accessibility service). Continue only if you trust this device.',
    blockedActions: [],
    requiresBiometric: true,
    requiresConfirmation: true,
  },
  [CONDITION.INTEGRITY_UNAVAILABLE]: {
    tier: TIER.WARN,
    sentence: "We couldn't confirm this device's integrity just now — continue with extra caution.",
    blockedActions: ['seed-reveal', 'export', 'import'],
    requiresBiometric: true,
    requiresConfirmation: true,
  },
  [CONDITION.EMULATOR]: {
    tier: TIER.BLOCK,
    sentence: 'Signing is turned off in emulated environments.',
    blockedActions: ['sign'],
    requiresBiometric: false,
    requiresConfirmation: false,
  },
  [CONDITION.INTEGRITY_FAIL]: {
    tier: TIER.BLOCK,
    sentence: 'This device failed an integrity check, so signing and key access are turned off.',
    blockedActions: [...SENSITIVE],
    requiresBiometric: false,
    requiresConfirmation: false,
  },
  [CONDITION.HOOKED]: {
    tier: TIER.BLOCK,
    sentence:
      'Another program appears to be inspecting this app, so signing and key access are turned off until it stops.',
    blockedActions: [...SENSITIVE],
    requiresBiometric: false,
    requiresConfirmation: false,
  },
  [CONDITION.TAMPERED]: {
    tier: TIER.BLOCK,
    sentence: 'This app appears to have been altered, so signing and key access are turned off.',
    blockedActions: [...SENSITIVE],
    requiresBiometric: false,
    requiresConfirmation: false,
  },
};

const FAIL_CLOSED: RaspArtifact = Object.freeze({
  tier: TIER.BLOCK,
  condition: CONDITION.INTEGRITY_UNAVAILABLE as RaspCondition,
  sentence: "We couldn't safely evaluate this device, so signing and key access are turned off.",
  blockedActions: [...SENSITIVE],
  requiresBiometric: false,
  requiresConfirmation: false,
});

/**
 * Map a condition to its response artifact.
 * PURE: no wallet-set handle — byte-identical in real and decoy sessions (I3).
 * FAIL-CLOSED: any unrecognised condition → TIER.BLOCK (I4).
 */
export function degrade(condition: RaspCondition): RaspArtifact {
  const spec = Object.prototype.hasOwnProperty.call(SPECS, condition) ? SPECS[condition] : null;
  if (!spec) return { ...FAIL_CLOSED };
  return {
    tier: spec.tier,
    condition,
    sentence: spec.sentence,
    blockedActions: [...spec.blockedActions],
    requiresBiometric: spec.requiresBiometric,
    requiresConfirmation: spec.requiresConfirmation,
  };
}

// ── Classify ───────────────────────────────────────────────────────────────

/**
 * Map a normalised signal set to a condition.
 * The strongest (most dangerous) active signal wins.
 * Absent/undefined fields count as "not observed", never as clean.
 */
export function classifyEnvironment(signals: Partial<RaspSignals>): RaspCondition {
  const s = signals || {};
  if (s.tampered) return CONDITION.TAMPERED as RaspCondition;
  if (s.hooked) return CONDITION.HOOKED as RaspCondition;
  if (s.emulator) return CONDITION.EMULATOR as RaspCondition;
  if (s.rooted) return CONDITION.ROOTED as RaspCondition;
  if (s.elevated) return CONDITION.ELEVATED as RaspCondition;
  return CONDITION.CLEAN as RaspCondition;
}

/** Compose two conditions: return the more dangerous one */
export function composeConditions(a: RaspCondition, b: RaspCondition): RaspCondition {
  const precedence: Record<string, number> = {
    [CONDITION.TAMPERED]: 7,
    [CONDITION.HOOKED]: 6,
    [CONDITION.INTEGRITY_FAIL]: 5,
    [CONDITION.EMULATOR]: 4,
    [CONDITION.ROOTED]: 3,
    [CONDITION.INTEGRITY_UNAVAILABLE]: 2,
    [CONDITION.ELEVATED]: 1,
    [CONDITION.CLEAN]: 0,
  };
  return (precedence[a] ?? 0) >= (precedence[b] ?? 0) ? a : b;
}

// ── Detect ─────────────────────────────────────────────────────────────────

export interface ProbeSource {
  available: boolean;
  signals?: Partial<RaspSignals>;
}

export const UNAVAILABLE_PROBE_SOURCE: ProbeSource = Object.freeze({ available: false });

/**
 * Detect environment condition from a probe source.
 * FAIL-CLOSED: available !== true → INTEGRITY_UNAVAILABLE (never CLEAN).
 * Shape drift (missing booleans) → INTEGRITY_UNAVAILABLE.
 */
export function detect(probeSource: ProbeSource = UNAVAILABLE_PROBE_SOURCE): RaspCondition {
  if (!probeSource || probeSource.available !== true) {
    return CONDITION.INTEGRITY_UNAVAILABLE as RaspCondition;
  }
  const signals = probeSource.signals;
  if (
    signals == null ||
    typeof signals !== 'object' ||
    typeof (signals as RaspSignals).rooted !== 'boolean' ||
    typeof (signals as RaspSignals).hooked !== 'boolean' ||
    typeof (signals as RaspSignals).emulator !== 'boolean' ||
    typeof (signals as RaspSignals).tampered !== 'boolean'
  ) {
    return CONDITION.INTEGRITY_UNAVAILABLE as RaspCondition;
  }
  return classifyEnvironment(signals as RaspSignals);
}

// ── Native probe adapter ────────────────────────────────────────────────────

/**
 * Call the native bridge and normalise the verdict into a ProbeSource.
 * Soft environment signals (developerMode, overlayActive, etc.) → elevated.
 * BLOCK-tier signals (debuggerAttached, screenCapture) → hooked.
 */
export async function nativeProbeSource(): Promise<ProbeSource> {
  try {
    const verdict: RaspVerdict = await RaspIntegrity.checkIntegrity();

    if (!verdict || typeof verdict !== 'object') {
      return UNAVAILABLE_PROBE_SOURCE;
    }

    const softElevated =
      !!verdict.developerMode ||
      !!verdict.virtualApp ||
      !!verdict.suspiciousPackage ||
      !!verdict.thirdPartyKeyboard ||
      !!verdict.mockLocation ||
      !!verdict.networkProxy ||
      !!verdict.accessibilityService ||
      !!verdict.overlayActive;

    const signals: RaspSignals = {
      rooted: !!(verdict.rooted || verdict.jailbroken),
      hooked: !!(verdict.hookedProcess || verdict.debuggerAttached || verdict.screenCapture),
      emulator: !!verdict.emulator,
      tampered: !!verdict.tampered,
      elevated: softElevated,
    };

    // Validate shape
    if (
      typeof signals.rooted !== 'boolean' ||
      typeof signals.hooked !== 'boolean' ||
      typeof signals.emulator !== 'boolean' ||
      typeof signals.tampered !== 'boolean'
    ) {
      return UNAVAILABLE_PROBE_SOURCE;
    }

    return { available: true, signals };
  } catch {
    return UNAVAILABLE_PROBE_SOURCE;
  }
}

/**
 * On native: return nativeSource when available === true; otherwise UNAVAILABLE.
 * On web: return browserSource.
 * Never falls back from native-unavailable to browser CLEAN (C-01 fix, PR #825).
 */
export function selectPresignProbeSource(
  isNative: boolean,
  nativeSource: ProbeSource | null,
  browserSource: ProbeSource,
): ProbeSource {
  if (!isNative) return browserSource;
  return nativeSource?.available === true ? nativeSource : UNAVAILABLE_PROBE_SOURCE;
}

// ── Browser probe ──────────────────────────────────────────────────────────

export function getBrowserProbeSource(): ProbeSource {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const doc = typeof document !== 'undefined' ? document : null;
  const win = typeof window !== 'undefined' ? window : ({} as Window & typeof globalThis);

  const hooked = get(() =>
    (nav as { webdriver?: boolean }).webdriver === true ||
    !!doc?.documentElement.hasAttribute('webdriver') ||
    'callPhantom' in win ||
    '_phantom' in win ||
    '__nightmare' in win ||
    'domAutomation' in win,
  );

  return {
    available: true,
    signals: {
      rooted: false,
      hooked,
      emulator: false,
      tampered: false,
      elevated: false,
    },
  };
}

function get<T>(fn: () => T, fallback?: T): T {
  try {
    return fn();
  } catch {
    return fallback as T;
  }
}

// ── Fresh presign artifact ─────────────────────────────────────────────────

const FRESH_PROBE_TIMEOUT_MS = 1500;

function withFailClosedTimeout<T>(promise: Promise<T>, ms: number): Promise<T | ProbeSource> {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(UNAVAILABLE_PROBE_SOURCE);
    }, ms);
    Promise.resolve(promise)
      .then(v => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(UNAVAILABLE_PROBE_SOURCE);
      });
  });
}

/**
 * Fresh RASP probe at sign time — use this on the presign hot-path.
 * Runs native + browser probes in parallel, composes, degrades.
 * Fail-closed: timeout / throw / shape drift → TIER.BLOCK.
 *
 * @example
 * const artifact = await getFreshRaspArtifact();
 * if (artifact.tier === TIER.BLOCK) throw new Error(artifact.sentence);
 */
export async function getFreshRaspArtifact(): Promise<RaspArtifact> {
  try {
    const isNative = Capacitor.isNativePlatform();
    const browserSource = getBrowserProbeSource();

    const nativeSource = isNative
      ? await withFailClosedTimeout(nativeProbeSource(), FRESH_PROBE_TIMEOUT_MS)
      : null;

    const selectedSource = selectPresignProbeSource(isNative, nativeSource as ProbeSource | null, browserSource);
    const condition = detect(selectedSource);
    const artifact = degrade(condition);

    if (!artifact || typeof artifact.tier === 'undefined') {
      return { ...FAIL_CLOSED };
    }
    return artifact;
  } catch {
    return { ...FAIL_CLOSED };
  }
}

/**
 * Check whether an action is blocked by the current RASP artifact.
 * Pass the artifact from getFreshRaspArtifact() or useRaspArtifact().
 *
 * @example
 * const artifact = await getFreshRaspArtifact();
 * if (isSensitiveActionBlocked(artifact, 'seed-reveal')) throw new Error('blocked');
 */
export function isSensitiveActionBlocked(
  artifact: RaspArtifact | null | undefined,
  action: string,
): boolean {
  if (!artifact) return true; // null artifact → fail-closed (I4)
  return artifact.tier === TIER.BLOCK || artifact.blockedActions.includes(action);
}
