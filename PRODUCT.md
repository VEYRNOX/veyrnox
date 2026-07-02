# Product

## Register

product

## Users

Self-custody crypto wallet users who value privacy, control, and coercion resistance. Primary context: Web browsers (desktop and mobile) and native iOS/Android apps via Capacitor. Users need to quickly verify balances, initiate sends, and authorize transactions—often under stress or in unfamiliar environments.

## Product Purpose

Veyrnox is a self-custody, coercion-resistant crypto wallet. The seed is the identity; the app never holds keys server-side. It enables users to fully control their digital assets across multiple blockchains (EVM, Bitcoin, Solana) with hardware-backed key derivation and biometric authentication on native platforms. The goal is to provide institutional-grade security with consumer-friendly UX.

## Brand Personality

**Calm, trustworthy, restrained.** The app's design reflects security and control, not flashiness. Users are managing financial assets; the interface gets out of the way and lets them focus on the transaction at hand. Voice is honest and plain-language; risk is never sugar-coated.

Three words: **Secure. Clear. Honest.**

Emotional goals: confidence (users trust they control their assets), clarity (every action is unambiguous), calm (no artificial urgency or dark patterns).

## Anti-references

- Crypto casino UX (animated charts, FOMO-driven copy, "get rich quick" tone)
- SaaS dashboard bloat (too many metrics, decorative elements, needless complexity)
- Dark-by-default assumption (legitimate users need light mode; theme choice is user's)
- Fake security theater (misleading "verified" badges without real attestation)
- Mobile-as-afterthought design (web-first, then shoehorned to mobile)

## Design Principles

1. **Fail honest, fail closed** — When in doubt, disable a feature or surface the risk plainly rather than shipping a half-baked alternative. No fake security controls.
2. **Verify, don't assert** — An asset/feature is "verified" ONLY after a real on-chain transaction. Tests passing or code review are not verification.
3. **Mobile-first, theme-resilient** — Default to mobile constraints; both light and dark modes must be readable and functional (not an afterthought).
4. **Semantic color + icons** — Risk, caution, and success signals always pair text and icons. Never rely on color alone.
5. **Deniability by default** — The app reveals as little as possible about balances, wallet count, or transaction history unless the user explicitly enables logging/analytics.

## Accessibility & Inclusion

- **WCAG AA minimum** (4.5:1 contrast for body text, 3:1 for large text)
- **44px minimum tap targets** across all interactive elements
- **Theme support** (both light and dark modes must pass contrast and readability)
- **Reduced motion** — All animations have no-motion fallbacks via `@media (prefers-reduced-motion: reduce)`
- **Keyboard navigation** — Full keyboard accessibility for desktop; platform-native keyboard on mobile
- **Mobile text sizing** — Font size `max(16px, 1em)` on inputs to prevent iOS auto-zoom; `:root` font-size bumped on narrow viewports
- **No color-only signaling** — Risk, caution, and success always pair icon + text
