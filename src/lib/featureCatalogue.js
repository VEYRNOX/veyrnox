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
//   verified — exercised against a REAL on-chain testnet txid. This is the ONLY
//              state that can never be asserted by inspection: it requires a txid
//              entry in docs/verified-evidence.json. Code-complete, passing tests,
//              and clean review are NOT verification (CLAUDE.md: "Verify, don't
//              assert"). resolveStatus() downgrades any hand-typed `verified` with
//              no evidence entry back to `built`.
//   built    — code-complete and working in the testnet/provisional build, but
//              not yet exercised on-chain. "Code-ready ≠ verified."
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
        explanation: 'Generate a non-custodial hierarchical-deterministic wallet from a BIP-39 seed phrase, with multiple accounts derived from a single seed. Keys are created and held locally — Veyrnox never custodies them.',
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
        status: 'built',
        summary: 'Native coin transfers (testnet)',
        explanation: 'Build, sign, and broadcast native-coin transactions across supported chains. Every transfer is locally signed and requires the user’s authentication; address-poisoning screening runs before confirmation. Code-complete; an on-chain testnet txid would move this to verified.',
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
        explanation: 'Six EVM networks share one secp256k1 derivation and signing stack: Ethereum, Polygon, Arbitrum, Optimism, Avalanche, and BNB Chain. Testnet today; mainnet is gated until independent audit.',
      },
      {
        name: 'Bitcoin',
        status: 'built',
        summary: 'BIP-84 native-segwit stack (testnet)',
        explanation: 'A separate Bitcoin stack with BIP-84 derivation, UTXO coin-selection and change handling, and fee estimation against an Esplora provider. Testnet only; mainnet gated pending its own audit.',
      },
      {
        name: 'Solana',
        status: 'built',
        summary: 'ed25519 / SLIP-0010 stack (devnet)',
        explanation: 'A separate Solana stack with ed25519 / SLIP-0010 derivation, balance reads, and lamport transfers including blockhash-expiry and rent handling. Devnet-first; mainnet gated pending its own audit.',
      },
      {
        name: 'ERC-20 Tokens',
        status: 'built',
        summary: 'USDC and USDT via the shared token path',
        explanation: 'ERC-20 tokens (USDC, USDT) ride the audited token path with contract-read decimals and balance reads. Token sends reuse the native EVM signing flow.',
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
        summary: 'FIDO2 / WebAuthn unlock gate',
        explanation: 'Unlock the app with a platform passkey (FIDO2 / WebAuthn). This is an unlock gate parallel to the password — it never holds or replaces the wallet’s keys, and a password escape hatch remains.',
      },
      {
        name: 'Biometric Unlock',
        status: 'built',
        summary: 'Face ID / Touch ID unlock gate',
        explanation: 'Use device biometrics as an app-layer unlock gate where the platform supports it, falling back to passkey or password. Biometrics gate access; they do not custody keys.',
      },
      {
        name: 'Native Secure Storage',
        status: 'roadmap',
        summary: 'Secure Enclave / Android Keystore hardening',
        explanation: 'OS-enforced key storage via Secure Enclave / Android Keystore. Partially in place and provisional pending audit; full hardening is on the roadmap.',
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
        summary: 'Ledger WebHID address read + Trezor Safe 5 guide',
        explanation: 'Built (/hardware-wallet): Ledger tab uses browser WebHID to read the first ETH address (m/44\’/60\’/0\’/0/0) directly from the device — no third party, Chrome only. The read address auto-fills a watch-only wallet import. Trezor Safe 5 tab provides a platform-aware setup guide (Android full / iPhone watch-only / desktop) with honest iOS limitation note (Safe 5 has no Bluetooth; Safe 7 does). Cold-key transaction signing is post-audit scope.',
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
        status: 'roadmap',
        summary: 'Threat-intel reputation checks',
        explanation: 'Screen counterparties against a threat-intel / scam-reputation feed. On the roadmap; today’s checker uses only local heuristics, not a live feed.',
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
        summary: 'Decoy wallet under coercion',
        explanation: 'A separate duress PIN unlocks a plausible decoy wallet instead of the real one, providing deniability if a user is coerced into unlocking. The decoy is a genuine, separately-encrypted vault.',
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
        summary: 'Irreversible local key-material destruction',
        explanation: 'An emergency wipe irreversibly destroys local key material — available both as a panic/wipe PIN at unlock and as a guarded in-app action. Destroys local data only; on-chain funds are unaffected.',
      },
      {
        name: 'Crypto Will / Inheritance',
        status: 'roadmap',
        summary: 'Self-custody inheritance (no custodial backstop)',
        explanation: 'Inheritance built on secret-sharing plus a dead-man’s-switch — Veyrnox never custodies keys or adjudicates death. Specced, not yet built; needs audit and legal input.',
      },
      {
        name: 'Encrypted Cloud Backup',
        status: 'built',
        summary: 'Ciphertext-only vault backup',
        explanation: 'Built (/cloud-backup, UNAUDITED-PROVISIONAL). Client-side encrypt-then-export: the vault is serialised, sealed with a user-supplied password using strong on-device encryption, and written to an opaque file. Restore decrypts the file locally before any key material is loaded. Plaintext keys never leave the device.',
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
        explanation: 'Built (UNAUDITED-PROVISIONAL). Browser-level detection active: navigator.webdriver + legacy automation fingerprints → HOOKED → signing blocked. Normal browser → CLEAN → ALLOW (no friction). Degradation policy (condition → tier) and I3 response-symmetry guard built + tested in src/rasp/. Wired to the send path via detect(browserProbeSource) → degrade() → presignGate(). OS-level probes (root/jailbreak/tamper) require a native Capacitor plugin — audit-gated pending real-device verification.',
      },
      {
        name: 'Audit Log',
        status: 'built',
        summary: 'Optional encrypted local activity record',
        explanation: 'Built (/audit-log). Opt-in, off by default. Stores at most 100 entries ({ type, ts } ONLY — no amounts, addresses, or wallet identity) as an encrypted blob in the primary vault store (quaternary key). Hard allowlist of 3 event types; hard denylist of 7 sensitive terms. No-op in decoy/hidden sessions; panic wipe destroys it. UNAUDITED-PROVISIONAL.',
      },
      {
        name: 'Risk Limits / Risk Scoring',
        status: 'built',
        summary: 'Rule-based, transparent transaction risk scoring',
        explanation: 'A transparent, rule-based risk score over a pending transaction from on-device signals (fresh recipient, unlimited approval, fresh-spender approval, address poisoning, ENS mismatch, dust input, calldata mismatch, value anomaly) combined into a level. Built (unaudited-provisional) in src/risk/; rule-based and explainable, never an opaque custodial trust score.',
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
        explanation: 'Stateless native-unit fee analytics (Slice 1): totals the network fees the active set actually paid, computed on-device from chain history via the same on-demand fetch the history view uses — no fiat, no persistence, no new egress. EVM has no in-app indexer so it fails honest to "unavailable". Built and fixture-tested; UNAUDITED-PROVISIONAL — not verified against a real on-chain txid. Fiat cost-basis P&L is a separate, audit-gated slice.',
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
        explanation: 'Built (/nft). Display-only NFT portfolio using on-device records. Viewing only — Veyrnox does not mint, fractionalise, or run an NFT marketplace. Add/remove NFT records stored locally via base44 entities.',
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
        name: 'Payment Links',
        status: 'built',
        summary: 'Shareable request-to-pay links / QR',
        explanation: 'Built (/payment-links). Generate, store, and share request-to-pay records (amount, asset, note) with copy-to-clipboard. Self-initiated request only — no payment processing or custodial collection. Records stored locally via base44 entities.',
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
        status: 'roadmap',
        summary: 'Privacy-preserving referrals (if buildable serverlessly)',
        explanation: 'Public ranking and public-profile features were cut on principle — a wallet must not publish who holds what. Referrals are kept only as a future option, and only if they can work without a server that links referrer and referee.',
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
        name: 'WalletConnect / dApp Connector',
        status: 'roadmap',
        summary: 'Connect to dApps via WalletConnect',
        explanation: 'Connect to decentralised apps via WalletConnect. High-risk and post-audit only; specced, not yet built. (It is a gateway to swap/DeFi, which themselves stay out of scope.)',
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
        name: 'Desktop Web App',
        status: 'built',
        summary: 'Runs in the browser',
        explanation: 'The wallet runs as a desktop web app today.',
      },
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
        explanation: 'Built (/voice-commands). Web Speech API voice navigation: recognises a fixed command set (go to dashboard, check balance, etc.) and navigates the app. Read-only; never initiates or signs transactions by voice.',
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
 * feature has a txid entry in the evidence file — a hand-typed `verified` with no
 * evidence falls back to `built`, so verified is impossible to assert by
 * inspection. `built`/`roadmap` pass through as catalogued.
 * @param {{name:string, status:string}} feature
 * @param {Set<string>} [verifiedNames] - injectable for tests; defaults to the file
 * @returns {'verified'|'built'|'roadmap'}
 */
export function resolveStatus(feature, verifiedNames = verifiedFeatureNames()) {
  if (feature.status === STATUS.VERIFIED) {
    return verifiedNames.has(feature.name) ? STATUS.VERIFIED : STATUS.BUILT;
  }
  return /** @type {'verified'|'built'|'roadmap'} */ (feature.status);
}
