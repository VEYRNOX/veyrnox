// Single source for subscription / cancellation copy, so the two paywalls, the
// cancel dialog and the state messages cannot drift apart.
//
// Every claim here is pinned to code behaviour in docs/subscription-entitlement-matrix.md
// and asserted by src/lib/__tests__/subscriptionCopy.test.js. If a claim stops being true,
// fix the product; do not soften this copy to hide the conflict.
//
// No prices live here: the store returns them (see tier.js, purchases.js).

export const WALLET_REMAINS_YOURS = {
  heading: 'Your wallet remains yours',
  body:
    'Cancelling your subscription does not lock your wallet or affect ownership of your assets. ' +
    'You can continue to access your wallet, view balances, receive assets and move your funds.',
  recovery:
    'Existing recovery materials remain usable after cancellation, including two valid Shamir ' +
    'Recovery Shares or an existing encrypted Personal Backup.',
  ending:
    'When the paid period ends, premium monitoring and continuously maintained protection ' +
    'services may stop or revert to the Free tier.',
};

export const CANCELLATION_SHORT =
  'Cancellation never locks your wallet or funds. Existing recovery shares and your encrypted ' +
  'Personal Backup remain usable. Premium protection services may stop or revert to the Free ' +
  'tier when the paid period ends.';

export const AI_AGENT_LIMITS =
  'The AI Security Agent cannot access private keys, sign transactions, control the wallet or ' +
  'move assets. You authorize every action.';

export const TIER_DESCRIPTIONS = {
  safety_plus:
    'Advanced recovery, transaction-risk controls and coercion resistance for people who want ' +
    'more protection without giving up self-custody.',
  ai_security_protection:
    'Continuously maintained threat intelligence that helps identify malicious contracts, ' +
    'dangerous approvals, phishing and wallet-drainer patterns before authorization.',
};

export const WHY_SUBSCRIPTION =
  'Premium protection requires continuing infrastructure and maintenance, including ' +
  'threat-intelligence updates, security monitoring, vulnerability patches, compatibility ' +
  'updates and responses to new phishing and wallet-drainer techniques. The subscription funds ' +
  'this continuing protection layer, not custody of your wallet or assets.';

export const RECOVERY_FAQ = {
  question: 'Can I recover after cancelling?',
  answer:
    'Yes. Recovery materials created while subscribed remain usable. You can recover using two ' +
    'valid shares from your 2-of-3 Shamir Recovery Shares or an existing encrypted Personal ' +
    'Backup. Cancellation does not invalidate either method.',
  // Existing vs new, stated separately (handover: "state that separately").
  newMaterial:
    'Creating new shares or a new backup file, or changing your Emergency PIN, needs an active ' +
    'Safety Plus subscription. Using what you already have never does.',
};

export const CANCEL_FLOW = {
  before:
    'Cancelling stops future renewals. Your paid services remain active until the end of the ' +
    'current billing period. Cancellation does not lock your wallet, affect your assets or ' +
    'invalidate existing recovery materials.',
  after: (date) =>
    `Your subscription will end on ${date}. Your wallet and assets remain under your control. ` +
    'Existing Shamir Recovery Shares and your encrypted Personal Backup remain usable.',
};

// Subscription-state messages, rendered by components/subscription/SubscriptionStatus
// from the lifecycle view in lib/subscriptionState.js (display only, never a gate).
export const STATE_COPY = {
  active:
    'Your subscription is active. Your wallet and assets remain self-custodial and under your control.',
  cancelled: (date) =>
    `Your subscription has been cancelled and remains active until ${date}. After that date, ` +
    'premium services will stop or revert to the Free tier. Your wallet, assets and existing ' +
    'recovery materials will remain accessible.',
  billingRetry:
    'We could not confirm your latest renewal. Premium services may remain available ' +
    'temporarily while Apple or Google retries the payment. Your wallet and assets remain ' +
    'accessible regardless of the billing outcome.',
  expired:
    'Your paid protection has ended, and the wallet has reverted to the Free tier. Your wallet, ' +
    'funds and existing recovery materials remain accessible.',
  restored: 'Your subscription has been restored. Premium protection is active again.',
};

// Rows confirmed against the gating code (docs/subscription-entitlement-matrix.md).
// 'included' | 'baseline' | 'enhanced' | null (not available on that tier).
export const COMPARISON_ROWS = [
  { capability: 'Wallet access and asset movement', free: 'included', safety_plus: 'included', ai_security_protection: 'included' },
  { capability: 'Restoring from existing recovery material', free: 'included', safety_plus: 'included', ai_security_protection: 'included' },
  { capability: 'Creating Shamir Recovery Shares', free: null, safety_plus: 'included', ai_security_protection: 'included' },
  { capability: 'Creating an encrypted Personal Backup', free: null, safety_plus: 'included', ai_security_protection: 'included' },
  { capability: 'Coercion-resistance controls (Emergency PIN, decoy wallet)', free: null, safety_plus: 'included', ai_security_protection: 'included' },
  { capability: 'Continuously updated threat intelligence', free: null, safety_plus: null, ai_security_protection: 'included' },
  { capability: 'Advisory AI Security Agent', free: null, safety_plus: null, ai_security_protection: 'included' },
];
