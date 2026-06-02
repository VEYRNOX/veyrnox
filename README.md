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
npm run mobile:build:demo     # demo-seeded native build (DEMO=true; plaintext cache — NOT for release)
npm run mobile:build:release  # store/production build (VITE_RELEASE=1; DEMO can never be true)
npm run android:run           # build + run on Android
```

`mobile:build:release` (and `build:release` for web) is the canonical store
build. It sets `VITE_RELEASE=1`; the build hard-fails if `VITE_DEMO_MODE` is also
set, so a release bundle can never resolve `DEMO=true` (which would cache the
vault password in plaintext localStorage — SAST H-1). The guard lives in
`vite.config.js`, with a runtime belt-and-suspenders assertion in
`src/api/demoClient.js`.

## Tests & checks

```
npm test            # vitest suite (wallet-core + lib)
npm run check:rng   # guards against insecure randomness in crypto paths
npm run lint        # eslint
```

## Data layer (fully on-device)

Earlier builds talked to a hosted backend (base44) for entity data, auth, and a
few server functions. That dependency has been **removed entirely** — the app
ships as a self-contained binary with no hosted account and no network for
entity data. Two on-device data layers back the app:

- **local** (default): persistent on-device storage (IndexedDB). A fresh install
  starts empty — the honest state for a real self-custody wallet.
- **demo**: an ephemeral, pre-seeded in-memory tour. Enable with `?demo=1` or a
  `VITE_DEMO_MODE=1` build.

Access in the local build is gated solely by the on-device vault unlock
(`WalletGate` → `WalletEntry`): the seed/vault is the identity. A few features
that genuinely need a server we no longer ship (LLM-backed AI pages, email-OTP
delivery) show an explicit "not available in this local build" state rather than
faking a result.
