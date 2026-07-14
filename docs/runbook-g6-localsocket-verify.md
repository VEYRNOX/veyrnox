# Runbook — G6 `checkLocalSocketConnect()` device verification

**Status:** BUILT / structural pins only — NOT device-verified (as of 2026-07-14)
**Target device:** Samsung Galaxy Note 20 5G (SM-N981B), Android 12, Magisk v30.7
**Source:** `android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt`
**Added in:** PR #974
**Closes (if executed):** the G6 device-verify gap recorded in `CLAUDE.md` and
`docs/Feature-Status.md` §7 ("checkLocalSocketConnect — BUILT, NOT device-verified")

This runbook is a plan, not evidence. Nothing here is "device-verified" until the session
is run and results are recorded in Step 6.

---

## Background

`checkLocalSocketConnect()` is a behavioral probe added as a belt-and-suspenders
complement to `checkProcNetUnix()`, which was found to be structurally inert on Android
10+ (SELinux denies `untrusted_app` `proc_net` reads — device-verified 2026-07-14 on
this same SM-N981B).

The probe attempts `LocalSocket.connect()` to four abstract Unix sockets used by root
framework companion daemons:

| Socket name | Framework | Rationale |
|---|---|---|
| `zygisk_server` | Zygisk companion IPC (Magisk v24+) | Fixed name from `zygisk/daemon.cpp SOCKET_NAME` |
| `lspd_0` | LSPosed daemon at UID 0 | Format: `lspd_<uid>`; UID 0 = root |
| `apd` | APatch companion daemon | APatch root framework |
| `ksud` | KernelSU daemon | KernelSU root framework |

A `LocalSocket.connect()` probe does NOT require `proc_net` read permission (it is a
connect-only syscall), which is why it was added after `checkProcNetUnix()` was confirmed
inert. However, SELinux on hardened Android 12+ may deny the connect itself from the
`untrusted_app` domain — hence the need for device verification.

**Expected prior-session context (SM-N981B, Magisk v30.7, 2026-07-14):**
- `checkDangerousProps` FIRES: `ro.boot.verifiedbootstate=orange`, `ro.boot.flash.locked=0`
  via `SystemProperties` reflection — this is the operative root signal.
- `checkProcNetUnix` does NOT fire: SELinux denies `proc_net` reads for `untrusted_app`.
- `checkSuFromRuntime` does NOT fire: Magisk Hide covers `su` in PATH for this app.
- `rooted:true` confirmed; `hookedProcess:false`; `emulator:false`; `tampered:true`
  (debug build, `RELEASE_CERT_SHA256` unset — expected, fail-closed I4).

The question for G6: does `checkLocalSocketConnect()` ALSO fire on Magisk v30.7 on
Android 12, or does SELinux block the connect from `untrusted_app`?

Both outcomes are honest and valid. The check is structurally correct in either case.

---

## Prerequisites

- Samsung Galaxy Note 20 5G (SM-N981B), Android 12, Magisk v30.7
- USB debugging enabled; device authorized for the host machine
- Android SDK installed on host; `adb` in PATH
- Current `main` branch checked out in the project root
- Java/Gradle available for the Android build
- `RELEASE_CERT_SHA256` NOT set in `android/local.properties` — `tampered:true` is
  expected (same as prior sessions; do not set it for this session)
- No LSPosed, APatch, or KernelSU installed on the device — stock Magisk v30.7 only
  (only `zygisk_server` is relevant on a Magisk-only device; the other three socket names
  will be absent and return ECONNREFUSED)
- Optional: a Sepolia-funded wallet imported for the end-of-session bonus send (not
  required to close the G6 gap)

---

## Step 1 — Build and install the debug APK

From the project root on the host machine:

```bash
cd android
./gradlew assembleDebug
```

Then install:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Verify the install succeeded:

```bash
adb shell pm list packages | grep veyrnox
# expected: package:com.veyrnox.app.debug
```

Note the build timestamp so it can be correlated with device-local times in Step 3.

---

## Step 2 — Capture logcat before launching

Open two terminals on the host.

**Terminal A — RASP-tagged output only:**

```bash
adb logcat -c
adb logcat -s RASP:W -s Capacitor:D | tee /tmp/g6-verify-rasp.log
```

Note: `checkLocalSocketConnect()` itself has no `Log.*` instrumentation — its result
feeds `detectRoot()` which feeds `checkIntegrity()`. The RASP tag captures the tamper
warning line; the Capacitor tag captures the bridge method call and return value in debug
builds. The overall verdict JSON appears in the Capacitor bridge output.

**Terminal B — full session log (for post-session review):**

