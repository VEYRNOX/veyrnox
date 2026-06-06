---
name: veyrnox-design-system
description: >
  Use whenever building, editing, or styling any Veyrnox UI — screens, components,
  layouts, CSS, React/Tailwind. Applies the Veyrnox visual design language (color
  tokens, type system, component patterns, deniability rules) so output matches the
  product's "calm, precise, deniable" aesthetic instead of generic styling. Triggers
  on: building a screen/component, styling UI, "make it look like Veyrnox", onboarding/
  send/dashboard UI work, any frontend change to the wallet.
---

# Veyrnox design system

## Voice
Calm, precise, built to lose nothing under pressure. A vault, not a casino.

## Four principles (apply to every screen)
1. **Calm over flashy.** Near-black surfaces, ONE restrained accent, generous space.
   Trust is signalled by composure — no gradients-as-decoration, no glow, no hype.
2. **Mono for truth.** Every *verifiable* value — addresses, amounts, fees, chain IDs,
   hashes — is set in monospace and visually separated from human prose. Prose is sans.
3. **Deniability by default.** Never render a list, count, badge, or hint of how many
   wallets exist. The decoy must be visually indistinguishable from the real wallet.
   No "you have N wallets", no hidden-wallet indicator, ever.
4. **Plain-language risk.** Risky sends get ONE honest sentence before signing
   (fresh recipient, unlimited approval, poisoning) — not a wall of warnings.

## Color tokens (dark, near-black, one signal accent)
- `--bg-base: #050608`   (app background)
- `--surface-1: #08090C`
- `--surface-3: #101319`
- `--border / raised: #1D222B`
- `--accent: #4ADAC2`     (teal — the single accent; also "Verified")
- `--caution: #E7B14C`    (amber — caution)
- `--risk: #F06A5A`       (coral/red — risk, destructive)
- `--info: #6FA8FF`       (blue — informational)

Use the accent sparingly — primary action, verified state. Never more than one accent
hue competing on a screen. Status colors map 1:1 to meaning above; don't repurpose them.

## Typography (the sans / mono split)
- **Schibsted Grotesk** — the human layer: headlines, labels, all prose. Sentence case,
  calm, legible. (Fallback: system sans / Inter.)
- **IBM Plex Mono** — machine-truth: addresses, amounts, fees, hashes, chain IDs.
  Anything the user must verify character-by-character. (Fallback: ui-monospace.)
- Rule: if a value is verifiable on-chain, it is mono. If it's language, it's sans.
  Example: prose "Send crypto" (sans) vs "2.4019 ETH" / "0x8F3a…b9c4" (mono).

## Component patterns
- **Buttons:** primary = accent fill, calm; secondary = surface with border; destructive
  ("Sign anyway") = risk color, and only after a plain-language warning.
- **Address display:** mono, truncated middle (`0x8F3a…b9c4`), with character-by-character
  verification affordance for fresh recipients.
- **Risk chips:** "Fresh recipient", "Unlimited approval", "ENS verified" — small, one
  color from the token set, paired with a one-sentence explanation.
- **Balances:** honest figures only — never inflated demo numbers. Mono for the amount,
  sans for the asset name.

## Dashboard pattern
Total balance (mono), hardware-backed status, quick Send/Receive(/Swap), clean asset list
(asset name in sans, holdings + fiat in mono). No demo/placeholder balances in real mode.

## Deniability rules (hard constraints — these are security, not style)
- No UI element may reveal how many wallets/seeds exist.
- Real and decoy wallets are structurally identical in the UI — same layout, same chrome.
- No "hidden wallet" toggle, count, or badge anywhere.
- The decoy looks like a fully-functional, modestly-funded everyday wallet.

## What to avoid
Casino aesthetics, multiple competing accents, decorative gradients/glow, inflated demo
numbers, mono for prose or sans for verifiable values, any hint of multi-wallet existence.
