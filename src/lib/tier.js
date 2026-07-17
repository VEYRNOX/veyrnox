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

// Two tiers: Free (the complete self-custody wallet + core security) and Safety
// Plus (deeper security controls + advanced analytics). This catalogue mirrors
// the public plans page at https://veyrnox.com/plans — that page is the source
// of truth for what sits in each tier. Display catalogue only — real
// purchasing/entitlement lives in the billing layer above; these cards drive
// the Plans UI, and route access is enforced by components/FeatureGate against
// SAFETY_PLUS_ROUTES.
export const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    tagline: 'Complete self-custody wallet — everything you need to hold, send and secure your crypto, free forever.',
  },
  {
    id: 'safety_plus',
    name: 'Safety Plus',
    price: '$5.99/mo',
    tagline: 'Everything in Free, plus deeper security controls and advanced analytics.',
  },
];

// Free tier features — shown on the plan card. Mirrors the FREE column of
// https://veyrnox.com/plans.
export const FREE_FEATURES = [
  { name: 'HD wallet — 10 assets', summary: 'ETH, BTC, SOL, ERC-20s' },
  { name: 'Import wallet', summary: 'Restore from seed or private key' },
  { name: 'Send & Receive', summary: 'All chains, on-chain verified' },
  { name: 'Live balances & tx history', summary: 'Read live from chain' },
  { name: 'Gas / fee control', summary: 'Per-chain tiers + custom' },
  { name: 'ENS / SNS resolution', summary: 'Resolve .eth and .sol on send' },
  { name: 'Backup & reveal seed', summary: 'Seed phrase + QR — always free' },
  { name: 'Account access & recovery', summary: 'Change password, re-import' },
  { name: 'Network Manager', summary: 'View, switch & add EVM networks' },
  { name: 'Biometric / Passkey / PIN unlock', summary: 'FIDO2, Face ID, Argon2id' },
  { name: 'Two-factor at critical actions', summary: 'PIN + Action Password or Passkey' },
  { name: 'Session manager & auto-lock', summary: 'Device sessions, revoke, idle lock' },
  { name: 'Address book', summary: 'Saved, labelled addresses' },
  { name: 'RASP', summary: 'Runtime environment detection' },
  { name: 'Security dashboard', summary: 'At-a-glance security posture' },
  { name: 'Portfolio dashboard & net-worth', summary: 'Aggregate crypto net worth' },
  { name: 'Fee analytics', summary: 'Track fees paid in native units' },
  { name: 'Portfolio risk score', summary: 'Concentration, leverage, volatility' },
  { name: 'Price charts, alerts & watchlist', summary: 'Real OHLCV data, threshold alerts' },
  { name: 'WalletConnect / dApp connector', summary: 'Verified on Sepolia' },
  { name: 'NFT gallery', summary: 'View owned NFTs across chains' },
  { name: 'Notifications & push', summary: 'Web push notification centre' },
];

// Safety Plus tier features — shown on the Plans card. Mirrors the SAFETY PLUS
// column of https://veyrnox.com/plans. Presentation only: access is enforced by
// the tier gate in components/FeatureGate against SAFETY_PLUS_ROUTES, not by
// this list. NOTE: three of these (Calldata decode & approval guard,
// Address-poisoning warnings, Transaction simulation) are embedded in the Send
// flow rather than standalone routes, so they are listed here but are NOT yet
// route-gated — see docs and SAFETY_PLUS_ROUTES.
export const SAFETY_PLUS_FEATURES = [
  { name: 'Duress PIN', summary: 'Decoy wallet under coercion' },
  { name: 'Stealth / hidden wallets', summary: 'Deniable hidden-wallet pool' },
  { name: 'Panic wipe', summary: 'Irreversible local key destruction' },
  { name: 'Calldata decode & approval guard', summary: 'Human-readable calldata before signing' },
  { name: 'Address-poisoning warnings', summary: 'Look-alike detection on send' },
  { name: 'Risk scoring (pre-sign gate)', summary: 'Rule-based gate wired into Send' },
  { name: 'Hardware wallet (Trezor)', summary: 'Cold-key signing, keys never leave device' },
  { name: 'Transaction simulation', summary: 'Pre-sign preview with risk flags' },
  { name: 'Anomaly / fraud detection', summary: 'Rule-based deviation flags' },
  { name: 'Suspicious-address screening', summary: 'Local blocklist + sanctions checks' },
  { name: 'Token approvals (view + revoke)', summary: 'Inspect and revoke ERC-20 allowances' },
  { name: 'Spending limits', summary: 'Per-tx and daily caps' },
  { name: 'Spam token filter', summary: 'Auto-hide airdropped scam tokens' },
  { name: 'Encrypted personal backup', summary: 'Export .enc vault file off-device' },
  { name: 'Audit log', summary: 'Encrypted local activity record' },
  { name: 'Advanced analytics', summary: 'Sharpe ratio, correlation matrix' },
  { name: 'On-chain analytics', summary: 'Address-level activity insights' },
  { name: 'Recurring payments', summary: 'Scheduled payment reminders' },
  { name: 'Message signing', summary: 'Proof-of-ownership without sending funds' },
];
