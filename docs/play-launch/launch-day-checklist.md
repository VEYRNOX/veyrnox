# Veyrnox — launch-day checklist (iOS + Android)

**Created:** 2026-07-21 · Single execution reference for finishing the first store submissions.
Ordered by dependency. Boxes are the actual actions; do them in order within each track.

## Key references & IDs
- App Store metadata copy → `docs/play-launch/app-store-submission-copy.md`
- Export-compliance decision brief → `docs/play-launch/export-compliance-counsel-note.md`
- US BIS self-classification report → `docs/play-launch/bis-self-classification-report.md`
- Play Data Safety answers → `docs/play-launch/data-safety-form.md`
- **Apple ID (app):** 6790188660 · **Bundle:** com.veyrnox.app · **Team:** Veyrnox LTD (R54268MWFV)
- **Apple Support case (remove locked encryption doc):** 102948042496 (sent 2026-07-21)
- **Google app-signing SHA-256 (= RELEASE_CERT_SHA256 for RASP + assetlinks.json):**
  `D8:99:69:D5:C4:9F:39:50:A8:CA:20:03:13:C5:0E:B1:09:37:E3:9B:62:4B:38:64:3F:B3:A0:4F:63:44:6C:B9`
- Signatory: Al Jobson = CTO/Founder, NOT a director (sole director: Andreea Flavia Cotolan)

---

## Already DONE (do not redo)
- [x] iOS build 1.0 (1) archived, uploaded, processed → "Ready to Submit"
- [x] App metadata: subtitle, description, keywords, promo text, 10× 6.5" screenshots
- [x] App Privacy PUBLISHED (4 data types, Play-consistent, linkage corrected)
- [x] App Information: category Finance/Business, content rights, license
- [x] Apple Support request sent to remove locked draft encryption doc (case 102948042496)

---

## TRACK 1 — iOS submission (blocked on Apple case 102948042496)

**Trigger: Apple replies / removes the locked "In Review" draft encryption doc.**

- [ ] **Pre-req (parallel):** wife completes **Test A/B** (in bis-self-classification-report.md)
      → confirms Veyrnox = mass-market 5D992.c. If NO → escalate, do not proceed.
- [ ] Confirm the draft doc is gone from App Information → App Encryption Documentation.
- [ ] **Exclude France:** App Store Connect → Availability → untick **France** + French
      territories (French Guiana, Guadeloupe, Martinique, Réunion, Mayotte, St Pierre &
      Miquelon, Wallis & Futuna, French Polynesia, New Caledonia) → Save.
- [ ] Re-answer export compliance: **standard encryption = Yes**, **proprietary = No**,
      **distribution in France = No** (now truthful) → `ITSAppUsesNonExemptEncryption` = YES.
- [ ] Version page → **Build** section → attach build **1.0 (1)**.
- [ ] Confirm **Safety Plus IAPs** (`safety_plus_monthly` + `safety_plus_annual`) are
      attached to this version (first IAP must submit WITH the app version).
