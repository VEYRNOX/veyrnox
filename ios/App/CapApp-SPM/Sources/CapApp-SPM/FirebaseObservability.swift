import Foundation
import FirebaseCore
import FirebaseCrashlytics
import FirebasePerformance

/// Staging-only Firebase observability bootstrap.
///
/// Production builds receive neither the build flag nor GoogleService-Info.plist,
/// so Firebase is not configured. The fixed smoke event contains no wallet or
/// user data and is emitted only by Firebase Test Lab.
public enum FirebaseObservability {
    public static func configureIfEnabled() {
        let isTestLab = CommandLine.arguments.contains("--firebase-observability-smoke")
        let isStaging = (Bundle.main.object(
            forInfoDictionaryKey: "VeyrnoxFirebaseObservabilityEnabled"
        ) as? String)?.uppercased() == "YES"
        guard isTestLab || isStaging else {
            return
        }
        guard FirebaseApp.app() == nil,
              let configPath = Bundle.main.path(
                forResource: "GoogleService-Info",
                ofType: "plist"
              ),
              let options = FirebaseOptions(contentsOfFile: configPath) else {
            return
        }

        FirebaseApp.configure(options: options)

        let crashlytics = Crashlytics.crashlytics()
        crashlytics.setCrashlyticsCollectionEnabled(true)
        crashlytics.setCustomValue(
            isTestLab ? "firebase_test_lab" : "staging",
            forKey: "build_channel"
        )

        let performance = Performance.sharedInstance()
        performance.isDataCollectionEnabled = true
        performance.isInstrumentationEnabled = true

        if isTestLab {
            crashlytics.log("Firebase Test Lab observability smoke started")
            crashlytics.record(error: NSError(
                domain: "com.veyrnox.firebase-smoke",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "VEYRNOX_FIREBASE_NONFATAL_SMOKE"]
            ))
            crashlytics.sendUnsentReports()

            let trace = Performance.startTrace(name: "staging_launch_smoke")
            trace?.incrementMetric("completed", by: 1)
            trace?.stop()
        }
    }
}
