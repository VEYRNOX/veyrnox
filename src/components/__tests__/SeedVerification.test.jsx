import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SeedVerification from '@/components/SeedVerification';

vi.mock('@/lib/analytics', () => ({
  emit: vi.fn(),
  FunnelEvent: {
    SEED_VERIFY_STARTED: 'seed_verify_started',
    SEED_VERIFY_ATTEMPT: 'seed_verify_attempt',
    SEED_VERIFY_PASSED: 'seed_verify_passed',
    SEED_VERIFY_FAILED: 'seed_verify_failed',
    SEED_VERIFY_DEFERRED: 'seed_verify_deferred',
  },
}));

const WORDS = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(' ');

describe('SeedVerification', () => {
  beforeEach(() => localStorage.clear());

  it('asks user to identify a word by position', () => {
    render(<SeedVerification seedWords={WORDS} walletId="w1" onVerified={() => {}} onDeferred={() => {}} />);
    expect(screen.getByText(/word #/i)).toBeTruthy();
  });

  it('shows defer button', () => {
    render(<SeedVerification seedWords={WORDS} walletId="w1" onVerified={() => {}} onDeferred={() => {}} />);
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeTruthy();
  });

  it('calls onDeferred when defer clicked', () => {
    const onDeferred = vi.fn();
    render(<SeedVerification seedWords={WORDS} walletId="w1" onVerified={() => {}} onDeferred={onDeferred} />);
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(onDeferred).toHaveBeenCalled();
  });
});
