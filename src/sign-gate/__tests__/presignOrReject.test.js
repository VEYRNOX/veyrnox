import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../rasp/getFreshRaspArtifact.js', () => ({
  getFreshRaspArtifact: vi.fn(),
}));

const { getFreshRaspArtifact } = await import('../../rasp/getFreshRaspArtifact.js');
const { TIER } = await import('../../rasp/conditions.js');
const { presignGateOrReject } = await import('../presignOrReject.js');

beforeEach(() => vi.clearAllMocks());

describe('presignGateOrReject', () => {
  it('allows only an explicit fresh ALLOW verdict', async () => {
    getFreshRaspArtifact.mockResolvedValue({ tier: TIER.ALLOW });
    await expect(presignGateOrReject()).resolves.toEqual({ proceedAllowed: true, rejectCode: null });
  });

  it('blocks a missing artifact or tier', async () => {
    getFreshRaspArtifact.mockResolvedValue(null);
    await expect(presignGateOrReject()).resolves.toMatchObject({ proceedAllowed: false });

    getFreshRaspArtifact.mockResolvedValue({});
    await expect(presignGateOrReject()).resolves.toMatchObject({ proceedAllowed: false });
  });

  it('blocks when the fresh gate errors', async () => {
    getFreshRaspArtifact.mockRejectedValue(new Error('probe failed'));
    await expect(presignGateOrReject()).resolves.toMatchObject({ proceedAllowed: false });
  });
});

