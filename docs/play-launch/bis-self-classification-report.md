# BIS encryption self-classification report — Veyrnox

**Status:** DRAFT · created 2026-07-21 · US export compliance (License Exception ENC)

> **Read as a plain-language draft of a §740.17(e)(3) self-classification report, NOT a
> legal determination.** Before filing you MUST: (1) map this into the exact current
> **Supplement No. 8 to Part 742** file format/column order from bis.doc.gov; (2) verify
> the email addresses and the Feb-1 timing against the current rule; (3) confirm — with
> your reviewer (see docs/play-launch/export-compliance-counsel-note.md) — that Veyrnox
> genuinely meets the mass-market tests (below) and classifies as 5D992.c. This is the
> owner's filing to make and send.

## Eligibility tests to confirm BEFORE filing

**Test A — mass-market criteria (Cryptography Note, Note 3 to Cat. 5 Part 2) — all must be YES:**
1. Publicly available without restriction (App Store / Play / public web).
2. Cryptographic functionality cannot be easily changed by the user.
3. Installable by the user without substantial supplier support.
4. Details available to BIS/NSA on request.

**Test B — NOT excluded (would otherwise need a CCATS under 740.17(b)(2)/(3)) — all must be NO:**
1. Network infrastructure / carrier-grade equipment.
2. Proprietary / self-designed cryptography (Veyrnox: No — all standard).
3. Cryptanalytic tools, open cryptographic interface, or government/military end-use.
4. "Non-standard cryptography."

If A = all YES and B = all NO → mass-market, self-classify as **5D992.c** under **§740.17(b)(1)**.

---

## Notification email

**To:** crypt@bis.doc.gov; enc@nsa.gov
**Subject:** Encryption Self-Classification Report — Veyrnox LTD

> To Whom It May Concern,
>
> Please find attached the annual self-classification report submitted under License
> Exception ENC, 15 CFR §740.17(b)(1) and §740.17(e)(3), for encryption items produced by
> Veyrnox LTD.
>
> Submitter / point of contact:
> - Company: Veyrnox LTD
> - Address: [registered address]
> - Point of contact: Al Jobson, CTO / Founder
> - Email: al.jobson@21stclick.co.uk
> - Phone: [phone]
>
> The attached report contains the required data elements per Supplement No. 8 to Part 742.
> Please contact me if any further information is required.
>
> Regards,
> Al Jobson
> CTO / Founder, Veyrnox LTD

---

## Report data (one row per product — format into the Supplement No. 8 CSV)

| Field | Value |
|---|---|
| Product name | Veyrnox |
| Model / version | 1.0 |
| ECCN | 5D992.c |
| Authorization paragraph | §740.17(b)(1) |
| Manufacturer / producer | Veyrnox LTD |
| Item type | Software — mobile & web application (self-custody cryptocurrency wallet) |
| Mass-market item? | Yes |
| Uses non-standard (proprietary) cryptography? | No |
| Open cryptographic interface? | No |
| Encryption algorithms & key lengths | AES-256-GCM (256-bit, symmetric, confidentiality of local vault at rest); Argon2id (key derivation, RFC 9106); secp256k1 & Ed25519 (ECC digital signatures, SEC 2 / RFC 8032); TLS (transport, provided by OS/browser) |
| Key management | BIP-32 / BIP-39 HD derivation from locally generated seed; platform Secure Enclave / StrongBox where available |
| Brief description | Non-custodial cryptocurrency wallet. Encrypts the user's wallet on their own device; signs the user's own blockchain transactions. All algorithms are open, published standards; no proprietary cryptography. |

---

## Filing notes
- **Timing:** covers items exported in a calendar year, due **by Feb 1 of the following
  year**. Exports begin 2026 → report due **Feb 1, 2027**. Verify on bis.doc.gov.
- **Annual obligation** while exporting — set a recurring reminder.
- **Keep the Test A/B rationale on file** as the defensible self-classification record.
- Corresponding App Store Connect action: set `ITSAppUsesNonExemptEncryption = YES`
  (accurate — non-exempt AES confidentiality) and complete the self-classification answers.

## France (separate, still applies)
Clean US self-classification does NOT satisfy France. ANSSI independently requires a
cryptology declaration for confidentiality encryption. Launch options: exclude France now
+ add later with the ANSSI récépissé, or file ANSSI first. See
docs/play-launch/export-compliance-counsel-note.md.
