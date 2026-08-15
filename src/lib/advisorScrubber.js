// src/lib/advisorScrubber.js
//
// Codex P1 2026-08-15: client-side scrubber that strips seed phrases, private
// keys, PINs, and other vault-adjacent secrets from Security Advisor chat
// messages BEFORE they leave the device. The system prompt in SecurityAdvisor
// tells the model "Never reveal seed phrases, private keys, or PINs" — that
// is a hint to the LLM, NOT a control over the SECRET reaching the wire. The
// only place to stop the outbound leak is here, where the message body is
// composed. Pattern-matching only — errors on the side of over-redaction:
// a false positive costs an unhelpful "REDACTED" pointer, a false negative
// costs a seed. See tests in src/lib/__tests__/advisorScrubber.test.js.
//
// Uses the SAME BIP-39 English wordlist that mnemonic validation uses, so a
// caller pasting real English mnemonic words WILL be caught — the check is
// "N in-a-row wordlist words". We deliberately do NOT run @scure/bip39
// validateMnemonic (which would need a valid checksum) — an attacker/user can
// paste an INVALID-checksum mnemonic that still uniquely names a wallet, and
// leaking that upstream still leaks intent.

import { wordlist } from '@scure/bip39/wordlists/english';

const REDACTED = '[REDACTED — never paste seed phrases, private keys, or PINs into the Advisor. If you already did, treat that credential as compromised and rotate.]';

const WORDS = new Set(wordlist);

// Match any run of 4+ contiguous BIP-39 words. 12 and 24 are the canonical
// mnemonic lengths, but any 4-in-a-row is suspicious enough to redact — the
// concise-attack cost is negligible compared to the false-negative cost of
// a shorter run slipping through.
function scrubMnemonicRuns(input) {
  const tokens = input.split(/(\s+|[.,;:!?()])/); // preserve separators
  let out = '';
  let runStart = -1;
  let runLen = 0;

  const flushRun = (endExclusive) => {
    if (runLen >= 4) {
      // Replace tokens[runStart..endExclusive) with the sentinel.
      out = out.slice(0, out.length - tokens.slice(runStart, endExclusive).join('').length);
      out += REDACTED;
    }
    runStart = -1;
    runLen = 0;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const stripped = tok.toLowerCase().replace(/[^a-z]/g, '');
    if (stripped && WORDS.has(stripped)) {
      if (runStart === -1) runStart = i;
      runLen += 1;
      out += tok;
    } else if (/^\s+$/.test(tok) || /^[.,;:!?()]$/.test(tok)) {
      // separator — keep the run open
      out += tok;
    } else {
      flushRun(i);
      out += tok;
    }
  }
  flushRun(tokens.length);
  return out;
}

// 0x-prefixed 64-hex private key (secp256k1 / EVM). Case-insensitive.
const EVM_PRIVATE_KEY_RE = /\b0x[0-9a-fA-F]{64}\b/g;

// Bare 64-hex private key (no 0x prefix) — covers the copy-from-etherscan-
// like flow where a user pastes only the hex. Only redact if the string
// looks like a hex word (bounded), otherwise this false-positives on any
// long hex-only identifier.
const BARE_HEX_KEY_RE = /(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])/g;

// PIN-shaped digit runs: 4-16 digits, standalone. Requires word boundaries
// on both sides so we don't nuke every phone number or amount. The scoped
// caller (Advisor chat) rarely has legitimate long digit runs anyway.
const PIN_RE = /(?<!\d)\d{4,16}(?!\d)/g;

/**
 * Scrub secrets from a chat message before it leaves the device.
 * @param {unknown} input
 * @returns {string}
 */
export function scrubSecrets(input) {
  if (typeof input !== 'string') return typeof input === 'undefined' ? '' : String(input ?? '');
  if (input.length === 0) return input;

  let out = scrubMnemonicRuns(input);
  out = out.replace(EVM_PRIVATE_KEY_RE, REDACTED);
  out = out.replace(BARE_HEX_KEY_RE, REDACTED);
  out = out.replace(PIN_RE, REDACTED);
  return out;
}

// Exported for tests.
export const __test__ = { REDACTED, EVM_PRIVATE_KEY_RE, BARE_HEX_KEY_RE, PIN_RE };
