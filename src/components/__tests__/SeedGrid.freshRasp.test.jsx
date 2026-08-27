// SeedGrid — L-6 fix (audit 2026-08-25).
//
// The clipboard-copy RASP gate used to consult ONLY the mount-time
// useRaspArtifact() sample (up to ~60s stale). This pins that the copy
// button's confirm step now ALSO awaits a FRESH probe and refuses to copy
// the mnemonic on a BLOCK verdict, even when the mount-time sample is still
// ALLOW (the exact staleness window L-6 closes).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => (props) => {
    const { children, ...rest } = props || {};
    return <div {...rest}>{children}</div>;
  } }),
  useReducedMotion: () => true,
  AnimatePresence: ({ children }) => <>{children}</>,
}));

const copySecret = vi.fn(async () => {});
vi.mock('@/lib/copySecret', () => ({ copySecret: (...a) => copySecret(...a) }));

const toastError = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: { error: (...a) => toastError(...a) } }));

let mountArtifact = { tier: 'allow', sentence: null, blockedActions: [], requiresBiometric: false };
vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useRaspArtifact: () => mountArtifact };
});

const getFreshLocalRaspArtifact = vi.fn(async () => mountArtifact);
vi.mock('@/lib/getFreshLocalRaspArtifact', () => ({
  getFreshLocalRaspArtifact: (...a) => getFreshLocalRaspArtifact(...a),
}));

const SeedGrid = (await import('@/components/SeedGrid')).default;

beforeEach(() => {
  mountArtifact = { tier: 'allow', sentence: null, blockedActions: [], requiresBiometric: false };
  // mockReset (not mockClear): a prior test's mockResolvedValue override must
  // not leak into the next test — reset back to the default closure-reading impl.
  getFreshLocalRaspArtifact.mockReset().mockImplementation(async () => mountArtifact);
  copySecret.mockClear();
  toastError.mockClear();
});
afterEach(() => cleanup());

const MNEMONIC = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

describe('SeedGrid — fresh-at-confirm RASP probe on clipboard copy (L-6)', () => {
  it('awaits getFreshLocalRaspArtifact when the copy button is pressed', async () => {
    render(<SeedGrid mnemonic={MNEMONIC} defaultHidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: /copy recovery phrase/i }));

    await waitFor(() => expect(getFreshLocalRaspArtifact).toHaveBeenCalledTimes(1));
  });

  it('mount-time ALLOW + fresh BLOCK refuses to copy (closes the staleness window)', async () => {
    getFreshLocalRaspArtifact.mockResolvedValue({
      tier: 'block',
      sentence: 'This app appears to have been altered…',
      blockedActions: ['sign', 'seed-reveal', 'export', 'import'],
      requiresBiometric: false,
    });
    render(<SeedGrid mnemonic={MNEMONIC} defaultHidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: /copy recovery phrase/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(copySecret).not.toHaveBeenCalled();
  });

  it('fresh ALLOW proceeds to copy as before', async () => {
    render(<SeedGrid mnemonic={MNEMONIC} defaultHidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: /copy recovery phrase/i }));

    await waitFor(() => expect(copySecret).toHaveBeenCalledWith(MNEMONIC));
  });
});
