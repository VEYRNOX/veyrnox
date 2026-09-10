# Firebase Test Lab Robo scripts

Two scripts live here. Only one is referenced by `.github/workflows/firebase-test-lab.yml`.

## Active — `android-onboarding-nosecure-robo-script.json`

Runs on every FTL matrix. Stock FTL Pixels ship with no lock screen and no biometrics
enrolled, so `KeyguardManager.isDeviceSecure()` is `false`,
[`src/wallet-core/keystore/native.js`](../../src/wallet-core/keystore/native.js) throws
`DEVICE_NOT_SECURE`, and `createVault` refuses. This script asserts the actionable
`DEVICE_NOT_SECURE` copy PR #2484 introduced and pins the Play build-5 rejection banner
as absent.

## Parked — `android-pin-onboarding-robo-script.json`

Golden-path spec (PIN → confirm → post-onboard telemetry decline → main wallet with Send
reachable). **Not referenced by any workflow.** Cannot run on stock FTL: onboarding
throws `DEVICE_NOT_SECURE` before the PIN pad ever renders.

**Re-enable condition:** any FTL device profile that can be provisioned with a lock
screen — or a `--test` instrumentation lane that sets one — makes this script runnable.
When that arrives, add a second matrix alongside the nosecure one and reference this
file from that matrix. Do NOT swap it for the nosecure script; both paths matter.

Restored 2026-09-10 from `53b8a089` (deleted in PR #2486). See #2492 for the handoff-loss
this parking exists to prevent — the spec is worth recovering by reading the file, not by
digging through git history for a filename that no longer exists.
