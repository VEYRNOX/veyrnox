import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));
vi.mock('@/rasp', () => ({
  degrade: vi.fn(x => x ?? { tier: 'ALLOW' }),
  detect: vi.fn(() => ({ tier: 'ALLOW' })),
  browserProbeSource: { available: true, signals: {} },
  nativeProbeSource: vi.fn(async () => ({ available: false })),
  resolveProbeSource: vi.fn((n, b) => (n && n.available ? n : b)),
}));
vi.mock('@/wallet-core/evm/networks', () => ({ ALLOW_MAINNET: false }));

import { probeRuntimeServices, loadAuditSnapshot, readDeviceCapabilities } from '../appHealth';

describe('probeRuntimeServices', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('returns unreachable when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const results = await probeRuntimeServices();
    expect(results.every(r => r.status === 'unreachable' || r.status === 'ok' || r.status === 'degraded')).toBe(true);
    const rpc = results.find(r => r.name === 'RPC endpoint');
    expect(rpc.status).toBe('unreachable');
  });

  it('returns ok with latencyMs when fetch resolves', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: '0x1' }) }));
    const results = await probeRuntimeServices();
    const rpc = results.find(r => r.name === 'RPC endpoint');
    expect(rpc.status).toBe('ok');
    expect(typeof rpc.latencyMs).toBe('number');
  });

  it('never returns a missing status field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')));
    const results = await probeRuntimeServices();
    results.forEach(r => {
      expect(['ok', 'degraded', 'unreachable']).toContain(r.status);
    });
  });
});

describe('probeRevenueCat timeout → unreachable', () => {
  afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

  it('returns unreachable when RevenueCat getCustomerInfo never resolves (timeout path)', async () => {
    vi.useFakeTimers();
    // Mock @revenuecat/purchases-capacitor so getCustomerInfo hangs forever
    vi.doMock('@revenuecat/purchases-capacitor', () => ({
      Purchases: { getCustomerInfo: () => new Promise(() => {}) },
    }));
    const { probeRuntimeServices } = await import('../appHealth');
    const racePromise = probeRuntimeServices();
    // Advance past PROBE_TIMEOUT_MS (5000 ms) to trigger withTimeout rejection
    await vi.advanceTimersByTimeAsync(6000);
    const results = await racePromise;
    const rc = results.find(r => r.name === 'RevenueCat');
    expect(rc?.status).toBe('unreachable');
  });
});

describe('loadAuditSnapshot', () => {
  it('returns unavailable when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('not found')));
    const result = await loadAuditSnapshot();
    expect(result).toEqual({ unavailable: true });
  });

  it('returns unavailable when JSON is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'not json', json: async () => { throw new Error('bad json'); } }));
    const result = await loadAuditSnapshot();
    expect(result).toEqual({ unavailable: true });
  });

  it('parses a valid snapshot correctly', async () => {
    const snapshot = {
      generatedAt: '2026-07-11T00:00:00Z',
      metadata: { vulnerabilities: { critical: 1, high: 2, moderate: 0, low: 0, info: 0 } },
      vulnerabilities: {
        'bad-pkg': { severity: 'critical', via: ['CVE-2024-9999'] },
        'other-pkg': { severity: 'high', via: ['CVE-2024-1234'] },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }));
    const result = await loadAuditSnapshot();
    expect(result.unavailable).toBeUndefined();
    expect(result.critical).toBe(1);
    expect(result.high).toBe(2);
    expect(result.total).toBe(3);
    expect(result.findings).toHaveLength(2);
  });
});

describe('readDeviceCapabilities', () => {
  it('reports web platform when not native', () => {
    const caps = readDeviceCapabilities();
    expect(caps.platform).toBe('web');
  });

  it('reports mainnet false when ALLOW_MAINNET is false', () => {
    const caps = readDeviceCapabilities();
    expect(caps.mainnet).toBe(false);
  });

  it('never throws', () => {
    expect(() => readDeviceCapabilities()).not.toThrow();
  });
});

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const widgetSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../components/AppHealthWidget.jsx'),
  'utf8',
);

describe('AppHealthWidget.jsx source pins', () => {
  it('uses Promise.allSettled to fire all three probes concurrently', () => {
    expect(widgetSrc).toMatch(/Promise\.allSettled/);
  });

  it('never renders "ok" text when probe status is unavailable (fail-closed)', () => {
    expect(widgetSrc).not.toMatch(/unavailable.*ok/i);
  });

  it('imports all three probe helpers', () => {
    expect(widgetSrc).toMatch(/probeRuntimeServices/);
    expect(widgetSrc).toMatch(/loadAuditSnapshot/);
    expect(widgetSrc).toMatch(/readDeviceCapabilities/);
  });
});