```bash
adb logcat -v time > /tmp/g6-verify-full.log
```

Leave both terminals running throughout the session.

---

## Step 3 — Trigger `checkIntegrity()` and capture the verdict

`checkIntegrity()` is called via `selectPresignProbeSource` when the Send screen loads.

1. Launch Veyrnox on the device.
2. Unlock the wallet (enter PIN or biometric as applicable).
3. Navigate to the Send screen.
4. Wait for the RASP verdict banner to appear (the "Security check" banner or the WARN /
   ALLOW indicator beneath the send form).
5. Note the device-local time at the moment the banner appears.

The `checkIntegrity()` bridge call result will appear in Terminal A in the form:

```
D Capacitor/Plugin: To return:  {"rooted":true,"hookedProcess":false,"emulator":false,"tampered":true}
```

or similar (exact Capacitor log prefix varies by Capacitor version). Record the full
JSON and the device-local timestamp.

---

## Step 4 — Isolate whether `checkLocalSocketConnect` fired

Because `checkDangerousProps` already fires on this device, the overall
`"rooted":true` in the verdict JSON does not distinguish which root check contributed.
Use the adb shell steps below to establish the ground truth.

### 4a — Check for socket existence as the app UID (via `run-as`)

```bash
adb shell run-as com.veyrnox.app.debug \
  cat /proc/net/unix 2>/dev/null | grep -iE 'zygisk|lspd|apd|ksud'
```

If this returns empty or an error: the SELinux `proc_net` read denial is confirmed for
the app UID (consistent with prior session evidence). This step is informational only —
`checkLocalSocketConnect` does not use `proc_net`.

### 4b — Check for socket existence at root level

```bash
adb shell su -c "cat /proc/net/unix | grep -iE 'zygisk_server|lspd_0|\"apd\"|ksud'"
```

This must be run as root (Magisk shell). Record the output precisely.

- If `zygisk_server` appears in the root output: the socket EXISTS at OS level. The
  question is whether the app's connect() is SELinux-allowed or denied. Go to Step 4c.
- If `zygisk_server` does NOT appear: Magisk v30.7 uses a different socket name for the
  Zygisk companion IPC on this device. The probe returns ECONNREFUSED (socket absent,
  not SELinux denial) — the G6 check is operating correctly (no false positive) but cannot
  detect this Magisk version via the named sockets. Record this as Outcome B-variant.

### 4c — If the socket exists: check SELinux AVC in logcat

After the Send screen triggered `checkIntegrity()`, search Terminal B's full log for an
AVC denial targeting the socket connect:

```bash
grep -i "avc.*denied.*zygisk\|avc.*denied.*lspd\|avc.*denied.*apd\|avc.*denied.*ksud" \
  /tmp/g6-verify-full.log
```

- AVC denial present → SELinux blocked the connect → Outcome B (fail-open as designed).
- AVC denial absent and socket EXISTS (Step 4b) → connect was permitted → Outcome A.

---

## Step 5 — Determine and record the outcome

### Outcome A — `checkLocalSocketConnect` fires (connect succeeded)

The `hookedProcess` or `rooted` field does not change (they were already `true`), but the
connect to `zygisk_server` returned `true` inside `runCatching`, confirming the daemon
socket is reachable from `untrusted_app` on this device and Magisk version.

Evidence to record:
- Full `checkIntegrity()` verdict JSON with device-local timestamp.
- Root shell `proc/net/unix` output confirming `zygisk_server` socket is present.
- No AVC denial in logcat for the socket connect.

Status to record: **DEVICE-VERIFIED (INTERNAL, Outcome A — connect succeeded)**.

Update `CLAUDE.md` G6 entry and `docs/Feature-Status.md` §7.

### Outcome B — SELinux blocks the connect (fail-open)

`checkLocalSocketConnect` returns `false` for all four sockets because SELinux denies
`untrusted_app → abstract_socket` connect on Android 12 with the stock Magisk SELinux
policy. This is the expected outcome on hardened Android 12+ and is the intended
fail-open behaviour (the check does not throw; it returns `false`).

`rooted:true` still fires via `checkDangerousProps` — there is no security regression.

Evidence to record:
- Full `checkIntegrity()` verdict JSON (still shows `rooted:true` from `checkDangerousProps`).
- Root shell `proc/net/unix` output confirming whether `zygisk_server` socket is present
  or absent (disambiguates SELinux denial vs. socket-absent ECONNREFUSED).
- AVC denial in logcat if the socket exists (confirms the SELinux block).

