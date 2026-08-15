import Foundation
import FirebaseCore
import FirebaseCrashlytics
import FirebasePerformance

/// Firebase Test Lab-only observability bootstrap.
///
/// **Test Lab is the ONLY channel that may configure Firebase (F-1, 2026-08-15).**
/// The previous staging branch is deliberately gone: Crashlytics and Performance
/// are native-layer SDKs that consult neither `lib/consent.js` nor
/// `isDeniabilityOrDemoActive()`, so on any build a human installs — TestFlight
/// or Play internal testing — a crash or trace occurring inside a decoy, duress
/// or stealth session would transmit to Google. That breaks I3 ("deniability
/// mode makes zero backend calls"), and a runtime toggle cannot fix it: a crash
/// can beat the toggle and the SDK may already hold queued reports.
///
/// Test Lab is safe by construction — Google's own hardware, no real user, no
/// wallet, no coercion scenario — and it is where the automated Robo crawl that
/// would have caught the build-5 Create Wallet failure actually runs.
///
/// Real-device crash signal comes from the first-party tools the pre-submission
/// checklist already mandates: TestFlight → Crashes and Xcode Organizer →
/// Crashes / Metrics / Hangs.
///
/// Production and staging archives receive no GoogleService-Info.plist, and CI
/// asserts its absence in the exported app (see firebase-test-lab.yml).
public enum FirebaseObservability {
    public static func configureIfEnabled() {
        let isTestLab = CommandLine.arguments.contains("--firebase-observability-smoke")
        guard isTestLab else {
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

        let performance = Performance.sharedInstance()
        performance.isDataCollectionEnabled = true
        performance.isInstrumentationEnabled = true

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
