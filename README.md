# Veyrnox Wallet

A self-custody, local-first crypto wallet. Keys are derived and stored on-device;
signing and broadcast go through the wallet's own `wallet-core` providers and
direct RPC — never through a hosted backend.

The app defaults to a **local-first data layer**: all app data (wallets list,
transaction history, watchlists, approvals, address book, etc.) is persisted
on-device and no entity data is sent to any hosted backend.

Access in the local build is gated solely by the on-device vault unlock
(`WalletGate` → `WalletEntry`): the seed/vault is the identity.
