// src/wallet-core/keystore/__tests__/tierBadge.test.js
//
// Unit tests for tierToBadge() — the pure tier-name → badge-label mapping.
// No mocks needed: this is a side-effect-free pure function.

import { describe, it, expect } from 'vitest';
import { tierToBadge } from '../tierBadge.js';

describe('tierToBadge — StrongBox / SecureEnclave (strongest, success variant)', () => {
  it('maps STRONGBOX to "StrongBox Protected" with success variant', () => {
    const b = tierToBadge('STRONGBOX');
    expect(b.label).toBe('StrongBox Protected');
    expect(b.variant).toBe('success');
  });

  it('maps SecureEnclave to "Secure Enclave Protected" with success variant', () => {
    const b = tierToBadge('SecureEnclave');
    expect(b.label).toBe('Secure Enclave Protected');
    expect(b.variant).toBe('success');
  });
});

describe('tierToBadge — TEE tiers (hardware-backed, caution variant)', () => {
  it('maps TRUSTED_ENVIRONMENT to "TEE Protected" with caution variant', () => {
    const b = tierToBadge('TRUSTED_ENVIRONMENT');
    expect(b.label).toBe('TEE Protected');
    expect(b.variant).toBe('caution');
  });

  it('maps SECURE_HARDWARE_PRE31 to "TEE Protected" with caution variant', () => {
    const b = tierToBadge('SECURE_HARDWARE_PRE31');
    expect(b.label).toBe('TEE Protected');
    expect(b.variant).toBe('caution');
  });

  it('maps UNKNOWN_SECURE to "TEE Protected" with caution variant', () => {
    const b = tierToBadge('UNKNOWN_SECURE');
    expect(b.label).toBe('TEE Protected');
    expect(b.variant).toBe('caution');
  });
});

describe('tierToBadge — generic fallback (web PRF / unknown, muted variant)', () => {
  it('returns generic label for null (no tier stored / web vault)', () => {
    const b = tierToBadge(null);
    expect(b.label).toBe('Hardware Protection ON');
    expect(b.variant).toBe('muted');
  });

  it('returns generic label for undefined', () => {
    const b = tierToBadge(undefined);
    expect(b.label).toBe('Hardware Protection ON');
    expect(b.variant).toBe('muted');
  });

  it('returns generic label for an unrecognised tier string', () => {
    const b = tierToBadge('SOME_FUTURE_TIER');
    expect(b.label).toBe('Hardware Protection ON');
    expect(b.variant).toBe('muted');
  });

  it('returns generic label for empty string', () => {
    const b = tierToBadge('');
    expect(b.label).toBe('Hardware Protection ON');
    expect(b.variant).toBe('muted');
  });
});
