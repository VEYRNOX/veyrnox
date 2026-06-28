// lib/tier.js
//
// SUBSCRIPTION / TIER DISPLAY SCAFFOLD (non-functional).
//
// This is a DISPLAY-ONLY model of subscription tiers. There is NO subscription
// system wired up: no payment, no in-app-purchase, no entitlement check, no
// persistence. getCurrentTier() always returns "free".
//
// FUTURE: real entitlement will come from a VERIFIED in-app-purchase receipt
// (App Store / Play Billing) resolved at launch. When that exists it REPLACES
// the hard-coded "free" below — the tier must never be inferred from anything
// the client can forge, and a paid feature must never be unlocked by this file.
// Until then every user is "free" and the Safety Plus card is preview only.

// The user's current tier. Hard-coded to "free" because no billing exists yet.
// A real implementation reads a verified IAP receipt; this stub does NOT.
export function getCurrentTier() {
  return 'free';
}

// Two tiers: Free (the complete wallet) and Safety Plus (pre-sign intelligence
// layer + advanced analytics). Life-safety features (duress PIN, panic wipe,
// stealth wallets) are FREE on principle — physical safety must not be paywalled.
// Prices are confirmed. No payment system exists yet; these cards are preview only.
export const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    tagline: 'The complete self-custody wallet, all 10 assets, and all life-safety security. No account required.',
  },
  {
    id: 'safety_plus',
    name: 'Safety Plus',
    price: '$5.99/mo',
    tagline: 'Pre-sign intelligence and advanced analytics — harden your wallet day to day.',
  },
];

// Free tier headline features — shown on the plan card.
export const FREE_FEATURES = [
  { name: 'Full HD wallet — 10 assets (ETH, BTC, SOL + 7 more)', summary: 'EVM, Bitcoin, Solana, ERC-20 tokens' },
  { name: 'Biometric / Passkey / PIN unlock', summary: 'FIDO2, Face ID, numeric PIN over Argon2id' },
  { name: 'Hardware wallet (Ledger & Trezor)', summary: 'Cold-key signing, keys never leave the device' },
  { name: 'Duress PIN & Panic Wipe', summary: 'Coercion-resistant — always free on principle' },
  { name: 'Stealth / Hidden Wallets', summary: 'Deniable wallet pool — always free on principle' },
  { name: 'WalletConnect / dApp Connector', summary: 'Connect to dApps, verified on Sepolia' },
  { name: 'Portfolio & P&L tracking', summary: 'Net-worth overview and fee analytics' },
  { name: 'Address Book', summary: 'Saved, labelled addresses with per-chain validation' },
  { name: 'NFT Gallery', summary: 'View owned NFTs across chains' },
];

// Safety Plus tier headline features — BUILT and working today. Listing a
// feature here is presentation only — it does NOT gate or unlock the feature
// until real billing (IAP receipt verification) is wired up.
export const SAFETY_PLUS_FEATURES = [
  { name: 'Transaction Simulation', summary: 'Local-first pre-sign preview with risk flags' },
  { name: 'Anomaly / Fraud Detection', summary: 'Rule-based deviation flags over your own history' },
  { name: 'Suspicious-Address Screening', summary: 'Local blocklist + sanctioned-address checks' },
  { name: 'Security Dashboard', summary: 'At-a-glance view of your wallet security posture' },
  { name: 'Spending Limits', summary: 'Rule-based per-transaction and daily limits' },
  { name: 'Token Approvals (View + Revoke)', summary: 'Inspect and revoke ERC-20 allowances' },
  { name: 'Portfolio Risk Score', summary: 'Concentration, leverage and volatility scoring' },
  { name: 'Advanced Analytics', summary: 'Sharpe ratio, correlation matrix, volatility analysis' },
  { name: 'On-Chain Analytics', summary: 'Address-level transaction activity and insights' },
  { name: 'Price Charts, Alerts & Watchlist', summary: 'Real OHLCV data and threshold alerts' },
  { name: 'Audit Log', summary: 'Optional encrypted local activity record' },
  { name: 'Recurring Payments', summary: 'Scheduled payment reminders' },
  { name: 'Message Signing', summary: 'Sign messages for proof-of-ownership' },
];
