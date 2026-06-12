# Cinematic Welcome Screen — Design

**Date:** 2026-06-11
**Status:** Approved (design); pending implementation plan
**Surface:** First-run app entry, *before* the 6-digit PIN setup
**Files:** `src/components/WalletEntry.jsx`, `src/lib/onboardingEntry.js`, `src/lib/__tests__/onboardingEntry.test.js`

## Goal

Give a fresh user a calm, cinematic, on-brand VEYRNOX welcome screen as the very
first thing they see — *before* the 6-digit PIN setup — using Framer Motion for
entrance/interaction animation and the project's design-system visual language.

Today a fresh device (no vault) routes straight to the PIN pad
(`resolveOnboardingEntry({hasVault:false}) === 'pin-create'`). This inserts a
branded welcome ahead of that step.

## Honesty constraint (non-negotiable, per CLAUDE.md)

The original mockup that inspired this work contained claims that violate the
project's hard rules. They are explicitly **rejected**:

- ❌ "Mainnet" → the project is **testnet-only** (`ALLOW_MAINNET = false`).
- ❌ "Partial-custody crypto" → it is **self-custody**.
- ❌ "Cinematic security", shipped-"AI security assistant", "Live multi-chain
  balances" as finished features → marketing fluff / overclaims.

This screen ships a **visual** upgrade only. All copy stays honest: testnet,
self-custody, provisional/unaudited framing intact.

## Final scope (locked with user)

- **No** "Create New Vault" button on this screen.
- **No** "Import Recovery Phrase" button on this screen.
- **No** "Try Demo Mode" button.
- The create-vs-import choice is **unchanged** and still happens later, in the
  existing post-PIN Phase-2 card (`view === 'choose'` with `hasPendingPin`).

The welcome screen is a pure branded welcome with a **single** continue action.

## Flow

```
Fresh device → [ VEYRNOX welcome ] → Choose 6-digit PIN → Confirm → (post-PIN) Create or Import → Dashboard
                  hero + "Get Started"   ↑ existing flow, entirely untouched
```

- **Returning user** (vault exists): unchanged — still lands on `unlock`.
- **Back** from `pin-create` returns to `welcome` (instead of the old pre-PIN
  intro card).

## Screen contents

- `VeyrnoxLogo` (size ~64) + `VeyrnoxWordmark`, with a soft pulsing teal glow
  behind the mark.
- Tagline: *"Self-custody, coercion-resistant. Your keys never leave this device."*
- Honest feature bullets (icon + label):
  - Biometric + PIN unlock
  - Pre-sign screening
  - Multi-chain receive & balances
  - On-device encrypted vault
- One primary button: **"Get Started"** → proceeds to `pin-create`.
- Footer line: *"v1.0 · Testnet beta · keys stay on-device."*

## Visual & motion

- Design system: calm near-black gradient surface (`#050608 → #1D222B`), single
  teal accent (`#4ADAC2`), Schibsted Grotesk for prose. Mobile-first (matches the
  reference), scales up cleanly to desktop.
- Framer Motion (already a dependency, `^11`):
  - Staggered entrance: logo → wordmark → tagline → feature bullets → button.
  - Gentle spring on the primary button press/hover.
  - **`prefers-reduced-motion`**: all entrance/looping animation collapses to an
    instant, static render (accessibility — important for a security app).

## Code changes (surgical)

1. **`src/lib/onboardingEntry.js`** — `resolveOnboardingEntry({hasVault:false})`
   returns `'welcome'` instead of `'pin-create'`. Returning users (`hasVault:true`)
   still get `'unlock'`. The security invariant is preserved and re-documented:
   *a no-vault device NEVER lands on a dashboard/explore view* — `'welcome'` is a
   branding screen, not a dashboard.
2. **`src/lib/__tests__/onboardingEntry.test.js`** — updated via TDD:
   - fresh device → `'welcome'`
   - `'welcome'` is not `'choose'` / `'explore'` / any dashboard view
   - existing vault → `'unlock'` (unchanged)
3. **`src/components/WalletEntry.jsx`**:
   - New `view === 'welcome'` branch rendering the hero (a module-level component,
     consistent with `EntryShell`/`BiometricOffer`, so input focus / remount rules
     hold).
   - `welcome`'s "Get Started" → `setView('pin-create')` (+ resets the PIN sub-state
     exactly as the current fresh-mount path does).
   - `pin-create`'s Back button target changes from the old intro to `'welcome'`.

**No security/crypto code is touched.** No `WalletProvider` method signatures
change. This is a presentation + routing-landing change only.

## Out of scope

- `src/pages/LandingPage.jsx` (the marketing page) — untouched.
- Any change to create/import/PIN/biometric logic.
- Pulling components live from 21st.dev (no network/registry access in this env);
  the implementation follows modern 21st.dev composition patterns by hand using
  the existing shadcn `Button` primitive + Framer Motion.

## Testing

- Unit: `onboardingEntry.test.js` updated and green.
- Manual (preview): clear demo (`/?demo=0`) + fresh vault → confirm the sequence
  is **Welcome → Get Started → Choose PIN → Confirm PIN → (post-PIN) Create/Import**,
  Back from PIN returns to Welcome, returning-user unlock is unaffected, and
  reduced-motion renders statically. No console errors.
