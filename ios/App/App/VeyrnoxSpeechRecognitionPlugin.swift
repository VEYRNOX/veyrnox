// VeyrnoxSpeechRecognitionPlugin.swift — vendored iOS Voice Commands speech plugin.
//
// WHY THIS EXISTS (root cause of "Voice Commands not enabled on iOS"):
// The JS layer (src/context/VoiceContext.jsx) calls the Capacitor plugin registered
// under the JS name "SpeechRecognition". On Android that name is served by the npm
// package @capacitor-community/speech-recognition (linked via Gradle). On iOS that
// package ships ONLY a CocoaPods .podspec and NO Package.swift — but this app links
// iOS plugins exclusively through SPM (ios/App/App/CapApp-SPM/Package.swift, no
// Podfile). So `cap sync` cannot wire it, its Swift class is never compiled into the
// binary, and the bridge lookup for "SpeechRecognition" fails → available() throws →
// the Voice Commands page reports unsupported. Latest published version is 7.0.1
// (a Capacitor-7 plugin); there is no Capacitor-8 release to upgrade to.
//
// FIX: vendor the plugin directly in the App target — the same pattern this repo
// already uses for HardwareKekPlugin and RaspIntegrityPlugin. The class name is
// unique (VeyrnoxSpeechRecognitionPlugin) to avoid any collision with the npm class,
// but it registers under the JS name "SpeechRecognition" (see the Bridge .m) so the
// existing JS import routes here unchanged. Registration is added to packageClassList
// by scripts/register-local-ios-plugins.mjs (Capacitor 8 does not scan the ObjC
// runtime — see that script's header for the full explanation).
//
// The recognition logic mirrors @capacitor-community/speech-recognition@7.0.1's
// iOS implementation (SFSpeechRecognizer + AVAudioEngine streaming). With
// partialResults=false — the mode VoiceContext uses — start() resolves once with the
// final transcript in `matches`, matching the Android one-shot contract the JS loop
// expects.
//
// Requires Info.plist keys NSSpeechRecognitionUsageDescription and
// NSMicrophoneUsageDescription (added alongside this file). Without them iOS hard-
// crashes the moment authorization is requested.

import Foundation
import Capacitor
import Speech
import AVFoundation

@objc(VeyrnoxSpeechRecognitionPlugin)
public class VeyrnoxSpeechRecognitionPlugin: CAPPlugin {

    private let defaultMatches = 5
    private let messageMissingPermission = "Missing permission"
    private let messageAccessDeniedMicrophone = "User denied access to microphone"
    private let messageOngoing = "Speech recognition is already running"
    private let messageUnknown = "Unknown error occurred"

    private var audioEngine: AVAudioEngine?
    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    // Availability check — never requests permission, safe to call from the JS
    // availability probe. Returns false (not a throw) when the device has no
    // recognizer for the default locale.
    @objc func available(_ call: CAPPluginCall) {
        guard let recognizer = SFSpeechRecognizer() else {
            call.resolve(["available": false])
            return
        }
        call.resolve(["available": recognizer.isAvailable])
    }

    private var currentLanguage: String?

