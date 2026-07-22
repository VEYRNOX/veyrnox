# Export-compliance classification — note to counsel

**Status:** DRAFT for counsel review · created 2026-07-21
**Context:** Blocks first App Store submission (and informs Play). iOS build 1.0 (1) is
"Ready to Submit"; this encryption classification is the last gate. A draft French
declaration worksheet was mistakenly uploaded to App Store Connect and is locked
"In Review" — removal requested via Apple Developer Support.

> This is legal correspondence to be reviewed/sent by the owner. Claude drafted the
> technical facts; the classification decision is counsel's. Do not treat any option
> below as a legal determination until counsel confirms.

---

**To:** [Counsel]
**From:** Al Jobson, CTO/Founder, Veyrnox LTD
**Re:** Encryption export-compliance classification for App Store / Play launch — decision needed

## Summary of decision needed
We're submitting Veyrnox (a self-custody cryptocurrency wallet) to the Apple App Store
and Google Play. Apple's export-compliance questionnaire is asking us to classify our use
of encryption, and — because we indicated distribution in France — it is now demanding a
**French encryption declaration (ANSSI)**. I need your determination on which of three
compliance paths we take, covering both **US export (BIS/EAR)** and **French (ANSSI)**
obligations.

## What encryption the app actually uses
All standard, open, non-proprietary — we implement none of our own algorithms:

- **AES-256-GCM** (NIST) — encrypts the user's wallet vault at rest, on their own device.
- **Argon2id** (RFC 9106) — password-based key derivation for local vault unlock.
- **secp256k1 / Ed25519** (SEC 2 / RFC 8032) — digital signatures for the user's own
  blockchain transactions.
- **BIP-32 / BIP-39** — open industry-standard hierarchical key derivation from a
  locally generated seed.
- **TLS** — standard, provided by the OS/browser network stack (not implemented by us).
- On supported hardware: Apple Secure Enclave / Android StrongBox/TEE via each platform's
  standard APIs.

Keys never leave the device; there is no server-side key custody and no user account.

## Current status / what triggered this
- On Apple's questionnaire we selected "standard encryption algorithms" (accurate) and
  "available for distribution in France = Yes."
- That combination made Apple require a **French encryption declaration approval form**.
- A **draft preparation worksheet** was mistakenly uploaded and is now locked in
  "In Review." We've asked Apple Support to remove it. We will not submit the app until
  compliance is corrected.

## The three paths — please advise which applies

1. **Exemption (preferred if available).** Does Veyrnox's use of standard, publicly
   documented encryption qualify for the export **exemption** (e.g., mass-market /
   self-classification under EAR §740.17(b), classifiable as 5D992)? If so, we set
   `ITSAppUsesNonExemptEncryption = false` (with your confirmation) and the French-form
   requirement disappears. **Does it qualify? Is any BIS self-classification report /
   annual report still required?**

2. **Exclude France for initial launch.** We answer "distribution in France = No,"
   exclude France from our App Store/Play territories, and launch everywhere else now —
   adding France later once an ANSSI declaration is filed. **Any issue with this as an
   interim posture?**

3. **File the ANSSI declaration now.** We complete France's cryptology declaration via
   ANSSI's official portal, obtain the **récépissé** (receipt), and provide that to Apple.
   We have a prepared worksheet ready to file. **Are you able to file this, or advise us
   to, and what's the realistic timeline?**

## Specific questions for you
- Does our encryption profile qualify for the US export exemption, and can we set the
  "non-exempt encryption = false" flag truthfully?
- Is a BIS self-classification report (or ERN/CCATS) required regardless?
- For France: is the ANSSI declaration genuinely required for a mass-market standard-crypto
  app, and is Option 1 or 2 sufficient to avoid it for launch?
- Any equivalent consideration we're missing for other territories (the questionnaire also
  referenced China ICP)?

We're otherwise fully ready to submit (build approved, metadata complete), so this
classification is the last gate. Grateful for a quick read.

Thank you,
Al Jobson
CTO / Founder, Veyrnox LTD
