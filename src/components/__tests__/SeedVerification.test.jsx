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

  // No option other than the correct answer may be a real word from the user's
  // phrase. Distractors used to be drawn from seedWords itself, putting up to
  // 4 genuine mnemonic words on screen per question.
  it('never shows more than one real seed word at a time', () => {
    render(<SeedVerification seedWords={WORDS} walletId="w1" onVerified={() => {}} onDeferred={() => {}} />);

    const optionLabels = screen.getAllByRole('button')
      .map((b) => b.textContent.trim())
      .filter((t) => !/skip for now/i.test(t));

    expect(optionLabels).toHaveLength(4);
    const realWordsShown = optionLabels.filter((w) => WORDS.includes(w));
    expect(realWordsShown).toHaveLength(1);
  });

  // Resuming must re-ask the SAME question, not reroll it.
  it('resumes the question it was skipped on', () => {
    const { unmount } = render(
      <SeedVerification seedWords={WORDS} walletId="w1" onVerified={() => {}} onDeferred={() => {}} />,
    );
    const firstPrompt = screen.getByText(/word #/i).textContent;
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    unmount();

    render(<SeedVerification seedWords={WORDS} walletId="w1" onVerified={() => {}} onDeferred={() => {}} />);
    expect(screen.getByText(/word #/i).textContent).toBe(firstPrompt);
  });

  it('announces answer feedback to assistive tech', () => {
    render(<SeedVerification seedWords={WORDS} walletId="w1" onVerified={() => {}} onDeferred={() => {}} />);
    const live = document.querySelector('[role="status"][aria-live="polite"]');
    expect(live).toBeTruthy();
  });
});
