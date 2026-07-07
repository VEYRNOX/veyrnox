// src/lib/featureCatalogue.js
//
// THREE-STATE FEATURE CATALOGUE — verified | built | roadmap.
//
// Scope contract: docs/WalletFeatures.spec.md (canonical three-way split). This
// catalogue lists ONLY self-custody-safe, in-scope features (spec sections A =
// in-scope + B = self-custody-safe gaps). Everything in spec section C
// (custodial / regulated — swaps, perps, staking/yield/lending, fiat ramps,
// bank links, KYC/DID, NFT minting, DAO/payroll, encrypted messaging, etc.) is
// deliberately NOT a Veyrnox feature and is not listed here.
//
// The three states replace the old two-state badge (`available`/`roadmap`),
// whose single green "available" merged two very different realities:
//
//   verified — exercised against a REAL, explorer-confirmed on-chain txid
//              (testnet, or mainnet for a shipped asset). This is the ONLY
//              state that can never be asserted by inspection: it requires a txid
//              entry in docs/verified-evidence.json, linked from the feature via
//              its `verifiedBy` key (falling back to the feature name). Code-
//              complete, passing tests, and clean review are NOT verification
//              (CLAUDE.md: "Verify, don't assert"). resolveStatus() downgrades any
//              hand-typed `verified` with no matching evidence entry back to `built`.
//   built    — code-complete and working, but not yet exercised on-chain.
//              "Code-ready ≠ verified."
//   roadmap  — specced, not built.
//
// PR-A (this change) carries the honest three-state model with a manual mapping
// audited against the modules: every former `available` → `built`; the clearest
// understatements (Risk Scoring → src/risk/, Portfolio Dashboard →
// WalletPortfolioPage + portfolioBalances, Audit Log → wallet-core/auditLog.js)
// are lifted out of `roadmap`. PR-B will DERIVE `built` from a grep of module
// status tags so CI catches any future drift; until then this mapping is manual
// and deliberately errs toward `roadmap` (understate, never overstate) where a
// module's completeness is not obvious.
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
        status: 'built',
        summary: 'BIP-39 seed with multi-account derivation',
        explanation: 'Generate a non-custodial hierarchical-deterministic wallet from a BIP-39 seed phrase, with multiple accounts derived from a single seed. Keys are created and held locally — VEYRNOX never custodies them.',
      },
      {
        name: 'Import Wallet',
        status: 'built',
        summary: 'Restore from seed phrase or private key',
        explanation: 'Import an existing wallet from a BIP-39 mnemonic or a raw private key. Imported material is encrypted into the local vault on the same terms as a generated wallet.',
      },
      {
        name: 'Encrypted Vault',
        status: 'built',
        summary: 'Strong on-device encryption at rest',
        explanation: 'Private keys are sealed in a local vault using strong on-device encryption (a memory-hard key-derivation step plus authenticated encryption). Plaintext keys are never written to disk and never leave the device.',
      },
      {
        name: 'Backup & Reveal Seed',
        status: 'built',
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
        status: 'built',
        summary: 'Derived address + local QR code',
        explanation: 'Show the correct receive address per chain with a locally-generated QR code and copy action. Addresses come from the wallet’s own derivation, not from any backend.',
      },
      {
        name: 'Live Balances',
        status: 'built',
        summary: 'Balances read live from chain',
        explanation: 'Native and token balances are read directly from public chain RPC / explorer providers, so the displayed value reflects on-chain reality rather than a cached server figure.',
      },
      {
        name: 'Transaction History',
        status: 'built',
        summary: 'Per-chain read-only history',
        explanation: 'Per-chain transaction history sourced from the same providers used for balances (Esplora for BTC, RPC for SOL, explorer fallback for EVM). Read-only, with honest disclosure of each chain’s privacy trade-offs.',
      },
      {
        name: 'Gas / Fee Control',
        status: 'built',
        summary: 'Per-chain fee tiers + custom before signing',
        explanation: 'Choose a fee tier (or set a custom fee) per chain before signing, using each chain’s native fee model (EIP-1559 for EVM, sat/vB for Bitcoin, priority fee for Solana). The selected fee flows into the signed transaction.',
      },
      {
        name: 'ENS / SNS Resolution',
        status: 'built',
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
        status: 'built',
        summary: 'Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain',
        explanation: 'Six EVM networks share one secp256k1 derivation and signing stack: Ethereum, Polygon, Arbitrum, Optimism, Avalanche, and BNB Chain. All verified on testnet; mainnet was unlocked 2026-06-17 (internal audit), with USDC/USDT mainnet sends confirmed on Ethereum (see Send Crypto).',
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
        status: 'verified',
        verifiedBy: 'USDC mainnet send (full UI path, build:release, Ethereum mainnet)',
        summary: 'USDC and USDT via the shared token path, mainnet-verified',
        explanation: 'ERC-20 tokens (USDC, USDT) ride the audited token path with contract-read decimals and balance reads, reusing the native EVM signing flow. Both USDC and USDT have a real Ethereum-mainnet send confirmed on-chain (docs/verified-evidence.json).',
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
        explanation: 'Further EVM networks are largely configuration-level additions on the existing stack. On the roadmap; non-EVM stacks (each a full new stack + audit) are considered only if justified.',
      },
    ],
  },
  {
    category: 'Access & Authentication',
    features: [
      {
        name: 'Passkey Unlock',
        status: 'built',
        summary: 'FIDO2 / WebAuthn unlock + cloned authenticator detection (M-K)',
        explanation: 'Unlock the app with a platform passkey (FIDO2 / WebAuthn). This is an unlock gate parallel to the password - it never holds or replaces the wallet keys, and a password escape hatch remains. M-K (cloned authenticator detection): WebAuthn assertions include a signCount that must strictly increase to detect replayed assertions from cloned or backed-up soft authenticators. Implementation: signCount persisted in localStorage, validated on each assertion (rejects if signCount does not increase), fail-closed on validation errors (I4 invariant). Status: BUILT 2026-06-30, ready for device verification with real cloned authenticator test.',
      },
      {
        name: 'Biometric Unlock',
        status: 'built',
        summary: 'Face ID / Touch ID / Android fingerprint unlock gate — native on iOS and Android',
        explanation: 'Use device biometrics as an app-layer unlock gate where the platform supports it, falling back to passkey or password. Biometrics gate access; they do not custody keys. Native Face ID / biometric unlock is built on iOS and Android (2026-06-29): Face ID opens the real wallet (Biometric Unlock in Settings → Security) or optionally the decoy wallet ("Use Face ID for hidden wallet" in Duress PIN screen). Android: USE_BIOMETRIC and USE_FINGERPRINT permissions added to AndroidManifest.xml (PR #483) — previously BiometricPrompt threw SecurityException on Android 9+. App-layer gate; OS-enforced ACL binding (M2c/M2d) remains a TARGET (native plugin + real-device required).',
      },
      {
        name: 'PIN Unlock',
        status: 'built',
        summary: 'Numeric-PIN unlock over Argon2id (no hardware KEK yet)',
        explanation: 'Built; the ECC independent audit (2026-06-23) reviewed the PIN/Argon2id path with no findings (§24 satisfied). Numeric-PIN onboarding and returning-PIN unlock over the SAME Argon2id vault as the password path. Deniability model v2: real PIN opens the hidden real wallet; duress PIN opens the decoy; Face ID (opt-in) opens the decoy, never the real wallet; any other wrong PIN returns an explicit "Incorrect PIN" error (the old deterministic-decoy / no-oracle fallback was removed by design). 10 consecutive wrong PINs trigger an irreversible local wipe (pinAttemptGuard.js). HONEST LIMITATION: there is no hardware-bound key (Secure Enclave / StrongBox KEK) yet — a numeric PIN over Argon2id is offline-exhaustible on a seized device (the 10-attempt counter is a software counter, bypassable by imaging the storage). This residual gap is native, not audit: the hardware-KEK fast-follow (a native build, real-device-verified, plus its own key-at-rest audit pass since it expands crypto scope) is what closes it — it was out of reach of the source-level §24 audit. Until then this is a convenience unlock gate with a wipe-on-brute-force mitigation, not a hardware guarantee.',
      },
      {
        name: 'Two-Factor at Critical Actions',
        status: 'verified',
        verifiedBy: 'Two-Factor — Face ID biometric possession factor (physical iPhone, Sepolia)',
        summary: 'PIN + Action Password, or PIN + Face ID / Passkey, on sensitive actions — Face ID path verified on-chain 2026-06-29',
        explanation: 'VERIFIED (Face ID / biometric possession path, physical iPhone 17 Pro Max, Sepolia txid 0xd1c97fa2f0a8ec2ae1038364f0106f6ef98b27258ad1ec2faa227de0baf1e2e7, 2026-06-29 — see docs/verified-evidence.json). Opt-in second factor before sensitive actions — send, reveal recovery phrase, set duress PIN, create/hide a wallet. Three methods: (1) PIN + Action Password — a second KNOWLEDGE factor, per wallet-set, stored inside the encrypted container (two Argon2id checks run sequentially); (2) PIN + Passkey / FIDO2 — a POSSESSION factor (device-global, fails closed on any cancel/timeout/error); (3) PIN + Face ID / native biometric — OS biometric assertion via @aparajita/capacitor-biometric-auth, SEND_2FA.BIOMETRIC path, fails closed (I4). Face ID cancel blocks the send. 5 wrong attempts locks the app. Device-global passkey and biometric 2FA factors are suppressed in decoy (duress) and hidden (stealth) sessions (BUILT — unit-tested 17/17 resolver + 59/59 security-component tests, typecheck clean, NOT device-verified): a deniable-session send no longer triggers a real-session-configured passkey/biometric challenge, which would otherwise be an I3 deniability tell and a potential RP-backed-passkey network egress. The per-set Action Password factor is preserved across all session types. Implemented in `src/lib/send2faMethod.js` (`isDecoy`/`isHidden` inputs, `deniable` gate on the BIOMETRIC/PASSKEY branches), wired at `src/pages/SendCrypto.jsx` and `src/components/security/useActionGuard.jsx`. OUTSTANDING: I3 no-egress on a real decoy-send path is not yet device-verified (no on-device decoy-send egress trace captured); this is BUILT at most, never "verified". The ECC independent audit (2026-06-23) found the H-1 passkey-2FA Send bypass, fixed in PR #340 (resolveSend2faMethod). Honest scope: the Action Password path is two things you know on one device (not hardware 2FA); Face ID / native biometric is OS-level possession but not a FIDO2 WebAuthn credential (WKWebView WebAuthn is unreliable; native biometric is the honest possession factor equivalent on iOS).',
      },
      {
        name: 'Native Secure Storage',
        status: 'built',
        summary: 'iOS Secure Enclave ECIES + Android Keystore HMAC-SHA256 (StrongBox-preferred, TEE-accepted) KEK — device-verified (PARTIAL), UNAUDITED (internal pass only, NOT independent)',
        explanation: 'Built. Native hardware Key-Encryption-Key that wraps the PIN-derived vault DEK under KEK = HKDF-SHA256(H ‖ C) + AES-256-GCM, so an offline-seized vault blob cannot be PIN-exhausted without the device: the hardware factor H is released only per-use behind biometric auth and never leaves the secure element. iOS: Secure Enclave P-256 ECIES (non-extractable key, .biometryCurrentSet biometric ACL) shipped as a native Objective-C plugin (PR #495, registration blocker resolved via the two-file CAPPlugin split) and device-verified (PARTIAL) on iPhone 17 Pro Max. Android: AndroidKeyStore HMAC-SHA256, StrongBox-preferred but NOT enforced (honest tier reporting), device-verified on Pixel 10 Pro XL. NOT "verified": the iOS biometric re-enrollment invalidation test (Android PASSED 2026-07-01, Pixel 10 Pro XL) and the live iOS SE-unlock trace remain outstanding. OPEN GAP — StrongBox tier enforcement (TARGET, not built): non-StrongBox TEE keys are accepted (StrongBox preferred but not required); SOFTWARE/unknown tiers are already refused fail-closed (AUDIT M2, KEK_ENROLL_INSECURE_TIER) so a software-only key can never enroll. Requiring StrongBox over TEE is a device-coverage-vs-assurance tradeoff (see docs/audit-triage/strongbox-tier-enforcement-decision-2026-07-06.md). This is a distinct open residual gate, NOT the audit C-1 finding: the audit C-1 CRITICAL (global-fixed HMAC input / missing per-enrollment kekSalt binding) is FIXED / device-verified (v3, 2026-07-05, PR #568, docs/audit-2026-07-01-kek-internal.md). AUDIT STATUS: internal static-analysis pass only (2026-07-01); NOT an independent audit; "internal" must never be presented as "independent" (I4). Independent audit required before this control can be promoted. See docs/Feature-Status.md §4.',
      },
      {
        name: 'Session Manager & Auto-Lock',
        status: 'built',
        summary: 'Auto-lock + device session management',
        explanation: 'Built (/session-manager): lists UserSession device records, revoke individual or all sessions (self-enforcing: locks this device immediately, locks others at next open). Auto-lock idle/background timer in Settings. Login Activity (/login-activity) shows the previous-session unlock timestamp and device records in a read-only history view; per-unlock event log is intentionally absent (I3 deniability constraint).',
      },
      {
        name: 'Account Access & Recovery',
        status: 'built',
        summary: 'Non-custodial change-password + seed recovery',
        explanation: 'Change the vault password (re-encrypts the same seed under a new password; requires the current password) and recover access by re-importing your seed phrase. Fully non-custodial — there is no server-side key escrow and no "we’ll restore your access" path. If you lose both password and seed, funds are unrecoverable by design.',
      },
      {
        name: 'Hardware Wallet',
        status: 'built',
        summary: 'Trezor — cold-key signing for ETH, BTC, SOL (send paths wired 2026-06-29)',
        explanation: 'Built (/hardware-wallet): Trezor (WebUSB, Chrome/Edge desktop) supports address derivation and transaction signing for ETH (EIP-1559), BTC (PSBT), and SOL. trezorSignBtcTx and trezorSignSolTx are wired in SendCrypto (PR #475, 2026-06-29); broadcastBtcTx, buildUnsignedSolTx, and attachSolSignature added. Private key never leaves the hardware device (I1). Deniability sessions block all Trezor calls before any connect.trezor.io egress: demo/tour mode (veyrnox-demo) AND a real decoy/hidden (duress/stealth) session are both gated via the in-memory deniabilitySession marker (wallet-core/deniabilitySession.js, PR #476, 2026-06-29), fail-closed (I3). TrezorContext is the sole hardware wallet context (HardwareWalletContext deleted). Built, not device-verified — no physical-device txid. Non-WebUSB browsers (e.g. iOS WKWebView) fail soft to a "not available" card. ERC-20 hardware signing and multi-account paths not yet wired.',
      },
    ],
  },
  {
    category: 'Transaction Safety',
    features: [
      {
        name: 'Token Approvals (View + Revoke)',
        status: 'built',
        summary: 'Inspect and revoke ERC-20 allowances',
        explanation: 'List the token allowances granted to contracts, flag unlimited approvals, and build revoke calldata the user signs locally. Helps shut down drainer exposure from stale approvals.',
      },
      {
        name: 'Address-Poisoning Warnings',
        status: 'built',
        summary: 'Look-alike address detection on send',
        explanation: 'Before a send, the recipient is screened for look-alike / poisoned-address patterns and the user is warned. The warning informs the user; it does not silently block the transfer.',
      },
      {
        name: 'Spam Token Filter',
        status: 'built',
        summary: 'Auto-hide airdropped scam tokens',
        explanation: 'Heuristically annotate and hide spam / scam tokens airdropped to the wallet, with a manual show/hide override, reducing the chance of interacting with a malicious token.',
      },
      {
        name: 'Calldata Decode & Approval Guard',
        status: 'built',
        summary: 'Human-readable calldata before signing',
        explanation: 'Opaque transaction calldata is decoded into a structured, human-verifiable summary — including unlimited-approval detection — shown on the confirm screen before any signature. Holds no keys; inspects bytes only.',
      },
      {
        name: 'Suspicious-Address Screening',
        status: 'built',
        summary: 'Local blocklist + sanctioned-address screening',
        explanation: 'Built — recipients are screened on-device against a local blocklist of burn / known-bad addresses, including one known OFAC-sanctioned address (Ronin / Lazarus). Warns, never blocks; nothing leaves the device. A live, regularly-updated threat-intel / sanctions feed (Chainalysis / TRM / Elliptic class) is the roadmap upgrade — a bundled snapshot cannot stay delisting-current.',
      },
      {
        name: 'Transaction Simulation',
        status: 'built',
        summary: 'Local-first pre-sign preview with risk flags',
        explanation: 'Before signing, the transaction is previewed locally — an eth_call dry-run on EVM plus honest decode on BTC/SOL — surfacing expected balance / approval changes and risk flags as a drainer defence. No third-party scoring service; it warns rather than blocks and never claims a transaction is "safe".',
      },
      {
        name: 'Anomaly / Fraud Detection',
        status: 'built',
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
        status: 'built',
        summary: 'Decoy wallet under coercion — deniability model v2',
        explanation: 'BUILT; the ECC independent audit (2026-06-23) confirmed correct real/decoy routing with timing equalised between the two paths and no app-level coercer tell (no findings, §24 satisfied). A separate duress PIN opens a plausible decoy wallet; the real PIN opens the hidden real wallet (no UI tell it exists). Face ID (opt-in) is bound to the decoy, never the real wallet. A wrong PIN that matches neither returns an explicit "Incorrect PIN" error — the old no-oracle property was deliberately removed in the v2 model: deniability now rests on hiding the real wallet behind the secret real PIN, not on suppressing the error. 10 consecutive wrong PINs trigger an irreversible local wipe (pinAttemptGuard.js), making the wrong-PIN oracle non-fatal before brute-force succeeds. Does not resist offline seizure without a hardware key-encryption key (planned fast-follow, not yet built). The decoy is a genuine, separately-encrypted vault; a forensic inspection of device storage can reveal a second vault exists.',
      },
      {
        name: 'Stealth / Hidden Wallets',
        status: 'built',
        summary: 'Deniable hidden-wallet pool',
        explanation: 'Hidden wallets live in a deniable chaff-slot pool so their existence and count cannot be proven from the stored data. The dual of the duress feature, for count-hiding plausible deniability.',
      },
      {
        name: 'Panic Wipe',
        status: 'built',
        summary: 'Irreversible local key-material destruction + 10-attempt auto-wipe',
        explanation: 'BUILT; the ECC independent audit (2026-06-23) confirmed the prior key-material residue gap (stealth-slot salt, audit-device salt, passkey credential IDs) is CLOSED and the deletion is now test-pinned (no findings, §24 satisfied). Two wipe paths: (1) a dedicated panic PIN at the unlock screen triggers an immediate irreversible local wipe; (2) 10 consecutive wrong PINs trigger the same wipe automatically (pinAttemptGuard.js — this is the v2 model\'s mitigation for the now-explicit wrong-PIN error). The 10-attempt counter lives in software and can be bypassed by imaging the storage before the first attempt on a seized device; hardware KEK is the planned fast-follow. Wipe destroys local key material only; on-chain funds are unaffected and the seed phrase elsewhere still recovers the wallet.',
      },
      {
        name: 'Encrypted Personal Backup',
        status: 'built',
        summary: 'Ciphertext-only vault backup',
        explanation: 'Built (/cloud-backup). Client-side encrypt-then-export: the vault is serialised, sealed with a user-supplied password using strong on-device encryption, and written to an opaque file. Restore decrypts the file locally before any key material is loaded. Plaintext keys never leave the device. The ECC independent audit (2026-06-23) confirmed key custody for this LOCAL path (plaintext seed never leaves the device; Argon2id (64 MiB / t=3, audited at 192 MiB then lowered for device latency — not yet re-audited at 64 MiB) + AES-256-GCM; verify-before-success) and the only finding (L-1, PIN floor 4→6 digits) was fixed in PR #340. Scope note: this is the local file path only — the BACKEND-ESCROW variant (a server-side ciphertext target) remains backend + audit gated and is not built.',
      },
    ],
  },
  {
    category: 'Monitoring & Risk',
    features: [
      {
        name: 'RASP',
        status: 'built',
        summary: 'Runtime environment detection + graduated degradation',
        explanation: 'Built — UI-confirmed. Browser-level detection active: navigator.webdriver + legacy automation fingerprints → HOOKED → signing blocked. Normal browser → CLEAN → ALLOW (no friction). Degradation policy (condition → tier) and I3 response-symmetry guard built + tested in src/rasp/. Wired to the send path via detect(browserProbeSource) → degrade() → presignGate(). The ECC independent audit (2026-06-23) confirmed the browser-level lane genuinely blocks (not merely warns) at the wired send call-site with no network egress (I2/I3 clean), and that VITE_DEV_UNGATE_SEND cannot bypass it; the only fix was stale "NOT WIRED" comments (M-4, PR #340). The OS-level probes (root/jailbreak/tamper) remain a separate, unbuilt layer requiring a native Capacitor plugin and real-device verification (roadmap Phase 4) — the source-level §24 audit could not exercise on-device probes.',
      },
      {
        name: 'Audit Log',
        status: 'built',
        summary: 'Optional encrypted local activity record',
        explanation: 'Built (/audit-log). Opt-in, off by default. Stores at most 100 entries ({ type, ts } ONLY — no amounts, addresses, or wallet identity) as an encrypted blob in the primary vault store (quaternary key). Hard allowlist of 3 event types; hard denylist of 7 sensitive terms. No-op in decoy/hidden sessions; panic wipe destroys it. The ECC independent audit (2026-06-23) verified all catalogue claims against source, confirmed the write path, and found no exaggeration of scope (no findings, §24 satisfied). No on-chain artifact exists, so this stays BUILT — "audited" is not "verified".',
      },
      {
        name: 'Risk Limits / Risk Scoring',
        status: 'built',
        summary: 'Rule-based, transparent transaction risk scoring',
        explanation: 'A transparent, rule-based risk score over a pending transaction from on-device signals (fresh recipient, unlimited approval, fresh-spender approval, address poisoning, ENS mismatch, dust input, calldata mismatch, value anomaly) combined into a single pre-sign verdict. This verdict is the authoritative pre-sign gate wired into Send → verify: a high-RISK verdict requires an explicit "Sign anyway" acknowledgement before the send can proceed, an INFO verdict shows a non-blocking chip, and an INDETERMINATE verdict escalates to caution (fail-closed). Built in src/risk/ and reviewed in the ECC independent audit (2026-06-23): pure on-device heuristics, fail-closed, no network calls, never claims a transaction is "safe" (no findings, §24 satisfied). Local-only, rule-based and explainable, warns rather than silently blocks — never an opaque custodial trust score. No on-chain artifact, so it stays BUILT, not "verified".',
      },
    ],
  },
  {
    category: 'Portfolio & Analytics',
    features: [
      {
        name: 'Portfolio Dashboard',
        status: 'built',
        summary: 'Net-worth view across wallets and chains',
        explanation: 'A read-only overview of value across the unlocked vault’s wallets and chains, aggregated on-device from public balances (no new network surface, no keys, no writes). Built; reads are fail-closed — an unreachable chain shows as incomplete rather than a silent $0.',
      },
      {
        name: 'Net-Worth Tracker',
        status: 'built',
        summary: 'Aggregate crypto net worth across wallets and chains',
        explanation: 'Built (/net-worth). Aggregates current net worth on-device from portfolio balances via usePortfolio + buildAllocation. I2-gated: live price conversion requires explicit opt-in; shows reference-rate note otherwise. No time-series store (avoids size oracle). Read-only; no backend.',
      },
      {
        name: 'P&L Tracking',
        status: 'built',
        summary: 'Realised / unrealised profit and loss',
        explanation: 'Built (/pl). Per-asset P&L records stored on-device via base44 entities; current prices from CryptoCompare (I2-gated behind live-prices opt-in — shows "—" when off). Fabricated CURRENT_PRICES constant replaced with real feed. Read-only; no autonomous trading.',
      },
      {
        name: 'On-Chain Analytics',
        status: 'built',
        summary: 'Public on-chain activity insights',
        explanation: 'Built (/onchain). Address-level on-chain analytics: transaction lookup by address or hash, inbound/outbound activity breakdown, refreshable via public RPC. Read-only; uses base44 entities + public chain data. No private data egress.',
      },
      {
        name: 'Fee Analytics',
        status: 'built',
        summary: 'Track fees paid, in native units',
        explanation: 'Stateless native-unit fee analytics (Slice 1): totals the network fees the active set actually paid, computed on-device from chain history via the same on-demand fetch the history view uses — no fiat, no persistence, no new egress. EVM has no in-app indexer so it fails honest to "unavailable". Built and fixture-tested; the ECC independent audit (2026-06-23) confirmed it is stateless, does no fiat conversion, adds no new egress path, and fails honest on EVM fee failures (no findings, §24 satisfied). Still BUILT, not "verified": this is an analytics readout over real on-chain history with no on-chain txid of its own — "audited" is not "verified". Fiat cost-basis P&L is a separate slice that is not yet built.',
      },
      {
        name: 'What-If Simulator',
        status: 'roadmap',
        summary: 'Model hypothetical allocation changes',
        explanation: 'Model how a hypothetical allocation change would affect the portfolio — purely illustrative, executes nothing. Specced, not yet built.',
      },
      {
        name: 'Tax Report',
        status: 'built',
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
        status: 'built',
        summary: 'Historical OHLCV price charts',
        explanation: 'Built (/price-charts). Real OHLCV candlestick data from CryptoCompare histoday API, rendered with recharts. I2-gated (live prices opt-in required). Supports daily/weekly/monthly ranges for top assets. No fabricated data.',
      },
      {
        name: 'Price Alerts',
        status: 'built',
        summary: 'Threshold price notifications',
        explanation: 'Built (/alerts): threshold-based price alert rules stored on-device. Evaluation is I2-gated behind the live prices opt-in. Advisory only — alerts never trade.',
      },
      {
        name: 'Watchlist',
        status: 'built',
        summary: 'Track assets you do not hold',
        explanation: 'Built (/watchlist): follow assets independently of the active wallet with real opt-in price feeds from CryptoCompare (I2-gated; shows "—" when live prices are off).',
      },
      {
        name: 'Notifications & Push',
        status: 'built',
        summary: 'Web Push notification centre with opt-in subscription',
        explanation: 'Built (/push). Browser Web Push API integration: opt-in subscription management, test notification trigger, notification permission status. Advisory only — alerts never initiate transactions.',
      },
    ],
  },
  {
    category: 'NFTs',
    features: [
      {
        name: 'NFT Gallery (Display-Only)',
        status: 'built',
        summary: 'View owned NFTs',
        explanation: 'Built (/nft). Display-only NFT portfolio using on-device records. Viewing only — VEYRNOX does not mint, fractionalise, or run an NFT marketplace. Add/remove NFT records stored locally via base44 entities.',
      },
      {
        name: 'Multi-Chain NFT Viewing',
        status: 'built',
        summary: 'View NFTs across chains',
        explanation: 'Built (/nft-multichain). Cross-chain NFT display with chain filtering, grid/list toggle, and local records via base44 entities. Viewing only — no minting or trading.',
      },
    ],
  },
  {
    category: 'Payments & Utilities',
    features: [
      {
        name: 'Address Book',
        status: 'built',
        summary: 'Saved, labelled addresses with per-chain validation',
        explanation: 'Save and label trusted addresses for faster, safer sends. Each address is validated for the selected chain on save using the same validators the Send flow uses, reducing wrong-chain mistakes.',
      },
      {
        name: 'Message Signing',
        status: 'built',
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
        status: 'built',
        summary: 'Self-initiated scheduled reminders',
        explanation: 'Built (/recurring). Create and manage recurring payment schedules stored locally via base44 entities. Reminder notifications only — the user signs each payment. No autonomous auto-debit; the wallet never moves value without an explicit signature.',
      },
    ],
  },
  {
    category: 'Referrals',
    features: [
      {
        name: 'Referral Tracker',
        status: 'built',
        summary: 'Local referral-code tracking (conditional backend egress)',
        explanation: 'Built (/referrals). Generates a random referral code (crypto.getRandomValues — NOT seed-derived) and tracks code / tier / redeemed state in localStorage. Local-only by default: with no referral backend configured the network calls no-op. If VITE_SUPABASE_URL / ANON_KEY are set at build time, register/redeem/status send the referral code (not balances or seed) to that external backend — an opt-in egress, disclosed here per I2. Public ranking and public profiles remain cut on principle.',
      },
    ],
  },
  {
    category: 'AI Assistant (Advisory-Only)',
    features: [
      {
        name: 'Transaction Explanation',
        status: 'roadmap',
        summary: 'Plain-language description of a transaction',
        explanation: 'Explain in plain language what a pending transaction does. Advisory only — the AI never holds keys and never signs. Specced, not yet built.',
      },
      {
        name: 'Scam & Phishing Explanation',
        status: 'roadmap',
        summary: 'Explain why something looks risky',
        explanation: 'Explain why an address, contract, or site looks risky. Advisory only; specced, not yet built.',
      },
      {
        name: 'Educational Assistant',
        status: 'roadmap',
        summary: 'Answer wallet / crypto questions',
        explanation: 'Answer questions about gas, approvals, address formats, and wallet concepts. Advisory only; specced, not yet built.',
      },
      {
        name: 'Portfolio Q&A',
        status: 'roadmap',
        summary: 'Questions over public on-chain data',
        explanation: 'Answer questions over the user’s public on-chain data. Advisory only — never autonomous trading or management. Specced, not yet built.',
      },
    ],
  },
  {
    category: 'dApp Connectivity (Post-Audit)',
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
        explanation: 'An in-app browser for dApp interaction. Post-audit only; specced, not yet built.',
      },
    ],
  },
  {
    category: 'Platform',
    features: [
      {
        name: 'Demo Mode',
        status: 'built',
        summary: 'Browse without a backend',
        explanation: 'Explore the app without connecting a backend or funding a wallet, for evaluation and demos.',
      },
      {
        name: 'iOS App',
        status: 'roadmap',
        summary: 'Native iOS shell',
        explanation: 'A native iOS shell runs on the simulator; App Store submission is gated on an Apple organisation account. Roadmap.',
      },
      {
        name: 'Android App',
        status: 'roadmap',
        summary: 'Native Android shell',
        explanation: 'A native Android shell is scaffolded (non-custodial = store-exempt in the relevant sense). Roadmap.',
      },
      {
        name: 'Voice Commands',
        status: 'built',
        summary: 'Hands-free, read-only navigation',
        explanation: 'Built (/voice-commands). Voice navigation via the native @capacitor-community/speech-recognition plugin (Android SpeechRecognizer), with a Web Speech API fallback on web: recognises a fixed command set (go to dashboard, check balance, etc.) and navigates the app. Read-only navigation only — never initiates or signs transactions by voice. Transcription happens off-device on the platform speech service (Google on Android), and voice is disabled when locked or in a deniability/duress session (I3, fail closed).',
      },
    ],
  },
];

/** The set of feature names with a real testnet txid in docs/verified-evidence.json. */
export function verifiedFeatureNames() {
  return new Set(Object.keys(verifiedEvidence?.evidence ?? {}));
}

/**
 * Resolve a feature's RENDERED status. `verified` is honoured ONLY when the
 * feature points at a txid entry in the evidence file via its `verifiedBy` key
 * (falling back to the feature name) — a hand-typed `verified` with no matching
 * evidence falls back to `built`, so verified is impossible to assert by
 * inspection. `built`/`roadmap` pass through as catalogued.
 * @param {{name:string, status:string, verifiedBy?:string}} feature
 * @param {Set<string>} [verifiedNames] - injectable for tests; defaults to the file
 * @returns {'verified'|'built'|'roadmap'}
 */
export function resolveStatus(feature, verifiedNames = verifiedFeatureNames()) {
  if (feature.status === STATUS.VERIFIED) {
    return verifiedNames.has(feature.verifiedBy ?? feature.name) ? STATUS.VERIFIED : STATUS.BUILT;
  }
  return /** @type {'verified'|'built'|'roadmap'} */ (feature.status);
}
