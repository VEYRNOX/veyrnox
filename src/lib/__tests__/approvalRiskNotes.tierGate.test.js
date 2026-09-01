import { describe, it, expect, vi, beforeEach } from 'vitest';

// The tier gate on approval risk notes must sit BETWEEN the local threat-intel
// lookup and the remote TIP screen — not above both. A local hit is free,
// offline, and already shipped in the app; suppressing it for a lower tier
// leaves a user approving a known drainer in silence, which reads as safe (I4).
//
// Before the fix these tests fail as follows:
//   - "surfaces a local threat hit on the free tier": returns null (gate above
//     the local branch)
//   - "consults local intel from the async path": lookupThreatSync never called
//     (the local branch only ever existed in getRiskNote, which has no callers)

vi.mock('@/api/tipScreen', () => ({ screenTransaction: vi.fn() }));
vi.mock('@/lib/threatIntelStore', () => ({ lookupThreatSync: vi.fn(() => []) }));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/lib/tierCache', () => ({ hasAdvisorOnlineAccessCached: vi.fn(() => false) }));

const { screenTransaction } = await import('@/api/tipScreen');
const { lookupThreatSync } = await import('@/lib/threatIntelStore');
const { isDeniabilityOrDemoActive } = await import('@/wallet-core/deniabilitySession');
const { hasAdvisorOnlineAccessCached } = await import('@/lib/tierCache');
const { getRiskNote, fetchRiskNoteAsync, clearRiskNoteCache } =
  await import('@/lib/approvalRiskNotes');

const DRAINER = '0x00000000000000000000000000000000000dead01';
const CLEAN = '0x00000000000000000000000000000000000c1ea11';

const HIT = [{ category: 'drainer', note: 'known drainer contract', severity: 'critical' }];

beforeEach(() => {
  clearRiskNoteCache();
  vi.mocked(lookupThreatSync).mockReturnValue([]);
  vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  vi.mocked(hasAdvisorOnlineAccessCached).mockReturnValue(false);
  vi.mocked(screenTransaction).mockReset();
  vi.mocked(screenTransaction).mockResolvedValue({ verdict: 'allow' });
});

describe('approvalRiskNotes — tier gate placement', () => {
  it('surfaces a local threat hit on the free tier', () => {
    vi.mocked(lookupThreatSync).mockReturnValue(HIT);
    const note = getRiskNote(DRAINER);
    expect(note?.source).toBe('local-threat-intel');
    expect(note?.severity).toBe('high');
    expect(note?.note).toContain('known drainer contract');
  });

  it('consults local intel from the async path (the one TokenApprovals calls)', async () => {
    vi.mocked(lookupThreatSync).mockReturnValue(HIT);
    const note = await fetchRiskNoteAsync(DRAINER);
    expect(lookupThreatSync).toHaveBeenCalledWith(DRAINER);
    expect(note?.source).toBe('local-threat-intel');
    expect(screenTransaction).not.toHaveBeenCalled();
  });

  it('still withholds the remote screen from the free tier', async () => {
    expect(await fetchRiskNoteAsync(CLEAN)).toBeNull();
    expect(getRiskNote(CLEAN)).toBeNull();
    expect(screenTransaction).not.toHaveBeenCalled();
  });

  it('runs the remote screen on the AI tier when local intel is clean', async () => {
    vi.mocked(hasAdvisorOnlineAccessCached).mockReturnValue(true);
    const note = await fetchRiskNoteAsync(CLEAN);
    expect(screenTransaction).toHaveBeenCalledTimes(1);
    expect(note?.severity).toBe('low');
  });

  it('I3 still wins over every tier — a decoy session gets nothing', async () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    vi.mocked(lookupThreatSync).mockReturnValue(HIT);
    vi.mocked(hasAdvisorOnlineAccessCached).mockReturnValue(true);
    expect(getRiskNote(DRAINER)).toBeNull();
    expect(await fetchRiskNoteAsync(DRAINER)).toBeNull();
    expect(screenTransaction).not.toHaveBeenCalled();
  });
});
