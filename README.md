# Veyrnox Wallet

A self-custody, local-first crypto wallet. Keys are derived and stored on-device;
signing and broadcast go through the wallet's own `wallet-core` providers and
direct RPC — never through a hosted backend.

## Run locally

**Prerequisites:** Node.js + npm.

1. Clone the repository.
2. Install dependencies: `npm install`
3. Run the dev server: `npm run dev`

The app defaults to a **local-first data layer**: all app data (wallets list,
transaction history, watchlists, approvals, address book, etc.) is persisted
on-device (IndexedDB) and no entity data is sent to any hosted backend.

### Demo mode

Append `?demo=1` to the URL (or build with `VITE_DEMO_MODE=1`) to run against an
in-memory seeded dataset for a quick tour without creating real wallet data.
`?demo=0` turns it back off.

## Mobile (Capacitor)

```
npm run mobile:build          # vite build + cap sync
npm run mobile:build:demo     # demo-seeded native build
npm run android:run           # build + run on Android
```

## Tests & checks

```
npm test            # vitest suite (wallet-core + lib)
npm run check:rng   # guards against insecure randomness in crypto paths
npm run lint        # eslint
```

## Legacy hosted backend (optional, being removed)

Earlier builds talked to a hosted backend for entity data, auth, and a few
server functions. That dependency is being removed in phases so the app can
ship as a self-contained native binary. The hosted path is no longer the
default; it can still be opted into for a transitional build with
`VITE_BASE44_BACKEND=1` (plus the `VITE_BASE44_APP_ID` / `VITE_BASE44_APP_BASE_URL`
env vars). This opt-in will go away entirely once the phased removal completes.
