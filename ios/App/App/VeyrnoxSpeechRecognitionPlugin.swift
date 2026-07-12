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

    @objc func start(_ call: CAPPluginCall) {
        if let engine = audioEngine, engine.isRunning {
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

            if self.recognitionTask != nil {
                self.recognitionTask?.cancel()
                self.recognitionTask = nil
            }

            self.audioEngine = AVAudioEngine()
            self.speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: language))

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

            self.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            self.recognitionRequest?.shouldReportPartialResults = partialResults

            guard let engine = self.audioEngine, let request = self.recognitionRequest else {
                call.reject(self.messageUnknown)
                return
            }

            let inputNode = engine.inputNode
            let format = inputNode.outputFormat(forBus: 0)

            self.recognitionTask = self.speechRecognizer?.recognitionTask(with: request) { [weak self] result, error in
                guard let self = self else { return }
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
                    } else {
                        call.resolve(["matches": matches])
                    }

                    if result.isFinal {
                        self.teardownEngine()
                        self.notifyListeners("listeningState", data: ["status": "stopped"])
                    }
                }

                if let error = error {
                    self.teardownEngine()
                    self.notifyListeners("listeningState", data: ["status": "stopped"])
                    call.reject(error.localizedDescription)
                }
            }

            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                self?.recognitionRequest?.append(buffer)
            }

            engine.prepare()
            do {
                try engine.start()
                self.notifyListeners("listeningState", data: ["status": "started"])
                if partialResults {
                    call.resolve()
                }
            } catch {
                call.reject(self.messageUnknown)
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .default).async { [weak self] in
            guard let self = self else { return }
            if let engine = self.audioEngine, engine.isRunning {
                engine.stop()
                self.recognitionRequest?.endAudio()
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
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest = nil
        recognitionTask = nil
    }
}
