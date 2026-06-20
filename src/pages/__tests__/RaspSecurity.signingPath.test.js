import { describe, it, expect } from 'vitest';
import { raspSurfaceModel } from '@/pages/RaspSecurity';
import { STATUS } from '@/lib/featureCatalogue';

describe('raspSurfaceModel signing-path honesty (VULN-8)', () => {
  it('roadmap status yields detectionLive=false', () => {
    const m = raspSurfaceModel(STATUS.ROADMAP ?? 'roadmap');
    expect(m.detectionLive).toBe(false);
    expect(m.detection).toBe('pending');
  });

  it('built status yields browser-active, NOT live', () => {
    const m = raspSurfaceModel(STATUS.BUILT ?? 'built');
    expect(m.detection).toBe('browser-active');
    expect(m.detectionLive).toBe(true);
    // Sanity: 'browser-active' must not be the same string as 'live'
    expect(m.detection).not.toBe('live');
  });

  it('verified status yields live', () => {
    const m = raspSurfaceModel(STATUS.VERIFIED ?? 'verified');
    expect(m.detection).toBe('live');
    expect(m.detectionLive).toBe(true);
  });
});
