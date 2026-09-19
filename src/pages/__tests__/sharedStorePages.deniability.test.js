// K-2 / I3 (#2537) — seven pages that read the SHARED veyrnox-appdata IndexedDB
// must deny a decoy / hidden / demo session.
//
// `src/api/localClient.js` keeps one record per entity name with no per-session
// partitioning, cleared only by panic wipe. So without a gate a decoy session
// opening /onchain lists the real user's send history, and /budget, /recurring,
// /savings and /invoices can alter or delete the real user's rows.
//
// The fix is the two-chokepoint shape already used by PriceAlerts.jsx,
// AddressBook.jsx and Settings.jsx:
//   read  — every useQuery on the store is `enabled: !deniable`, and the rows it
//           returns are blanked locally (`const x = deniable ? [] : xRaw`) so a
//           cached result from the real session cannot render either;
//   write — every mutationFn throws DENIABILITY_BLOCKED before any store call.
//
// Source scan, matching Settings.wallet-passkeys-i3.test.js: these pages pull in
// recharts, dialogs and the whole WalletProvider, and in a deniable session the
// write controls never render (no rows), so a render test cannot reach the
// mutations anyway. Blocks are extracted by paren matching rather than a fixed
// window, so a pin can never be satisfied by the NEXT hook's guard.
//
// The last test in each page block is the coverage net: every
// `base44.entities.*` call in the file must sit inside a gated query or a
// guarded mutation. Adding a new ungated read or write turns it red.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Strip comments so a pin is never satisfied by the prose documenting it.
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Return the text of every `<callee>(...)` call, parens balanced, skipping
// string literals so a ")" inside an error message cannot end the block early.
function calls(code, callee) {
  const out = [];
  const re = new RegExp(`\\b${callee}\\(`, 'g');
  let m;
  while ((m = re.exec(code))) {
    let depth = 0;
    let quote = null;
    for (let i = m.index + callee.length; i < code.length; i++) {
      const c = code[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) {
        out.push({ start: m.index, end: i + 1, text: code.slice(m.index, i + 1) });
        break;
      }
    }
  }
  return out;
}

const PAGES = [
  { file: 'OnChainAnalytics.jsx', rows: ['transactions', 'wallets'], mutations: 0 },
  { file: 'AnomalyDetection.jsx', rows: ['transactions', 'fraudAlerts'], mutations: 0 },
  { file: 'FraudDetection.jsx', rows: ['transactions', 'addressBook', 'fraudAlerts'], mutations: 0 },
  { file: 'BudgetLimits.jsx', rows: ['budgets', 'transactions'], mutations: 3 },
  { file: 'RecurringPayments.jsx', rows: ['payments', 'wallets'], mutations: 3 },
  { file: 'SavingsGoals.jsx', rows: ['goals'], mutations: 3 },
  { file: 'InvoiceGenerator.jsx', rows: ['invoices'], mutations: 3 },
  // Added 2026-09-16 (#2593). These three are NOT part of the original #2537
  // seven — they are its near-miss neighbours, which is exactly why they were
  // missed: AddressBook gated the fetch but not the cache; PriceAlerts.jsx was
  // gated while NotificationCentre read the same entity; WatchlistWidget was
  // gated while WatchlistPage, the one that can also write, was not.
  { file: 'AddressBook.jsx', rows: ['contacts'], mutations: 3 },
  { file: 'NotificationCentre.jsx', rows: ['priceAlerts'], mutations: 1 },
  { file: 'WatchlistPage.jsx', rows: ['items'], mutations: 3 },
  // Added 2026-09-19 (#2537 static gate audit). Found by enumerating EVERY
  // `base44.entities.*` call site under src/ rather than the pages the issue
  // named — 44 files touch the shared store and 14 had no deniability
  // reference at all. These four are the ones where the entity, the route and
  // the absence of a gate were all confirmed in merged source:
  //   Dashboard              — the decoy session's FIRST screen: wallet list,
  //                            summed balance, last 100 transactions.
  //   TaxReport              — 1000 transactions AND a CSV export of them.
  //   SpendingPatterns       — 500 transactions, charted by asset and month.
  //   SuspiciousAddressChecker — the real address book, names included.
  { file: 'Dashboard.jsx', rows: ['triggeredAlerts', 'wallets', 'transactions'], mutations: 2 },
  { file: 'TaxReport.jsx', rows: ['transactions'], mutations: 0 },
  { file: 'SpendingPatterns.jsx', rows: ['transactions'], mutations: 0 },
  { file: 'SuspiciousAddressChecker.jsx', rows: ['contacts'], mutations: 0 },
];

