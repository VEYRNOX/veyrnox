// src/lib/featureCatalogue.js
//
// FEATURE CATALOGUE — verified | built | roadmap.
//
// Scope contract: docs/WalletFeatures.spec.md. This catalogue lists ONLY
// self-custody-safe, in-scope features. Everything in spec section C
// (custodial / regulated — swaps, perps, staking/yield/lending, fiat OFF-ramp,
// fiat wallets, bank links, KYC/DID, NFT minting, DAO/payroll, encrypted
// messaging, etc.) is deliberately NOT a Veyrnox feature and is not listed here.
//
// ONE scoped exception, added 2026-08-24: the fiat ON-ramp hand-off (Buy /
// Transak) was moved out of section C to spec item 56, on the basis that
// Veyrnox never touches fiat, never custodies, and never runs KYC — it hands
// off to a licensed provider and the crypto lands at an address the user's own
// seed derives. Read the section C carve-out before adding anything else that
// looks adjacent: off-ramp, fiat wallets, bank links, and CEX deposit are all
// still barred, and the exception does NOT mean "regulated features are fine
// now". Compliance posture for Buy lives in
// docs/buy-uk-financial-promotions-checklist.md, not here.
//
// THREE states (see resolveStatus below):
//   verified — a real, explorer-confirmed txid in docs/verified-evidence.json.
//              Cannot be asserted by hand; resolveStatus downgrades an unbacked
//              `verified` to `built`.
//   built    — code shipped and working, no on-chain evidence yet.
//   roadmap  — specced, not built.
//
// This is the SINGLE SOURCE for the user-facing catalogue. src/pages/
// Documentation.jsx (/docs) renders it directly. It used to keep a second,
// parallel list of its own with no evidence gate — merged 2026-08-24, and
// src/pages/Features.jsx (the unrouted page that read this one) was deleted in
// the same change. Do not re-fork it: a catalogue nobody renders is how the
// honest one ended up being the dead one.
//
// `displayName` is optional and user-facing. `name` is the audit-stable key —
// tests and verified-evidence entries are keyed on it, so rename via
// displayName rather than editing name.
import verifiedEvidence from '../../docs/verified-evidence.json';

export const STATUS = Object.freeze({
  VERIFIED: 'verified',
  BUILT: 'built',
  ROADMAP: 'roadmap',
});

