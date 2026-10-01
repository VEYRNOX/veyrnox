// BackupNagSheet — gentle Safety Plus nudge (replaces former Personal Backup push).
//
// Pins: mount does NOT call markBackupNagShown, dismiss button works,
// CTA navigates to /plans (not /personal-backup), I3 suppression.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const navigateMock = vi.fn();
vi.mock('react-router', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigateMock };
});

const backupNagMock = {
  shouldShowBackupNag: vi.fn(() => true),
  dismissForSession: vi.fn(),
  markBackupCompleted: vi.fn(),
  markBackupNagShown: vi.fn(),
  onVaultKeySetChanged: vi.fn(),
  markBackupPendingConfirmation: vi.fn(),
  markBackupCompletedFromConfirmation: vi.fn(),
  recordUnlock: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  getVaultFingerprint: vi.fn(() => 'fp-a'),
};
vi.mock('@/lib/backupNag', () => backupNagMock);

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

// The store lookup behind the "14 days free" wording. Defaults to "no confirmed
// trial", so every pre-existing case keeps today's copy; the free-trial block
// below overrides it per case.
const loadTrialMock = vi.fn(() => Promise.resolve(null));
vi.mock('@/lib/safetyPlusTrial', () => ({
  TRIAL_LOOKUP_BUDGET_MS: 1200,
  loadSafetyPlusTrialWithin: (...a) => loadTrialMock(...a),
}));
const hasRedeemedMock = vi.fn(() => false);
vi.mock('@/lib/referral', () => ({ hasRedeemed: () => hasRedeemedMock() }));

async function loadSheet() {
  const mod = await import('@/components/BackupNagSheet');
  return mod.default ?? mod.BackupNagSheet;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('BackupNagSheet', () => {
  it('mount does NOT call markBackupNagShown (avoids self-unmount race)', async () => {
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    expect(backupNagMock.markBackupNagShown).not.toHaveBeenCalled();
  });

  it('dismiss button calls dismissForSession', async () => {
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    fireEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    expect(backupNagMock.dismissForSession).toHaveBeenCalledTimes(1);
  });

  it('"Learn about Safety Plus" navigates to /plans', async () => {
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    fireEvent.click(await screen.findByRole('button', { name: /learn about safety plus/i }));
    expect(navigateMock).toHaveBeenCalledWith('/plans');
  });

  it('I3: in decoy/demo the sheet does not render', async () => {
    const den = await import('@/wallet-core/deniabilitySession');
    vi.mocked(den.isDeniabilityOrDemoActive).mockReturnValue(true);
    backupNagMock.shouldShowBackupNag.mockReturnValue(false);
    const Sheet = await loadSheet();
    const { container } = render(<Sheet addrs={['0xaaa']} />);
    expect(container.textContent ?? '').not.toMatch(/Safety Plus|Protect/i);
  });
});

// "14 days free" is a claim about what the store will charge: the sheet may say it
// only when loadSafetyPlusTrialWithin confirms an eligible, store-reported trial.
// Every other outcome keeps today's wording. The derivation itself (zero-price
// phase, iOS eligibility, no referral) is covered in lib/__tests__.
describe('BackupNagSheet free-trial wording', () => {
  beforeEach(async () => {
    // The I3 test above leaves these flipped; this block needs the sheet visible.
    const den = await import('@/wallet-core/deniabilitySession');
    vi.mocked(den.isDeniabilityOrDemoActive).mockReturnValue(false);
    backupNagMock.shouldShowBackupNag.mockReturnValue(true);
    loadTrialMock.mockResolvedValue(null);
    hasRedeemedMock.mockReturnValue(false);
  });

  it('a confirmed trial: says 14 days free with the price after it, and offers to see it', async () => {
    loadTrialMock.mockResolvedValue({ days: 14, priceString: '$49.99' });
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    const cta = await screen.findByRole('button', { name: 'See free trial' });
    expect(screen.getByText(/14 days free, then \$49\.99\/year/)).toBeTruthy();
    expect(screen.getByText(/before the trial ends/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /learn about safety plus/i })).toBeNull();
    fireEvent.click(cta);
    // Same behavior as the old button: mark shown, go to /plans (not a purchase).
    expect(backupNagMock.markBackupNagShown).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/plans');
  });

  it('keeps the original sentence about encrypted backups alongside the trial', async () => {
    loadTrialMock.mockResolvedValue({ days: 14, priceString: '$49.99' });
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    await screen.findByRole('button', { name: 'See free trial' });
    expect(screen.getByText(/adds encrypted backups/i)).toBeTruthy();
  });

  it('no confirmed trial: today\'s copy and button, no free claim', async () => {
    loadTrialMock.mockResolvedValue(null);
    const Sheet = await loadSheet();
    const { container } = render(<Sheet addrs={['0xaaa']} />);
    await screen.findByRole('button', { name: /learn about safety plus/i });
    expect(container.textContent ?? '').not.toMatch(/free/i);
  });

  it('shows nothing while the store lookup is still pending (no flash of the wrong copy)', async () => {
    loadTrialMock.mockReturnValue(new Promise(() => {}));
    const Sheet = await loadSheet();
    const { container } = render(<Sheet addrs={['0xaaa']} />);
    await Promise.resolve();
    expect(container.textContent ?? '').not.toMatch(/Protect your wallet|Safety Plus/);
  });

  it('asks the lookup with the live referral flag and a bounded wait', async () => {
    hasRedeemedMock.mockReturnValue(true);
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    await screen.findByRole('button', { name: /learn about safety plus/i });
    expect(loadTrialMock).toHaveBeenCalledTimes(1);
    const [budgetMs, args] = loadTrialMock.mock.calls[0];
    expect(budgetMs).toBeGreaterThan(0);
    expect(budgetMs).toBeLessThanOrEqual(2000);
    expect(args.hasReferral).toBe(true);
  });

  it('I3: makes no store lookup in a decoy/demo session', async () => {
    const den = await import('@/wallet-core/deniabilitySession');
    vi.mocked(den.isDeniabilityOrDemoActive).mockReturnValue(true);
    const Sheet = await loadSheet();
    const { container } = render(<Sheet addrs={['0xaaa']} />);
    await Promise.resolve();
    expect(loadTrialMock).not.toHaveBeenCalled();
    expect(container.textContent ?? '').toBe('');
  });

  it('makes no store lookup when the sheet is not due to show', async () => {
    backupNagMock.shouldShowBackupNag.mockReturnValue(false);
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    await Promise.resolve();
    expect(loadTrialMock).not.toHaveBeenCalled();
  });
});

