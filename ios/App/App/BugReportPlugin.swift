// BugReportPlugin.swift — vendored iOS ReplayKit plugin for the opt-in
// bug-report screen recording feature.
//
// See docs/bug-report-recording-plan.md for the full contract.
//
// WHY VENDORED: same reason as HardwareKekPlugin / RaspIntegrityPlugin /
// VeyrnoxSpeechRecognitionPlugin — this app links iOS plugins exclusively
// through SPM (no Podfile), so a local plugin lives in the App target and
// must be re-added to packageClassList after every `cap sync` by
// scripts/register-local-ios-plugins.mjs.
//
// JS-side name: "BugReport" (see BugReportPluginBridge.m and slice 2c's
// updated captureBridge.js).
//
// STORE DISCLOSURE — Info.plist needs no new key: RPScreenRecorder does
// not require a usage-description entry. Apple presents its own consent
// dialog the first time startRecording() is called. That dialog is the
// system's, not ours; the app-level consent screen (BugReportFlow's
// explainer) is a separate promise the app makes to the user BEFORE
// invoking the plugin.
//
// RASP INTERACTION (Slice 2c/2d follow-up):
//   RaspIntegrityPlugin.m treats an active ReplayKit broadcast as a
//   tamper signal (screen mirroring / recording). For the bug-report
//   path, ReplayKit is EXPECTED. Slice 2c/2d must coordinate: this
//   plugin should notify RASP that a legitimate recording is in
//   progress so RASP does not raise its own indicator during the
//   captured window. NOT WIRED YET in slice 2a — plugin is inert
//   without JS callers (see captureBridge.js still on the mock).

import Foundation
import Capacitor
import ReplayKit

@objc(BugReportPlugin)
public class BugReportPlugin: CAPPlugin {

    private let messageUnavailable = "RPScreenRecorder is not available on this device"
    private let messageAlreadyRecording = "A recording is already in progress"
    private let messageNoRecording = "No recording is in progress"
    private let messageDenied = "User denied screen recording"

    private var recordingStartedAt: Date?

    // Availability check — safe to call from a JS availability probe.
    // Never triggers the system consent dialog; that fires on start().
    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": RPScreenRecorder.shared().isAvailable])
    }

    // Starts a screen recording. Resolves once the recorder is active.
    // Rejects on: system unavailable, user denies system dialog, another
    // recording already in progress, ReplayKit init error.
    //
    // Contract: after resolve, the recorder writes to an OS-managed
    // buffer until stopRecording() moves it to disk. Nothing is written
    // to app storage between start and stop.
    @objc func startRecording(_ call: CAPPluginCall) {
        let recorder = RPScreenRecorder.shared()
        guard recorder.isAvailable else {
            call.reject(messageUnavailable)
            return
        }
        if recorder.isRecording {
            call.reject(messageAlreadyRecording)
            return
        }
        // Microphone deliberately OFF. The bug-report contract in
        // docs/bug-report-recording-plan.md §Non-goals commits to
        // "No microphone or camera capture."
        recorder.isMicrophoneEnabled = false
        recorder.isCameraEnabled = false

        recorder.startRecording { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    // AVError.userDeclined (–11833) is the deny path.
                    call.reject(error.localizedDescription)
                    return
                }
                self?.recordingStartedAt = Date()
                call.resolve()
            }
        }
    }

    // Stops the recording and writes to a fresh file under the app's
    // temp dir. Resolves with { path, size, duration_ms }.
    //
    // The file lives at NSTemporaryDirectory()/bug-report-<uuid>.mov
    // and is deliberately NOT persisted across the flow — Slice 2c's JS
    // reads it, encrypts + uploads via sendBugReport, then calls
    // deleteRecording() to remove it. If the JS layer crashes between
    // stopRecording and deleteRecording, the file lingers until iOS
    // reclaims temp; nothing on disk is decrypted.
    @objc func stopRecording(_ call: CAPPluginCall) {
        let recorder = RPScreenRecorder.shared()
        guard recorder.isRecording else {
            call.reject(messageNoRecording)
            return
        }

        let outputURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("bug-report-\(UUID().uuidString).mov")

        // iOS 15+ writes directly to a URL. Callers below 15 would need
        // stopRecording(handler:) + RPPreviewViewController + AVAssetExport
        // to get bytes — a lot of code for versions the app no longer
        // supports (bump minimum in ios/App/CapApp-SPM/Package.swift
        // Package.swift when this ships).
        if #available(iOS 15.0, *) {
            recorder.stopRecording(withOutput: outputURL) { [weak self] error in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    if let error = error {
                        call.reject(error.localizedDescription)
                        return
                    }
                    let attrs = try? FileManager.default.attributesOfItem(atPath: outputURL.path)
                    let size = (attrs?[.size] as? NSNumber)?.intValue ?? 0
                    let durationMs = Int(
                        (Date().timeIntervalSince(self.recordingStartedAt ?? Date())) * 1000
                    )
                    self.recordingStartedAt = nil
                    call.resolve([
                        "path": outputURL.path,
                        "size": size,
                        "duration_ms": durationMs,
                    ])
                }
            }
        } else {
            call.reject("iOS 15 or later required")
        }
    }

    // Abort a live recording, discarding the buffer. Called by the
    // BugReportFlow kill switches (visibility, route change, close).
    @objc func abortRecording(_ call: CAPPluginCall) {
        let recorder = RPScreenRecorder.shared()
        guard recorder.isRecording else {
            call.resolve() // idempotent — abort on nothing is fine
            return
        }
        // stopRecording writes the file; discardRecording tears it down
        // without producing output. That is exactly what abort means.
        recorder.discardRecording { [weak self] in
            DispatchQueue.main.async {
                self?.recordingStartedAt = nil
                call.resolve()
            }
        }
    }

    // Read the raw bytes of a recording file the JS side needs to
    // encrypt. Returns { base64 }.
    //
    // Base64 for the same reason the speech plugin returns strings —
    // Capacitor 8's JS bridge does not have a first-class binary
    // channel, and reading via Filesystem plugin would add a
    // dependency this slice doesn't otherwise pull in. Encoded size
    // is ~1.33× the file size, which is fine for the 52 MiB cap.
    @objc func readRecording(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("path required")
            return
        }
        // Refuse anything outside NSTemporaryDirectory — the plugin
        // owns those files and should not read arbitrary disk paths on
        // request. Belt-and-braces: the JS layer only ever supplies a
        // path we returned from stopRecording, but a compromised JS
        // caller (or a future refactor) must not turn this into a
        // file-read primitive.
        let tempPrefix = NSTemporaryDirectory()
        guard path.hasPrefix(tempPrefix) else {
            call.reject("path outside temp dir")
            return
        }
        do {
            let data = try Data(contentsOf: URL(fileURLWithPath: path))
            call.resolve(["base64": data.base64EncodedString()])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    // Delete a recording file. Called after the JS side has read the
    // bytes and either uploaded or discarded. Idempotent — no error
    // if the file has already been removed.
    @objc func deleteRecording(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("path required")
            return
        }
        let tempPrefix = NSTemporaryDirectory()
        guard path.hasPrefix(tempPrefix) else {
            call.reject("path outside temp dir")
            return
        }
        try? FileManager.default.removeItem(atPath: path)
        call.resolve()
    }
}
