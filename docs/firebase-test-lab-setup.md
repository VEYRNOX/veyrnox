# Firebase Test Lab setup (owner-only)

`firebase-test-lab.yml` references this doc; the workflow itself only exercises
the pipeline. This file documents the GCP-side configuration the workflow needs
to run.

## Current state (2026-09-04)

**Working.** Full rebuild landed 2026-09-04 afternoon on Firebase project
`veyrnox-400ae` (Workspace-visible, project number 567659013773). Latest run
`matrix-hhpcvb8uffw6a` completed 265 UI actions on Pixel 8 / Android 14 with
zero crashes and zero ANRs against versionCode 41. **Android side needs no
further owner action.**

**iOS side is still broken but in a different way** — SPM Capacitor graph
fixed by PR #2316 (SharePlugin.swift now compiles), next blocker is code
signing: the App Manager App Store Connect key cannot drive xcodebuild's
"cloud signing" path, and no provisioning profile exists for
`com.veyrnox.app.AppUITests.xctrunner`. iOS crash data is covered by
TestFlight + Xcode Organizer per the CLAUDE.md pre-submission gate; do not
rebuild iOS on Firebase Test Lab unless the ASC key is promoted to Admin OR
a manual-signing pipeline is added (see checklist below).

## Live configuration on `veyrnox-400ae`

- Firebase project: registered (added 2026-09-04). Blaze billing active.
- APIs enabled: `testing.googleapis.com`, `toolresults.googleapis.com`.
- Service account: `github-actions-testlab@veyrnox-400ae.iam.gserviceaccount.com`
  with `roles/firebase.qualityAdmin`, `roles/cloudtestservice.testAdmin`,
  `roles/serviceusage.serviceUsageConsumer`.
- Results bucket: `gs://veyrnox-400ae-testlab-results` (uniform bucket-level
  access; SA has `roles/storage.objectAdmin` bucket-scoped).
- GitHub secrets: `GCP_PROJECT_ID=veyrnox-400ae`, `GCP_SA_KEY` (SA JSON),
  `GCS_RESULTS_BUCKET=veyrnox-400ae-testlab-results`.

Owner-workflow chain that made it work: PRs #2307, #2309, #2313, #2314, #2315,
#2316. All merged.

## Historical note

The workflow was originally wired to `veyrnox-wallet` (personal account,
al.jobson1@gmail.com) which owns the RevenueCat SA but had never been
registered as a Firebase project. That path got as far as creating Firebase's
default bucket but the SA couldn't write to it — Firebase-managed buckets
reject even project-owner IAM edits. The rebuild moved everything onto the
Workspace-visible `veyrnox-400ae`, which already existed as a Firebase
project. If Firebase Test Lab is ever moved back to a different project, the
checklist below is what needed doing.

## GitHub configuration (already set)

| Secret / Var | Purpose |
|---|---|
| `GCP_PROJECT_ID` | Passed to `setup-gcloud`; must match the project the SA belongs to and where Test Lab runs |
| `GCP_SA_KEY` | Service-account JSON key; auth for `gcloud firebase test android run` |
| `GCS_RESULTS_BUCKET` | Cloud Storage bucket where per-device artifacts (logcat, video, screenshots) are written |
| `IOS_FIREBASE_SIGNING_READY` (var) | Gate on ios-smoke job; already `true` |

Nothing to change here. All fixes are GCP-side.

## Owner fix checklist

Do these in order; each depends on the previous.

### 1. Confirm the project

Open https://console.cloud.google.com/home/dashboard?project=veyrnox-wallet.

If it loads: project exists on your account, jump to step 2.
If access denied: the `veyrnox-wallet` project is owned by a different Google
account. Either (a) log in with that account for all subsequent steps, or (b)
switch the workflow to use `veyrnox-400ae` (the Firebase project you already
have access to) — that means rotating `GCP_SA_KEY` to a key issued on
`veyrnox-400ae` and updating `GCP_PROJECT_ID` to match.

### 2. Register as a Firebase project (if not already)

https://console.firebase.google.com → Add project → **Add Firebase to Google
Cloud project** → select `veyrnox-wallet`.

Test Lab is a Firebase-scoped product; the plain GCP project cannot run it.

### 3. Enable Blaze billing

https://console.cloud.google.com/billing?project=veyrnox-wallet.

Firebase Test Lab itself has a Spark (free) allowance (10 virtual + 5 physical
device-slots/day), but Spark cannot **auto-create Cloud Storage buckets**. The
workflow writes results per-run under `gs://$GCS_RESULTS_BUCKET/robo-$SHA-…/`,
which requires either Blaze OR a pre-created bucket the SA can write to.

### 4. Enable required APIs

https://console.cloud.google.com/apis/library?project=veyrnox-wallet — enable:

- **Cloud Testing API** (`testing.googleapis.com`)
- **Cloud Tool Results API** (`toolresults.googleapis.com`)
- **Cloud Storage API** (`storage.googleapis.com`) — usually on by default

### 5. Grant SA the required roles

Decode `GCP_SA_KEY` to find the SA email (`client_email` field). Then at
https://console.cloud.google.com/iam-admin/iam?project=veyrnox-wallet, grant:

- `roles/cloudtesting.testRunner` — run Test Lab
- One of:
  - `roles/storage.admin` on the project — lets Test Lab auto-create the bucket
    each run (matches current workflow behaviour), OR
  - Pre-create the bucket named in `GCS_RESULTS_BUCKET`, then grant
    `roles/storage.objectAdmin` on that bucket only (least-privilege)

### 6. Verify

Re-dispatch `firebase-test-lab.yml` manually with `platform=android`. Expect
`android-robo` to succeed and post a Firebase Console results link to the job
summary.

## Notes for future readers

- Two silent workflow bugs were fixed en route to surfacing the real error —
  see PRs #2307 (`publish-to-play-internal` gating) and #2309 (`# comment`
  inside `gcloud \ ... \` block silently dropping `--device`). Since
  2026-08-15, the workflow ran zero Robo crawls despite looking green; that
  history is why "it worked before" is not evidence here.
- Test Lab results contain wallet state (logcat, screenshots, UI dumps). The
  workflow inventories bucket contents by NAME only for a reason — never echo
  the contents in CI logs or PR comments.
- `ios-smoke` uses the same SA + bucket + APIs; fixing steps 1–5 unblocks both
  jobs.
