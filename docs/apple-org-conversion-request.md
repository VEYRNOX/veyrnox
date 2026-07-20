# Apple Developer Program — Individual → Organization conversion request

**Status:** DRAFT for owner review. Not yet sent (as of 2026-07-20).
**Send via:** <https://developer.apple.com/contact/> → Membership & Account → *Change
account type / Organization enrollment*. (There is no self-serve conversion in the
account portal — it must go through Developer Program Support.)

> **Before sending, confirm:**
> 1. ~~D-U-N-S record matches Companies House~~ — **CONFIRMED by owner 2026-07-20.**
>    D-U-N-S `234941876` matches VEYRNOX LTD. No D&B correction needed.
> 2. ~~Directorship~~ — **RESOLVED 2026-07-20.** Al Jobson is **CTO, not a director**;
>    the sole director is **Andreea Flavia Cotolan**. An earlier draft wrongly stated "Director,
>    with authority to bind the entity" — corrected. **Route B** chosen: Al Jobson stays
>    Account Holder (keeping Team R54268MWFV, its apps, certificates and IAP setup
>    intact) and supplies a signed letter of authority from the director. Do not
>    overstate the CTO's authority in any follow-up correspondence.
> 2a. **Attach the signed letter of authority** (template at the end of this file) before
>    sending, or state that it is available on request.
> 3. Send from the **Account Holder Apple ID** (`al.jobson@21stclick.co.uk`), not the
>    Gmail address used for the Google Play account.

---

## Subject

Request to convert Individual membership to Organization — Team ID R54268MWFV

## Body

Hello,

I would like to convert my existing Apple Developer Program membership from an
Individual account to an Organization account. All required details are below.

**Current membership**

| | |
|---|---|
| Team ID | R54268MWFV |
| Enrolled as | Individual |
| Account Holder Apple ID | al.jobson@21stclick.co.uk |
| Two-factor authentication | Enabled (1 trusted phone number, 2 trusted devices) |

**Organization to convert to**

| | |
|---|---|
| Legal entity name | VEYRNOX LTD |
| D-U-N-S number | 234941876 |
| Companies House number | 17299951 (England & Wales) |
| Registered office | 24 Lankers Drive, Harrow, England, HA2 7NT, United Kingdom |
| Entity type | Private limited company |
| Incorporated | 24 June 2026 |
| Website | https://veyrnox.com |
| My role | Chief Technology Officer |
| Director / person with authority to bind | Andreea Flavia Cotolan (sole director, Veyrnox LTD) |
| Company contact | support@veyrnox.com |

**Reason for the request**

Our app, Veyrnox (bundle ID `com.veyrnox.app`), is a self-custody cryptocurrency
wallet. App Review Guideline 3.1.5(b) requires that apps facilitating cryptocurrency
transactions or wallet services be offered by an organization rather than an
individual developer. I am therefore requesting this conversion so the app can be
submitted compliantly under the correct entity.

The app is already set up in App Store Connect under this team and is otherwise ready
for submission.

**Authority to bind the organization**

To be clear about my role: I am the Chief Technology Officer of Veyrnox LTD, not a
registered director. The company's sole director, **Andreea Flavia Cotolan**, has authorized
this enrollment and this conversion request. A signed letter of authority from her is
attached / available on request, and she can confirm directly by email or telephone if
you would prefer.

If Apple requires the Account Holder for an Organization account to be a registered
director, please advise and we will arrange for Andreea Flavia Cotolan to take that role
instead.

**Additional information**

Please let me know if you need any supporting documentation — for example the
certificate of incorporation, the Companies House officer listing confirming Andreea Flavia
Cotolan's directorship, or verification of the registered address. I can provide these
promptly.

Note that the address currently on the membership record (76 Melling Drive, Enfield,
EN1 4UZ) is my personal address from the original Individual enrolment. It should be
updated to the company's registered office shown above as part of this conversion.

Thank you,

Al Jobson
Chief Technology Officer, Veyrnox LTD
al.jobson@21stclick.co.uk
+44 7949 467271

---

## Letter of authority — for the director to sign

Print on Veyrnox LTD letterhead if available, sign, scan/photograph, and attach to the
support request. Apple accepts a scan; a wet signature is not required, but the
director's own signature is.

> **VEYRNOX LTD**
> Company number 17299951
> 24 Lankers Drive, Harrow, England, HA2 7NT, United Kingdom
>
> [Date]
>
> **To: Apple Developer Program Support**
>
> **Re: Authorization for Apple Developer Program enrollment — Team ID R54268MWFV**
>
> I, **Andreea Flavia Cotolan**, am the sole director of **Veyrnox LTD** (company number
> 17299951, registered in England and Wales), and I have the legal authority to bind the
> company.
>
> I hereby authorize **Al Jobson**, Chief Technology Officer of Veyrnox LTD, to:
>
> 1. Enroll Veyrnox LTD in the Apple Developer Program, and act as Account Holder for
>    Apple Developer Program Team ID **R54268MWFV**;
> 2. Request and complete the conversion of that membership from an Individual account
>    to an Organization account in the name of Veyrnox LTD;
> 3. Accept the Apple Developer Program License Agreement and related agreements on
>    behalf of Veyrnox LTD; and
> 4. Submit applications to the App Store on behalf of Veyrnox LTD.
>
> This authorization remains in effect until revoked by me in writing.
>
> Should you require any further confirmation, I can be contacted directly at
> support@veyrnox.com.
>
> Yours faithfully,
>
> ______________________________
> **Andreea Flavia Cotolan**
> Director, Veyrnox LTD
> support@veyrnox.com

---

## Notes for whoever follows up

- Apple typically responds within 1–3 business days and may route this to the
  enrollment team for entity verification.
- Expect a possible request for **proof of authority** (Companies House officer listing
  usually suffices) and confirmation of the registered address.
- The membership address mismatch is called out proactively above — raising it first
  avoids a round-trip when Apple's verification finds it.
- **Do not** let anyone describe the internal audits as independent in any
  correspondence (I4 honesty rule); the independent third-party audit is outstanding.
- Related loose end, not part of this request: the stale `SafeDigitalWallet` app record
  in App Store Connect (owner confirmed it is the old app).
