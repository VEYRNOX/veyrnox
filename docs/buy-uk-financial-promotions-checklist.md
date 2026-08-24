# UK Buy Suppression Checklist

> Operational checklist for keeping the in-app crypto **Buy** flow suppressed for
> UK users under the current UK cryptoasset financial promotions regime.
>
> Scope: Veyrnox's **Buy / Transak on-ramp** only.
> Out of scope: AI Security Protection subscriptions, referral pricing, Safety Plus
> billing, or any non-buy paywall logic.

## Current app behavior

As of **2026-08-24**, the app code suppresses the Buy entry point for a
device that looks UK-based from either:

- locale region tag: `GB` / `UK`
- timezone: `Europe/London`

This gate lives in:

- [src/lib/buy/useBuyEnabled.js](../src/lib/buy/useBuyEnabled.js) —
  `isUkBuyBlocked()`, composed into both `useBuyEnabled()` (React surfaces) and
  `isBuyEnabled()` (non-React callers)

That means the following inherit the same suppression automatically:

- `/buy`
- `/buy/in-progress`
- dashboard Buy action
- empty-state Buy CTA
- mobile nav Buy entry
- native deep-link handling for `https://veyrnox.com/buy/return`

This is an **app-layer compliance control**, not authoritative geolocation.
It reduces exposure but should not be treated as the only UK safeguard.

### How the two signals are actually resolved

Both come from [src/lib/locale.js](../src/lib/locale.js), and the resolution
order matters for compliance reasoning:

| signal | order |
|---|---|
| locale | stored `veyrnox-locale` → `navigator` detection → `FALLBACK_LOCALE` |
| timezone | stored `veyrnox-timezone` → `Intl…resolvedOptions().timeZone` → `'UTC'` |

Three consequences, all verified against the source on 2026-08-24 rather than
assumed. **None is a live defect today; all three are properties a reviewer or
counsel should know about before relying on this control.**

**1. The control fails OPEN on detection failure.** If `Intl` throws or returns
an empty zone, `resolveTimeZone()` returns `'UTC'` and `resolveLocale()` returns
`FALLBACK_LOCALE` — neither is UK, so Buy renders. Everywhere else in this
codebase a security or compliance gate that cannot determine its input denies
(I4, "fail honest, fail closed"); this one permits. That is a deliberate-looking
choice inherited from a *display* resolver being reused as a *compliance*
input, and it should be an explicit owner decision rather than a side effect.
If the answer is "block when the region is unknowable", the fix is a
UK-specific resolver that treats an absent signal as blocking, not a change to
`locale.js` (which would alter date/number formatting everywhere).

**2. A stored preference short-circuits detection, unfiltered.** Both resolvers
read `localStorage` first. **Nothing in `src/` writes either key today** —
verified by grep, so this is latent, not exploitable. But the moment a timezone
or locale picker ships, a user-facing display setting silently becomes a
compliance opt-out, and the value is not canonicalised or validated on the way
in. If a picker is ever added, `isUkBuyBlocked()` should read *detected*
signals, not stored preferences.

**3. Timezone aliases are safe for detected values, not for stored ones.**
`UK_TIME_ZONES` holds a single entry, `Europe/London`. That is sufficient for
detection: `Europe/Belfast`, `GB`, and `GB-Eire` are all IANA links that ICU
canonicalises to `Europe/London` before `Intl` reports them (checked in Node on
2026-08-24 — all three resolve to `Europe/London`). It is **not** sufficient for
a raw stored value, which reaches the `Set` uncanonicalised and would miss.

### Crown Dependencies are NOT blocked — record the decision

`Europe/Jersey`, `Europe/Guernsey`, and `Europe/Isle_of_Man` do not match either
signal, so Buy renders there. This is most likely **correct** — the Channel
Islands and the Isle of Man are outside the UK for FCA purposes and have their
own regulators, so s.21 FSMA does not reach them — but the code arrives at that
outcome by omission rather than by decision, and nothing records it.

**Owner/counsel action:** confirm the intended perimeter is "UK only, excluding
Crown Dependencies" and note it here, so a future reviewer does not "fix" the
gap by adding those zones and inadvertently suppress a lawful market.

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
- [x] full unit test run completed in a dependency-installed workspace —
  2026-08-24, `src/lib/buy/__tests__` + `src/pages/__tests__`: 590 passed,
  1 skipped, 0 failed