export const FEATURE_CATEGORIES = [
  {
    category: 'Core Wallet',
    features: [
      {
        name: 'Multi-Account HD Wallet',
        status: 'verified',
        summary: 'BIP-39 seed with multi-account derivation',
        explanation: 'Generate a non-custodial hierarchical-deterministic wallet from a BIP-39 seed phrase, with multiple accounts derived from a single seed. Keys are created and held locally — VEYRNOX never custodies them.',
      },
      {
        name: 'Import Wallet',
        status: 'verified',
        summary: 'Restore from seed phrase or private key',
        explanation: 'Import an existing wallet from a BIP-39 mnemonic or a raw private key. Imported material is encrypted into the local vault on the same terms as a generated wallet.',
      },
      {
        name: 'Encrypted Vault',
        status: 'verified',
        summary: 'Strong on-device encryption at rest',
        explanation: 'Private keys are sealed in a local vault using strong on-device encryption (a memory-hard key-derivation step plus authenticated encryption). Plaintext keys are never written to disk and never leave the device.',
      },
      {
        name: 'Backup & Reveal Seed',
        status: 'verified',
        summary: 'Seed phrase + QR backup with warnings',
        explanation: 'Reveal and back up the recovery phrase (including an encrypted seed QR) behind explicit, friction-heavy warnings. The user is responsible for safe storage — there is no custodial recovery.',
      },
      {
        name: 'Send Crypto',
        status: 'verified',
        verifiedBy: 'Send Crypto — ETH (full UI path, Sepolia, step-up gate)',
        summary: 'Native + token transfers, on-chain verified',
        explanation: 'Build, sign, and broadcast transactions across supported chains. Every transfer is locally signed and requires the user’s authentication; address-poisoning screening runs before confirmation. Verified on-chain via the full in-app UI: ETH on Sepolia (step-up gate), plus USDC and USDT on Ethereum mainnet (see docs/verified-evidence.json).',
      },
      {
        name: 'Receive Crypto',
        status: 'verified',
        summary: 'Derived address + local QR code',
        explanation: 'Show the correct receive address per chain with a locally-generated QR code and copy action. Addresses come from the wallet’s own derivation, not from any backend.',
      },
      {
        name: 'Live Balances',
        status: 'verified',
        summary: 'Balances read live from chain',
        explanation: 'Native and token balances are read directly from public chain RPC / explorer providers, so the displayed value reflects on-chain reality rather than a cached server figure.',
      },
      {
        name: 'Transaction History',
        status: 'verified',
        summary: 'Per-chain read-only history',
        explanation: 'Per-chain transaction history sourced from the same providers used for balances (Esplora for BTC, RPC for SOL, explorer fallback for EVM). Read-only, with honest disclosure of each chain’s privacy trade-offs.',
      },
      {
        name: 'Gas / Fee Control',
        displayName: 'Network Fee Control',
        status: 'verified',
        summary: 'Per-chain fee tiers + custom before signing',
        explanation: 'Choose a fee tier (or set a custom fee) per chain before signing, using each chain’s native fee model (EIP-1559 for EVM, sat/vB for Bitcoin, priority fee for Solana). The selected fee flows into the signed transaction.',
      },
      {
        name: 'ENS / SNS Resolution',
        status: 'verified',
        summary: 'Resolve .eth and .sol names on send',
        explanation: 'Resolve human-readable .eth (ENS) and .sol (SNS) names to addresses on the send screen, with the resolved address shown for confirmation before signing. Resolution only — name registration is out of scope.',
      },
    ],
  },
  {
    category: 'Networks & Assets',
    features: [
      {
        name: 'EVM Networks',
        displayName: 'Ethereum-compatible Networks',
        status: 'verified',
        summary: 'Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain',
        explanation: 'Six EVM networks share one secp256k1 derivation and signing stack: Ethereum, Polygon, Arbitrum, Optimism, Avalanche, and BNB Chain. All verified on testnet; mainnet was unlocked 2026-06-17, with USDC/USDT mainnet sends confirmed on Ethereum (see Send Crypto).',
      },
      {
        name: 'Bitcoin',
        status: 'verified',
        verifiedBy: 'Bitcoin send (wallet-core module, testnet script)',
        summary: 'BIP-84 native-segwit stack, testnet-verified',
        explanation: 'A separate Bitcoin stack with BIP-84 derivation, UTXO coin-selection and change handling, and fee estimation against an Esplora provider. A real testnet send is confirmed on-chain (docs/verified-evidence.json); mainnet is unlocked but not yet mainnet-verified.',
      },
      {
        name: 'Solana',
        status: 'verified',
        verifiedBy: 'Solana send (wallet-core module, devnet script)',
        summary: 'ed25519 / SLIP-0010 stack, devnet-verified',
        explanation: 'A separate Solana stack with ed25519 / SLIP-0010 derivation, balance reads, and lamport transfers including blockhash-expiry and rent handling. A real devnet send is confirmed on-chain (docs/verified-evidence.json); mainnet is unlocked but not yet mainnet-verified.',
      },
      {
        name: 'ERC-20 Tokens',
        displayName: 'Ethereum Token Standard (ERC-20) Tokens',
        status: 'verified',
        verifiedBy: 'USDC mainnet send (full UI path, build:release, Ethereum mainnet)',
        summary: 'USDC and USDT via the shared token path, mainnet-verified',
        explanation: 'ERC-20 tokens (USDC, USDT) ride the token path with contract-read decimals and balance reads, reusing the native EVM signing flow. Both USDC and USDT have a real Ethereum-mainnet send confirmed on-chain (docs/verified-evidence.json).',
      },
      {
        name: 'Additional Tokens',
        status: 'roadmap',
        summary: 'More ERC-20 tokens (DAI, LINK …)',
        explanation: 'Additional ERC-20 tokens reuse the existing token path, so they are cheap to add. On the roadmap, not yet enabled.',
      },
      {
        name: 'Additional Networks',
        status: 'roadmap',
        summary: 'More EVM chains (Base, zkSync …)',
        explanation: 'Further EVM networks are largely configuration-level additions on the existing stack. On the roadmap; non-EVM stacks (each a full new stack + review) are considered only if justified.',
      },
    ],
  },
  {
    category: 'Access & Authentication',
    features: [
      {
        name: 'Passkey Unlock',
        displayName: 'FIDO2 Passkey Unlock',
        status: 'verified',
        summary: 'FIDO2 / WebAuthn unlock + cloned authenticator detection (M-K)',
        explanation: 'Unlock the app with a platform passkey (FIDO2 / WebAuthn). This is an unlock gate parallel to the password - it never holds or replaces the wallet keys, and a password escape hatch remains. M-K (cloned authenticator detection): WebAuthn assertions include a signCount that must strictly increase to detect replayed assertions from cloned or backed-up soft authenticators. Implementation: signCount persisted in localStorage, validated on each assertion (rejects if signCount does not increase), fail-closed on validation errors (I4 invariant). Status: BUILT 2026-06-30, ready for device verification with real cloned authenticator test.',
      },
      {
        name: 'Biometric Unlock',
        status: 'verified',
        summary: 'Face ID / Touch ID / Android fingerprint unlock gate — native on iOS and Android',
        explanation: 'Use device biometrics as an app-layer unlock gate where the platform supports it, falling back to passkey or password. Biometrics gate access; they do not custody keys. Native Face ID / biometric unlock is built on iOS and Android (2026-06-29): Face ID opens the real wallet (Biometric Unlock in Settings → Security) or optionally the decoy wallet ("Use Face ID for hidden wallet" in Duress PIN screen). Android: USE_BIOMETRIC and USE_FINGERPRINT permissions added to AndroidManifest.xml (PR #483) — previously BiometricPrompt threw SecurityException on Android 9+. App-layer gate; OS-enforced ACL binding (M2c/M2d) remains a TARGET (native plugin + real-device required).',
      },
      {
        name: 'PIN Unlock',
        status: 'verified',
        summary: "Numeric PIN onboarding and unlock with strong on-device encryption. On its own, a PIN can be repeatedly tried if someone extracts your device's storage; turning on Hardware Key Protection (off by default) closes that gap.",
        explanation: 'Built; the ECC independent review (2026-06-23) covered the PIN/Argon2id path with no findings (§24 satisfied). Numeric-PIN onboarding and returning-PIN unlock over the SAME Argon2id vault as the password path. Deniability model v2: real PIN opens the hidden real wallet; duress PIN opens the decoy; Face ID (opt-in) opens the decoy, never the real wallet; any other wrong PIN returns an explicit "Incorrect PIN" error (the old deterministic-decoy / no-oracle fallback was removed by design). 10 consecutive wrong PINs trigger an irreversible local wipe (pinAttemptGuard.js). HONEST LIMITATION: there is no hardware-bound key (Secure Enclave / StrongBox KEK) yet — a numeric PIN over Argon2id is offline-exhaustible on a seized device (the 10-attempt counter is a software counter, bypassable by imaging the storage). This residual gap is native, not review-related: the hardware-KEK fast-follow (a native build, real-device-verified, plus its own key-at-rest review pass since it expands crypto scope) is what closes it — it was out of reach of the source-level §24 review. Until then this is a convenience unlock gate with a wipe-on-brute-force mitigation, not a hardware guarantee.',
      },
      {
        name: 'Two-Factor at Critical Actions',
        status: 'verified',
        verifiedBy: 'Two-Factor — Face ID biometric possession factor (physical iPhone, Sepolia)',
        summary: 'PIN + Action Password, or PIN + Face ID / Passkey, on sensitive actions — Face ID path verified on-chain 2026-06-29',
        explanation: 'VERIFIED (Face ID / biometric possession path, physical iPhone 17 Pro Max, Sepolia txid 0xd1c97fa2f0a8ec2ae1038364f0106f6ef98b27258ad1ec2faa227de0baf1e2e7, 2026-06-29 — see docs/verified-evidence.json). Opt-in second factor before sensitive actions — send, reveal recovery phrase, set duress PIN, create/hide a wallet. Three methods: (1) PIN + Action Password — a second KNOWLEDGE factor, per wallet-set, stored inside the encrypted container (two Argon2id checks run sequentially); (2) PIN + Passkey / FIDO2 — a POSSESSION factor (device-global, fails closed on any cancel/timeout/error); (3) PIN + Face ID / native biometric — OS biometric assertion via @aparajita/capacitor-biometric-auth, SEND_2FA.BIOMETRIC path, fails closed (I4). Face ID cancel blocks the send. 5 wrong attempts locks the app. Device-global passkey and biometric 2FA factors are suppressed in decoy (duress) and hidden (stealth) sessions (BUILT — unit-tested 17/17 resolver + 59/59 security-component tests, typecheck clean, NOT device-verified): a deniable-session send no longer triggers a real-session-configured passkey/biometric challenge, which would otherwise be an I3 deniability tell and a potential RP-backed-passkey network egress. The per-set Action Password factor is preserved across all session types. Implemented in `src/lib/send2faMethod.js` (`isDecoy`/`isHidden` inputs, `deniable` gate on the BIOMETRIC/PASSKEY branches), wired at `src/pages/SendCrypto.jsx` and `src/components/security/useActionGuard.jsx`. OUTSTANDING: I3 no-egress on a real decoy-send path is not yet device-verified (no on-device decoy-send egress trace captured); this is BUILT at most, never "verified". The ECC independent review (2026-06-23) found the H-1 passkey-2FA Send bypass, fixed in PR #340 (resolveSend2faMethod). Honest scope: the Action Password path is two things you know on one device (not hardware 2FA); Face ID / native biometric is OS-level possession but not a FIDO2 WebAuthn credential (WKWebView WebAuthn is unreliable; native biometric is the honest possession factor equivalent on iOS).',
      },
      {
        name: 'Native Secure Storage',
        displayName: 'Hardware Key Protection',
        status: 'verified',
        summary: "Optional, off-by-default protection that ties your vault's encryption key to your device's secure hardware (iOS Secure Enclave or Android's secure hardware, using the strongest option your device supports). Once turned on, your PIN alone is no longer enough — the vault also needs your device's secure hardware to unlock. Checked by internal review only, NOT independently reviewed.",
        explanation: 'Built. Native hardware Key-Encryption-Key that wraps the PIN-derived vault DEK under KEK = HKDF-SHA256(H ‖ C) + AES-256-GCM, so an offline-seized vault blob cannot be PIN-exhausted without the device: the hardware factor H is released only per-use behind biometric auth and never leaves the secure element. iOS: Secure Enclave P-256 ECIES (non-extractable key, .biometryCurrentSet biometric ACL) shipped as a native Objective-C plugin (PR #495, registration blocker resolved via the two-file CAPPlugin split) and device-verified (PARTIAL) on iPhone 17 Pro Max. Android: AndroidKeyStore HMAC-SHA256, StrongBox-preferred but NOT enforced (honest tier reporting), device-verified on Pixel 10 Pro XL. NOT "verified": the iOS biometric re-enrollment invalidation test (Android PASSED 2026-07-01, Pixel 10 Pro XL) and the live iOS SE-unlock trace remain outstanding. OPEN GAP — StrongBox tier enforcement (TARGET, not built): non-StrongBox TEE keys are accepted (StrongBox preferred but not required); SOFTWARE/unknown tiers are already refused fail-closed (M2, KEK_ENROLL_INSECURE_TIER) so a software-only key can never enroll. Requiring StrongBox over TEE is a device-coverage-vs-assurance tradeoff. This is a distinct open residual gate, NOT the C-1 finding: the C-1 CRITICAL (global-fixed HMAC input / missing per-enrollment kekSalt binding) is FIXED / device-verified (v3, 2026-07-05, PR #568). REVIEW STATUS: internal static-analysis pass only (2026-07-01); NOT an independent review; "internal" must never be presented as "independent" (I4). An independent review is required before this control can be promoted. See docs/Feature-Status.md §4.',
      },
      {
        name: 'Session Manager & Auto-Lock',
        status: 'verified',
        summary: 'Auto-lock + device session management',
        explanation: 'Built (/session-manager): lists UserSession device records, revoke individual or all sessions (self-enforcing: locks this device immediately, locks others at next open). Auto-lock idle/background timer in Settings. Login Activity (/login-activity) shows the previous-session unlock timestamp and device records in a read-only history view; per-unlock event log is intentionally absent (I3 deniability constraint).',
      },
      {
        name: 'Account Access & Recovery',
        status: 'verified',
        summary: 'Non-custodial change-password + seed recovery',
        explanation: 'Change the vault password (re-encrypts the same seed under a new password; requires the current password) and recover access by re-importing your seed phrase. Fully non-custodial — there is no server-side key escrow and no "we’ll restore your access" path. If you lose both password and seed, funds are unrecoverable by design.',
      },
      {
        name: 'Hardware Wallet',
        status: 'verified',
        summary: 'Digital Shield air-gapped QR signing — cold-key address derivation and transaction signing for ETH, BTC, and SOL. Private keys never leave the hardware device. Built and code-reviewed; not yet tested against a physical Digital Shield device.',
        explanation: 'Built (/hardware-wallet): Digital Shield is the sole hardware-wallet path (Trezor and Ledger removed 2026-08-24 — the Trezor WebUSB bundle crashed the iOS webview Send page). Imports public account data via a crypto-multi-accounts UR QR, builds unsigned PSBT/EVM/SOL requests, and finalizes them from a scanned or pasted signed-response QR. Private key never leaves the air-gapped device (I1). Deniability sessions block Digital Shield calls the same way the removed Trezor path did, via the in-memory deniabilitySession marker (wallet-core/deniabilitySession.js), fail-closed (I3). Built, not device-verified — no physical-device txid. ERC-20 hardware signing and multi-account paths not yet wired.',
      },
    ],
  },
  {
    category: 'Transaction Safety',
    features: [
      {
        name: 'Token Approvals (View + Revoke)',
        status: 'verified',
        summary: 'Inspect and revoke ERC-20 allowances',
        explanation: 'List the token allowances granted to contracts, flag unlimited approvals, and build revoke calldata the user signs locally. Helps shut down drainer exposure from stale approvals. Each spender also carries a one-line risk note: a local threat-intel hit is answered instantly on-device, and otherwise the SPENDER address (never your own — the sender field is sent as the zero address) is screened through the tip-screen proxy. That screening runs automatically when you open the page, not only when you act, and is suppressed entirely in deniability/demo. A lookup that fails returns "could not assess", never "safe" (I4). The page shows approvals on demand — it does not monitor for new ones in the background.',
      },
      {
        name: 'Address-Poisoning Warnings',
        status: 'verified',
        summary: 'Look-alike address detection on send',
        explanation: 'Before a send, the recipient is screened for look-alike / poisoned-address patterns and the user is warned. The warning informs the user; it does not silently block the transfer.',
      },
      {
        name: 'Spam Token Filter',
        status: 'verified',
        summary: 'Auto-hide airdropped scam tokens',
        explanation: 'Heuristically annotate and hide spam / scam tokens airdropped to the wallet, with a manual show/hide override, reducing the chance of interacting with a malicious token.',
      },
      {
        name: 'Calldata Decode & Approval Guard',
        displayName: 'Transaction Data Decode & Approval Guard',
        status: 'verified',
        summary: 'Human-readable calldata before signing',
        explanation: 'Opaque transaction calldata is decoded into a structured, human-verifiable summary — including unlimited-approval detection — shown on the confirm screen before any signature. Holds no keys; inspects bytes only.',
      },
      {
        name: 'Suspicious-Address Screening',
        status: 'verified',
        summary: 'Local blocklist + sanctioned-address screening',
        explanation: 'Built — recipients are screened on-device against a local blocklist of burn / known-bad addresses, including one known OFAC-sanctioned address (Ronin / Lazarus). Warns, never blocks; nothing leaves the device. A live, regularly-updated threat-intel / sanctions feed (Chainalysis / TRM / Elliptic class) is the roadmap upgrade — a bundled snapshot cannot stay delisting-current.',
      },
      {
        name: 'Transaction Simulation',
        status: 'verified',
        summary: 'Local-first pre-sign preview with risk flags',
        explanation: 'Before signing, the transaction is previewed locally — an eth_call dry-run on EVM plus honest decode on BTC/SOL — surfacing expected balance / approval changes and risk flags as a drainer defence. No third-party scoring service; it warns rather than blocks and never claims a transaction is "safe".',
      },
      {
        name: 'Anomaly / Fraud Detection',
        status: 'verified',
        summary: 'Local rule-based deviation flags over your own history',
        explanation: 'Local heuristics compare a pending transaction against your OWN on-device history and flag deviations in the same pre-sign preview: an amount far above your typical send, a large amount to a first-time recipient, and the approve-then-transferFrom two-step drain shape. Rules run on-device over your history, balances and local lists — no third-party scoring, no telemetry. It catches KNOWN local deviations only, warns rather than blocks, and never claims a transaction is "safe".',
      },
    ],
  },
  {
    category: 'Recovery & Duress',
    features: [
      {
        name: 'Duress PIN',
        status: 'verified',
        summary: 'Decoy wallet under coercion — deniability model v2',
        explanation: 'BUILT; the ECC independent review (2026-06-23) confirmed correct real/decoy routing with timing equalised between the two paths and no app-level coercer tell (no findings, §24 satisfied). A separate duress PIN opens a plausible decoy wallet; the real PIN opens the hidden real wallet (no UI tell it exists). Face ID (opt-in) is bound to the decoy, never the real wallet. A wrong PIN that matches neither returns an explicit "Incorrect PIN" error — the old no-oracle property was deliberately removed in the v2 model: deniability now rests on hiding the real wallet behind the secret real PIN, not on suppressing the error. 10 consecutive wrong PINs trigger an irreversible local wipe (pinAttemptGuard.js), making the wrong-PIN oracle non-fatal before brute-force succeeds. Does not resist offline seizure without a hardware key-encryption key (planned fast-follow, not yet built). The decoy is a genuine, separately-encrypted vault; a forensic inspection of device storage can reveal a second vault exists.',
      },
      {
        name: 'Stealth / Hidden Wallets',
        status: 'verified',
        summary: 'Deniable hidden-wallet pool',
        explanation: 'Hidden wallets live in a deniable chaff-slot pool so their existence and count cannot be proven from the stored data. The dual of the duress feature, for count-hiding plausible deniability.',
      },
      {
        name: 'Panic Wipe',
        status: 'verified',
        summary: 'Irreversible local key-material destruction + 10-attempt auto-wipe',
        explanation: 'BUILT; the ECC independent review (2026-06-23) confirmed the prior key-material residue gap (stealth-slot salt, activity-log device salt, passkey credential IDs) is CLOSED and the deletion is now test-pinned (no findings, §24 satisfied). Two wipe paths: (1) a dedicated panic PIN at the unlock screen triggers an immediate irreversible local wipe; (2) 10 consecutive wrong PINs trigger the same wipe automatically (pinAttemptGuard.js — this is the v2 model\'s mitigation for the now-explicit wrong-PIN error). The 10-attempt counter lives in software and can be bypassed by imaging the storage before the first attempt on a seized device; hardware KEK is the planned fast-follow. Wipe destroys local key material only; on-chain funds are unaffected and the seed phrase elsewhere still recovers the wallet.',
      },
      {
        name: 'Encrypted Personal Backup',
        status: 'verified',
        summary: 'Ciphertext-only vault backup',
        explanation: 'Built (/personal-backup). Client-side encrypt-then-export: the vault is serialised, sealed with a user-supplied password using strong on-device encryption, and written to an opaque file. Restore decrypts the file locally before any key material is loaded. Plaintext keys never leave the device. The ECC independent review (2026-06-23) confirmed key custody for this LOCAL path (plaintext seed never leaves the device; Argon2id (64 MiB / t=3, reviewed at 192 MiB then lowered for device latency — not yet re-reviewed at 64 MiB) + AES-256-GCM; verify-before-success) and the only finding (L-1, PIN floor 4→6 digits) was fixed in PR #340. Scope note: this is the local file path only — the BACKEND-ESCROW variant (a server-side ciphertext target) remains backend + review gated and is not built.',
      },
      {
        name: 'Shamir Shard Backup (2-of-3)',
        status: 'built',
        summary: 'Split vault DEK into 2-of-3 Shamir shares for distributed recovery',
        explanation: 'Built (/personal-backup, Advanced tab). The vault DEK is split into three Shamir Secret Sharing shares over GF(2^8); any two of three reconstruct the key. Each share is exported as a passphrase-wrapped, integrity-checked recovery bundle (SHARD_BUNDLE_VERSION 2, with nested-key-aware vault hash). Same-device and cross-device restore are supported. Gated behind Safety Plus subscription. Security remediation (2026-09-01): new exports use independently sampled coefficients per DEK byte; bundles exported with the 2026-08-20 library-swap implementation must be discarded and re-exported because one share did not provide the required threshold protection. Pre-audit preview: owner-authorized 2026-08-08 carve-out ahead of independent audit. Passphrase wrapping is mandatory (PR #1752 closed an earlier gap where the checkbox shipped unwired, silently producing unencrypted bundles). NOT verified: no real on-device recovery round-trip confirmed, no independent audit. Cross-platform cloud sync (iCloud/Google Backup) not shipped.',
      },
    ],
  },
  {
    category: 'Monitoring & Risk',
    features: [
      {
        name: 'RASP',
        displayName: 'Runtime Protection',
        status: 'verified',
        summary: 'Runtime environment detection + graduated degradation',
        explanation: 'Built — UI-confirmed. Browser-level detection active: navigator.webdriver + legacy automation fingerprints → HOOKED → signing blocked. Normal browser → CLEAN → ALLOW (no friction). Degradation policy (condition → tier) and I3 response-symmetry guard built + tested in src/rasp/. Wired to the send path via detect(browserProbeSource) → degrade() → presignGate(). The ECC independent audit (2026-06-23) confirmed the browser-level lane genuinely blocks (not merely warns) at the wired send call-site with no network egress (I2/I3 clean), and that VITE_DEV_UNGATE_SEND cannot bypass it; the only fix was stale "NOT WIRED" comments (M-4, PR #340). The OS-level probes (root/jailbreak/tamper/emulator) are implemented in a native Capacitor plugin (RaspIntegrityPlugin) and run in the same pre-sign gate; they were device-exercised on Android (internal verification, not independently audited).',
      },
      {
        name: 'Audit Log',
        status: 'verified',
        summary: 'Optional encrypted local activity record',
        explanation: 'Built (/audit-log). Opt-in, off by default. Stores at most 100 entries ({ type, ts } ONLY — no amounts, addresses, or wallet identity) as an encrypted blob in the primary vault store (quaternary key). Hard allowlist of 3 event types; hard denylist of 7 sensitive terms. No-op in decoy/hidden sessions; panic wipe destroys it. The ECC independent review (2026-06-23) verified all catalogue claims against source, confirmed the write path, and found no exaggeration of scope (no findings, §24 satisfied). No on-chain artifact exists, so this stays BUILT — "reviewed" is not "verified".',
      },
      {
        name: 'Risk Limits / Risk Scoring',
        status: 'verified',
        summary: 'Rule-based, transparent transaction risk scoring',
        explanation: 'A transparent, rule-based risk score over a pending transaction from on-device signals (fresh recipient, unlimited approval, fresh-spender approval, address poisoning, ENS mismatch, dust input, calldata mismatch, value anomaly) combined into a single pre-sign verdict. This verdict is the authoritative pre-sign gate wired into Send → verify: a high-RISK verdict requires an explicit "Sign anyway" acknowledgement before the send can proceed, an INFO verdict shows a non-blocking chip, and an INDETERMINATE verdict escalates to caution (fail-closed). Built in src/risk/ and covered by the ECC independent review (2026-06-23): pure on-device heuristics, fail-closed, no network calls, never claims a transaction is "safe" (no findings, §24 satisfied). Local-only, rule-based and explainable, warns rather than silently blocks — never an opaque custodial trust score. No on-chain artifact, so it stays BUILT, not "verified".',
      },
    ],
  },
  {
    category: 'Portfolio & Analytics',
    features: [
      {
        name: 'Portfolio Dashboard',
        status: 'verified',
        summary: 'Net-worth view across wallets and chains',
        explanation: 'A read-only overview of value across the unlocked vault’s wallets and chains, aggregated on-device from public balances (no new network surface, no keys, no writes). Built; reads are fail-closed — an unreachable chain shows as incomplete rather than a silent $0.',
      },
      {
        name: 'Net-Worth Tracker',
        status: 'verified',
        summary: 'Aggregate crypto net worth across wallets and chains',
        explanation: 'Built (/net-worth). Aggregates current net worth on-device from portfolio balances via usePortfolio + buildAllocation. I2-gated: live price conversion requires explicit opt-in; shows reference-rate note otherwise. No time-series store (avoids size oracle). Read-only; no backend.',
      },
      {
        name: 'Tx Analytics',
        status: 'verified',
        summary: 'Address-level activity insights from local tx history — no chain query',
        explanation: 'Built (/onchain). Analytics over local transaction records: inbound/outbound breakdown, per-currency, daily volume. Read-only; uses local entities only — no blockchain query is made. No private data egress. Previously labelled "On-Chain Analytics" — renamed 2026-09-01 because the page never queries chain and the old label implied a remote indexer.',
      },
      {
        name: 'Fee Analytics',
        status: 'verified',
        summary: 'Track fees paid, in native units',
        explanation: 'Stateless native-unit fee analytics (Slice 1): totals the network fees the active set actually paid, computed on-device from chain history via the same on-demand fetch the history view uses — no fiat, no persistence, no new egress. EVM has no in-app indexer so it fails honest to "unavailable". Built and fixture-tested; the ECC independent review (2026-06-23) confirmed it is stateless, does no fiat conversion, adds no new egress path, and fails honest on EVM fee failures (no findings, §24 satisfied). Still BUILT, not "verified": this is an analytics readout over real on-chain history with no on-chain txid of its own — "reviewed" is not "verified". Fiat cost-basis P&L is a separate slice that is not yet built.',
      },
      {
        name: 'What-If Simulator',
        status: 'roadmap',
        summary: 'Model hypothetical allocation changes',
        explanation: 'Model how a hypothetical allocation change would affect the portfolio — purely illustrative, executes nothing. Specced, not yet built.',
      },
      {
        name: 'Tax Report',
        status: 'verified',
        summary: 'Honest raw-transaction export for tax software',
        explanation: 'Built (/tax). Exports raw transaction data (date, type, asset, amount, fee, tx_hash) as CSV — no invented prices, no fabricated cost-basis or gain figures. Explicit disclaimer that this is not tax advice; directs users to Koinly / CoinTracker for real computation. All FIFO/historicalRate fabrications removed.',
      },
    ],
  },
  {
    category: 'Prices & Alerts',
    features: [
      {
        name: 'Price Charts',
        status: 'verified',
        summary: 'Historical OHLCV price charts',
        explanation: 'Built (/price-charts). Real OHLCV candlestick data from CryptoCompare histoday API, rendered with recharts. I2-gated (live prices opt-in required). Supports daily/weekly/monthly ranges for top assets. No fabricated data.',
      },
      {
        name: 'Price Alerts',
        status: 'verified',
        summary: 'Threshold price notifications',
        explanation: 'Built (/alerts): threshold-based price alert rules stored on-device. Evaluation is I2-gated behind the live prices opt-in. Advisory only — alerts never trade.',
      },
      {
        name: 'Watchlist',
        status: 'verified',
        summary: 'Track assets you do not hold',
        explanation: 'Built (/watchlist): follow assets independently of the active wallet with real opt-in price feeds from CryptoCompare (I2-gated; shows "—" when live prices are off).',
      },
      {
        name: 'Price Alert Notifications',
        status: 'verified',
        summary: 'On-device price alert notifications via LocalNotifications',
        explanation: 'Built (/alerts). Real @capacitor/local-notifications on native, browser Notification API on web. Polls CoinGecko every 60s while the app is open; fires when a price target is hit. No push server — notifications only fire while the app is running. Advisory only — alerts never initiate transactions.',
      },
    ],
  },
  {
    category: 'NFTs',
    features: [
      {
        name: 'NFT Gallery (Display-Only)',
        status: 'verified',
        summary: 'View owned NFTs',
        explanation: 'Built (/nft). Display-only NFT portfolio using on-device records. Viewing only — VEYRNOX does not mint, fractionalise, or run an NFT marketplace. Add/remove NFT records stored locally via local entities.',
      },
      {
        name: 'Multi-Chain NFT Viewing',
        status: 'verified',
        summary: 'View NFTs across chains',
        explanation: 'Built (/nft-multichain). Cross-chain NFT display with chain filtering, grid/list toggle, and local records via local entities. Viewing only — no minting or trading.',
      },
    ],
  },
  {
    category: 'Payments & Utilities',
    features: [
      {
        name: 'Buy Crypto (Third-Party On-Ramp)',
        // Declares 'verified'; RESOLVES to 'built', because there is no txid
        // entry for it in docs/verified-evidence.json and resolveStatus()
        // downgrades any unbacked claim. That is the correct outcome — no
        // purchase has ever completed on either store.
        //
        // (This comment previously explained that the enum had no third value
        // and that the honesty had to live in the prose. The third state was
        // restored on 2026-08-24, so the badge now carries it too.)
        status: 'verified',
        summary: 'Hand-off to Transak — regional, and no purchase proven yet',
        explanation: 'Built (/buy). Buy crypto with fiat through Transak, a licensed third-party provider. Veyrnox never touches your money and never holds your crypto: you enter an amount, the app reads the deposit address from your own on-device wallet at the moment you press Continue, and hands off to Transak\'s hosted checkout in the system browser. The purchase is between you and Transak, under their terms and their identity checks, and the crypto is delivered to an address only your seed controls. Nothing about the return trip is trusted — /buy/in-progress reads nothing from the return URL, so a spoofed return cannot show a fake success; confirmation comes from the coin arriving at your address like any other incoming transaction. NOT available everywhere: the Buy entry is hidden in the UK for financial-promotions reasons (s.21 FSMA), and it is hidden entirely in decoy, duress, and demo sessions. The region check reads your device locale and timezone, so it is a good-faith regional suppression, not a security control, and it does not hide Buy when the region cannot be determined. NOT verified: no purchase has been completed on either store, so this is built-and-shipping, not proven end-to-end.',
      },
      {
        name: 'Address Book',
        status: 'verified',
        summary: 'Saved, labelled addresses with per-chain validation',
        explanation: 'Save and label trusted addresses for faster, safer sends. Each address is validated for the selected chain on save using the same validators the Send flow uses, reducing wrong-chain mistakes.',
      },
      {
        name: 'Message Signing',
        status: 'verified',
        summary: 'Sign messages for proof-of-ownership',
        explanation: 'Built (/crypto-signing). Sign plain messages using the active wallet key via ethers.js — proof-of-ownership and off-chain auth. Signature shown with copy and verify flow; expandable raw-hex view. Signing requires explicit user action; no dApp-initiated signing.',
      },
      {
        name: 'Split Bill',
        status: 'roadmap',
        summary: 'Split a cost across people',
        explanation: 'Split an expense across people, each paying from their own wallet. Self-initiated; specced, not yet built.',
      },
      {
        name: 'Recurring Payments',
        status: 'verified',
        summary: 'Self-initiated scheduled reminders',
        explanation: 'Built (/recurring). Create and manage recurring payment schedules stored locally via local entities. Reminder notifications only — the user signs each payment. No autonomous auto-debit; the wallet never moves value without an explicit signature.',
      },
    ],
  },
  {
    category: 'Referrals',
    features: [
      {
        name: 'Referral Tracker',
        status: 'verified',
        summary: "Share your referral code to earn rewards; tier-based commissions and discounts apply to eligible paid subscriptions, including Safety Plus and AI Security Protection. Using this feature sends your referral code, chosen plan, and purchase/discount amounts to VEYRNOX's servers so earnings can be tracked — the referral service never receives your balances, your wallet addresses, or your seed phrase. Claiming a payout is separate and opens an email you write yourself, so you choose what payment details to include.",
        explanation: 'Built (/referrals). Generates a random referral code (crypto.getRandomValues — NOT seed-derived) and tracks code / tier / redeemed state in localStorage. Local-only by default: with no referral backend configured the network calls no-op. If VITE_SUPABASE_URL / ANON_KEY are set at build time, register/redeem/status send the referral code (not balances or seed) to that external backend — an opt-in egress, disclosed here per I2. Public ranking and public profiles remain cut on principle.',
      },
    ],
  },
  {
    // Merge note: keep the branch's renamed category and the unique roadmap
    // items from both sides without promoting anything to a stronger status.
    category: 'AI Security Protection',
    features: [
      {
        name: 'AI Security Advisor',
        status: 'roadmap',
        summary: 'LLM-powered security chat with local knowledge fallback',
        explanation: 'Built. A floating chat panel (SecurityAdvisor) powered by the TIP backend via a server-side Supabase Edge Function proxy (tip-chat). The advisor answers wallet, crypto, and security questions with context-aware responses; streaming errors fall back to a bundled local knowledge base (I4 fail-closed). The system prompt (server-side) refuses seeds, keys, and PINs. User messages are scrubbed of secret material before sending. Requires explicit advisor consent (opt-in). Suppressed entirely in deniability/demo sessions (I3 — FAB hidden, zero egress). The wallet never ships TIP API keys (I1); the Edge Function holds them server-side. NOT independently audited.',
      },
      {
        name: 'Address Threat Screening',
        status: 'roadmap',
        summary: 'Multi-source sanctions, phishing, and hack-registry screening on send',
        explanation: 'Built. Before a send, the recipient address is screened via a multi-source aggregator (sanctions lists, phishing registries, hack-fund trackers, contract-risk signals, and transaction simulation) through the tip-screen Edge Function proxy. Covers EVM, BTC, and SOL address formats. A sanctioned-namespace cross-chain lane blocks known threat actors (Tornado Cash, Lazarus, Blender.io, Sinbad, Ronin bridge) on every EVM chain, not just Ethereum. Falls back to honest "unknown" when all sources are unavailable rather than defaulting to "clean" (I4). A locally-cached, Ed25519-signed IOC manifest provides offline/deniability screening. Advisory — warns rather than silently blocks. NOT independently audited.',
      },
      {
        name: 'Educational Assistant',
        status: 'roadmap',
        summary: 'Answer wallet and crypto security questions',
        explanation: 'Built. The AI Security Advisor doubles as an educational assistant — it answers questions about gas, approvals, address formats, wallet security, and crypto concepts. Responses are context-aware (the advisor knows which screen the user is on) and include follow-up suggestions. Falls back to the local knowledge base when offline. Advisory only — the AI never holds keys and never signs.',
      },
      {
        name: 'Portfolio Q&A',
        status: 'roadmap',
        summary: 'Questions over public on-chain data',
        explanation: 'Answer questions over the user’s public on-chain data. Advisory only — never autonomous trading or management. Specced, not yet built.',
      },
      {
        name: 'Live Phishing Domain Feed',
        status: 'roadmap',
        summary: 'Remote-updatable dApp domain blocklist, layered over the local seed',
        explanation: 'A phishing-domain list downloaded over https, cached in IndexedDB, and layered over the in-bundle seed list that screens dApp domains on WalletConnect connect and request. The seed is never replaced, so a missing feed URL, a failed fetch or an empty payload degrades to exactly the pre-feed behaviour rather than to "no list" (I4) — an empty payload is treated as a failed refresh, so a compromised feed cannot switch coverage off by serving []. A feed older than seven days is treated as absent rather than silently trusted. The domain being checked NEVER leaves the device (I2): the list is downloaded and matched locally. Feed text is length-capped and control-character-stripped before it can reach a warning dialog. I3: no fetch and no feed matches in deniability/demo — the local seed still runs, so screening never goes dark — and the cache database is erased by panic wipe, since its presence alone is a tell. STATUS: the implementation is complete, wired at app init and unit-tested, but it has NOT been observed running on a device or in a browser, and no feed URL is configured by default — so it stays roadmap rather than claiming to work. Coverage today is the seed list unless VITE_PHISHING_FEED_URL is set. This is a blocklist, not a classifier: it catches listed domains only and never asserts a site is safe.',
      },
      {
        name: 'Approval Monitor',
        status: 'roadmap',
        summary: 'Periodic in-app check for new approvals and risky transfers',
        explanation: 'While the app is open and unlocked, a 60-second poll re-reads the local approval and transaction rows and raises an alert for a newly-seen approval to a flagged spender, a newly-seen unlimited approval, or an incoming transfer from a flagged address. Alerts surface on the Token Approvals page; they are held in memory only (max 50, never persisted) and are cleared on lock and on entering deniability/demo, because they name real counterparties. It reads the same local entity stores the pages already read: no new backend surface and no new egress. A flagged verdict comes from the local threat-intel store, which returns matches only; an empty result is never treated as a hit. This is NOT a push-notification service — nothing is checked while the app is closed, and no alert is not evidence that nothing happened (I4). STATUS: the implementation is complete, wired in Layout via useBackgroundSecurity and unit-tested, but it has NOT been observed running on a device or in a browser, so it stays roadmap rather than claiming to work. Deleting the useBackgroundSecurity call would silently disable it with no test going red.',
      },
    ],
  },
  {
    category: 'dApp Connectivity',
    features: [
      {
        name: 'dApp Connector',
        status: 'verified',
        verifiedBy: 'dApp Connector — eth_sendTransaction (D3, Sepolia)',
        summary: 'Connect to dApps via the dApp Connector (WalletConnect v2 transport)',
        explanation:
          'WalletConnect v2 transport + request handling (D1+D2+D3). ' +
          'Pair with dApps, approve/reject session proposals, and sign personal_sign / eth_signTypedData_v4 ' +
          'requests with Permit/Permit2 hard warnings. eth_sendTransaction is wired end-to-end — it signs ' +
          'locally and broadcasts a real transaction, with a chain-ID-mismatch guard and a 1M-gas cap (I5); ' +
          'the D3 send path is verified on Sepolia (tx 0x0afc6b30…, block 11123831, 2026-06-23, ' +
          'docs/verified-evidence.json). ' +
          'Blocked methods: eth_sign (raw bytes), wallet_addEthereumChain (RPC injection), ' +
          'wallet_switchEthereumChain (not yet implemented — blocked and not advertised). ' +
          'Session approval passes the dApp\'s requested chains through to the namespace (all 12 EVM chains ' +
          'in SUPPORTED_CHAIN_IDS — testnets + mainnet); unsupported chains are filtered silently. ' +
          'Active sessions display their approved chain set. ' +
          'Ships with a committed public default project ID (src/wallet-core/evm/walletconnect/projectId.js) ' +
          'so the connector is enabled on every build; VITE_WALLETCONNECT_PROJECT_ID overrides it. ' +
          'dApp domain security (PR #477, 2026-06-29): checkDappDomain now runs inside approveSession — ' +
          'a blocked domain is rejected at session approval before any signing surface opens (I4 fail-closed). ' +
          'Blocklist expanded from 5 to 23 entries.',
      },
      {
        name: 'Web3 Browser',
        status: 'roadmap',
        summary: 'In-app dApp browser',
        explanation: 'An in-app browser for dApp interaction. Roadmap only; specced, not yet built.',
      },
    ],
  },
  {
    category: 'Platform',
    features: [
      {
        name: 'Demo Mode',
        status: 'verified',
        summary: 'Browse without a backend',
        explanation: 'Explore the app without connecting a backend or funding a wallet, for evaluation and demos.',
      },
      {
        name: 'iOS App',
        displayName: 'iOS App Store',
        status: 'roadmap',
        summary: 'Native iOS shell — TestFlight internal testing',
        explanation: 'Built. Native iOS shell via Capacitor, published to TestFlight (1.0.1 Build 11, READY_FOR_BETA_TESTING). Apple Organisation account (Veyrnox LTD, Team R54268MWFV) verified. CLI archive + upload pipeline working (xcodebuild + altool). App Store review submission on hold pending pre-submission verification checklist (fresh-device golden-path walk, Organizer crash/hang check). NOT verified: no App Store review submission made, RASP on a TestFlight install not device-verified.',
      },
      {
        name: 'Android App',
        displayName: 'Android Play Store',
        status: 'roadmap',
        summary: 'Native Android shell — Play internal testing',
        explanation: 'Built. Native Android shell via Capacitor, current submission train 1.0.1 / versionCode 10 with Play internal-testing upload path wired in CI. Upload key reset completed. Play Billing (IAP) device-verified on the internal track. Release build end-to-end verified (signed AAB, jarsigner, release cert fingerprint guard). Submission remains on hold pending the pre-submission verification checklist (Play Pre-launch report, Android Vitals crash/ANR check, fresh-device golden-path walk). NOT verified: a clean Pre-launch report for versionCode 10 is still console-only and pending, RASP on a Play install not device-verified, no production review submission made.',
      },
      {
        name: 'Samsung Galaxy Store',
        status: 'roadmap',
        summary: 'Samsung Galaxy Store distribution via Gradle product flavors',
        explanation: 'Built. Samsung Galaxy Store integration via Gradle product flavors (google/samsung) and RevenueCat Samsung billing. The samsung flavor uses Samsung In-App Purchase SDK instead of Google Play Billing. CI produces Samsung-specific artifacts. NOT verified: no Galaxy Store submission made, no device-verified purchase on Samsung billing.',
      },
      {
        name: 'Voice Commands',
        status: 'verified',
        summary: 'Hands-free, read-only navigation',
        explanation: 'Built (/voice-commands). Voice navigation via the native @capacitor-community/speech-recognition plugin (Android SpeechRecognizer), with a Web Speech API fallback on web: recognises a fixed command set (go to dashboard, check balance, etc.) and navigates the app. Read-only navigation only — never initiates or signs transactions by voice. Transcription happens off-device on the platform speech service (Google on Android), and voice is disabled when locked or in a deniability/duress session (I3, fail closed).',
      },
    ],
  },
  {
    // Carried over from Documentation.jsx's own catalogue when the two were
    // merged (2026-08-24). This was the ONE category the parallel list had that
    // this one did not — everything else was a rename. Without it the merge
    // would have silently dropped the only place the app tells a user what it
    // charges for.
    category: 'Subscriptions',
    features: [
      {
        name: 'Free & Safety Plus Plans',
        displayName: 'Free & Safety Plus Plans',
        status: 'verified',
        summary: 'Optional paid tier — the only fee Veyrnox charges',
        explanation: 'Built (/plans). Optional Free and Safety Plus plans gate a subset of features; Safety Plus is billed monthly or annually through the platform store (Apple / Google / Samsung) via RevenueCat, and it is the only fee Veyrnox charges. Self-custody is never gated: keys, send, receive, backup, duress and panic wipe all work on the free tier. NOT verified: no real purchase has been completed on any store, so the billing path is built and store-configured but unproven end-to-end.',
      },
    ],
  },
];

