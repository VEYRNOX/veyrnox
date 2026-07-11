import { Capacitor } from '@capacitor/core';
import { ALLOW_MAINNET } from '@/wallet-core/evm/networks';
import { degrade, detect, browserProbeSource, resolveProbeSource } from '@/rasp';

const PROBE_TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function probeRpc() {
  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch('https://sepolia.infura.io/v3/placeholder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      }),
      PROBE_TIMEOUT_MS,
    );
    if (!res.ok) return { name: 'RPC endpoint', status: 'degraded' };
    const data = await res.json();
    if (!data.result) return { name: 'RPC endpoint', status: 'degraded' };
    return { name: 'RPC endpoint', status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { name: 'RPC endpoint', status: 'unreachable' };
  }
}

async function probePriceFeed() {
  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD'),
      PROBE_TIMEOUT_MS,
    );
    if (!res.ok) return { name: 'Price feed', status: 'degraded' };
    return { name: 'Price feed', status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { name: 'Price feed', status: 'unreachable' };
  }
}

async function probeRevenueCat() {
  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    await withTimeout(Purchases.getCustomerInfo(), PROBE_TIMEOUT_MS);
    return { name: 'RevenueCat', status: 'ok' };
  } catch (err) {
    if (err?.message === 'timeout') return { name: 'RevenueCat', status: 'unreachable' };
    return { name: 'RevenueCat', status: 'unreachable' };
  }
}

function probeRasp() {
  try {
    const artifact = degrade(detect(resolveProbeSource(null, browserProbeSource)));
    const tier = artifact?.tier ?? 'BLOCK';
    const status = tier === 'ALLOW' ? 'ok' : tier === 'WARN' ? 'degraded' : 'unreachable';
    return { name: 'RASP', status };
  } catch {
    return { name: 'RASP', status: 'unreachable' };
  }
}

export async function probeRuntimeServices() {
  const results = await Promise.allSettled([probeRpc(), probePriceFeed(), probeRevenueCat(), Promise.resolve(probeRasp())]);
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const names = ['RPC endpoint', 'Price feed', 'RevenueCat', 'RASP'];
    return { name: names[i], status: 'unreachable' };
  });
}

export async function loadAuditSnapshot() {
  try {
    const res = await fetch('/audit-snapshot.json');
    if (!res.ok) return { unavailable: true };
    const data = await res.json();
    const vuln = data?.metadata?.vulnerabilities ?? {};
    const critical = vuln.critical ?? 0;
    const high = vuln.high ?? 0;
    const moderate = vuln.moderate ?? 0;
    const low = vuln.low ?? 0;
    const total = critical + high + moderate + low;
    const findings = Object.entries(data?.vulnerabilities ?? {}).map(([name, v]) => ({
      name,
      severity: v.severity ?? 'unknown',
    }));
    return { total, critical, high, moderate, low, findings };
  } catch {
    return { unavailable: true };
  }
}

export function readDeviceCapabilities() {
  try {
    const platform = Capacitor.isNativePlatform() ? 'native' : 'web';
    let kekTier = 'unavailable';
    try {
      const stored = localStorage.getItem('veyrnox-vault');
      if (stored) {
        const blob = JSON.parse(stored);
        kekTier = blob?.hardwareKekTier ?? 'unavailable';
      }
    } catch { /* vault unreadable */ }
    const raspAvailable = Capacitor.isNativePlatform();
    return { platform, kekTier, raspAvailable, mainnet: ALLOW_MAINNET };
  } catch {
    return { platform: 'web', kekTier: 'unavailable', raspAvailable: false, mainnet: false };
  }
}
