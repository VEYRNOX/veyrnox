// lib/tier.js
//
// SUBSCRIPTION / TIER DISPLAY CATALOGUE.
//
// This file is the presentation model for the tier UI (TIERS, FREE_FEATURES,
// SAFETY_PLUS_FEATURES — consumed by the Plans and Safety Plus screens). It does
// NOT resolve entitlement.
//
// Real in-app-purchase billing IS wired up (App Store / Play Billing via
// RevenueCat): the live, verified, fail-closed tier is resolved by
// lib/entitlement.js `resolveTier()` and exposed through lib/TierProvider.jsx
// `useTier()`, which is what lib/… route gating (components/FeatureGate.jsx)
// actually reads. BUILT / unit-tested only — NOT device-verified. See
// docs/Feature-Status.md §11 and docs/superpowers/plans/2026-07-06-iap-subscription-stitching.md.

// Legacy display-only stub, retained for the tier catalogue tests. It always
// returns "free" and is NOT used for gating — never infer entitlement from this
// (the client can forge it). The real, forge-resistant source is resolveTier().
export function getCurrentTier() {
  return 'free';
}

// Two tiers: Free (the complete wallet, including every security/anti-fraud
// control) and Safety Plus (advanced analytics / premium insights only).
// Security and anti-fraud controls are FREE on principle — a safety-positioned
// wallet must never paywall the controls that keep users safe. Display catalogue
// only — real purchasing/entitlement lives in the billing layer above; these
// cards drive the Plans UI.
export const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    tagline: 'The complete self-custody wallet, all 10 assets, and every security & anti-fraud control. No account required.',
  },
  {
    id: 'safety_plus',
    name: 'Safety Plus',
    price: '$5.99/mo',
    tagline: 'Advanced analytics and premium insights — go deeper on your portfolio.',
  },
];

// Free tier headline features — shown on the plan card.
export const FREE_FEATURES = [
  { name: 'Full HD wallet — 10 assets (ETH, BTC, SOL + 7 more)', summary: 'EVM, Bitcoin, Solana, ERC-20 tokens' },
  { name: 'Biometric / Passkey / PIN unlock', summary: 'FIDO2, Face ID, numeric PIN over Argon2id' },
  { name: 'Duress PIN & Panic Wipe', summary: 'Coercion-resistant — always free on principle' },
  { name: 'Stealth / Hidden Wallets', summary: 'Deniable wallet pool — always free on principle' },
  { name: 'Reveal seed phrase', summary: 'Always accessible — your emergency recovery fallback' },
  { name: 'Calldata Decode & Approval Guard', summary: 'Human-readable pre-sign summary with unlimited-approval warning' },
  { name: 'Network Manager', summary: 'Switch and add custom EVM networks with RPC validation' },
  { name: 'WalletConnect / dApp Connector', summary: 'Connect to dApps, verified on Sepolia' },
  { name: 'Portfolio & P&L tracking', summary: 'Net-worth overview and fee analytics' },
  { name: 'Address Book', summary: 'Saved, labelled addresses with per-chain validation' },
  { name: 'NFT Gallery', summary: 'View owned NFTs across chains' },
  { name: 'Hardware wallet (Ledger & Trezor)', summary: 'Cold-key signing for ETH, BTC, SOL — keys never leave the device' },
  { name: 'Encrypted Personal Backup', summary: 'Export an encrypted .enc vault file for off-device storage' },
  { name: 'Spam Token Filter', summary: 'Auto-classify and hide airdropped scam tokens' },
  { name: 'Transaction Simulation', summary: 'Local-first pre-sign preview with risk flags' },
  { name: 'Anomaly / Fraud Detection', summary: 'Rule-based deviation flags over your own history' },
  { name: 'Suspicious-Address Screening', summary: 'Local blocklist + sanctioned-address checks' },
  { name: 'Security Dashboard', summary: 'At-a-glance view of your wallet security posture' },
  { name: 'Spending Limits', summary: 'Rule-based per-transaction and daily limits' },
  { name: 'Token Approvals (View + Revoke)', summary: 'Inspect and revoke ERC-20 allowances' },
  { name: 'Audit Log', summary: 'Optional encrypted local activity record' },
  { name: 'Message Signing', summary: 'Sign messages for proof-of-ownership' },
  { name: 'Price Charts, Alerts & Watchlist', summary: 'Real OHLCV data and threshold alerts' },
];

// Safety Plus tier headline features (analytics / premium insights only) — shown
// on the Plans card. Presentation only: access is enforced by the tier gate in
// components/FeatureGate against SAFETY_PLUS_ROUTES, not by this list.
export const SAFETY_PLUS_FEATURES = [
  { name: 'Portfolio Risk Score', summary: 'Concentration, leverage and volatility scoring' },
  { name: 'Advanced Analytics', summary: 'Sharpe ratio, correlation matrix, volatility analysis' },
  { name: 'On-Chain Analytics', summary: 'Address-level transaction activity and insights' },
  { name: 'Recurring Payments', summary: 'Scheduled payment reminders' },
];
