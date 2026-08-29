import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OnboardingProgressBar from '@/components/OnboardingProgressBar';

describe('OnboardingProgressBar', () => {
  it('determinate (default): renders aria-valuenow and the percentage label', () => {
    render(<OnboardingProgressBar value={42} label="Wallet setup progress" />);
    const bar = screen.getByRole('progressbar', { name: /wallet setup progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('42%')).toBeTruthy();
  });

  it('indeterminate: omits aria-valuenow (WCAG-correct indeterminate shape), no fake percentage', () => {
    render(<OnboardingProgressBar indeterminate label="Sealing into hardware" />);
    const bar = screen.getByRole('progressbar', { name: /sealing into hardware/i });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuemin');
    expect(bar).not.toHaveAttribute('aria-valuemax');
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('indeterminate: animated fill respects motion-reduce', () => {
    const { container } = render(<OnboardingProgressBar indeterminate label="Sealing into hardware" />);
    const fill = container.querySelector('[aria-hidden="true"]');
    expect(fill.className).toMatch(/motion-safe:animate-onboarding-indeterminate/);
    expect(fill.className).toMatch(/motion-reduce:animate-none/);
  });
});
