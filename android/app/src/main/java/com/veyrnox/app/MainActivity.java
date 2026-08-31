package com.veyrnox.app;

import android.app.AlertDialog;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.crashlytics.FirebaseCrashlytics;
import com.google.firebase.perf.FirebasePerformance;
import com.google.firebase.perf.metrics.Trace;
import com.veyrnox.app.FileSaverPlugin;
import com.veyrnox.app.HardwareKekPlugin;
import com.veyrnox.app.RaspIntegrityPlugin;
import com.veyrnox.app.PlayIntegrityPlugin;
import com.veyrnox.app.VeyrnoxEnclavePlugin;
import com.veyrnox.app.AndroidBiometricCachePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
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
        // Store-specific billing plugins must only load in the flavor that ships
        // their runtime SDKs. The google flavor (which Firebase/Test Lab uses)
        // has neither the RevenueCat Galaxy store module nor the Huawei HMS IAP
        // classes, so registering them unconditionally would fail there.
        if ("samsung".equals(BuildConfig.FLAVOR)) {
            registerStorePlugin("com.veyrnox.app.SamsungIapPlugin");
        }
        if ("huawei".equals(BuildConfig.FLAVOR)) {
            registerStorePlugin("com.veyrnox.app.HuaweiIapPlugin");
        }
        super.onCreate(savedInstanceState);

        // Firebase Test Lab-ONLY observability (F-1, 2026-08-15). The staging
        // channel was removed: Crashlytics/Performance are native-layer and
        // consult neither lib/consent.js nor isDeniabilityOrDemoActive(), so on
        // any build a human installs, a crash inside a decoy/duress session
        // would transmit to Google (I3). FIREBASE_OBSERVABILITY_ENABLED is now
        // true only in the isolated `firebaseTest` variant. Never attach wallet
        // state, addresses, balances, PINs, seeds, URLs, or user identifiers.
        if (BuildConfig.FIREBASE_OBSERVABILITY_ENABLED
                && !FirebaseApp.getApps(this).isEmpty()) {
            FirebaseCrashlytics crashlytics = FirebaseCrashlytics.getInstance();
            crashlytics.setCrashlyticsCollectionEnabled(true);
            crashlytics.setCustomKey("build_channel", "firebase_test_lab");

            FirebasePerformance performance = FirebasePerformance.getInstance();
            performance.setPerformanceCollectionEnabled(true);

            // Synthetic fixed-value events belong only to the isolated Test Lab APK.
            if (BuildConfig.FIREBASE_OBSERVABILITY_SMOKE) {
                crashlytics.log("Firebase Test Lab observability smoke started");
                crashlytics.recordException(new IllegalStateException(
                    "VEYRNOX_FIREBASE_NONFATAL_SMOKE"
                ));
                crashlytics.sendUnsentReports();

                Trace trace = performance.newTrace("staging_launch_smoke");
                trace.start();
                trace.putMetric("completed", 1L);
                trace.stop();
            }
        }

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

    @SuppressWarnings("unchecked")
    private void registerStorePlugin(String className) {
        try {
            Class<?> pluginClass = Class.forName(className);
            registerPlugin((Class<? extends Plugin>) pluginClass);
        } catch (ClassNotFoundException e) {
            // A selected store flavor must include its adapter rather than silently omitting billing.
            throw new IllegalStateException("Missing store plugin: " + className, e);
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