- [ ] Fill any remaining required fields: Support URL, (Marketing URL optional), copyright.
- [ ] **Add for Review → Submit for Review** (owner's click).

**After approval:** verify a REAL StoreKit production purchase before recording IAP as
"verified" (sandbox ≠ verified). Add France back later (see Track 3).

---

## TRACK 2 — Google Play submission (blocked on upload-key reset)

**Trigger: Google approves the pending upload-key reset (requested 2026-07-20).**

- [ ] Confirm reset approved: Play Console → Setup → App integrity → new upload key
      `CC:3F:16:36…` accepted. DO NOT cancel the pending request; DO NOT generate new keystores.
- [ ] Build the release AAB signed with `android/veyrnox-upload.jks`.
- [ ] Confirm `RELEASE_CERT_SHA256` in RASP config = Google's app-signing cert
      (`D8:99:69:D5…`), NOT an upload key.
- [ ] Upload AAB to the **internal testing** track (real Play Billing verifiable there;
      personal-account 12-tester/14-day rule blocks production only). Uses next
      versionCode (4). versionName = **1.0**.
- [ ] Confirm Data Safety (9/9 already resolved) + store listing complete.
- [ ] Roll out to internal testing → verify real Play Billing purchase.

---

## TRACK 3 — Compliance filings (own timeline)

- [ ] **US BIS self-classification report** — file per bis-self-classification-report.md.
      Due **Feb 1, 2027** for 2026 exports. Set a recurring annual reminder.
- [ ] **France (later):** file cryptology declaration with ANSSI (worksheet ready) → get
      the **récépissé** → then in App Store Connect re-add France to Availability + flip
      export-compliance "France = Yes" + attach the récépissé.

---

## Honesty guardrails (do not violate)
- Do NOT submit with a placeholder/draft standing as a compliance document.
- Do NOT mark IAP or any asset "verified" without real production evidence (txid / real purchase).
- "Internal" audits are never presented as the outstanding independent audit.
- Independent third-party security audit of the full stack remains OUTSTANDING.

---

## STATE AS OF 2026-07-22 EOD (supersedes the checkboxes above where they conflict)

### Apple App Store — one blocker
- Build **1.0 (1)** uploaded, processed, **Ready to Submit**. Metadata, description, keywords,
  pricing ($5.99 / $49.99), App Privacy (published, Play-consistent), category Finance/Business
  all COMPLETE.
- **BLOCKED:** a DRAFT French encryption declaration worksheet is attached as export-compliance
  evidence and locked "In Review" — it cannot be deleted. Apple Support case **102948042496**
  (filed 2026-07-21 ~17:00, no reply as of EOD 07-22). Do NOT submit while it stands: it
  represents a placeholder as an official regulatory document.
- **UNVERIFIED RISK:** the 10 iOS screenshots are probably the duplicated set (the source folder
  `veyrnox-appstore-screenshots/` has 14 of 16 files byte-identical, and is sized exactly to
  Apple's 6.5" spec). Check the thumbnails in App Store Connect before submitting.
- **UNRESOLVED:** DSA trader status declared "non-trader". For a limited company selling
  subscriptions in the EU that is likely wrong, and can cause EU removal.
- Distance to submit: Apple clears the doc -> exclude France -> re-answer compliance -> submit.

### Google Play — weeks away, gated by Google
- Internal testing: build **5 (1.0)** live. **Real Play Billing purchase VERIFIED.**
- App content checklist: all 9 items complete. Store listing saved with assets.
- Category set to **Finance**; contact details **published** (support@veyrnox.com,
  https://veyrnox.com; phone deliberately blank).
- versionCode bumped to **6** (5 consumed by the internal-testing upload).
- **BLOCKED — production access:** dashboard shows *0 of 12 testers opted in*, and requires a
  closed test run for **at least 14 days** before "Apply for production" unlocks. Clock NOT
  started. Internal testing does NOT count toward it.
- **Org conversion STARTED, NOT FINISHED.** Website verified; D-U-N-S 234941876 confirmed and
  the payments profile matched (both Google and D&B hold the OLD address,
  **24 Lankers Drive, Harrow, HA2 7NT** — which is why the old address was used, and the
  certificate of incorporation showing it is the right supporting document). Remaining:
  organization phone, verification codes, document upload, Google review.
- **OPEN QUESTION that decides the Play timeline:** does an ORGANIZATION account skip the
  closed-testing/12-tester requirement? Google's dashboard wording ("You must run a closed test
  before you can apply to publish your app to everyone in production") reads as universal.
  UNVERIFIED. Resolve this before investing further in the conversion for speed reasons.
- **CONSTRAINT:** organization accounts must publish a phone number on the developer profile.
  The owner does not want a personal mobile published — a business/VoIP number is needed, or
  the account stays personal.
- Screenshots currently live are the duplicated set. Replacements ready:
  `~/Downloads/veyrnox-play-screenshots-v2/` (13 genuinely distinct, 1311x2622, ratio 2.000).
  iOS-spec versions: `~/Downloads/veyrnox-ios-screenshots-v2/` (1284x2778).

### Honest bottom line
iOS is one support reply from submittable. Play is >= 2 weeks from production and the
assumption that converting to a company shortcuts that is UNVERIFIED. Nothing has been
submitted to either store.
