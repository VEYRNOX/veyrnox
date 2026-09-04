# Firebase Test Lab setup (owner-only)

`firebase-test-lab.yml` references this doc; the workflow itself only exercises
the pipeline. This file documents the GCP-side configuration the workflow needs
to run.

## Current state (2026-09-04)

Broken. `android-robo` fails with:

```
ERROR: (gcloud.firebase.test.android.run) Permission denied while creating
bucket [***]. Is billing enabled for project: [veyrnox-wallet]?
```

Two upstream causes narrowed here that owner must resolve in GCP Console:

1. **Project identity mismatch.** Workflow secret `GCP_PROJECT_ID = veyrnox-wallet`.
   Firebase account `support@veyrnox.com` has no access to `veyrnox-wallet` — its
   Firebase console lists only `veyrnox-400ae` and `device-streaming-2b4fab1b`.
   `veyrnox-wallet` is confirmed real (`docs/Feature-Status.md` — the RevenueCat
   service account lives there) but may not be REGISTERED as a Firebase project.
2. **Service-account permissions.** Even with the correct project, the SA lacks
   the roles Test Lab needs to auto-create a results bucket.

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
