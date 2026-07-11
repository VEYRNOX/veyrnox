import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import IncompleteBalanceNote from '../IncompleteBalanceNote';
import { PARTIAL_TOTAL_NOTE } from '@/lib/balanceDisplay';

afterEach(cleanup);

describe('IncompleteBalanceNote', () => {
  it('renders the shared incomplete-total copy (I4 fail-closed marker)', () => {
    render(<IncompleteBalanceNote />);
    expect(screen.getByText(PARTIAL_TOTAL_NOTE)).toBeTruthy();
    // exposed as a status region so the incompleteness is announced, not silent
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('passes through an extra className without dropping the message', () => {
    render(<IncompleteBalanceNote className="mb-2" />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('mb-2');
    expect(el.textContent).toContain('incomplete');
  });
});
