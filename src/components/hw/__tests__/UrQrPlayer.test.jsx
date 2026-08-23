import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import UrQrPlayer from '../UrQrPlayer.jsx';

vi.mock('@/components/QRCodeDisplay', () => ({
  default: ({ address }) => <div data-testid="qr-frame">{address}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

describe('UrQrPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the first QR part and advances manually', () => {
    render(<UrQrPlayer parts={['ur:a', 'ur:b', 'ur:c']} autoPlay={false} title="Sequence" />);

    expect(screen.getByTestId('qr-frame').textContent).toBe('ur:a');
    expect(screen.getByText('Part 1 of 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /next qr part/i }));
    expect(screen.getByTestId('qr-frame').textContent).toBe('ur:b');
    expect(screen.getByText('Part 2 of 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /previous qr part/i }));
    expect(screen.getByTestId('qr-frame').textContent).toBe('ur:a');
  });

  it('autoplays through multi-part sequences and can be paused', async () => {
    render(<UrQrPlayer parts={['ur:a', 'ur:b']} intervalMs={500} />);

    expect(screen.getByTestId('qr-frame').textContent).toBe('ur:a');
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('qr-frame').textContent).toBe('ur:b');

    fireEvent.click(screen.getByRole('button', { name: /pause qr playback/i }));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('qr-frame').textContent).toBe('ur:b');
  });

  it('renders a single-part QR without playback controls', () => {
    render(<UrQrPlayer parts={['ur:only']} />);

    expect(screen.getByText('Single-part QR')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /next qr part/i })).toBeNull();
    expect(screen.getByTestId('qr-frame').textContent).toBe('ur:only');
  });
});
