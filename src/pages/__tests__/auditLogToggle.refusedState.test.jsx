// Branch review 2026-08-15 — S-2 (Settings lied about a refused toggle) and
// A-1 (the refusal was inaudible to a screen reader).
//
// Both surfaces expose the SAME provider callback. In a decoy/hidden session
// WalletProvider.toggleAuditLog refuses, and the two pages diverged on what the
// user then saw:
//
//   AuditLog.jsx  — switch driven by provider state, so it did not move at all.
//                   Honest, but silent: nothing announced the refusal.
//   Settings.jsx  — kept its own optimistic state and called setAuditLog(checked)
//                   unconditionally after the await, so the switch rendered ON
//                   and the entries panel opened on a log that was never
//                   enabled, until a remount silently reverted it.
//
// The fix gives toggleAuditLog an applied/refused return value and adds a single
// `auditLogWritable` flag to the context, so neither page recomputes
// `!isDecoy && !isHidden` for itself (the three-place duplication that produced
// the unguarded third consent writer — see lib/consent.js).
//
// aria-disabled, NOT disabled: a hard-disabled control leaves the tab order and
// reads as unavailable, which is a louder deniability tell than an unresponsive
// one. The control stays reachable and announces its state.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(resolve(here, '../Settings.jsx'), 'utf8');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.resetModules();
});

// A decoy session: toggleAuditLog refuses (returns false) and never flips
// auditLogEnabled — exactly what the real provider does.
//
// Every function below is created ONCE per mock, not inside the useWallet()
// factory. AuditLog's `reload` is a useCallback keyed on readAuditLogEntries and
// is driven by a useEffect, so a fresh function identity per render is an
// infinite render loop (it OOMs the worker rather than failing). Same reason the
// existing AuditLog.deniabilityDisclosure.test.jsx hoists its mocks.
function mockWallet({ writable }) {
  const toggleAuditLog = vi.fn(async () => writable);
  const readAuditLogEntries = vi.fn(async () => []);
  const clearAuditLogEntries = vi.fn(async () => {});
  const recordAudit = vi.fn();
  const lock = vi.fn();
  const getAuditLogEnabled = vi.fn(() => false);
  const ctx = {
    auditLogEnabled: false,
    auditLogWritable: writable,
    toggleAuditLog,
    getAuditLogEnabled,
    readAuditLogEntries,
    fetchAuditEntries: readAuditLogEntries,
    clearAuditLogEntries,
    recordAudit,
    lock,
  };
  vi.doMock('@/lib/WalletProvider', () => ({ useWallet: () => ctx }));
  return { toggleAuditLog };
}

const mockRefusingWallet = () => mockWallet({ writable: false });
const mockAcceptingWallet = () => mockWallet({ writable: true });

describe('AuditLog — A-1 refusal is announced, control stays reachable', () => {
  it('marks the switch aria-disabled when the session cannot write', async () => {
    mockRefusingWallet();
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const sw = screen.getByRole('switch', { name: 'Enable audit log' });
    expect(sw.getAttribute('aria-disabled')).toBe('true');
  });

  it('does NOT hard-disable it — a control removed from the tab order is a louder tell', async () => {
    mockRefusingWallet();
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const sw = screen.getByRole('switch', { name: 'Enable audit log' });
    expect(sw.hasAttribute('disabled')).toBe(false);
  });

  it('points aria-describedby at text that actually names the limitation', async () => {
    mockRefusingWallet();
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const sw = screen.getByRole('switch', { name: 'Enable audit log' });
    const describedBy = sw.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const help = document.getElementById(describedBy ?? '');
    expect(help).toBeTruthy();
    // A pointer at text that does not explain the refusal is worse than none.
    expect((help?.textContent ?? '').toLowerCase()).toMatch(/decoy\/hidden sessions/);
  });

  it('carries no aria-disabled in a primary session', async () => {
    mockAcceptingWallet();
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const sw = screen.getByRole('switch', { name: 'Enable audit log' });
    expect(sw.getAttribute('aria-disabled')).toBeNull();
  });
});

// Settings.jsx is SOURCE-SCANNED rather than rendered, matching the call this
// repo already made for it in Settings.change-pin-link.test.js: the page pulls in
// base44 + react-query + a dozen child components, so a full render needs a
// QueryClientProvider, a TierProvider and i18n before it will mount at all —
// disproportionate for one handler. AuditLog.jsx above IS rendered, because the
// aria assertions need real DOM and that page only depends on useWallet.
describe('Settings — S-2 a refused toggle must not render as applied (source scan)', () => {
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const code = stripComments(settingsSrc);
  // The activity-log Switch's onCheckedChange handler.
  const handlerIdx = code.indexOf('toggleAuditLog(checked)');
  const handler = code.slice(Math.max(0, handlerIdx - 400), handlerIdx + 400);

  it('the activity-log toggle handler still exists', () => {
    expect(handlerIdx).toBeGreaterThan(-1);
  });

  it('captures the APPLIED verdict rather than discarding it', () => {
    expect(handler).toMatch(/const\s+applied\s*=\s*await\s+toggleAuditLog\(checked\)/);
  });

  it('returns early on refusal BEFORE touching local state', () => {
    // This is the whole defect: setAuditLog(checked) used to run unconditionally
    // after the await, so a refused toggle still rendered as ON.
    const guardIdx = handler.search(/if\s*\(\s*!applied\s*\)\s*return\s*;/);
    const setIdx = handler.indexOf('setAuditLog(checked)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(setIdx);
  });

  it('the guard also precedes recordAudit — a refused change is not an event', () => {
    const guardIdx = handler.search(/if\s*\(\s*!applied\s*\)\s*return\s*;/);
    const auditIdx = handler.indexOf("recordAudit('settings_changed')");
    expect(auditIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(auditIdx);
  });

  it('still calls toggleAuditLog — the gate belongs to the provider, not this page', () => {
    // Short-circuiting on auditLogWritable here would re-create the duplicated
    // session check that lib/consent.js exists to warn about.
    expect(handler).not.toMatch(/if\s*\(\s*!auditLogWritable\s*\)\s*return/);
  });

  it('annotates the switch aria-disabled without hard-disabling it', () => {
    expect(code).toMatch(/aria-disabled=\{!auditLogWritable \|\| undefined\}/);
    // `disabled` would drop the control from the tab order — a louder tell.
    const swIdx = code.indexOf('aria-disabled={!auditLogWritable');
    const sw = code.slice(Math.max(0, swIdx - 300), swIdx + 300);
    expect(sw).not.toMatch(/\sdisabled=/);
  });

  it('reads auditLogWritable from the provider instead of recomputing it', () => {
    expect(code).toMatch(/auditLogWritable\s*=\s*true\s*,/); // destructured with a safe default
    expect(code).not.toMatch(/!isDecoy\s*&&\s*!isHidden/);
  });
});
