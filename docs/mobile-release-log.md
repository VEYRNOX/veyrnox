# Mobile Release Log

Last updated: 2026-09-23

**Scope note.** Everything below the 2026-08-19 entries was staging / internal
testing. This log stopped there and missed both public launches entirely — it
still ended at `1.0.1 (19)` on Internal testing five weeks after 1.0.1 shipped
to both stores. The production releases are recorded at the top now; the
staging history is kept underneath, unedited.

## Production releases

### Google Play

| Date | Version | versionCode | State |
|---|---|---|---|
| 2026-09-12 | 1.0.1 | 48 | Published. Superseded 2026-09-23. |
| 2026-09-23 | 1.0.2 | **57** | **Live, 100% rollout.** |

versionCode 49 reached Closed testing (`alpha`) only and was never the live
production release. versionCode 56 was submitted to production review on
2026-09-22, withdrawn on 2026-09-23 before approval, and **never shipped** — it
predated fixes that reach Android. Its versionCode is permanently consumed.

### App Store

| Date | Version | Build | State |
|---|---|---|---|
| 2026-09-11 | 1.0.1 | 59 | `READY_FOR_SALE`. Still the live version. |

Apple has no 1.0.2 version record. Build numbers restart per train, so 1.0.2's
build 8 in the repo is not behind 1.0.1's build 59.

Full record: `docs/RELEASE-v1.0.2.md`.

## Staging / internal history

### iOS

1. 2026-08-18
Version: `1.0.1 (26)`
Channel: TestFlight / staging
Notes: user confirmed this iOS build works; this is the known-good iOS reference build in the current Android parity discussion.

### Android

1. 2026-08-19
Version: `1.0.1 (17)`
Channel: Internal testing / staging
Artifact: `/Users/aljobson/Downloads/veyrnox-android-staging-1.0.1-17.aab`
Notes: uploaded previously; reported issues included Send error page and biometric-related problems.

2. 2026-08-19
Version: `1.0.1 (18)`
Channel: Internal testing / staging
Artifact: `/Users/aljobson/Downloads/veyrnox-android-staging-1.0.1-18.aab`
Notes: signed AAB uploaded to Play Console Internal testing. As of 2026-08-19, Play Console shows release `18 (1.0.1)` on the Internal testing track.

3. 2026-08-19
Version: `1.0.1 (19)`
Channel: Internal testing / staging
Status: building
Notes: version code bumped from `14` to `19` in `android/app/build.gradle` to create the next upload after release `18`.
