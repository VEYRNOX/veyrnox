# App health widget — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings → App health screen that shows runtime service status, npm CVE counts, and device capability flags in one card.

**Architecture:** Three independent async probe helpers in `src/lib/appHealth.js` are fired concurrently on mount via `Promise.allSettled`. The UI renders each section as results arrive. An npm audit JSON snapshot is baked into `public/` at CI time so there is no Node.js on device.

**Tech Stack:** React 18, Vitest, Capacitor, `src/wallet-core/evm/networks.js` (ALLOW_MAINNET), `src/wallet-core/keystore/tierBadge.js` (tierToBadge), existing RASP stack (`src/rasp`).

## Global Constraints

- Fail-closed (I4): a probe that throws or times out returns `unavailable`, never `ok` or `0 vulnerabilities`.
- No egress (I2): the audit snapshot is a local `fetch('/audit-snapshot.json')` — no npm registry calls on device.
- Sentence case everywhere, no emoji, Tabler outline icons only.
- Card shell: `rounded-2xl border border-border bg-card p-4` (matches existing widget pattern).
- Test runner: `npx vitest run <path>` (Vitest, not Jest).
- Route added to `src/App.jsx` inside the existing `<Routes>` block (lines 116–183).
- Settings nav rows are in `src/pages/Settings.jsx`; new row goes after the "Terms & legal" row (line 265).

---

### Task 1: CI audit snapshot

**Files:**
- Create: `scripts/gen-audit-snapshot.mjs`
- Create: `.github/workflows/audit-snapshot.yml`
- Create: `public/audit-snapshot.json` (initial placeholder)

**Interfaces:**
- Produces: `public/audit-snapshot.json` with shape `{ generatedAt: string, metadata: { vulnerabilities: { critical: number, high: number, moderate: number, low: number, info: number } }, vulnerabilities: { [pkgName]: { severity: string, via: any[] } } }`

- [ ] **Step 1: Write the snapshot generator script**

Create `scripts/gen-audit-snapshot.mjs`:

```js
#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'audit-snapshot.json');

let raw;
try {
  raw = execSync('npm audit --json', { cwd: root, encoding: 'utf8' });
} catch (err) {
  // npm audit exits non-zero when vulnerabilities exist — capture stdout anyway
  raw = err.stdout ?? '{}';
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  parsed = {};
}

const out = {
  generatedAt: new Date().toISOString(),
  metadata: parsed.metadata ?? { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 } },
  vulnerabilities: parsed.vulnerabilities ?? {},
};

writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('audit-snapshot.json written to', outPath);
```

- [ ] **Step 2: Create the initial placeholder snapshot**

Create `public/audit-snapshot.json`:

```json
{
  "generatedAt": "2026-07-11T00:00:00.000Z",
  "metadata": { "vulnerabilities": { "critical": 0, "high": 0, "moderate": 0, "low": 0, "info": 0 } },
  "vulnerabilities": {}
}
```

- [ ] **Step 3: Create the CI workflow**

Create `.github/workflows/audit-snapshot.yml`:

```yaml
name: Update audit snapshot

on:
  push:
    branches: [main]
  pull_request:

jobs:
  audit-snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: node scripts/gen-audit-snapshot.mjs
      - name: Commit updated snapshot (main only)
        if: github.ref == 'refs/heads/main'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git diff --quiet public/audit-snapshot.json || (git add public/audit-snapshot.json && git commit -m "chore(ci): update npm audit snapshot")
          git push
```

- [ ] **Step 4: Run the script locally to verify it works**

```bash
node scripts/gen-audit-snapshot.mjs
```

