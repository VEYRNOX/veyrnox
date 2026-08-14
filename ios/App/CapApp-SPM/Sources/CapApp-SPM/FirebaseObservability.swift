import Foundation
import FirebaseCore
import FirebaseCrashlytics
import FirebasePerformance

/// Test-only Firebase observability bootstrap.
///
/// Normal and store builds never pass the launch argument and do not receive a
/// GoogleService-Info.plist, so Firebase is neither configured nor permitted to
/// collect. The fixed smoke event contains no wallet or user data.
public enum FirebaseObservability {
    public static func configureTestLabSmokeIfRequested() {
        guard CommandLine.arguments.contains("--firebase-observability-smoke") else {
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
        crashlytics.setCustomValue("firebase_test_lab", forKey: "build_channel")
        crashlytics.log("Firebase Test Lab observability smoke started")
        crashlytics.record(error: NSError(
            domain: "com.veyrnox.firebase-smoke",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "VEYRNOX_FIREBASE_NONFATAL_SMOKE"]
        ))
        crashlytics.sendUnsentReports()

        let performance = Performance.sharedInstance()
        performance.isDataCollectionEnabled = true
        performance.isInstrumentationEnabled = true
        let trace = Performance.startTrace(name: "staging_launch_smoke")
        trace?.incrementMetric("completed", by: 1)
        trace?.stop()
    }
}