- [x] `isUkBuyBlocked()` has direct unit coverage —
  [src/lib/buy/\_\_tests\_\_/useBuyEnabled.test.js](../src/lib/buy/__tests__/useBuyEnabled.test.js)
  pins GB/UK locale tags, the London timezone with a non-GB locale, and
  non-UK pairs
- [ ] **owner decision: fail-open on unknowable region** (see "How the two
  signals are actually resolved", point 1) — today an undetectable timezone
  resolves to `UTC` and Buy renders
- [ ] **owner/counsel decision: Crown Dependencies perimeter** — recorded as
  intentionally out of scope, or added to the block
- [ ] **honesty gap: the user-facing feature catalogue does not mention UK
  suppression at all.** `src/lib/featureClassification.js:98` and
  `src/lib/featureCatalogue.js` describe the Buy tile's deniability and ship
  gates and omit the region block, so the catalogue overstates availability.
  One-line fix, deliberately not bundled into a docs-only change
- [ ] optional UX follow-up decided:
  - keep silent hide, or
  - add explicit "Buy unavailable in your region" copy
  - note: silent hide is currently indistinguishable from "ship gate off" and
    from "deniability active" — all three render nothing

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
- [ ] Detection-failure case (covers the fail-open above):
  - a device/webview where `Intl…resolvedOptions().timeZone` is unavailable
  - record what happens today (expected: Buy **renders**), so the owner decision
    is made against observed behaviour rather than a reading of the code

### Note for developers running the suite from the UK

The Buy tests are **environment-sensitive by construction**, and this bit a real
run on 2026-08-24. `resolveLocale()`/`resolveTimeZone()` fall back to the host's
`Intl` settings, so on a `Europe/London` machine `isUkBuyBlocked()` returns true
and every test that expects a Buy surface to render fails — correctly, for a
reason unrelated to what the test names.

`BuyCrypto.gates.test.jsx` now pins `veyrnox-locale`/`veyrnox-timezone` to a
non-UK pair in `beforeEach` so the ship gate is the only variable under test
(PR #2040). `useBuyEnabled.test.js` already did the same.

**If you add a Buy test that expects the entry point to render, pin those two
keys.** Without them the test passes on a UTC CI runner and fails on a UK
developer's laptop — which is the worst possible split, because the person most
likely to be changing UK compliance behaviour is the one who cannot run its
suite. Verified by varying only `TZ` with no code change: `TZ=UTC` green,
`TZ=Europe/London` red.

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
- **fail closed when the region cannot be determined** — an undetectable
  timezone resolves to `UTC` and Buy renders (see point 1 above)
- **resist a user who changes their device locale or timezone.** Both signals
  are device-reported and trivially changed by the device owner. This control
  is a good-faith suppression for ordinary UK users, not an access control, and
  it should never be described as one
- **survive a stored preference**, if a locale/timezone picker is ever added
  (see point 2 above)

Nothing here has been verified on a real UK device. The behaviour above is read
from source and from a Node-level check of ICU timezone canonicalisation; no
device QA row in this file is ticked.

## Recommended follow-ups

Ordered by what most changes the compliance posture, not by effort.

1. **Decide the fail-open question.** Today an unknowable region permits Buy.
   Either accept that explicitly here, or add a UK-specific resolver that
   blocks on an absent signal. Do not change `locale.js`'s fallbacks to achieve
   it — they drive date/number formatting app-wide.
2. **Record the Crown Dependencies perimeter** so it stops being an omission.
3. **Fix the catalogue honesty gap** — `featureClassification.js:98` describes
   the Buy gates and omits the region block entirely.
4. Add a provider-side UK deny control if Transak supports it for this
   integration. App-layer suppression and provider-layer suppression fail
   differently, and only the provider one survives a user changing their
   device locale.
5. Add a short compliance note to release operations / QA docs.
6. If a locale or timezone **picker** is ever added, re-read point 2 above
   before shipping it — it converts a display setting into a compliance
   opt-out.
7. If legal later approves a UK route, remove the block only together with:
   - approved FCA-compliant disclosure/copy path
   - provider/store configuration review
   - fresh device verification

## Change log

- **2026-08-24** — Reviewed the gate against source. Added the resolution-order
  section (fail-open on detection failure; stored-preference short-circuit;
  timezone-alias canonicalisation), recorded that Crown Dependencies are not
  blocked, noted that the user-facing catalogue omits the region block, ticked
  the two test rows that are genuinely done, and added the UK-developer note
  after `BuyCrypto.gates.test.jsx` was found to be host-timezone-dependent
  (PR #2040). No production behaviour changed.
- **2026-08-19** — Initial checklist.