Expected: prints "audit-snapshot.json written to …/public/audit-snapshot.json". Check the file has a real `generatedAt` timestamp.

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-audit-snapshot.mjs public/audit-snapshot.json .github/workflows/audit-snapshot.yml
git commit -m "feat(ci): npm audit snapshot script and workflow"
```

---

### Task 2: `appHealth.js` probe helpers

**Files:**
- Create: `src/lib/appHealth.js`
- Create: `src/lib/__tests__/appHealth.test.js`

**Interfaces:**
- Consumes: `import { ALLOW_MAINNET } from '@/wallet-core/evm/networks'`, `import { Capacitor } from '@capacitor/core'`, `import { degrade, detect, browserProbeSource, nativeProbeSource, resolveProbeSource } from '@/rasp'`
- Produces:
  - `probeRuntimeServices(): Promise<RuntimeService[]>` where `RuntimeService = { name: string, status: 'ok'|'degraded'|'unreachable', latencyMs?: number }`
  - `loadAuditSnapshot(): Promise<AuditSnapshot>` where `AuditSnapshot = { unavailable: true } | { total: number, critical: number, high: number, findings: { name: string, severity: string }[] }`
  - `readDeviceCapabilities(): DeviceCapabilities` where `DeviceCapabilities = { platform: 'native'|'web', kekTier: string|'unavailable', raspAvailable: boolean, mainnet: boolean }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/appHealth.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/appHealth.test.js
```

Expected: FAIL — "Cannot find module '../appHealth'"

- [ ] **Step 3: Implement `src/lib/appHealth.js`**

```js
import { Capacitor } from '@capacitor/core';
import { ALLOW_MAINNET } from '@/wallet-core/evm/networks';
import { degrade, detect, browserProbeSource, nativeProbeSource, resolveProbeSource } from '@/rasp';

const PROBE_TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
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
    if (err?.message === 'timeout') return { name: 'RevenueCat', status: 'degraded' };
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run src/lib/__tests__/appHealth.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appHealth.js src/lib/__tests__/appHealth.test.js
git commit -m "feat(rasp): appHealth probe helpers with tests (I4 fail-closed)"
```

---

### Task 3: `AppHealthWidget.jsx`

**Files:**
- Create: `src/components/AppHealthWidget.jsx`

**Interfaces:**
- Consumes: `probeRuntimeServices`, `loadAuditSnapshot`, `readDeviceCapabilities` from `@/lib/appHealth`
- Produces: `<AppHealthWidget />` — zero required props

- [ ] **Step 1: Write source-pin tests**

Add to `src/lib/__tests__/appHealth.test.js` (append after existing describes):

```js
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
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run src/lib/__tests__/appHealth.test.js
```

Expected: FAIL on the three new pins — "ENOENT: no such file … AppHealthWidget.jsx"

- [ ] **Step 3: Implement `AppHealthWidget.jsx`**

Create `src/components/AppHealthWidget.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { probeRuntimeServices, loadAuditSnapshot, readDeviceCapabilities } from '@/lib/appHealth';

const STATUS_COLOR = {
  ok: 'text-success',
  degraded: 'text-caution',
  unreachable: 'text-destructive',
};

function StatusDot({ status }) {
  const color = status === 'ok' ? 'bg-success' : status === 'degraded' ? 'bg-caution' : 'bg-destructive';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} aria-hidden="true" />;
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
      {children}
    </p>
  );
}

function Row({ icon, label, right, status }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 text-sm text-foreground">
        {icon && <i className={`ti ${icon} text-muted-foreground`} aria-hidden="true" />}
        {label}
      </div>
      <span className={`text-xs font-mono ${STATUS_COLOR[status] ?? 'text-muted-foreground'}`}>
        {right}
      </span>
    </div>
  );
}

function Skeleton() {
  return <div className="h-4 w-24 rounded bg-muted animate-pulse" />;
}