describe.each(PAGES)('$file — shared-store deniability gate (#2537)', ({ file, rows, mutations }) => {
  const code = stripComments(readFileSync(resolve(here, '..', file), 'utf8'));
  const queries = calls(code, 'useQuery');
  const muts = calls(code, 'useMutation');

  // DEMO is required alongside the live predicate: isDeniabilityOrDemoActive()
  // sees only the session marker and a persisted veyrnox-demo, while DEMO is
  // also true for VITE_DEMO_MODE=1 and native-dev builds.
  it('derives `deniable` from DEMO, decoy, hidden AND the module-level predicate', () => {
    expect(code).toMatch(/const\s*\{[^}]*\bisDecoy\b[^}]*\bisHidden\b[^}]*\}\s*=\s*useWallet\(\)/);
    expect(code).toMatch(
      /const\s+deniable\s*=\s*DEMO\s*\|\|\s*isDecoy\s*\|\|\s*isHidden\s*\|\|\s*isDeniabilityOrDemoActive\(\)\s*;/,
    );
    expect(code).toMatch(/import\s*\{\s*DEMO\s*\}\s*from\s*["']@\/api\/demoClient["']/);
    expect(code).toMatch(/import\s*\{\s*isDeniabilityOrDemoActive\s*\}\s*from\s*["']@\/wallet-core\/deniabilitySession["']/);
  });

  it.runIf(mutations > 0)('denyInDeniable throws DENIABILITY_BLOCKED', () => {
    expect(code).toMatch(
      /const\s+denyInDeniable\s*=\s*\(\)\s*=>\s*\{\s*throw\s+Object\.assign\([^;]*code:\s*["']DENIABILITY_BLOCKED["']/,
    );
  });

  it('every store query is disabled in a deniable session', () => {
    expect(queries.length).toBe(rows.length);
    for (const q of queries) {
      expect(q.text, q.text).toMatch(/enabled:\s*!deniable\b/);
    }
  });

  it.each(rows)('blanks `%s` locally in a deniable session', (name) => {
    expect(code).toMatch(new RegExp(`data:\\s*${name}Raw\\s*=\\s*\\[\\]`));
    expect(code).toMatch(new RegExp(`const\\s+${name}\\s*=\\s*deniable\\s*\\?\\s*\\[\\]\\s*:\\s*${name}Raw\\s*;`));
  });

  it(`every mutationFn (${mutations}) refuses before touching the store`, () => {
    expect(muts.length).toBe(mutations);
    for (const mu of muts) {
      const fn = mu.text.match(/mutationFn:\s*\([^)]*\)\s*=>\s*\{\s*([\s\S]*)/);
      expect(fn, `mutationFn must be a block body:\n${mu.text}`).toBeTruthy();
      // The guard is the FIRST statement, so validation errors cannot reveal
      // anything and no store call can precede it.
      expect(fn[1]).toMatch(/^if\s*\(deniable\)\s*denyInDeniable\(\);/);
    }
  });

  it('no base44.entities call sits outside a gated query or guarded mutation', () => {
    const covered = [...queries, ...muts];
    const re = /base44\.entities\./g;
    let m;
    while ((m = re.exec(code))) {
      const inside = covered.some((b) => m.index > b.start && m.index < b.end);
      expect(inside, `ungated store access at offset ${m.index}: ${code.slice(m.index, m.index + 60)}`).toBe(true);
    }
  });
});

// SendCrypto.jsx — same store, different shape (#2537 item 2, traced 2026-09-14).
//
// `deniable` here deliberately omits the bare DEMO flag: SendCrypto documents that
// a persisted demo flag must not exempt a session with a real wallet, and blanking
// TransactionLimit for a real user would switch their spend limits off. Demo is
// covered by `demoActive` (DEMO && no wallets).
//
// Writes are SKIPPED, not thrown: Transaction.create runs after the broadcast, so
// a throw would report a failed send for funds that already left and invite a
// second send. EVM/ERC-20 reach the software-path create in a decoy session
// because their providers do not refuse deniable sessions (BTC/SOL do).
describe('SendCrypto.jsx — shared-store deniability gate (#2537)', () => {
  const code = stripComments(readFileSync(resolve(here, '..', 'SendCrypto.jsx'), 'utf8'));
  const queries = calls(code, 'useQuery').filter((q) => /base44\.entities\./.test(q.text));
  const ROWS = ['whitelist', 'txLimits', 'history', 'addressBook'];
  const GUARD = /if\s*\(\s*!deniable\s*&&\s*!isDeniabilitySessionActive\(\)\s*\)\s*\{?\s*$/;

  it('derives `deniable` from decoy, hidden, the live session marker and demoActive', () => {
    expect(code).toMatch(
      /const\s+deniable\s*=\s*isDecoy\s*\|\|\s*isHidden\s*\|\|\s*isDeniabilitySessionActive\(\)\s*\|\|\s*demoActive\s*;/,
    );
  });

  it('every store query is disabled in a deniable session', () => {
    expect(queries.length).toBe(ROWS.length);
    for (const q of queries) expect(q.text, q.text).toMatch(/enabled:\s*!deniable\b/);
  });

  it.each(ROWS)('blanks `%s` locally in a deniable session', (name) => {
    expect(code).toMatch(new RegExp(`data:\\s*${name}Raw\\s*=\\s*\\[\\]`));
    expect(code).toMatch(new RegExp(`const\\s+${name}\\s*=\\s*deniable\\s*\\?\\s*\\[\\]\\s*:\\s*${name}Raw\\s*;`));
  });

  it('every store write is directly guarded (skip, not throw)', () => {
    const writes = [...code.matchAll(/base44\.entities\.\w+\.(create|update|delete)\(/g)];
    expect(writes.length).toBe(2);
    for (const w of writes) {
      const before = code.slice(Math.max(0, w.index - 200), w.index).replace(/await\s*$/, '');
      expect(before, `unguarded write: ${code.slice(w.index, w.index + 50)}`).toMatch(GUARD);
    }
  });

  it('no base44.entities read sits outside a gated query', () => {
    const re = /base44\.entities\.\w+\.(\w+)\(/g;
    let m;
    while ((m = re.exec(code))) {
      if (['create', 'update', 'delete'].includes(m[1])) continue;
      const inside = queries.some((b) => m.index > b.start && m.index < b.end);
      expect(inside, `ungated store read: ${code.slice(m.index, m.index + 60)}`).toBe(true);
    }
  });
});

// TaxReport has a second egress the shared harness above cannot see: it writes
// the rows OUT to a file. Blanking the table is not enough — the seven pages in
// #2542 only ever rendered, this one downloads. A decoy session must not be able
// to export the primary session's history, and it must not be handed an empty
// CSV either: a zero-row file is a tell that there was something to withhold.
describe('TaxReport.jsx — CSV export is suppressed in a deniable session (#2537)', () => {
  const code = stripComments(
    readFileSync(resolve(here, '..', 'TaxReport.jsx'), 'utf8'),
  );

  it('handleExport refuses before reaching the download', () => {
    const fn = code.match(/const\s+handleExport\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/);
    expect(fn, 'handleExport must be a block-bodied arrow').toBeTruthy();
    const body = fn[1];
    const guard = body.indexOf('if (deniable) return;');
    const download = body.indexOf('downloadRawCSV');
    expect(guard, 'no `if (deniable) return;` guard in handleExport').toBeGreaterThanOrEqual(0);
    expect(download, 'handleExport no longer calls downloadRawCSV').toBeGreaterThan(guard);
  });

  it('the export button is disabled in a deniable session', () => {
    expect(code).toMatch(/onClick=\{handleExport\}\s+disabled=\{deniable\s*\|\|/);
  });
});
