/**
 * tierBadge.js — pure helper: maps a hardware KEK security tier name to a
 * display-layer badge descriptor.
 *
 * This is DISPLAY-ONLY logic with no side-effects — safe to import anywhere
 * (web, native, tests). It deliberately avoids importing any crypto, plugin,
 * or React code.
 *
 * Tier names come from HardwareKekPlugin.kt (Android) or HardwareKekPlugin.m (iOS):
 *   'STRONGBOX'              — Android StrongBox (dedicated secure chip, strongest)
 *   'TRUSTED_ENVIRONMENT'    — Android TEE (hardware-backed, standard Keystore)
 *   'SECURE_HARDWARE_PRE31'  — Android pre-API-31 secure hardware (legacy name)
 *   'UNKNOWN_SECURE'         — Android: reported secure but tier unclassified
 *   'SecureEnclave'          — iOS Secure Enclave (P-256, non-extractable)
 *   anything else / absent   — generic label (web WebAuthn PRF, or tier unknown)
 *
 * The returned `variant` is a semantic colour token:
 *   'success'  → teal/verified (strongest, on-chain analogy: confirmed)
 *   'caution'  → amber/yellow (good but not strongest — honest about limitation)
 *   'muted'    → generic (web PRF or tier not known)
 */

/**
 * @typedef {{ label: string, variant: 'success' | 'caution' | 'muted' }} TierBadge
 */

/**
 * tierToBadge(tierName) → TierBadge
 *
 * @param {string | null | undefined} tierName
 * @returns {TierBadge}
 */
export function tierToBadge(tierName) {
  switch (tierName) {
    case 'STRONGBOX':
      return { label: 'StrongBox Protected', variant: 'success' };

    case 'SecureEnclave':
      return { label: 'Secure Enclave Protected', variant: 'success' };

    case 'TRUSTED_ENVIRONMENT':
    case 'SECURE_HARDWARE_PRE31':
    case 'UNKNOWN_SECURE':
      // TEE is hardware-backed (meets the at-rest threat model) but is not the
      // dedicated StrongBox chip. Show amber so users on TEE-only devices understand
      // their level of protection is real but not maximum (honest, not alarming).
      return { label: 'TEE Protected', variant: 'caution' };

    default:
      // Web PRF, unknown tier in legacy vault blobs, or no tier stored.
      // Falls back to the generic label that existed before this fix.
      return { label: 'Hardware Protection ON', variant: 'muted' };
  }
}
