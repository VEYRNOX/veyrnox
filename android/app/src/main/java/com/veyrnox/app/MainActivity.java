package com.veyrnox.app;

import android.app.AlertDialog;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;
import com.veyrnox.app.FileSaverPlugin;
import com.veyrnox.app.HardwareKekPlugin;
import com.veyrnox.app.RaspIntegrityPlugin;
import com.veyrnox.app.PlayIntegrityPlugin;
import com.veyrnox.app.VeyrnoxEnclavePlugin;
import com.veyrnox.app.AndroidBiometricCachePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Android 15 (SDK 35+) draws every activity edge-to-edge by default.
        // targetSdk=36 is subject to that; enable the compatible window setup.
        // This does not prove correct WebView insets or remove deprecated calls
        // inside dependencies. Play still reports those on versionCode 56 (#2749).
        // Check both the wallet and the RASP-block dialog on a physical device.
        EdgeToEdge.enable(this);

        // Pre-WebView RASP gate — must run before plugin registration and
        // super.onCreate() so the Capacitor bridge never initialises on
        // BLOCK-tier (hooked/tampered) devices.
        if (RaspIntegrityPlugin.Companion.earlyCheck(this)) {
            super.onCreate(null);
            showNativeBlockScreen();
            return;
        }

        registerPlugin(FileSaverPlugin.class);
        registerPlugin(HardwareKekPlugin.class);
        registerPlugin(RaspIntegrityPlugin.class);
        registerPlugin(PlayIntegrityPlugin.class);
        // M2d — Android StrongBox/TEE vault-blob wrap (ungated PR #1152).
        registerPlugin(VeyrnoxEnclavePlugin.class);
        registerPlugin(AndroidBiometricCachePlugin.class);
        registerPlugin(OtaUpdatePlugin.class);
        // InstallReferrerPlugin lives in src/gms (google + samsung, #2541). Load
        // reflectively so huawei/fdroid builds, which have no Play Store and no
        // referrer library, compile without it. Absent class = JS sees no referrer.
        try {
            registerPlugin((Class) Class.forName("com.veyrnox.app.InstallReferrerPlugin"));
        } catch (ClassNotFoundException e) {
            // nogms flavour — nothing to register.
        }
        // HuaweiIapPlugin lives in the `huawei` source set (HMS-only classpath).
        // Load reflectively so google/samsung/fdroid builds compile without HMS.
        if (BuildConfig.HAS_HUAWEI_IAP) {
            try {
                Class<?> huaweiIap = Class.forName("com.veyrnox.app.HuaweiIapPlugin");
                registerPlugin((Class) huaweiIap);
            } catch (ClassNotFoundException e) {
                // Flavor mislabelled — fail-open on registration only. IAP calls
                // will surface HUAWEI_IAP_NOT_WIRED at the JS boundary.
            }
        }
        // OTA web bundle: boot a signed, fully verified downloaded bundle if one
        // exists, else the one shipped in the APK. Also clears Capacitor's own
        // unverified persisted server path. See OtaUpdatePlugin / docs/ota-updates.md.
        String otaDir = OtaUpdatePlugin.resolveLaunchDir(this);
        if (otaDir != null) {
            bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.BASE_PATH, otaDir));
        }
        super.onCreate(savedInstanceState);

        // Firebase Test Lab-ONLY observability (F-1, 2026-08-15). The body lives
        // in a per-flavor class: the real one in src/gms (google + samsung), a
        // no-op in src/nogms (huawei + fdroid). It was inline here and imported
        // the Firebase SDK directly, which made the huawei and fdroid flavors
        // fail to compile — neither declares a Firebase dependency, and no CI
        // job ever built them. See android/app/build.gradle sourceSets.
        //
        // This file is in the shared `main` source set, so it must never name
        // that SDK again; firebase-observability.test.js asserts exactly that.
        FirebaseTestLabObservability.start(this);

        // FLAG_SECURE — block screenshots, screen recording, and the recents /
        // app-switcher thumbnail for the whole window. The wallet's threat model
        // includes a seized device, so sensitive screens (seed reveal/QR, balances,
        // decoy/duress) must not be capturable. Applied window-wide as the safer
        // default for a self-custody wallet.
        // M13: DEVICE-VERIFIED (INTERNAL, 2026-07-14) — Samsung Galaxy Note 20 5G
        // SM-N981B, Android debug build. `adb exec-out screencap -p` returned 0 bytes
        // (OS refused capture entirely) with mScreenState=ON and mCurrentFocus=
        // com.veyrnox.app.debug/com.veyrnox.app.MainActivity — FLAG_SECURE propagates
        // to the Capacitor WebView surface. Verified via tests/android/specs/
        // flag-secure-screenshot-e2e.spec.js (manual adb path). INTERNAL.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // filterTouchesWhenObscured — refuse tap events on the Capacitor WebView when
        // another app's TYPE_APPLICATION_OVERLAY window is above it. Blocks overlay-
        // phishing attacks that draw a fake "Confirm" button over the real PIN pad or
        // Send button and harvest the tap. Called after super.onCreate() so the Bridge
        // and its WebView are already initialised.
        getBridge().getWebView().setFilterTouchesWhenObscured(true);

        // Disable remote WebView debugging in release builds so an attacker with ADB
        // access cannot attach Chrome DevTools to read in-memory JS state or drive the
        // UI. Debug builds keep it on for development.
        // TARGET: verify on a REAL release build that CDP can no longer attach.
        if (!BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(false);
        }
    }

    private void showNativeBlockScreen() {
        new AlertDialog.Builder(this)
            .setTitle("Security Alert")
            .setMessage(
                "This device has been modified in a way that cannot be verified as safe. " +
                "Veyrnox cannot start to protect your assets."
            )
            .setCancelable(false)
            .setPositiveButton("Exit", (dialog, which) -> finishAffinity())
            .show();
    }
}
