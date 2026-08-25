// Local knowledge base for the Security Advisor.
// Provides app-specific education content regardless of TIP connection.
// Organised by screen/topic so the advisor can give contextual answers.

import advisories from '../data/security-advisories.json';
import { FEATURE_CATEGORIES } from './featureCatalogue.js';

export const KNOWLEDGE_BASE = {
  wallet_basics: {
    title: 'Self-Custody Basics',
    entries: [
      {
        q: 'What is self-custody?',
        a: 'Self-custody means YOU hold the private keys to your crypto — not an exchange or a third party. Your seed phrase is your identity. Veyrnox never stores your keys on a server; they exist only on your device, encrypted in the vault.',
      },
      {
        q: 'What is a seed phrase?',
        a: 'A seed phrase (also called a recovery phrase) is a set of 12 or 24 words that can regenerate all your private keys. Anyone who has your seed phrase controls your funds. Never share it, never type it into a website, never store it in a screenshot or cloud note. Write it on paper and store it somewhere safe offline.',
      },
      {
        q: 'What happens if I lose my device?',
        a: 'If you lose your device, your funds are safe as long as you have your seed phrase. Import it into a new Veyrnox install to recover all your wallets. Without the seed phrase, your funds are permanently inaccessible — there is no recovery service.',
      },
      {
        q: 'How do I back up my wallet?',
        a: 'Your seed phrase is the ultimate backup — write it on paper and store it somewhere safe offline. Safety Plus subscribers can also export an encrypted backup file protected by their PIN; store it on a USB drive or secure location, not in cloud storage.',
      },
    ],
  },

  sending: {
    title: 'Sending Crypto Safely',
    entries: [
      {
        q: 'Is this address safe to send to?',
        a: 'Before sending, always verify: (1) Double-check the first and last 4 characters of the address. (2) If you\'ve sent to this address before, Veyrnox flags it as a known contact. (3) Watch for address poisoning — scammers send tiny amounts from lookalike addresses hoping you\'ll copy the wrong one from your history. (4) Never trust an address from a DM, email, or social media post without independent verification.',
      },
      {
        q: 'What is address poisoning?',
        a: 'Address poisoning is a scam where an attacker sends you a tiny transaction from an address that looks similar to one you use regularly (same first/last few characters). When you later copy an address from your transaction history, you might accidentally copy the attacker\'s address instead. Always verify the FULL address, not just the ends.',
      },
      {
        q: 'How do gas fees work?',
        a: 'Gas fees are payments to the network validators who process your transaction. They vary by network congestion — higher demand means higher fees. Veyrnox shows you estimated fees before you confirm. On EVM chains (Ethereum, Polygon, etc.), you can choose speed tiers: Slow (cheaper, slower), Standard, or Fast (more expensive, faster confirmation).',
      },
      {
        q: 'What should I check before signing?',
        a: 'Before signing any transaction: (1) Verify the recipient address carefully. (2) Confirm the amount and asset are correct. (3) Check the gas fee is reasonable. (4) For token approvals, understand what you\'re approving and for how much. (5) If connecting via WalletConnect, verify the dApp URL matches what you expect. Never rush a signature — legitimate requests don\'t expire in seconds.',
      },
      {
        q: 'What are common crypto scams?',
        a: 'Common scams include: (1) Phishing — fake websites or messages asking for your seed phrase. (2) Address poisoning — lookalike addresses in your history. (3) Fake airdrops — tokens that require you to visit a malicious site to "claim." (4) Approval scams — dApps requesting unlimited token spending allowance. (5) Social engineering — impersonators claiming to be support staff. Veyrnox will NEVER ask for your seed phrase.',
      },
      {
        q: 'How do I verify a recipient address?',
        a: 'To verify a recipient address: (1) Compare the full address character by character — don\'t rely on just the first and last few. (2) If copying from a message or website, paste into a plaintext editor first to check nothing was substituted by clipboard malware. (3) Use the Veyrnox address book to save verified contacts. (4) For large amounts, send a small test transaction first and confirm the recipient received it.',
      },
      {
        q: 'What is a token approval?',
        a: 'A token approval is a smart contract permission that lets a dApp spend your tokens on your behalf. Some dApps request "unlimited" approval — meaning they can move ANY amount of that token from your wallet without further signatures. Only approve what you need, revoke approvals you no longer use, and be especially cautious of approvals from unfamiliar dApps.',
      },
      {
        q: 'Can a transaction be reversed?',
        a: 'No. Blockchain transactions are irreversible once confirmed. There is no "undo" button, no customer service to call, and no chargeback mechanism. This is why verifying the recipient address and amount before signing is critical. Always double-check before you confirm.',
      },
      {
        q: 'What happens if I send to the wrong address?',
        a: 'If you send crypto to the wrong address, the funds are gone. Blockchain transactions cannot be reversed. If the address belongs to someone you know, you can ask them to send it back — but there is no technical mechanism to force a return. For large transfers, always send a small test amount first.',
      },
      {
        q: 'How do I choose the right fee tier?',
        a: 'Choose based on urgency: Slow is cheapest but may take minutes to hours. Standard balances cost and speed for most transactions. Fast is for time-sensitive transfers. During high network congestion, even "Fast" may be slow — check the estimated confirmation time Veyrnox shows. Note: on BNB testnet, "Slow" can underprice the minimum gas requirement, so use Standard or higher.',
      },
    ],
  },

  receiving: {
    title: 'Receiving Crypto',
    entries: [
      {
        q: 'Is it safe to share my address?',
        a: 'Your public address is safe to share — it\'s like a bank account number. People need it to send you crypto. However, be aware that sharing your address links your on-chain activity to your identity. For privacy, consider using different addresses for different purposes.',
      },
      {
        q: 'How do I verify a sender?',
        a: 'You can verify a sender by checking: (1) The sending address against known contacts. (2) The transaction on a block explorer for additional details. (3) Whether you were expecting this payment. Be cautious of unsolicited tokens — they may be part of a phishing scam designed to lure you to a malicious dApp.',
      },
      {
        q: 'What should I know about receiving crypto?',
        a: 'Key points: (1) Each blockchain has its own address format — never send Bitcoin to an Ethereum address or vice versa. (2) Transactions are irreversible once confirmed. (3) You don\'t need to keep the app open to receive; funds arrive at your address on the blockchain. (4) Veyrnox monitors your addresses and notifies you of incoming transactions.',
      },
      {
        q: 'Can someone steal my funds with my public address?',
        a: 'No. Your public address only allows people to VIEW your balance and SEND you crypto. They cannot withdraw or move your funds — that requires your private key (which is derived from your seed phrase and never leaves your device). Sharing your address is safe, though it does link your on-chain activity to your identity.',
      },
      {
        q: 'What are fake airdrop scams?',
        a: 'Fake airdrops are scam tokens sent to your address without your consent. They often have names like "Visit-website.com to claim" or impersonate legitimate projects. The goal is to lure you to a malicious website that asks you to connect your wallet and sign a transaction — which actually approves the scammer to drain your real tokens. Never interact with tokens you didn\'t expect to receive.',
      },
      {
        q: 'Do I need the app open to receive?',
        a: 'No. Crypto is sent to your blockchain address, not to the app. Funds arrive whether or not Veyrnox is open. When you next open the app, it scans the blockchain for new transactions and updates your balance. Veyrnox can also send you a notification when an incoming transaction is detected.',
      },
      {
        q: 'Can I use the same address for all chains?',
        a: 'EVM chains (Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB) share the same address format, so your EVM address works on all of them. However, Bitcoin and Solana use completely different address formats. Never send BTC to an EVM address or SOL to a BTC address — the funds will be permanently lost.',
      },
    ],
  },

  security: {
    title: 'Security Features',
    entries: [
      {
        q: 'How do I set up a strong PIN?',
        a: 'Your PIN protects access to your wallet on this device. Use at least 8 digits (the minimum enforced by Veyrnox). Avoid patterns like 123456789012 or repeated digits. Your PIN encrypts the vault using Argon2id key derivation with 192 MiB of memory — making brute-force attacks extremely expensive.',
      },
      {
        q: 'What does hardware key encryption do?',
        a: 'Hardware key encryption (KEK) uses your device\'s secure hardware (Secure Enclave on iOS, StrongBox/TEE on Android) to add an extra layer of encryption to your vault. Even if someone extracts your encrypted vault data, they cannot decrypt it without the hardware-bound key that never leaves the chip. This is automatic — Veyrnox enrolls it when you set up your wallet.',
      },
      {
        q: 'What is RASP?',
        a: 'RASP (Runtime Application Self-Protection) detects if your device has been tampered with — rooted, jailbroken, or running debugging tools. If tampering is detected, Veyrnox restricts sensitive operations (signing, WalletConnect) to protect your funds. This isn\'t about controlling your device; it\'s about ensuring the signing environment is trustworthy.',
      },
      {
        q: 'How does the vault work?',
        a: 'Your vault stores your encrypted seed and derived keys using AES-256-GCM encryption. The encryption key is derived from your PIN via Argon2id (192 MiB memory-hard KDF), optionally combined with a hardware-bound key (KEK). The vault never stores your PIN — it derives the decryption key each time you unlock. If the wrong PIN is entered, decryption fails; there\'s no "wrong password" oracle.',
      },
      {
        q: 'Can I change my PIN?',
        a: 'Yes. Go to Settings to change your PIN. You\'ll need to enter your current PIN first, then set a new one (minimum 8 digits). Changing your PIN re-encrypts the vault with the new key — your seed phrase and wallet addresses remain the same.',
      },
      {
        q: 'What is biometric authentication?',
        a: 'Biometric authentication (Face ID, Touch ID, fingerprint) provides a convenient way to unlock your wallet without entering your full PIN every time. In Veyrnox, biometric auth is always backed by a hardware-bound key — it\'s not just a simple "is fingerprint enrolled" check. The biometric unlocks a cryptographic key stored in your device\'s secure hardware.',
      },
      {
        q: 'How do I export my seed phrase?',
        a: 'Go to Settings and look for the seed phrase / recovery phrase option. You\'ll need to authenticate with your PIN. Write the words down on paper IN ORDER. Store the paper somewhere physically secure — a safe, a safety deposit box, NOT a photo or digital note. Never enter your seed phrase into any website or share it with anyone.',
      },
      {
        q: 'What data does Veyrnox collect?',
        a: 'Veyrnox collects minimal anonymous usage data (event types like "app opened" or "send completed") with a random device ID — no personal information, no addresses, no transaction amounts. You can opt out entirely at first launch or any time in Settings → Privacy. In deniability/demo mode, zero data is transmitted (I3 invariant).',
      },
      {
        q: 'What does fail-closed mean?',
        a: 'Fail-closed means that when something goes wrong — a security check errors out, a connection drops, or data is corrupted — Veyrnox DENIES the action rather than allowing it. Most apps fail-open (errors = allow). Veyrnox\'s design principle (I4) is the opposite: if the security check can\'t complete, the transaction is blocked. This prevents attackers from bypassing security by causing intentional errors.',
      },
      {
        q: 'What security checks happen before signing?',
        a: 'Before any signing operation, Veyrnox runs: (1) RASP check — is the device tampered with? (2) PIN/biometric re-authentication if required. (3) Spend-limit check — does this exceed your configured limit? (4) Threat intelligence screening — is the recipient address on sanctions lists or known scam databases? (5) Address validation — correct format for the target chain. All checks must pass; a failure in ANY one blocks the signature.',
      },
      {
        q: 'How does Veyrnox detect a rooted device?',
        a: 'RASP uses multiple detection layers: checking for root management apps (Magisk, SuperSU), verifying system partition integrity, detecting debugging tools (Frida), checking Play Integrity / App Attest attestation, and scanning for known tampering signatures. On Android, it also verifies the app\'s signing certificate matches the expected release certificate.',
      },
      {
        q: 'What is the threat intelligence platform?',
        a: 'The Threat Intelligence Platform (TIP) is Veyrnox\'s backend service that screens transaction addresses against sanctions lists (OFAC SDN), known scam databases, and a community-driven flywheel of threat signals. When you send crypto, TIP checks the recipient address and returns a verdict (allow/warn/block) before you sign.',
      },
      {
        q: 'How are sanctions lists checked?',
        a: 'Veyrnox\'s TIP ingests the OFAC SDN (Specially Designated Nationals) sanctions list daily and converts addresses to a fast-lookup format. When you enter a recipient address, it\'s checked against this list. A sanctions match results in an immediate BLOCK verdict — this is not overridable, as transacting with sanctioned addresses is illegal in most jurisdictions.',
      },
    ],
  },

  deniability: {
    title: 'Deniability Mode',
    entries: [
      {
        q: 'How does deniability mode work?',
        a: 'Deniability mode protects you if someone forces you to unlock your wallet (coercion). You can set up a separate "duress PIN" that unlocks a decoy wallet with a different balance. The attacker sees what looks like your real wallet, but your actual funds remain hidden. Veyrnox is designed so that an observer cannot tell whether deniability mode is active. Deniability features (duress PIN, stealth wallets, panic wipe) require a Safety Plus subscription.',
      },
      {
        q: 'What is a duress PIN?',
        a: 'A duress PIN is a second PIN that unlocks a decoy wallet instead of your real one. If someone physically forces you to open your wallet, entering the duress PIN shows them a separate wallet that looks real but contains different (or no) funds. Your real wallet remains hidden and inaccessible until you enter your real PIN.',
      },
      {
        q: 'Does deniability leave any traces?',
        a: 'Veyrnox is carefully designed to leave no traces that deniability mode exists or has been used. The decoy session makes zero backend calls (I3 invariant), writes nothing to shared storage, and the UI looks identical to the real wallet. Even inspecting localStorage or device storage should not reveal the existence of a hidden wallet.',
      },
      {
        q: 'How do I set up stealth wallets?',
        a: 'Stealth wallets are additional hidden wallets within your deniability setup. Go to the Deniability section in your settings to configure them. Each stealth wallet has its own address set and balance, completely separate from your main wallet and decoy wallet.',
      },
      {
        q: 'What is panic wipe?',
        a: 'Panic wipe instantly erases all wallet data from your device — vault, keys, settings, everything. It\'s a last-resort safety feature for extreme coercion scenarios. After a panic wipe, the app looks like a fresh install. Your funds are safe on the blockchain and recoverable with your seed phrase from another device.',
      },
      {
        q: 'Can someone detect I have a hidden wallet?',
        a: 'Veyrnox is designed so that no observer — whether looking at the screen, inspecting device storage, or monitoring network traffic — can determine whether a hidden wallet exists. The decoy session is visually identical to a real session, makes zero distinctive network calls, and leaves no storage artifacts that differ from a single-wallet install.',
      },
      {
        q: 'What happens after a panic wipe?',
        a: 'After a panic wipe, the app looks like it was just installed — no wallets, no settings, no history. Anyone inspecting the device sees a clean slate. Your funds remain safe on the blockchain at your addresses; nothing on-chain is affected by a device wipe.',
      },
      {
        q: 'How do I recover after a panic wipe?',
        a: 'After a panic wipe, reinstall Veyrnox (or use it on another device) and import your seed phrase. All your wallets and addresses will be regenerated from the seed. Transaction history will be rebuilt from on-chain data. Your PIN, deniability settings, and device-specific settings will need to be reconfigured.',
      },
      {
        q: 'What is the difference between decoy and stealth?',
        a: 'A decoy wallet is what opens when you enter the duress PIN — it\'s the wallet an attacker sees. Stealth wallets are additional hidden wallets beyond your main one. The decoy is designed to look convincing (some balance, some history); stealth wallets are where you can hold funds that are invisible even if someone discovers your main wallet exists.',
      },
      {
        q: 'Does deniability mode make any network calls?',
        a: 'No. This is the I3 invariant — the most critical deniability guarantee. When deniability mode is active, Veyrnox makes ZERO backend calls. No telemetry, no balance checks, no threat screening, no referral sync. An attacker monitoring network traffic sees nothing that distinguishes a decoy session from an offline real session.',
      },
    ],
  },

  walletconnect: {
    title: 'WalletConnect & dApps',
    entries: [
      {
        q: 'How do I verify a dApp is legitimate?',
        a: 'Before connecting: (1) Check the dApp URL carefully — phishing sites use similar-looking domains. (2) Verify the dApp is listed on official directories. (3) Check community feedback and audits. (4) Be wary of dApps shared via social media DMs. (5) Veyrnox shows you the requesting URL during WalletConnect pairing — always verify it matches what you expect.',
      },
      {
        q: 'What permissions am I granting?',
        a: 'When you connect via WalletConnect, you\'re granting the dApp permission to REQUEST signatures and transactions — but every request still requires your explicit approval in Veyrnox. You\'re not giving the dApp access to your keys. However, be cautious with token approval transactions — these grant smart contract spending permission on your tokens.',
      },
      {
        q: 'Can a dApp drain my wallet?',
        a: 'A dApp cannot directly access your funds through WalletConnect — every transaction requires your signature. However, if you sign a malicious token approval (granting unlimited spending), the dApp\'s smart contract could later move those tokens without further approval. Always check what you\'re signing, especially "approve" transactions, and revoke unused approvals.',
      },
      {
        q: 'How do sessions work?',
        a: 'WalletConnect sessions have an expiry time and are bound to a specific chain and address. Veyrnox enforces session limits and requires re-authentication for high-risk operations. You can disconnect any session at any time from the WalletConnect page. Sessions are automatically cleared on lock or panic wipe.',
      },
      {
        q: 'What is a token approval and why is it risky?',
        a: 'A token approval is an on-chain permission you grant to a smart contract, allowing it to move a specified amount of your tokens. The risk: many dApps request UNLIMITED approval, meaning the contract can move ALL of that token from your wallet at any time — even after you\'ve left the site. Only approve what you need, and regularly revoke old approvals.',
      },
      {
        q: 'How do I disconnect a dApp?',
        a: 'Go to the WalletConnect page in Veyrnox. You\'ll see all active sessions with their connected dApp names and URLs. Tap on any session and choose "Disconnect" to immediately revoke that dApp\'s ability to send you signing requests. Sessions are also automatically cleared when you lock the wallet or perform a panic wipe.',
      },
      {
        q: 'What does session expiry mean?',
        a: 'WalletConnect sessions have a maximum lifetime enforced by Veyrnox. After the session expires, the dApp must request a new connection — you\'ll see a fresh approval prompt. This limits the window during which a compromised dApp could send you malicious signing requests. Veyrnox enforces expiry even if the dApp doesn\'t.',
      },
      {
        q: 'What is typed data signing?',
        a: 'Typed data signing (EIP-712) is a structured way for dApps to request your signature on data that isn\'t a simple transaction — like an order on a DEX, a permit, or a governance vote. Veyrnox shows you the structured data before signing. Be cautious: a "Permit" signature can grant token spending rights without an on-chain approval transaction.',
      },
      {
        q: 'How does Veyrnox protect me from malicious dApps?',
        a: 'Multiple layers: (1) RASP gate on session approval — tampered devices can\'t connect. (2) Every signing request requires explicit approval with your PIN or biometrics. (3) Threat intelligence screens recipient addresses. (4) Gas cap prevents excessive fee manipulation. (5) Chain and address binding prevent cross-chain attacks. (6) Session expiry limits exposure time. (7) Step-up re-auth for high-value operations.',
      },
    ],
  },

  subscription: {
    title: 'Safety Plus',
    entries: [
      {
        q: 'What is Safety Plus?',
        // M-6 (audit 2026-08-03): this used to list "enhanced threat intelligence
        // screening" as a Safety Plus feature. The remote-screening toggle in the
        // send flow has no entitlement check of any kind — it is available on
        // every tier — so the claim described a gate that does not exist.
        a: 'Safety Plus is Veyrnox\'s optional premium tier: advanced security alerts and priority access to new security features. It\'s a monthly ($5.99) or annual ($49.99) subscription managed through your device\'s app store. Note that on-device and online threat screening are NOT behind it — both are free and opt-in for everyone.',
      },
      {
        q: 'Do I need Safety Plus to be secure?',
        a: 'No. Veyrnox\'s core security — hardware encryption, vault protection, and RASP — is available to all users, and so is transaction threat screening. Safety Plus unlocks deniability features (duress PIN, stealth wallets, panic wipe) and encrypted personal backup, plus advanced security alerts. The free tier is already significantly more secure than most wallets.',
      },
    ],
  },

  general: {
    title: 'General',
    entries: [
      {
        q: 'How do I keep my wallet safe?',
        a: 'Key practices: (1) Never share your seed phrase with anyone. (2) Use a strong PIN (8+ digits). (3) Enable hardware key encryption (automatic on supported devices). (4) Verify addresses carefully before sending. (5) Be skeptical of unsolicited messages about crypto. (6) Keep your device\'s OS updated. (7) Set up deniability mode if physical coercion is a concern. (8) Back up your seed phrase offline on paper.',
      },
      {
        q: 'What makes Veyrnox different?',
        a: 'Veyrnox is built around coercion resistance — protecting you not just from hackers, but from physical threats. Key differentiators: (1) Deniability mode with duress PINs. (2) Hardware-bound encryption (KEK) using your device\'s secure chip. (3) RASP tamper detection. (4) Fail-closed design — errors deny access rather than granting it. (5) No accounts, no server-side keys — true self-custody. (6) Built-in threat intelligence screening.',
      },
      {
        q: 'What blockchains does Veyrnox support?',
        a: 'Veyrnox supports 10 assets across multiple blockchains: ETH, MATIC (Polygon), ARB (Arbitrum), OP (Optimism), AVAX (Avalanche), BNB (BNB Chain), BTC (Bitcoin), SOL (Solana), USDC, and USDT. EVM chains share one address; BTC and SOL have their own derivation paths.',
      },
    ],
  },
};

