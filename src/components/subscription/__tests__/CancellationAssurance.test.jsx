import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import TierComparison from '../TierComparison';
import { CancellationAssurance, WhySubscription, RecoveryFaq } from '../CancellationAssurance';
import { COMPARISON_ROWS, WALLET_REMAINS_YOURS, AI_AGENT_LIMITS } from '@/lib/subscriptionCopy';

describe('CancellationAssurance', () => {
  it('renders the headline promise and recovery line', () => {
    render(<CancellationAssurance />);
    expect(screen.getByRole('heading', { name: WALLET_REMAINS_YOURS.heading })).toBeTruthy();
    expect(screen.getByText(/does not lock your wallet/)).toBeTruthy();
    expect(screen.getByText(/two valid Shamir/)).toBeTruthy();
  });

  it('shows agent limits only when asked (AI tier)', () => {
    const { rerender } = render(<CancellationAssurance />);
    expect(screen.queryByTestId('ai-agent-limits')).toBeNull();
    rerender(<CancellationAssurance showAgentLimits />);
    expect(screen.getByTestId('ai-agent-limits').textContent).toBe(AI_AGENT_LIMITS);
  });

  it('expanders are native details with a labelled summary', () => {
    render(<><WhySubscription /><RecoveryFaq /></>);
    expect(screen.getByText('Why a subscription?').closest('details')).toBeTruthy();
    const faq = screen.getByTestId('recovery-faq');
    expect(within(faq).getByText('Can I recover after cancelling?')).toBeTruthy();
    // existing vs new material stated separately
    expect(within(faq).getByText(/Creating new shares or a new backup file/)).toBeTruthy();
  });
});

describe('TierComparison', () => {
  it('is an accessible table with one row per capability and 3 tier columns', () => {
    render(<TierComparison />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(table).getAllByRole('row')).toHaveLength(COMPARISON_ROWS.length + 1);
  });

  it('marks unavailable cells as "Not included" for screen readers', () => {
    render(<TierComparison />);
    expect(screen.getAllByLabelText('Not included').length).toBeGreaterThan(0);
  });
});