    @objc func start(_ call: CAPPluginCall) {
        // Guards a genuinely overlapping call, not "the engine happens to already be
        // running" — the engine/session are now kept warm across back-to-back
        // commands (see the continuous-listening note below), so "already running"
        // is the normal, expected state between two consecutive start() calls.
        if recognitionTask != nil {
            call.reject(messageOngoing)
            return
        }

        let status = SFSpeechRecognizer.authorizationStatus()
        if status != .authorized {
            call.reject(messageMissingPermission)
            return
        }

        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            guard let self = self else { return }
            if !granted {
                call.reject(self.messageAccessDeniedMicrophone)
                return
            }

            let language = call.getString("language") ?? "en-US"
            let maxResults = call.getInt("maxResults") ?? self.defaultMatches
            let partialResults = call.getBool("partialResults") ?? false

            if self.speechRecognizer == nil || self.currentLanguage != language {
                self.speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: language))
                self.currentLanguage = language
            }

            guard let recognizer = self.speechRecognizer else {
                call.reject("Speech recognizer unavailable for \(language) on this device.")
                return
            }

            // Continuous-listening design: a fresh AVAudioEngine + AVAudioSession
            // route activation on every single command (the original behavior) is
            // the expensive part of the restart cycle — Android's equivalent restart
            // (SpeechRecognizer Intent to the OS service) never touches an app-level
            // audio route, which is why it read as "always listening" while iOS had a
            // perceptible gap between commands. Keep the engine/session warm across
            // calls and only rebuild the (cheap) recognition request + task each time.
            let engineAlreadyRunning = self.audioEngine?.isRunning == true

            // `available()` only checks the device's default-locale recognizer, so
            // re-verify the per-request-locale recognizer too — but ONLY on the
            // first listen of a session (engine not yet running). SFSpeechRecognizer
            // can legitimately report isAvailable == false for a brief moment while
            // it recycles between back-to-back on-device sessions; re-enforcing this
            // guard on every restart of an already-working continuous session turned
            // one transient false into a hard reject, and after 5 consecutive rejects
            // the JS loop gave up entirely — the "it ended on its own" symptom. A
            // session that has already recognized speech once is proven working;
            // don't second-guess it on every subsequent restart.
            if !engineAlreadyRunning && !recognizer.isAvailable {
                call.reject("Speech recognizer unavailable for \(language) on this device.")
                return
            }

            if !engineAlreadyRunning {
                self.audioEngine = AVAudioEngine()
                let audioSession = AVAudioSession.sharedInstance()
                do {
                    try audioSession.setCategory(.playAndRecord, options: .defaultToSpeaker)
                    try audioSession.setMode(.default)
                    do {
                        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
                    } catch {
                        call.reject("Microphone is already in use by another application.")
                        return
                    }
                } catch {
                    // Non-fatal category/mode failure — proceed; the engine start below
                    // will surface a hard failure if the session is truly unusable.
                }
            }

            self.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            self.recognitionRequest?.shouldReportPartialResults = partialResults

            // Prefer on-device recognition when the model is installed: it removes the
            // dependency on Apple's cloud speech service (and, with it, the "Enable
            // Dictation" system toggle and network reachability) — the same silent-hang
            // failure mode as the locale-availability gap above.
            if recognizer.supportsOnDeviceRecognition {
                self.recognitionRequest?.requiresOnDeviceRecognition = true
            }

            guard let engine = self.audioEngine, let request = self.recognitionRequest else {
                call.reject(self.messageUnknown)
                return
            }

            // Captured by identity below so a stray callback from a task we've
            // already retired (e.g. the cancellation error our own .cancel() call
            // triggers, below) can be told apart from the CURRENT task — without
            // this, that late callback would run teardownEngine() against
            // whichever session is active by the time it arrives, killing a
            // next command that had already started successfully.
            var thisTask: SFSpeechRecognitionTask?

            thisTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self = self else { return }
                guard self.recognitionTask == nil || self.recognitionTask === thisTask else {
                    // Stale callback from a task that's no longer current — ignore.
                    return
                }

                if let result = result {
                    let matches = NSMutableArray()
                    var counter = 0
                    for transcription in result.transcriptions {
                        if maxResults > 0 && counter < maxResults {
                            matches.add(transcription.formattedString)
                        }
                        counter += 1
                    }

                    if partialResults {
                        self.notifyListeners("partialResults", data: ["matches": matches])
                        if result.isFinal {
                            self.recognitionRequest = nil
                            self.recognitionTask = nil
                            self.notifyListeners("listeningState", data: ["status": "stopped"])
                        }
                    } else {
                        // One-shot contract: the FIRST result is the answer — do not
                        // wait for Apple's own `isFinal` timing. `isFinal` can lag
                        // well past our between-command pause (Apple's finalization
                        // silence-timeout can run several seconds), so waiting for it
                        // left `recognitionTask` non-nil when the next start() call
                        // arrived, which rejected with "Speech recognition is already
                        // running" — the task ONLY ever got past its first command.
                        call.resolve(["matches": matches])
                        self.recognitionTask?.cancel()
                        self.recognitionRequest = nil
                        self.recognitionTask = nil
                        self.notifyListeners("listeningState", data: ["status": "stopped"])
                    }
                }

                if let error = error {
                    // A real recognition error (vs. a clean resolve above) forces a
                    // full teardown — the engine/session may be in a bad state and a
                    // warm reuse next call could otherwise wedge silently. The
                    // staleness guard above ensures this never fires for the benign
                    // cancellation error our own .cancel() call (just above) triggers
                    // once a newer session is already active.
                    self.teardownEngine()
                    self.notifyListeners("listeningState", data: ["status": "stopped"])
                    call.reject(error.localizedDescription)
                }
            }
            self.recognitionTask = thisTask

            if !engineAlreadyRunning {
                let inputNode = engine.inputNode
                let format = inputNode.outputFormat(forBus: 0)
                inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                    self?.recognitionRequest?.append(buffer)
                }

                engine.prepare()
                do {
                    try engine.start()
                } catch {
                    call.reject(self.messageUnknown)
                    return
                }
            }

            self.notifyListeners("listeningState", data: ["status": "started"])
            if partialResults {
                call.resolve()
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .default).async { [weak self] in
            guard let self = self else { return }
            let wasRunning = self.audioEngine?.isRunning == true
            self.teardownEngine()
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            if wasRunning {
                self.notifyListeners("listeningState", data: ["status": "stopped"])
            }
            call.resolve()
        }
    }

    @objc func isListening(_ call: CAPPluginCall) {
        call.resolve(["listening": audioEngine?.isRunning ?? false])
    }

    @objc func getSupportedLanguages(_ call: CAPPluginCall) {
        let languages = NSMutableArray()
        for locale in SFSpeechRecognizer.supportedLocales() {
            languages.add(locale.identifier)
        }
        call.resolve(["languages": languages])
    }

    // Legacy alias kept for API parity with the npm plugin.
    @objc func hasPermission(_ call: CAPPluginCall) {
        let granted = SFSpeechRecognizer.authorizationStatus() == .authorized
        call.resolve(["permission": granted])
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        let permission: String
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            permission = "granted"
        case .denied, .restricted:
            permission = "denied"
        case .notDetermined:
            permission = "prompt"
        @unknown default:
            permission = "prompt"
        }
        call.resolve(["speechRecognition": permission])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard let self = self else { return }
                switch status {
                case .authorized:
                    AVAudioSession.sharedInstance().requestRecordPermission { granted in
                        call.resolve(["speechRecognition": granted ? "granted" : "denied"])
                    }
                case .denied, .restricted, .notDetermined:
                    self.checkPermissions(call)
                @unknown default:
                    self.checkPermissions(call)
                }
            }
        }
    }

    private func teardownEngine() {
        recognitionTask?.cancel()
        recognitionRequest?.endAudio()
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest = nil
        recognitionTask = nil
    }
}
