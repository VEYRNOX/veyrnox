// components/settings/__tests__/RelockGraceSelector.test.jsx
//
// UI for the Delayed re-lock setting. Default renders "Immediate" (0 ms);
// selection persists via lib/relockGrace. Suppressed in decoy/demo (rendering
// the setting at all leaks that a real session exists — I3).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import RelockGraceSelector from '../RelockGraceSelector.jsx';
import { RELOCK_GRACE_STORAGE_KEY, getRelockGraceMs, __resetRelockGraceForTests }
  from '@/lib/relockGrace.js';

describe('RelockGraceSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
    __resetRelockGraceForTests();
  });

  it('renders "Immediate" as the selected default', () => {
    render(<RelockGraceSelector />);
    const select = screen.getByTestId('relock-grace-select');
    expect(select.value).toBe('0');
  });

  it('persists the chosen value via setRelockGraceMs', () => {
    render(<RelockGraceSelector />);
    const select = screen.getByTestId('relock-grace-select');
    fireEvent.change(select, { target: { value: '30000' } });
    expect(localStorage.getItem(RELOCK_GRACE_STORAGE_KEY)).toBe('30000');
    expect(getRelockGraceMs()).toBe(30_000);
  });

  it('is suppressed entirely in decoy/demo (renders null, no signal)', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    const { container } = render(<RelockGraceSelector />);
    expect(container.firstChild).toBeNull();
  });
});