// Placement pins (RSP-01/RSP-02/RTE-04, 2026-09-21). Source-read, not DOM-read:
// the outer wrapper's Tailwind position classes are what caused the bug, so pin
// the classes directly rather than trusting jsdom's non-layout-aware measurements.
// Mutation-checked: each pin was confirmed red by reverting to the pre-fix
// className string, then restored.
describe('BackupNagSheet placement', () => {
  it('below md, the card sits above the bottom nav, not flush at the viewport edge', async () => {
    const text = await readFile(
      resolve(process.cwd(), 'src/components/BackupNagSheet.jsx'),
      'utf8',
    );
    const wrapper = text.match(/<div className="([^"]*fixed[^"]*)">/)[1];
    // A bare `bottom-0` re-opens RSP-01 (card intercepts the Layout mobile nav,
    // which is also fixed bottom-0 z-40). The mobile rule must carry an offset.
    expect(wrapper).not.toMatch(/(?<!\S)bottom-0(?!\S)/);
    expect(wrapper).toMatch(/bottom-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\]/);
  });

  it('at md and up, the card clears SecurityAdvisor\'s Vigil launcher button', async () => {
    const [sheetText, advisorText] = await Promise.all([
      readFile(resolve(process.cwd(), 'src/components/BackupNagSheet.jsx'), 'utf8'),
      readFile(resolve(process.cwd(), 'src/components/SecurityAdvisor.jsx'), 'utf8'),
    ]);
    // Vigil docks at md:bottom-6, h-14 (3.5rem) tall -> its top edge is 5rem up.
    // RSP-02: the card used to dock at the SAME md:bottom-6, sitting on top of it.
    expect(advisorText).toMatch(/md:bottom-6/);
    expect(sheetText).not.toMatch(/md:bottom-6(?!\d)/);
    expect(sheetText).toMatch(/md:bottom-24/);
  });
});
