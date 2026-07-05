// AL-06 (2026-07-05 internal audit) — audit log deniability-absence disclosure.
// The optional audit log only writes in the primary session (auditSecretForSession
// returns null for decoy/hidden sessions, src/wallet-core/auditLog.js:145). The
// resulting ABSENCE of a log blob during a decoy/hidden session is itself a
// forensic tell. This pins the VISIBLE, honest disclosure of that limitation so
// it can't regress into an undisclosed design gap.
//
// Requirement: shown whenever the audit log opt-in is ON (regardless of whether
// entries exist yet), explaining:
//   - the log is primary-session-only,
//   - decoy/hidden sessions intentionally write nothing,
//   - the absence itself can be a forensic tell,
//   - panic wipe is the recommended mitigation if concerned.
// Must NOT render when the toggle is off.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const mockToggleAuditLog = vi.fn();
const mockReadAuditLogEntries = vi.fn(async () => []);
const mockClearAuditLogEntries = vi.fn(async () => {});

function mockWallet(auditLogEnabled) {
  vi.doMock('@/lib/WalletProvider', () => ({
    useWallet: () => ({
      auditLogEnabled,
      toggleAuditLog: mockToggleAuditLog,
      readAuditLogEntries: mockReadAuditLogEntries,
      clearAuditLogEntries: mockClearAuditLogEntries,
    }),
  }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('AuditLog — AL-06 deniability-absence disclosure (visible, not just a comment)', () => {
  it('is NOT rendered when the audit log is off', async () => {
    mockWallet(false);
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    expect(screen.queryByTestId('audit-log-deniability-disclosure')).toBeNull();
  });

  it('renders when the audit log opt-in is enabled', async () => {
    mockWallet(true);
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const el = await screen.findByTestId('audit-log-deniability-disclosure');
    expect(el).toBeTruthy();
  });

  it('states the log only records the primary wallet session', async () => {
    mockWallet(true);
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const text = (await screen.findByTestId('audit-log-deniability-disclosure')).textContent.toLowerCase();
    expect(text).toMatch(/primary wallet session/);
  });

  it('explains no log is written in decoy/hidden sessions, by design', async () => {
    mockWallet(true);
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const text = (await screen.findByTestId('audit-log-deniability-disclosure')).textContent.toLowerCase();
    expect(text).toMatch(/decoy or hidden/);
    expect(text).toMatch(/nothing is logged/);
  });

  it('warns that forensic examination could detect the absence of a log and infer a deniability session', async () => {
    mockWallet(true);
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const text = (await screen.findByTestId('audit-log-deniability-disclosure')).textContent.toLowerCase();
    expect(text).toMatch(/examining your device|forensic/);
    expect(text).toMatch(/no log exists/);
  });

  it('recommends panic wipe if concerned about forensic evidence', async () => {
    mockWallet(true);
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const text = (await screen.findByTestId('audit-log-deniability-disclosure')).textContent.toLowerCase();
    expect(text).toMatch(/panic wipe/);
  });

  it('uses calm muted-foreground styling, not the caution/alert palette', async () => {
    mockWallet(true);
    const { default: AuditLog } = await import('@/pages/AuditLog');
    render(<AuditLog />);
    const el = await screen.findByTestId('audit-log-deniability-disclosure');
    expect(el.className).toMatch(/text-muted-foreground/);
    expect(el.className).not.toMatch(/text-caution|bg-caution|text-destructive|bg-destructive/);
  });
});