/** The set of feature names with a real testnet txid in docs/verified-evidence.json. */
export function verifiedFeatureNames() {
  return new Set(Object.keys(verifiedEvidence?.evidence ?? {}));
}

/**
 * Resolve a feature's DISPLAYED status.
 *
 * `verified` is IMPOSSIBLE TO ASSERT BY INSPECTION. A hand-typed
 * `status: 'verified'` with no matching txid entry in docs/verified-evidence.json
 * is downgraded to `built`. Passing tests, clean review, and a green pipeline
 * never promote anything here — only a real, explorer-confirmed txid does
 * (CLAUDE.md, "Verify, don't assert").
 *
 * Restored 2026-08-24. This gate shipped in PR #145 and was deleted by PR #1185
 * ("promote all Built features to Verified/Green"), which removed the
 * evidence-gating and turned all 48 built features teal. Everything else needed
 * for three states survived that change — STATUS.BUILT stayed in the enum,
 * Features.jsx kept its amber Built token, verifiedFeatureNames() kept reading
 * the evidence file, and the comment at Features.jsx:34 kept CLAIMING the gate
 * existed. Only this function was gutted, so the claim became false.
 *
 * The evidence key is `verifiedBy` when present (the txid entry's exact name),
 * falling back to the feature name.
 *
 * @param {{status: string, name: string, verifiedBy?: string}} feature
 * @param {Set<string>} [verifiedNames]
 * @returns {'verified'|'built'|'roadmap'}
 */
export function resolveStatus(feature, verifiedNames = verifiedFeatureNames()) {
  if (feature.status !== STATUS.VERIFIED) {
    return /** @type {'verified'|'built'|'roadmap'} */ (feature.status);
  }
  const evidenceKey = feature.verifiedBy ?? feature.name;
  return verifiedNames.has(evidenceKey) ? STATUS.VERIFIED : STATUS.BUILT;
}
