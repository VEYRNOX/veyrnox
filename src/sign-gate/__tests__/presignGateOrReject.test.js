import { describe, expect, it, vi } from 'vitest';
import { TIER } from '@/rasp';
import { presignGateOrReject } from '../presignGateOrReject.js';

const clean = Object.freeze({
  tier: TIER.ALLOW,
  sentence: null,
  blockedActions: [],
  requiresBiometric: false,
});

const warn = Object.freeze({
  tier: TIER.WARN,
  sentence: 'This device needs extra caution.',
  blockedActions: [],
  requiresBiometric: true,
});

const block = Object.freeze({
  tier: TIER.BLOCK,
  sentence: 'Signing is turned off.',
  blockedActions: ['sign'],
  requiresBiometric: false,
});

describe('presignGateOrReject — fresh fail-closed signing decision', () => {
  it('allows an exact clean decision', async () => {
    const result = await presignGateOrReject({
      getFreshArtifact: vi.fn().mockResolvedValue(clean),
      isNative: () => false,
    });

    expect(result.proceedAllowed).toBe(true);
    expect(result.rejectCode).toBeNull();
  });

  it('requires explicit acknowledgement for WARN', async () => {
    const getFreshArtifact = vi.fn().mockResolvedValue(warn);

    const unacknowledged = await presignGateOrReject({
      getFreshArtifact,
      isNative: () => false,
    });
    const acknowledged = await presignGateOrReject({
      getFreshArtifact,
      acknowledged: true,
      isNative: () => false,
    });

    expect(unacknowledged.proceedAllowed).toBe(false);
    expect(unacknowledged.rejectCode).toBe('RASP_WARN_ACK_REQUIRED');
    expect(acknowledged.proceedAllowed).toBe(true);
  });

  it('requires both acknowledgement and biometric confirmation for native WARN', async () => {
    const getFreshArtifact = vi.fn().mockResolvedValue(warn);

    const withoutBiometric = await presignGateOrReject({
      getFreshArtifact,
      acknowledged: true,
      isNative: () => true,
    });
    const confirmed = await presignGateOrReject({
      getFreshArtifact,
      acknowledged: true,
      biometricConfirmed: true,
      isNative: () => true,
    });

    expect(withoutBiometric.proceedAllowed).toBe(false);
    expect(withoutBiometric.rejectCode).toBe('RASP_BIOMETRIC_REQUIRED');
    expect(confirmed.proceedAllowed).toBe(true);
  });

  it('blocks BLOCK even when acknowledgement and biometric confirmation are true', async () => {
    const result = await presignGateOrReject({
      getFreshArtifact: vi.fn().mockResolvedValue(block),
      acknowledged: true,
      biometricConfirmed: true,
      isNative: () => true,
    });

    expect(result.proceedAllowed).toBe(false);
    expect(result.rejectCode).toBe('RASP_BLOCK');
  });

  it.each([
    ['missing', undefined],
    ['errored', { error: new Error('probe failed') }],
  ])('blocks a %s artifact result', async (_label, artifact) => {
    const result = await presignGateOrReject({
      getFreshArtifact: vi.fn().mockResolvedValue(artifact),
      isNative: () => false,
    });

    expect(result.proceedAllowed).toBe(false);
    expect(result.rejectCode).toBe('RASP_BLOCK');
  });

  it('blocks when the fresh-artifact probe throws', async () => {
    const result = await presignGateOrReject({
      getFreshArtifact: vi.fn().mockRejectedValue(new Error('bridge threw')),
      isNative: () => false,
    });

    expect(result.proceedAllowed).toBe(false);
    expect(result.rejectCode).toBe('RASP_BLOCK');
  });

  it.each([
    ['missing', undefined],
    ['false', false],
  ])('blocks WARN with a %s biometric requirement instead of dropping confirmation', async (_label, requiresBiometric) => {
    const result = await presignGateOrReject({
      getFreshArtifact: vi.fn().mockResolvedValue({
        tier: TIER.WARN,
        sentence: 'Caution.',
        blockedActions: [],
        requiresBiometric,
      }),
      acknowledged: true,
      biometricConfirmed: true,
      isNative: () => true,
    });

    expect(result.proceedAllowed).toBe(false);
    expect(result.rejectCode).toBe('RASP_BLOCK');
  });
});
