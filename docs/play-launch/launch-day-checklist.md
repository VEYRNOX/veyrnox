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