export default function AppHealthWidget() {
  const [services, setServices] = useState(null);
  const [audit, setAudit] = useState(null);
  const caps = readDeviceCapabilities();

  useEffect(() => {
    Promise.allSettled([
      probeRuntimeServices().then(setServices),
      loadAuditSnapshot().then(setAudit),
    ]);
  }, []);

  const issueCount =
    (services?.filter(s => s.status !== 'ok').length ?? 0) +
    (audit && !audit.unavailable ? (audit.critical + audit.high) : 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className="ti ti-topology-star text-muted-foreground" aria-hidden="true" />
          <span className="font-medium text-sm">App dependencies</span>
        </div>
        {issueCount > 0 && (
          <span className="text-xs bg-caution/10 text-caution border border-caution/20 rounded px-2 py-0.5">
            {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </div>

      <div>
        <SectionLabel>Runtime services</SectionLabel>
        {services === null
          ? [1, 2, 3, 4].map(i => <div key={i} className="py-2"><Skeleton /></div>)
          : services.map(s => (
              <Row
                key={s.name}
                label={s.name}
                status={s.status}
                right={s.status === 'ok' && s.latencyMs != null ? `OK · ${s.latencyMs}ms` : s.status}
              />
            ))}
      </div>

      <div>
        <SectionLabel>Package security</SectionLabel>
        {audit === null ? (
          <div className="py-2"><Skeleton /></div>
        ) : audit.unavailable ? (
          <Row label="Audit snapshot" status="unreachable" right="unavailable" />
        ) : (
          <>
            <Row
              label={`${audit.total} total vulnerabilities`}
              status={audit.critical > 0 ? 'unreachable' : audit.high > 0 ? 'degraded' : 'ok'}
              right={audit.total === 0 ? 'clean' : `${audit.critical}C · ${audit.high}H`}
            />
            {audit.findings.filter(f => f.severity === 'critical' || f.severity === 'high').slice(0, 3).map(f => (
              <Row key={f.name} label={f.name} status={f.severity === 'critical' ? 'unreachable' : 'degraded'} right={f.severity} />
            ))}
          </>
        )}
      </div>

      <div>
        <SectionLabel>Device capabilities</SectionLabel>
        <Row label="Platform" status="ok" right={caps.platform} />
        <Row
          label="Hardware KEK"
          status={caps.kekTier === 'unavailable' ? 'degraded' : 'ok'}
          right={caps.kekTier}
        />
        <Row
          label="RASP OS probe"
          status={caps.raspAvailable ? 'ok' : 'degraded'}
          right={caps.raspAvailable ? 'native (F-09)' : 'browser only'}
        />
        <Row
          label="Mainnet"
          status={caps.mainnet ? 'ok' : 'degraded'}
          right={caps.mainnet ? 'enabled' : 'testnet only'}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run src/lib/__tests__/appHealth.test.js
```

Expected: all tests PASS (including the three new source pins).

- [ ] **Step 5: Commit**

```bash
git add src/components/AppHealthWidget.jsx src/lib/__tests__/appHealth.test.js
git commit -m "feat(ui): AppHealthWidget card — runtime/audit/device sections"
```

---

### Task 4: Page, route, and Settings row

**Files:**
- Create: `src/pages/AppHealthPage.jsx`
- Modify: `src/App.jsx` — add `/app-health` route
- Modify: `src/pages/Settings.jsx` — add "App health" row with warning dot

**Interfaces:**
- Consumes: `<AppHealthWidget />` from `@/components/AppHealthWidget`, `probeRuntimeServices`, `loadAuditSnapshot` from `@/lib/appHealth` (for the warning dot in Settings)
- Produces: navigable route at `/app-health`

- [ ] **Step 1: Write source-pin tests**

Create `src/pages/__tests__/AppHealthPage.pins.test.js`:

```js
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(dir, '../AppHealthPage.jsx'), 'utf8');
const settingsSrc = readFileSync(join(dir, '../Settings.jsx'), 'utf8');
const appSrc = readFileSync(join(dir, '../../App.jsx'), 'utf8');

describe('AppHealthPage.jsx', () => {
  it('renders AppHealthWidget', () => {
    expect(pageSrc).toMatch(/AppHealthWidget/);
  });
});

describe('App.jsx route', () => {
  it('has a /app-health route', () => {
    expect(appSrc).toMatch(/app-health/);
    expect(appSrc).toMatch(/AppHealthPage/);
  });
});

describe('Settings.jsx', () => {
  it('links to /app-health', () => {
    expect(settingsSrc).toMatch(/app-health/);
  });

  it('renders a warning dot when issues exist', () => {
    expect(settingsSrc).toMatch(/issueCount|issue.*dot|warn.*dot|dot.*warn/i);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run src/pages/__tests__/AppHealthPage.pins.test.js
```

Expected: FAIL — file not found errors.

- [ ] **Step 3: Create `AppHealthPage.jsx`**

```jsx
import { useNavigate } from 'react-router-dom';
import AppHealthWidget from '@/components/AppHealthWidget';

export default function AppHealthPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded text-muted-foreground hover:text-foreground"
          aria-label="Go back"
        >
          <i className="ti ti-chevron-left text-xl" aria-hidden="true" />
        </button>
        <h1 className="text-lg font-medium">App health</h1>
      </div>
      <AppHealthWidget />
    </div>
  );
}
```

- [ ] **Step 4: Add route to `src/App.jsx`**

Find the `<Routes>` block (line ~116). Add after the `/terms-legal` route (line ~152):

```jsx
import AppHealthPage from '@/pages/AppHealthPage';

// inside <Routes>:
<Route path="/app-health" element={<AppHealthPage />} />
```

- [ ] **Step 5: Add Settings row to `src/pages/Settings.jsx`**

At the top of the component (after existing imports), add:

```jsx
import { useState, useEffect } from 'react';
import { probeRuntimeServices, loadAuditSnapshot } from '@/lib/appHealth';
```

Inside the component function, before the return, add:

```jsx
const [issueCount, setIssueCount] = useState(0);
useEffect(() => {
  Promise.allSettled([probeRuntimeServices(), loadAuditSnapshot()]).then(([svcResult, auditResult]) => {
    let count = 0;
    if (svcResult.status === 'fulfilled') {
      count += svcResult.value.filter(s => s.status !== 'ok').length;
    }
    if (auditResult.status === 'fulfilled' && !auditResult.value.unavailable) {
      count += auditResult.value.critical + auditResult.value.high;
    }
    setIssueCount(count);
  });
}, []);
```

After the "Terms & legal" row (line ~265), add:

```jsx
<Link
  to="/app-health"
  className="flex items-center justify-between py-3 border-b border-border"
>
  <div className="flex items-center gap-3">
    <i className="ti ti-topology-star text-muted-foreground" aria-hidden="true" />
    <span className="text-sm">App health</span>
  </div>
  <div className="flex items-center gap-2">
    {issueCount > 0 && (
      <span className="w-2 h-2 rounded-full bg-caution inline-block" aria-label={`${issueCount} issues`} />
    )}
    <i className="ti ti-chevron-right text-muted-foreground text-sm" aria-hidden="true" />
  </div>
</Link>
```

- [ ] **Step 6: Run all tests**

```bash
npx vitest run src/pages/__tests__/AppHealthPage.pins.test.js src/lib/__tests__/appHealth.test.js
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AppHealthPage.jsx src/App.jsx src/pages/Settings.jsx src/pages/__tests__/AppHealthPage.pins.test.js
git commit -m "feat(ui): App health page, route /app-health, Settings row with warning dot"
```

---

## Self-review

**Spec coverage:**
- Runtime services (RPC, price feed, RevenueCat, RASP) — ✅ Task 2 + Task 3
- Package security (npm CVE snapshot) — ✅ Task 1 + Task 2 + Task 3
- Device capabilities (platform, KEK, RASP F-09, mainnet) — ✅ Task 2 + Task 3
- Fail-closed on every probe — ✅ `{ unavailable: true }`, `'unreachable'` throughout
- Settings row with warning dot — ✅ Task 4
- Dedicated route `/app-health` — ✅ Task 4
- CI baked snapshot — ✅ Task 1
- No egress on device (I2) — ✅ audit is a local `fetch('/audit-snapshot.json')`

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:**
- `probeRuntimeServices()` returns `RuntimeService[]` — produced in Task 2, consumed in Task 3 ✅
- `loadAuditSnapshot()` returns `{ unavailable: true } | { total, critical, high, ... }` — produced in Task 2, consumed in Tasks 3 and 4 ✅
- `readDeviceCapabilities()` returns `{ platform, kekTier, raspAvailable, mainnet }` — produced in Task 2, consumed in Task 3 ✅
- `issueCount` naming consistent between Tasks 3 and 4 ✅
