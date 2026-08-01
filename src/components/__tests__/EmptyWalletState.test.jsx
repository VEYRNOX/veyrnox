import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyWalletState from '@/components/EmptyWalletState';

vi.mock('@/lib/analytics', () => ({
  emit: vi.fn(),
  FunnelEvent: { RECEIVE_ADDRESS_VIEWED: 'receive_address_viewed' },
}));

describe('EmptyWalletState', () => {
  it('shows receive CTA and on-ramp routes', () => {
    render(<EmptyWalletState receiveAddress="0xabc" onReceive={() => {}} buyReady={false} />);
    expect(screen.getByText(/add funds/i)).toBeTruthy();
    expect(screen.getByText(/from an exchange/i)).toBeTruthy();
    expect(screen.getByText(/from another wallet/i)).toBeTruthy();
  });

  it('hides buy-with-card when buyReady is false', () => {
    render(<EmptyWalletState receiveAddress="0xabc" onReceive={() => {}} buyReady={false} />);
    expect(screen.queryByText(/buy with card/i)).toBeFalsy();
  });

  it('shows buy-with-card when buyReady is true', () => {
    render(<EmptyWalletState receiveAddress="0xabc" onReceive={() => {}} buyReady={true} />);
    expect(screen.getByText(/buy with card/i)).toBeTruthy();
  });

  it('calls onReceive when receive button is clicked', () => {
    const onReceive = vi.fn();
    render(<EmptyWalletState receiveAddress="0xabc" onReceive={onReceive} buyReady={false} />);
    fireEvent.click(screen.getByRole('button', { name: /receive/i }));
    expect(onReceive).toHaveBeenCalled();
  });
});
