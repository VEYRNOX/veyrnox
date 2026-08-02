# App Store submission copy — Veyrnox 1.0 (build 1)

Reconciled to BUILT/verified status 2026-07-21. No unshipped features, no hardcoded
prices, RASP described as it actually behaves. Roadmap (Transak/Vault) lives in the
launch email, NOT in this metadata.

---

## Name
Veyrnox

## Subtitle (30 char max)
Self-Custody Wallet · Security

## Promotional Text (170 char — editable without review)
Self-custody crypto for high-stakes situations. Your seed, your keys, on your device. Coercion-resistant modes for when a password isn't enough.

## Keywords (100 char, comma-separated, no spaces after commas)
crypto wallet,self custody,bitcoin,ethereum,solana,seed phrase,web3,secure wallet,duress,non-custodial

## Description
Your crypto. Your keys. On your device.

Veyrnox is a non-custodial wallet for security-first users. Keys are generated and stored only on your device, sealed with hardware-backed (Secure Enclave) encryption — never on a server. Veyrnox cannot move your funds and cannot recover them for you.

Runtime self-protection (RASP)
Veyrnox actively checks its own runtime for tampering, rooting/jailbreaking, and code-injection, and fails closed if it detects a compromised environment.

Address-safety checks
Automatic warnings for poisoning and look-alike addresses, plus spam-token filtering, before you send.

One wallet, ten assets
Send and receive ETH, BTC, SOL, MATIC, ARB, OP, AVAX, BNB, USDC, and USDT — all from a single recovery phrase.

Safety Plus (optional subscription)
Unlocks coercion-resistant modes:
• Duress PIN — a separate PIN opens a decoy wallet, so a forced unlock reveals nothing real.
• Hidden wallets — accounts that don't appear in any list or count.
• Panic wipe — irreversibly destroy local key material on demand.
Monthly or annual; auto-renews until cancelled. Manage or cancel anytime in your App Store account settings.

Veyrnox is non-custodial. If you lose your recovery phrase, no one — including us — can restore your wallet. Back it up.

---

## App Review Notes
This is a non-custodial (self-custody) wallet. Keys are generated and stored only on the device, encrypted with the Secure Enclave. There is no server-side key custody and no account/login — nothing to sign into for review.

Getting started (no funds needed to review):
1. Launch → "Create wallet" → set a PIN → the app displays a recovery phrase and creates a wallet. No email or account required.
2. The main screen shows balances (0.00 on a fresh wallet) and Send/Receive for 10 assets (ETH, BTC, SOL, MATIC, ARB, OP, AVAX, BNB, USDC, USDT).
3. Receive shows a real on-device address + QR. Send screens are fully navigable without broadcasting a transaction.

Runtime self-protection (RASP): the app checks its own runtime environment for tampering, rooting/jailbreaking, and code-injection frameworks. If it detects a compromised environment it fails closed (blocks signing). This is on-device integrity checking — it does not intercept web content or user taps.

On-device security modes (Settings → Security): a Duress PIN (opens a separate decoy wallet), hidden wallets, and a panic wipe. These are deliberate anti-coercion features for at-risk users; they operate entirely on-device and make no network calls.

Address-safety checks: before sending, the app warns on poisoning and look-alike addresses and filters spam tokens. These are local heuristics, not a hosted service.

In-App Purchase (Safety Plus): an auto-renewing subscription (monthly safety_plus_monthly / annual safety_plus_annual, unified safety_plus entitlement) that unlocks the coercion-resistant modes above. Purchases are processed via StoreKit; entitlement resolves through RevenueCat. No content is gated behind a login.

Encryption / export compliance: the app uses standard cryptography for wallet key management and TLS. [CONFIRM your export-compliance exemption answer.]

Contact for review questions: support@veyrnox.com

---

## Fields you must supply (not draftable)
- Support URL:            [https://veyrnox.com/support or similar]
- Marketing URL:          [https://veyrnox.com]
- Privacy Policy URL:     [required — must be live]
- Screenshots:            6.7" and 6.5" (capture from device build)
- App Privacy answers:    map from docs/play-launch/data-safety-form.md
- Export compliance:      your attestation (encryption question)
- Age rating:             questionnaire
- Category:               Finance (primary)
