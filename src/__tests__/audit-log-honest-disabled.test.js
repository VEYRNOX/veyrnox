// Guard: the Audit Log primitive stays HONEST-DISABLED and UNWIRED.
//
// docs/audit-log-login-activity-deniability-decision.md keeps Audit Log
// audit-gated: the wallet-core/auditLog.js primitive may exist in code (PR #72)
// but must remain (a) NOT wired into any runtime call site and (b) NOT reachable
// as a page/route, until the independent audit reviews the storage-shape
// construction. This test locks both halves so the posture can't silently
// regress. (Whether it is advertised in the feature catalogue is separately
// guarded by featureCatalogue.test.js — this guards the wiring/route surface.)
//
// It also pins the removal of the orphaned, base44-mock AuditLogPage.jsx (a dead,
// unrouted page that read base44.entities.AuditLog and claimed a "Full history of
// all account actions" — a fabrication tell carrying the one name the deniability
// decision forbids surfacing). Same source-text/fs posture as
// security-framing.test.js — there is no DOM renderer in this project.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '..'); // src/
const read = (rel) => readFileSync(resolve(srcDir, rel), 'utf8');

// Recursively collect runtime source files (exclude tests + the primitive itself).
function runtimeFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...runtimeFiles(full));
    else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\.[jt]sx?$/.test(name)) out.push(full);
  }
  return out;
}

// An import / dynamic-import / require whose module specifier ends in `auditLog`
// (optionally with a `.js` suffix). A bare comment mentioning "audit-log" does
// not match — only a real module wiring does.
const IMPORTS_AUDITLOG = /(?:from|import\s*\(|require\s*\()\s*['"][^'"]*auditLog[^'"]*['"]/;

describe('Audit Log stays HONEST-DISABLED + UNWIRED (deniability decision)', () => {
  const primitive = resolve(srcDir, 'wallet-core/auditLog.js');

  it('the deniability-safe primitive is imported by NO runtime module', () => {
    const offenders = runtimeFiles(srcDir)
      .filter((f) => f !== primitive)
      .filter((f) => IMPORTS_AUDITLOG.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(srcDir.length + 1).replace(/\\/g, '/'));
    expect(
      offenders,
      `auditLog.js must stay unwired until the audit; imported by: ${offenders.join(', ')}`
    ).toEqual([]);
  });

  it('no /audit-log route is registered and no AuditLogPage is referenced', () => {
    const app = read('App.jsx');
    expect(app).not.toContain('/audit-log');
    expect(app).not.toContain('AuditLogPage');
  });

  it('the orphaned base44-mock AuditLogPage is gone', () => {
    expect(existsSync(resolve(srcDir, 'pages/AuditLogPage.jsx'))).toBe(false);
  });
});
