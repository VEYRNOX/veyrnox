// Guard: the Audit Log primitive stays HONEST-DISABLED and TIGHTLY-WIRED.
//
// OWNER OVERRIDE (2026-06-16) — documented in
// docs/audit-log-login-activity-deniability-decision.md §"Owner override":
// the audit gate that kept wallet-core/auditLog.js imported by ZERO runtime
// modules has been DELIBERATELY lifted to allow the PRIMARY-SESSION wiring path,
// pre-audit. The override is intentionally NARROW: auditLog.js may now be imported
// by exactly ONE approved wiring point (lib/WalletProvider.jsx, which owns the
// gated recordAudit(type) entry); call sites reach it only through that provider,
// never by importing auditLog.js directly. Everything else the gate protected
// still holds: still NOT reachable as a page/route, still NOT surfaced in the
// feature catalogue (guarded by featureCatalogue.test.js), and the D1–D7 multi-set
// storage shape the auditor was to review is NOT built — logging is primary-session
// only and hard-off in decoy/hidden, so the real-vs-decoy distinguisher hazard is
// never introduced. This test still locks the posture so it can't drift wider:
// any importer other than the approved wirer, any route/page, fails here.
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

describe('Audit Log stays HONEST-DISABLED + TIGHTLY-WIRED (deniability decision + 2026-06-16 owner override)', () => {
  const primitive = resolve(srcDir, 'wallet-core/auditLog.js');

  // The ONLY runtime module permitted to import auditLog.js. The gated
  // recordAudit(type) entry point lives here; everything else must reach the log
  // through the provider, never by importing the primitive directly. Widening this
  // set is a deliberate security decision, not a routine edit.
  const APPROVED_WIRERS = new Set(['lib/WalletProvider.jsx']);

  it('the deniability-safe primitive is imported ONLY by the approved wiring point', () => {
    const offenders = runtimeFiles(srcDir)
      .filter((f) => f !== primitive)
      .filter((f) => IMPORTS_AUDITLOG.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(srcDir.length + 1).replace(/\\/g, '/'))
      .filter((rel) => !APPROVED_WIRERS.has(rel));
    expect(
      offenders,
      `auditLog.js may be imported only by ${[...APPROVED_WIRERS].join(', ')}; also imported by: ${offenders.join(', ')}`
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