export function findLocalAnswer(question) {
  const q = question.toLowerCase();
  /** @type {{ q: string, a: string } | null} */
  let bestMatch = null;
  let bestScore = 0;

  for (const topic of Object.values(KNOWLEDGE_BASE)) {
    for (const entry of topic.entries) {
      const keywords = entry.q.toLowerCase().split(/\s+/);
      const score = keywords.filter(w => w.length > 3 && q.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }
  }

  if (bestMatch && bestScore >= 2) return bestMatch.a;
  return null;
}

export function getKnowledgeForScreen(screen) {
  const mapping = {
    dashboard: ['wallet_basics', 'general', 'security'],
    send: ['sending', 'security', 'general'],
    receive: ['receiving', 'general'],
    settings: ['security', 'wallet_basics', 'general'],
    walletconnect: ['walletconnect', 'security'],
    deniability: ['deniability', 'security'],
    subscription: ['subscription', 'general'],
    security: ['security', 'wallet_basics'],
    general: ['general', 'wallet_basics', 'security'],
  };

  const topics = mapping[screen] || mapping.general;
  return topics.map(key => KNOWLEDGE_BASE[key]).filter(Boolean);
}

export function getFollowUpQuestions(asked, screen) {
  const allQuestions = [];
  for (const topic of Object.values(KNOWLEDGE_BASE)) {
    for (const entry of topic.entries) {
      allQuestions.push(entry.q);
    }
  }

  const askedLower = new Set(asked.map(q => q.toLowerCase()));
  const unasked = allQuestions.filter(q => !askedLower.has(q.toLowerCase()));

  const screenTopics = {
    send: ['sending', 'security'],
    receive: ['receiving', 'security'],
    settings: ['security', 'wallet_basics'],
    walletconnect: ['walletconnect', 'security'],
    deniability: ['deniability', 'security'],
    dashboard: ['wallet_basics', 'general', 'security'],
  };
  const preferred = screenTopics[screen] || ['general', 'wallet_basics', 'security'];
  const preferredEntries = new Set();
  for (const key of preferred) {
    const topic = KNOWLEDGE_BASE[key];
    if (topic) topic.entries.forEach(e => preferredEntries.add(e.q));
  }

  const sorted = unasked.sort((a, b) => {
    const aP = preferredEntries.has(a) ? 0 : 1;
    const bP = preferredEntries.has(b) ? 0 : 1;
    return aP - bP;
  });

  return sorted.slice(0, 3);
}

export function buildAdvisoriesBlock(data = advisories, max = 15) {
  const entries = Array.isArray(data?.entries) ? data.entries.slice(0, max) : [];
  if (entries.length === 0) return '';
  const lines = [`## Recent Vendor Security Advisories (last ${data.window_days ?? 90}d, CVSS >= ${data.cvss_floor ?? 7.0})`];
  lines.push(`Source: NVD, refreshed ${data.generated ?? 'unknown'}. Use these when the user asks about hardware wallets, browser wallets, or WalletConnect security.`);
  lines.push('');
  for (const e of entries) {
    const sev = e.severity ? ` ${e.severity}` : '';
    lines.push(`- [${e.vendor}] ${e.cve} (${e.published ?? '?'}, CVSS ${e.cvss}${sev}): ${e.summary}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function buildAdvisorSystemContext(screen) {
  const topics = getKnowledgeForScreen(screen);
  const lines = [];
  for (const topic of topics) {
    lines.push(`## ${topic.title}`);
    for (const entry of topic.entries) {
      lines.push(`Q: ${entry.q}`);
      lines.push(`A: ${entry.a}`);
      lines.push('');
    }
  }
  const catalogueBlock = buildFeatureCatalogueDigest();
  if (catalogueBlock) lines.push(catalogueBlock);
  const pagesBlock = buildAppPagesDigest();
  if (pagesBlock) lines.push(pagesBlock);
  const advisoriesBlock = buildAdvisoriesBlock();
  if (advisoriesBlock) lines.push(advisoriesBlock);
  return lines.join('\n');
}

// Full feature catalogue as a compact digest. One line per feature:
// "- Feature Name [status]: summary". Grouped by category. Fits within the
// 32 KB system-prompt cap even at ~50 features. Sourced from the same
// featureCatalogue.js that Documentation renders, so the Advisor never drifts
// from what the user can see on /docs. Long explanations are intentionally
// dropped — the summary is what a user needs; deep detail belongs on the page.
export function buildFeatureCatalogueDigest() {
  const lines = ['## Veyrnox Feature Catalogue (from /docs)'];
  for (const cat of FEATURE_CATEGORIES) {
    lines.push('');
    lines.push(`### ${cat.category}`);
    for (const f of cat.features) {
      const status = f.status === 'roadmap' ? 'Roadmap' : 'Live';
      lines.push(`- ${f.name} [${status}]: ${f.summary}`);
    }
  }
  return lines.join('\n');
}

// User-facing app routes with a one-line purpose per page. Kept as a small
// hardcoded list rather than parsing App.jsx — the routing table has 89
// entries including redirects and auth-shell paths that a user never asks
// the Advisor about. Keep this in step with App.jsx when a NEW user-facing
// page ships (Documentation.jsx quick-links section is the canonical list).
export const APP_PAGES = [
  { path: '/', label: 'Dashboard — portfolio overview, balances, quick actions' },
  { path: '/send', label: 'Send Crypto — build, sign, broadcast transfers' },
  { path: '/receive', label: 'Receive Crypto — per-chain address + QR' },
  { path: '/buy', label: 'Buy Crypto — on-ramp via Transak' },
  { path: '/tx-history', label: 'Transaction History — per-chain history (read-only)' },
  { path: '/token-approvals', label: 'Token Approvals — inspect and revoke ERC-20 allowances' },
  { path: '/security', label: 'Security Center — security controls and status' },
  { path: '/security-dashboard', label: 'Security Dashboard — signal summary and risk posture' },
  { path: '/rasp-security', label: 'Runtime Protection — automation, root/jailbreak, tamper detection' },
  { path: '/duress-pin', label: 'Duress PIN — set a decoy-wallet PIN for coercion' },
  { path: '/stealth-wallets', label: 'Stealth Wallets — deniable hidden wallets' },
  { path: '/panic-wipe', label: 'Panic Wipe — irreversibly destroy local key material' },
  { path: '/personal-backup', label: 'Personal Backup — encrypt-then-export vault file' },
  { path: '/wallet-seed-qr', label: 'Wallet Seed QR — reveal / scan encrypted seed QR' },
  { path: '/wallet-access', label: 'Account Access & Recovery — change password, re-import seed' },
  { path: '/hardware-wallet', label: 'Hardware Wallet — Trezor via WebUSB (Chrome/Edge)' },
  { path: '/biometric-auth', label: 'Biometric Unlock — Face ID / Touch ID / fingerprint gate' },
  { path: '/session-manager', label: 'Session Manager — view and revoke device sessions' },
  { path: '/login-activity', label: 'Login Activity — previous unlock history' },
  { path: '/audit-log', label: 'Audit Log — opt-in encrypted local activity log' },
  { path: '/address-book', label: 'Address Book — labelled trusted addresses' },
  { path: '/address-checker', label: 'Suspicious Address Checker — local blocklist screening' },
  { path: '/anomaly-detection', label: 'Anomaly Detection — deviations from your history' },
  { path: '/fraud', label: 'Fraud Detection — drainer and approve-then-transfer patterns' },
  { path: '/risk-score', label: 'Portfolio Risk Score — rule-based, on-device' },
  { path: '/dapp-alerts', label: 'dApp Security Alerts — WalletConnect risk verdicts' },
  { path: '/walletconnect', label: 'WalletConnect — connect to dApps (v2 transport)' },
  { path: '/crypto-signing', label: 'Message Signing — proof-of-ownership' },
  { path: '/plans', label: 'Subscription — Free and Safety Plus plans' },
  { path: '/safety-plus', label: 'Safety Plus — premium tier feature list' },
  { path: '/referrals', label: 'Referral Tracker — share your code, earn discounts' },
  { path: '/notifications', label: 'Notification Centre — alerts and reminders' },
  { path: '/alerts', label: 'Price Alerts — threshold-based (advisory only)' },
  { path: '/price-charts', label: 'Price Charts — OHLCV candlesticks (opt-in prices)' },
  { path: '/watchlist', label: 'Watchlist — track assets you do not hold' },
  { path: '/analytics', label: 'Analytics — portfolio analytics' },
  { path: '/advanced-analytics', label: 'Advanced Analytics — deeper portfolio breakdowns' },
  { path: '/onchain', label: 'On-Chain Analytics — inbound/outbound activity' },
  { path: '/net-worth', label: 'Net-Worth Tracker — aggregate net worth' },
  { path: '/fee-analytics', label: 'Fee Analytics — network fees paid (native units)' },
  { path: '/tax', label: 'Tax Report — raw CSV export (not tax advice)' },
  { path: '/spending', label: 'Spending Patterns — outbound activity by recipient' },
  { path: '/budget', label: 'Spending Limits — per-tx and daily rules' },
  { path: '/recurring', label: 'Recurring Payments — reminder schedules' },
  { path: '/invoices', label: 'Invoice Generator — request-for-payment invoices' },
  { path: '/savings', label: 'Savings Goals — self-tracking savings targets' },
  { path: '/nft', label: 'NFT Gallery — display-only owned NFTs' },
  { path: '/nft-multichain', label: 'Multi-Chain NFT — cross-chain NFT display' },
  { path: '/voice-commands', label: 'Voice Commands — hands-free navigation (read-only)' },
  { path: '/settings', label: 'Settings — preferences, security, auto-lock' },
  { path: '/what-this-protects', label: 'What This Protects — plain-language threat model' },
  { path: '/docs', label: 'Documentation — full feature catalogue and workflows' },
  { path: '/terms-legal', label: 'Terms & Legal — TOS and privacy' },
  { path: '/demo', label: 'Demo Mode — browse without a backend or funded wallet' },
];

export function buildAppPagesDigest() {
  const lines = ['## Veyrnox App Pages'];
  for (const p of APP_PAGES) {
    lines.push(`- ${p.path} — ${p.label}`);
  }
  return lines.join('\n');
}
