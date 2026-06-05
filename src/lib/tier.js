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
// Until then every user is "free" and the Pro/Guardian cards are preview only.

// The user's current tier. Hard-coded to "free" because no billing exists yet.
// A real implementation reads a verified IAP receipt; this stub does NOT.
export function getCurrentTier() {
  return 'free';
}

// The tiers shown on the plans screen. Two AXES, not one ladder (spec §5):
//   - Software axis (DIY):  Free -> Pro -> SHIELD. More money = more protection depth.
//   - Service axis:         Guardian sits ON TOP of the software (it INCLUDES SHIELD
//                           and adds humans) — it is not a higher software rung.
// Life-safety security (duress PIN, panic wipe, decoy balances) is FREE on principle.
// Prices are a WORKING MODEL, not final, and nothing here grants access to anything —
// it is copy for the cards. Pro = harden the present; SHIELD = harden across time,
// devices and succession; Guardian = our team operates it with you.
export const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    tagline: 'The full self-custody wallet plus all life-safety security. No account required.',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '~$5-8/mo, not final',
    tagline: 'Harden your wallet day to day.',
  },
  {
    id: 'shield',
    name: 'SHIELD',
    price: 'Top software tier — price TBC',
    tagline: 'Harden across time, devices, and succession.',
  },
  {
    id: 'guardian',
    name: 'Guardian',
    price: '$100+/mo, by application',
    tagline: 'Our security team operates it with you.',
  },
];

// The Pro tier's headline features. These are ONLY features that are ALREADY
// BUILT and working today (status "available"), mirroring the honest
// available/roadmap split used in pages/Features.jsx. No roadmap or unbuilt
// feature belongs in this list. Listing a feature here is presentation only —
// it does NOT gate or unlock the feature (all of these work for everyone today).
export const PRO_FEATURES = [
  {
    name: 'Stealth / Hidden Wallets',
    status: 'available',
    summary: 'Deniable hidden-wallet pool',
  },
  {
    name: 'Transaction Simulation',
    status: 'available',
    summary: 'Local-first pre-sign preview with risk flags',
  },
  {
    name: 'Anomaly Detection',
    status: 'available',
    summary: 'Local rule-based deviation flags over your own history',
  },
  {
    name: 'Security Dashboard',
    status: 'available',
    summary: 'At-a-glance view of your wallet security posture',
  },
  {
    name: 'Spending Limits',
    status: 'available',
    summary: 'Rule-based per-transaction and daily limits',
  },
];