Status to record: **DEVICE-VERIFIED (INTERNAL, Outcome B — SELinux-blocked, fail-open as
designed; `checkDangerousProps` is the operative Magisk signal on SM-N981B Android 12)**.

Update `CLAUDE.md` G6 entry and `docs/Feature-Status.md` §7.

### Outcome B-variant — socket absent (different socket name in Magisk v30.7)

Neither the app connect nor the root shell `proc/net/unix` grep finds `zygisk_server`.
The probe returns ECONNREFUSED (daemon not listening on this name).

Evidence to record:
- Root shell `proc/net/unix` output showing no matching socket.
- Note: Magisk v30.7 Zygisk companion may use a randomised or versioned socket name that
  differs from the hardcoded `"zygisk_server"` marker. File a follow-up to inspect Magisk
  v30.7 source (`zygisk/daemon.cpp`) to confirm the actual socket name. `checkDangerousProps`
  remains the operative signal.

Status to record: **DEVICE-VERIFIED (INTERNAL, Outcome B-variant — socket absent on
Magisk v30.7; probe structurally correct, marker name may not match this Magisk version)**.

---

## Step 6 — Record findings and update documentation

### 6a — Evidence to capture (all must be recorded before updating docs)

```
Date (device-local):
Device: Samsung Galaxy Note 20 5G SM-N981B
Android version: 12
Magisk version: v30.7
Build: com.veyrnox.app.debug (debug, RELEASE_CERT_SHA256 not set)

checkIntegrity() verdict:
  Timestamp:
  JSON: { "rooted": , "hookedProcess": , "emulator": , "tampered": }

Step 4b — root shell /proc/net/unix grep output:
  [paste output or "no output"]

Step 4c — AVC denial in logcat (if socket present):
  [paste matching lines or "no AVC denial found"]

Outcome: [ A / B / B-variant ]
Operative root signal on this device: checkDangerousProps (verifiedbootstate=orange)
```

### 6b — CLAUDE.md update (G6 entry)

Find the G6 entry in `CLAUDE.md` (search for `checkLocalSocketConnect`) and update it
with the outcome, date, and device. Do not soften "INTERNAL" — this is not independently
audited. Use the exact language:

**If Outcome A:**
```
G6 checkLocalSocketConnect ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-XX) on SM-N981B
(Android 12, Magisk v30.7): connect to zygisk_server abstract socket succeeded from
untrusted_app — SELinux policy on this device permits the connect. Belt-and-suspenders
with checkDangerousProps (verifiedbootstate=orange, operative). NOT independently audited.
```

**If Outcome B:**
```
G6 checkLocalSocketConnect DEVICE-VERIFIED (INTERNAL, 2026-07-XX, SELinux-blocked,
fail-open as designed) on SM-N981B (Android 12, Magisk v30.7): connect denied for all
four abstract sockets — avc denied confirmed in logcat. Fail-open (returns false, not
throw) as intended. checkDangerousProps (verifiedbootstate=orange) is the operative root
signal on Android 12. NOT independently audited.
```

**If Outcome B-variant:**
```
G6 checkLocalSocketConnect DEVICE-VERIFIED (INTERNAL, 2026-07-XX, socket absent) on
SM-N981B (Android 12, Magisk v30.7): zygisk_server not present in /proc/net/unix at root
level — Magisk v30.7 Zygisk companion uses a different socket name. Follow-up: inspect
Magisk v30.7 zygisk/daemon.cpp for the actual SOCKET_NAME. checkDangerousProps is the
operative signal. NOT independently audited.
```

### 6c — `docs/Feature-Status.md` §7 update

Update the G6 row from "BUILT, NOT device-verified" to the appropriate outcome using the
same language as 6b. Do not use the word "verified" without the INTERNAL qualifier.

---

## Honest gaps (preserved regardless of outcome)

- `checkLocalSocketConnect` is belt-and-suspenders. If SELinux blocks it (Outcome B/B-
  variant), no security regression occurs — `checkDangerousProps` is the primary operative
  root signal on SM-N981B Android 12.
- LSPosed, APatch, and KernelSU socket probes (`lspd_0`, `apd`, `ksud`) are only
  relevant if those frameworks are installed. On a stock Magisk-only device, only
  `zygisk_server` is expected to be present.
- The Magisk v30.7 Zygisk companion socket name requires source confirmation — if
  Outcome B-variant occurs, file a follow-up item.
- This is INTERNAL evidence only. Passing this session does not constitute independent
  audit and does not promote any catalogue feature to `verified` (that bar requires a
  per-asset explorer txid and applies to asset sends, not security controls).
- Independent security audit remains outstanding for the full RASP stack.
