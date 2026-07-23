// @ts-nocheck
// Guards the honesty rule on the cancel-intent dialog: a price may be shown
// ONLY when a real, cheaper package exists in the current RevenueCat offering.
//
// Why this needs a test: Apple and Google sell exclusively from their own price
// points via store-configured promotional offers. A discount computed
// client-side is a number neither store can charge, so rendering one would be
// advertising a price that cannot be honoured. No promotional offer is
// configured today, so the no-price branch is the live path — and is exactly
// the branch a well-meaning "improvement" would break.
//
// The offer price arrives as an `offerPrice` prop ({priceString, price}) from
// purchases.js offerPriceInfo, and deliberately NOT off `offerPackage`. The
// retention package wraps the same store product as the current subscription,
// so its priceString is the full price — reading it rendered a struck-through
// "$5.99" beside an identical "$5.99" under a "Stay for less" headline.
// `offerPackage` remains the "is there an offer at all" signal.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CancelOfferDialog from '../CancelOfferDialog';

function setup(props = {}) {
  return render(
    <CancelOfferDialog
      open
      onOpenChange={() => {}}
      onKeep={() => {}}
      onContinue={() => {}}
      {...props}
    />
  );
}

describe('CancelOfferDialog — price is shown only for a real store offer', () => {
  it('renders NO price when no offer package exists (the current live state)', () => {
    setup({ offerPackage: null, currentPriceString: '$5.99/mo' });
    expect(screen.queryByTestId('cancel-offer-price')).toBeNull();
    // and must not invent a discount from the current price
    expect(screen.queryByText(/stay for less/i)).toBeNull();
  });

  it('renders NO price when a package exists but no offer price resolved', () => {
    // The live shape of the bug: a retention package IS present, but its
    // promotional price could not be read. Falling back to the package's own
    // priceString would quote the full price as a saving — so the whole price
    // block is omitted instead.
    setup({
      offerPackage: { product: { price: 5.99, priceString: '$5.99/mo' } },
      offerPrice: null,
      currentPackage: { product: { price: 5.99, priceString: '$5.99/mo' } },
      currentPriceString: '$5.99/mo',
    });
    expect(screen.queryByTestId('cancel-offer-price')).toBeNull();
    expect(screen.queryByText(/stay for less/i)).toBeNull();
  });

  it('never reads the price off the package — that is the base plan price', () => {
    // Regression guard. offerPackage carries a priceString of $5.99 (the base
    // plan, because the retention package wraps the same product). Only the
    // offerPrice prop may be rendered.
    setup({
      offerPackage: { product: { price: 5.99, priceString: '$5.99/mo' } },
      offerPrice: { priceString: '$2.99/mo', price: 2.99 },
      currentPackage: { product: { price: 5.99, priceString: '$5.99/mo' } },
      currentPriceString: '$5.99/mo',
    });
    expect(screen.getByText('$2.99/mo')).toBeTruthy();
    // the base price appears exactly once — struck through, as "what you pay
    // now" — and never as the offer figure
    expect(screen.getAllByText('$5.99/mo')).toHaveLength(1);
    expect(screen.getByText(/stay for 50% less/i)).toBeTruthy();
  });

  it('renders the store-provided price when a real cheaper offer exists', () => {
    setup({
      offerPackage: { product: { priceString: '$5.99/mo' } },
      offerPrice: { priceString: '$3.99/mo', price: 3.99 },
      currentPriceString: '$5.99/mo',
    });
    expect(screen.getByTestId('cancel-offer-price')).toBeTruthy();
    // the displayed figure is the store's string, not anything we derived
    expect(screen.getByText('$3.99/mo')).toBeTruthy();
  });

  it('derives the saving from real store prices — 50% off is computed, not asserted', () => {
    setup({
      currentPackage: { product: { price: 5.99, priceString: '$5.99/mo' } },
      offerPackage: { product: { price: 5.99 } },
      offerPrice: { priceString: '$2.99/mo', price: 2.99 },
      currentPriceString: '$5.99/mo',
    });
    expect(screen.getByText(/stay for 50% less/i)).toBeTruthy();
  });

  it('reports the ACTUAL percentage when the store offer is not 50%', () => {
    // Guards against hardcoding "50%": a 30% store offer must read 30%.
    setup({
      currentPackage: { product: { price: 10 } },
      offerPackage: { product: { price: 10 } },
      offerPrice: { priceString: '$7.00/mo', price: 7 },
    });
    expect(screen.getByText(/stay for 30% less/i)).toBeTruthy();
    expect(screen.queryByText(/50%/)).toBeNull();
  });

  it('omits the percentage rather than guessing when a numeric price is missing', () => {
    setup({
      currentPackage: { product: { priceString: '$5.99/mo' } }, // no numeric price
      offerPackage: { product: {} },
      offerPrice: { priceString: '$2.99/mo', price: 2.99 },
    });
    expect(screen.getByTestId('cancel-offer-price')).toBeTruthy();
    expect(screen.queryByText(/% less/i)).toBeNull();
  });

  it('always offers a route out — cancellation is never trapped behind the offer', () => {
    const onContinue = vi.fn();
    setup({
      offerPackage: { product: {} },
      offerPrice: { priceString: '$3.99/mo', price: 3.99 },
      onContinue,
    });
    const out = screen.getByText(/continue to cancel/i);
    expect(out).toBeTruthy();
    out.click();
    expect(onContinue).toHaveBeenCalled();
  });

  it('states that cancellation is handled by the store, not by us', () => {
    setup({ offerPackage: null });
    expect(
      screen.getByText(/handled by the App Store or Google Play/i)
    ).toBeTruthy();
  });
});
