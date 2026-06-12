// components/spendingQueryConfig.js
//
// The on-demand fetch gate for the Spending Patterns card, extracted as a PURE
// function so the I2 privacy property is unit-testable without rendering hooks.
//
// I2 (no background egress): `enabled` IS the gate. While the card is collapsed
// (expanded=false) react-query does not run the query, so the BTC/SOL indexer is
// never hit and the active address is never disclosed — the query runs only once
// the user explicitly expands the card. `staleTime` makes a collapse→re-expand
// within the window serve cache rather than re-querying; `refetchOnWindowFocus:
// false` keeps it a user-opened snapshot, never a background poll.
//
// I3 (deniability): the queryKey is scoped to the active set's address (plus the
// asset and demo flag), so switching the active set reads a distinct cache entry
// — no cross-set bleed.

export function spendingQueryConfig({ expanded, assetSymbol, address, demo }) {
  return {
    queryKey: ['spending-patterns', assetSymbol, address, demo],
    enabled: !!expanded,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    retry: 1,
  };
}
