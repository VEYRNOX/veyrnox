package com.veyrnox.app;

import android.app.Activity;

import com.google.firebase.FirebaseApp;
import com.google.firebase.crashlytics.FirebaseCrashlytics;
import com.google.firebase.perf.FirebasePerformance;
import com.google.firebase.perf.metrics.Trace;

/**
 * Firebase Test Lab-ONLY observability (F-1, 2026-08-15). GMS variant.
 *
 * <p>Lives in the shared {@code src/gms} source set, wired into the google and
 * samsung flavors only. The huawei and fdroid flavors get the no-op twin in
 * {@code src/nogms} — they declare no Firebase dependency, and MainActivity
 * previously referenced these classes directly, which made those two flavors
 * fail to compile at all.
 *
 * <p>The staging channel was removed: Crashlytics/Performance are native-layer
 * and consult neither lib/consent.js nor isDeniabilityOrDemoActive(), so on any
 * build a human installs, a crash inside a decoy/duress session would transmit
 * to Google (I3). FIREBASE_OBSERVABILITY_ENABLED is true only in the isolated
 * {@code firebaseTest} variant. Never attach wallet state, addresses, balances,
 * PINs, seeds, URLs, or user identifiers.
 */
final class FirebaseTestLabObservability {
    private FirebaseTestLabObservability() {}

    static void start(Activity activity) {
        if (!BuildConfig.FIREBASE_OBSERVABILITY_ENABLED
                || FirebaseApp.getApps(activity).isEmpty()) {
            return;
        }

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
}
