// Guard: the Audit Log primitive stays TIGHTLY-WIRED.
//
// OWNER OVERRIDE (2026-06-16, updated 2026-06-17) — documented in
// docs/audit-log-login-activity-deniability-decision.md:
//
// Original gate (pre-2026-06-16): auditLog.js was imported by ZERO runtime
// modules. Override: allowed exactly one approved wiring point (WalletProvider.jsx).
//
// UI landing (2026-06-17): /audit-log is now live. WalletProvider exposes four
// context methods (readAuditLogEntries, clearAuditLogEntries, auditLogEnabled,
// toggleAuditLog). The page (AuditLog.jsx) reaches the log ONLY through those
// context methods — it never imports auditLog.js directly. Everything else the
// gate protected still holds: auditLog.js is still imported ONLY by
// WalletProvider.jsx; no other runtime module may do so.
//
// Deniability properties preserved:
//   • readAuditLogEntries() returns [] in decoy/hidden sessions (hard gate).
//   • Entries are { type, ts } ONLY — no amounts, addresses, wallet identity.
//   • D1–D7 multi-set storage shape NOT built; primary-session only.
//   • Hard denylist of 7 sensitive terms in auditLog.js is unchanged.
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

describe('Audit Log stays TIGHTLY-WIRED — only WalletProvider may import auditLog.js', () => {
  const primitive = resolve(srcDir, 'wallet-core/auditLog.js');

  // The ONLY runtime module permitted to import auditLog.js. Pages reach the
  // audit log only through WalletProvider context (readAuditLogEntries, etc.),
  // never by importing the primitive directly. Widening this set is a deliberate
  // security decision, not a routine edit.
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

  it('/audit-log route IS registered in App.jsx and uses AuditLog component (not AuditLogPage)', () => {
    const app = read('App.jsx');
    expect(app).toContain('/audit-log');
    expect(app).toContain('AuditLog');
    expect(app).not.toContain('AuditLogPage');
  });

  it('the orphaned base44-mock AuditLogPage is gone', () => {
    expect(existsSync(resolve(srcDir, 'pages/AuditLogPage.jsx'))).toBe(false);
  });
});
