# Runbook — Android Hardware KEK residuals device session

**Drafted:** 2026-07-06 (not yet executed — this is a plan, not evidence)
**Device:** Pixel 10 Pro XL, Android 16 / API 36, `com.veyrnox.app.debug`
**Closes (if all pass):** the three C-1 residuals from the 2026-07-05 v3 verification
session, plus the LOG-1 device spot-check as a piggyback. See
`docs/audit-2026-07-01-kek-internal.md` (C-1 annotations) and `docs/Feature-Status.md` §4.

| # | Residual | Current evidence | This session's bar |
|---|----------|------------------|--------------------|
| T1 | v2→v3 lazy migration never device-exercised | 11 unit tests only | Real falsely-v2 vault upgraded brickless on-device |
| T2 | Salt-tamper negative test not performed | `"salt-source: v2-bound"` branch attestation only | Wrong/malformed salt provably fails closed on-device |
| T3 | Per-enrollment salt distinctness | Unit-proven; one enrollment observed | ≥2 fresh enrollments with distinct salts on-device |
| — | LOG-1 device spot-check (PR #572 redaction) | Code-verified only | Leak canary clean across all of the above |

**Honesty bar:** everything below is INTERNAL evidence. Passing this session does NOT
make anything "independently audited" and does NOT promote any catalogue status to
`verified` (that bar is per-asset explorer txids and doesn't apply to an unlock gate).
It upgrades three "unit-tested only" caveats to "device-exercised".

---

## 0. Prerequisites and prep (before touching the device)

1. **Two debug APKs, built in this order:**
   - **APK-OLD** — the falsely-v2 build: `git checkout f611bd42^` (main immediately
     before the PR #568 merge; contains PR #529, so it stamps `hardwareKekVersion: 2`
     while actually wrapping under the fixed v1 `PRF_EVAL_SALT`). Build the debug APK.
   - **APK-NEW** — current `main` debug APK (contains #568 v3 fix and #572 LOG-1
     redaction).
   - Both must be debug-signed with the same keystore so APK-NEW installs OVER
     APK-OLD without wiping app data (`adb install -r`). Verify signatures match
     before the session; if they don't, T1 is impossible and must be redesigned.
2. **Note the patch-package caveat:** the SecureStorage `.commit()` fix is a
   patch-package patch — do a clean plugin recompile for BOTH builds (Gradle caches the
   AAR). A stale AAR invalidates the whole session.
3. **Device state:** biometric (fingerprint) enrolled and working; no existing Veyrnox
   vault worth keeping (session starts with `adb uninstall com.veyrnox.app.debug`).
4. **Tooling:**
   - `adb logcat -v time -s HardwareKek:V` in one terminal (the plugin's evidence tags).
   - `adb logcat -v time > full-session.log` in a second terminal (full capture for the
     LOG-1 canary sweep).
   - Chrome `chrome://inspect` CDP attached to the WebView — this is the established
     vault read-back method from the 2026-07-05 session.
   - A scratch note for device-local timestamps at every step (the evidence convention).
5. **Testnet:** not required. No Sepolia send is needed for these residuals; an optional
   end-of-session KEK-gated send is listed at the end as a bonus, not a gate.

**CDP vault read-back snippet** (used throughout; adjust to however the 2026-07-05
session read `vault_v1` — the storage key is `VAULT_KEY = 'vault_v1'` in
`src/wallet-core/keystore/native.js:69`). Record `hardwareKekVersion`,
`kekSalt.length`, and `SHA-256(kekSalt)` — never paste raw salt bytes or `kekWrap`
into evidence docs (LOG-1 hygiene):

```js
const raw = await Capacitor.Plugins.SecureStorage.get({ key: 'vault_v1' }); // shape per plugin API
const blob = JSON.parse(/* unwrap per plugin return shape */);
const salt = blob.kekSalt ?? null;
const digest = salt
  ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt)))]
      .map(b => b.toString(16).padStart(2, '0')).join('')
  : null;
({ v: blob.hardwareKekVersion, saltLen: salt?.length ?? 0, saltSha256: digest });
```

> If the SecureStorage plugin isn't reachable from the CDP console in the current
> build, add a `DEV`-only read/write helper on `window` behind `import.meta.env.DEV`
> as a session-scoped commit. It must never ship in a release path — flag it in the PR
> and remove or gate it before merge. Do NOT weaken SecureStorage itself.

**Abort criteria (whole session):** any step where the vault becomes unreadable or
unlock fails in a way the plan doesn't predict → STOP, capture logcat + CDP state,
do not improvise recovery on the evidence vault. The runbook has no destructive step
that can lose real funds (throwaway testnet-only vaults), but unexplained behavior is
itself a finding — record it, don't paper over it.

---

## T1 — v2→v3 lazy migration, device-exercised

Proves: a genuinely v2-stamped vault (created by the buggy build) upgrades brickless to
a salt-bound v3 wrap on first unlock under the fixed build, per `_upgradeV2ToV3`
(`src/wallet-core/keystore/native.js:264`).

1. `adb uninstall com.veyrnox.app.debug` → install **APK-OLD**.
2. Create a fresh throwaway wallet (testnet), set PIN, enroll hardware KEK in
   Settings → Security.
   - Expect logcat: `HardwareKek I enroll: key stored — tier=STRONGBOX (securityLevel=2)`.
   - Expect logcat at enroll-time factor derivation: `salt-source: v1-fixed` — this IS
     the bug being migrated away from; on APK-OLD the bridge drops the salt.
     *(If APK-OLD logs `v2-bound` here, the checkout is wrong — abort.)*
3. CDP read-back: `hardwareKekVersion: 2`, `saltLen: 44`. Record salt SHA-256 as
   **SALT-A** (stored but cryptographically inert on this build).
4. Lock the app. Install **APK-NEW** over it: `adb install -r apk-new.apk`. Confirm app
   data survived (app opens to unlock screen, not onboarding).
5. **Migration-failure branch first (brickless contract, one moving part):** unlock with
   PIN + biometric, and when the SECOND biometric prompt appears (the migration's
   one-time extra prompt), CANCEL it.
   - Expect: unlock still succeeds (seed visible), no error surfaced.
   - Expect logcat: one `salt-source: v1-fixed` (the v2 unlock), then the cancelled
     attempt.
   - CDP read-back: still `hardwareKekVersion: 2`, kekSalt SHA-256 unchanged
     (byte-for-byte untouched blob — the fail-safe restore worked).
6. Lock. Unlock again, this time APPROVING both biometric prompts.
   - Expect logcat sequence: `salt-source: v1-fixed` (v2 unlock) → `salt-source: v2-bound`
     (H2 derivation for the new wrap).
   - CDP read-back: `hardwareKekVersion: 3`, `saltLen: 44`, salt SHA-256 **changed**
     (fresh migration salt — record as **SALT-B**).
7. Cold restart (`adb shell am force-stop com.veyrnox.app.debug`, relaunch). Unlock.
   - Expect: exactly ONE biometric prompt, logcat `salt-source: v2-bound` only, seed
     recovered. CDP: still v3, salt SHA-256 = SALT-B.

**Pass:** steps 5–7 all as expected. **Record:** device-local times, the two logcat
sequences, the three read-backs.

---

## T2 — salt-tamper negative tests (fail-closed)

Proves: the supplied salt is cryptographically load-bearing (a wrong salt yields a
wrong H → unwrap fails) and every malformed-salt branch fails closed with no silent
v1 fallback. Uses the v3 vault from T1 step 7. **Take a CDP backup of the full blob
string FIRST** (kept locally for restore only, then deleted — it contains `kekWrap`).

**2a — plugin-level probes (no vault mutation), via CDP:**

```js
const HK = Capacitor.Plugins.HardwareKek;
await HK.getHardwareFactor({ kekSalt: '' });        // expect reject: "Empty kekSalt — refusing to fall back to fixed salt"
await HK.getHardwareFactor({ kekSalt: '!!notb64' }); // expect reject: "Invalid kekSalt encoding"
await HK.getHardwareFactor({ kekSalt: 12345 });      // expect reject: "KEK_SALT_MALFORMED: kekSalt must be a base64 string"
```

Each must REJECT (per `HardwareKekPlugin.kt:277-295`) — none may resolve with an H, and
logcat must show NO `salt-source: v1-fixed` line for these calls (that would be the
silent-fallback regression).

**2b — wrong-salt vault swap (the load-bearing proof):**

1. Via CDP: replace the blob's `kekSalt` with a DIFFERENT valid 44-char base64 value
   (`btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))`), write
   back, verify the write took.
2. Attempt unlock with the correct PIN + biometric.
   - Expect logcat: `salt-source: v2-bound` (the plugin USED the tampered salt — this
     line is what proves the salt is the HMAC input).
   - Expect: unlock FAILS with `KEK_ERR.UNWRAP_FAILED` surfaced as the standard
     wrong-PIN/device error. It must NOT succeed and must NOT silently fall back.
3. Restore the original blob via CDP. Unlock → succeeds. (Confirms the tamper, not
   collateral damage, caused the failure.)

**2c — malformed-salt vault (structural fail-closed):**

1. Via CDP: set `kekSalt` to `""`, write back. Attempt unlock.
   - Expect: `MALFORMED_VAULT` error BEFORE any biometric prompt (per
     `native.js:320-323` — `decodeKekSalt` runs pre-prompt). No `salt-source` logcat
     line at all.
2. Restore the original blob. Unlock → succeeds. Delete the local blob backup.

**Pass:** all three sub-tests behave exactly as above. This closes the "salt-tamper
negative test not performed" caveat with something STRONGER than the branch
attestation: a live demonstration that a different salt produces a different H.

---

## T3 — per-enrollment salt distinctness on device

Proves: fresh enrollments generate distinct salts on this device (entropy source sane
in production WebView, not just under the unit-test crypto shim).

1. From the T1/T2 vault: record its salt SHA-256 (= SALT-B, already recorded).
2. Settings → Security → unenroll hardware KEK (PIN-only vault), then re-enroll.
   - Expect logcat: fresh `enroll: key stored — tier=STRONGBOX (securityLevel=2)` and
     `salt-source: v2-bound` on the enroll-time derivation (APK-NEW enrolls straight
     to v3 — `native.js:652-658` generates the salt BEFORE deriving H).
   - CDP read-back: `hardwareKekVersion: 3`, salt SHA-256 = **SALT-C**.
3. Repeat once more (unenroll → re-enroll): salt SHA-256 = **SALT-D**.
4. Compare: SALT-A, SALT-B, SALT-C, SALT-D all pairwise distinct (four observed salts
   across the session, incl. T1's). Verify the final vault unlocks (cold restart, one
   prompt, `v2-bound`).

**Pass:** all recorded salt digests distinct + final unlock clean. Three-plus on-device
data points replaces "one enrollment observed".

---

## Piggyback — LOG-1 device spot-check (PR #572 redaction)

Run continuously, judge at the end:

1. Sweep `full-session.log` for leaks, mirroring the canary in
   `tests/android/specs/hardware-kek-e2e.spec.js:247`:
   - any JSON `"h"` field carrying a 44-char base64 value → FAIL;
   - any `Capacitor/Console` line with a long base64 run (vault blob, wrapped DEK) → FAIL.
   - Report COUNTS only in evidence docs; never paste matched lines (re-leak risk).
2. Optionally run the Appium canary spec itself against the installed APK-NEW for a
   second, automated opinion.

**Pass:** zero matches across a session that exercised enroll, unlock, migration,
tamper-reject, and unenroll — that's a far broader redaction spot-check than a single
unlock. Record as "LOG-1 remediation device-verified (debug build)"; the release-config
silence check remains a separate item.

---

## Optional bonus (not a gate)

KEK-gated Sepolia send from the final T3 vault → explorer-confirmed txid. Adds an
end-to-end anchor for the fresh-enroll-after-unenroll path. Requires testnet ETH;
skip freely.

## After the session — recording rules

- Update `docs/audit-2026-07-01-kek-internal.md` C-1 annotations: append a dated
  entry per residual (device-exercised / result), never rewrite the regression history.
- Update `docs/Feature-Status.md` §4 and `CLAUDE.md` "Still outstanding" lists:
  items that passed move from "unit-tested only" to "device-exercised 2026-07-XX
  (INTERNAL)"; anything that failed or surprised becomes a new dated finding.
- Language stays INTERNAL throughout. "Independent audit" remains outstanding and is
  unaffected by this session.
- Evidence artifacts: timestamps, logcat excerpts (redacted per LOG-1 rules), salt
  SHA-256 table, read-back JSON (version + saltLen + digest only).
