# UK Buy Suppression Checklist

> Operational checklist for keeping the in-app crypto **Buy** flow suppressed for
> UK users under the current UK cryptoasset financial promotions regime.
>
> Scope: Veyrnox's **Buy / Transak on-ramp** only.
> Out of scope: AI Security Protection subscriptions, referral pricing, Safety Plus
> billing, or any non-buy paywall logic.

## Current app behavior

As of **2026-08-19**, the app code already fail-closes the Buy entry point for a
device that looks UK-based from either:

- locale region tag: `GB` / `UK`
- timezone: `Europe/London`

This gate lives in:

- [src/lib/buy/useBuyEnabled.js](../src/lib/buy/useBuyEnabled.js)

That means the following inherit the same suppression automatically:

- `/buy`
- `/buy/in-progress`
- dashboard Buy action
- empty-state Buy CTA
- mobile nav Buy entry
- native deep-link handling for `https://veyrnox.com/buy/return`

This is an **app-layer compliance control**, not authoritative geolocation.
It reduces exposure but should not be treated as the only UK safeguard.

## Regulatory basis

The current basis for suppressing the UK Buy flow is the FCA's cryptoasset
financial promotions regime under **section 21 FSMA**.

Current FCA references checked on **2026-08-19**:

- [Marketing cryptoassets to UK consumers](https://www.fca.org.uk/firms/cryptoassets/marketing-uk-consumers)
- [FG23/3 finalised guidance for cryptoasset financial promotions](https://www.fca.org.uk/publications/fg23-3-finalised-non-handbook-guidance-cryptoasset-financial-promotions)
- [Cryptoasset financial promotions and fiat-crypto ramp services](https://www.fca.org.uk/firms/cryptoasset-financial-promotions-and-fiat-crypto-ramp-services)

Operational assumption for Veyrnox:

- unless Veyrnox has a clearly lawful route to market the Buy/on-ramp flow to UK
  consumers, the safest product posture is to **not expose the Buy entry point**
  to UK users from the app

## Release checklist

### 1. App code

- [x] UK suppression exists in the central Buy gate
- [x] `/buy` route inherits the same gate
- [x] `/buy/in-progress` inherits the same gate
- [x] native deep-link handling respects `isBuyEnabled()`
- [ ] full unit test run completed in a dependency-installed workspace
- [ ] optional UX follow-up decided:
  - keep silent hide, or
  - add explicit "Buy unavailable in your region" copy

### 2. Transak / on-ramp provider

- [ ] Confirm the provider-side setup does **not** intentionally target UK users
  unless legal approval exists for that route
- [ ] Confirm production Transak configuration does not expose UK-targeted checkout
  or UK-targeted campaign links from Veyrnox surfaces
- [ ] If Transak has its own geo restrictions / country denylist controls for this
  integration, mirror the UK block there too
- [ ] Record the final owner decision:
  - UK blocked at app layer only
  - UK blocked at provider layer too
  - UK legally enabled with approved compliance path

### 3. Marketing / web / deep links

- [ ] Review `veyrnox.com` buy-related pages or CTA copy for UK-targeted language
- [ ] Review any direct `veyrnox.com/buy` or buy-return documentation so it does
  not promise UK availability
- [ ] Review App Store / Play listing screenshots and descriptions so they do not
  market the Buy flow to UK users if the app suppresses it there
- [ ] Review support docs / FAQs for UK wording consistency

### 4. App Store / Play operational checks

- [ ] Confirm no release note, promo text, or screenshot says UK users can buy
  crypto in-app
- [ ] Confirm internal QA understands the Buy feature is expected to be absent on
  UK-like devices
- [ ] Confirm no store experiment / feature flag re-enables Buy outside the central
  gate

### 5. Device QA

- [ ] Non-UK device or simulator:
  - Buy entry appears when `VITE_BUY_ENABLED=true`
  - `/buy` is reachable
- [ ] UK-like device by locale:
  - set locale to `en-GB`
  - Buy entry is absent
  - direct navigation to `/buy` renders nothing
- [ ] UK-like device by timezone:
  - set timezone to `Europe/London`
  - Buy entry is absent even if locale is non-UK
- [ ] Native deep-link QA:
  - opening a `veyrnox.com/buy/return` link on a UK-like device does not surface
    Buy-in-progress UI

## Honest limitations

Do not overstate this control.

What it does:

- suppresses the Buy UI for common UK device signals
- keeps direct route access and the buy-return deep-link path fail-closed in app

What it does **not** do:

- authoritative IP geolocation
- SIM-country detection
- App Store country or Play billing-country enforcement
- legal analysis that Veyrnox is fully compliant for UK marketing generally

## Recommended follow-ups

- add a provider-side UK deny control if Transak supports it for this integration
- add a short compliance note to release operations / QA docs
- if legal later approves a UK route, remove the block only together with:
  - approved FCA-compliant disclosure/copy path
  - provider/store configuration review
  - fresh device verification
