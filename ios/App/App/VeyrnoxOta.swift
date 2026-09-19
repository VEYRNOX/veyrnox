// VeyrnoxOta.swift — native half of OTA web-bundle updates. See docs/ota-updates.md.
//
// The web bundle holds the whole wallet (derivation, signing, RASP gates), so an
// OTA bundle is code execution on every install. Every trust decision is made
// here; the JS half (src/lib/otaUpdate.js) only moves bytes:
//   - the manifest must carry a valid ECDSA P-256 signature from the OFFLINE key
//     pinned in OtaConfig (compiled into the store binary, so no OTA bundle can
//     replace it);
//   - every file on disk must match the manifest's sha256, with no extra files;
//   - versions only move forward, and a bundle that never reports ready is
//     rolled back and never retried.
// Any failure boots the store-shipped bundle (I4: fail closed).
//
// Mirrors android/.../OtaBundleVerifier.kt + OtaUpdatePlugin.kt line for line;
// the state machine's tests live on the Kotlin side (OtaBundleVerifierTest).
//
// STATUS: BUILT, INTERNAL — not device-verified, no key provisioned.

import Capacitor
import CryptoKit
import Foundation

enum OtaConfig {
    /// Must equal NATIVE_API in scripts/ota/manifest.mjs and OtaConfig.NATIVE_API on Android.
    static let nativeApi = 1
    /// SPKI DER (base64) of every offline P-256 OTA signing key, one per hardware
    /// token. A manifest signed by ANY of them is accepted, so losing one token
    /// costs nothing: keep signing with the other and drop the lost key in the next
    /// store release. A key on a YubiKey cannot be backed up, which is why this is
    /// a list — pin one key per token, never copy a key between tokens.
    ///
    /// EMPTY = OTA DISABLED: no downloaded bundle is ever loaded.
    /// Must equal PUBLIC_KEYS_SPKI_B64 on Android, in the same order (pinned by a test).
    // DISARMED for the 1.0.2 release (2026-09-19, owner decision). An empty list
    // disables OTA completely (I4) -- see docs/ota-updates.md.
    //
    // The keys below are the real pinned values, kept here and not only in git
    // history so re-arming is an uncomment rather than an archaeology exercise.
    // A test pins the commented pair on both platforms so iOS and Android cannot
    // drift apart while disarmed -- emptying both lists would otherwise make the
    // parity check pass vacuously.
    //
    // DO NOT UNCOMMENT WITHOUT the two prerequisites docs/ota-updates.md states:
    //   1. owner sign-off against I3's "zero backend calls" wording
    //   2. a privacy-policy disclosure of the cold-start update check
    // Both were unmet when the keys were provisioned on 2026-09-18. The check
    // fetches updates.veyrnox.com on every cold start whether or not anything is
    // published, so an empty bucket is not a mitigation for either.
    static let publicKeysSpkiB64: [String] = []
    // OTA_PINNED_KEY Token A — YubiKey 5C NFC serial 39744850, PIV slot 9c, on-token 2026-09-18
    // OTA_PINNED_KEY "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEbJRsfXCSdRweSxBeZ7J4SvKY4zlbMgvZHlvOnt6hbo1ml67IZ19HrMyD2DCrN8iNeqhDJtktwty/CX7acvTT1Q=="
    // OTA_PINNED_KEY Token B — YubiKey 5C NFC serial 39744871, PIV slot 9c, on-token 2026-09-18
    // OTA_PINNED_KEY "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEPXtup2m80bcCIC9ocQ198AFnZKhyxr2zu/a7IDKKn14FRq0BtBshJRGfOPpcCSy1FMmLcqIKw44Zi6MGfkczxA=="
}

struct OtaManifest {
    let channel: String
    let bundleVersion: Int64
    let minNativeApi: Int
    let files: [String: String]
}

struct OtaState: Equatable {
    var active: Int64 = 0
    var pending: Int64 = 0
    var pendingBooted = false
    var floor: Int64 = 0
}

enum OtaVerifier {
    static let manifestName = "ota-manifest.json"
    static let signatureName = "ota-manifest.sig"
    private static let pathChars = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._@-")
    private static let hexChars = CharacterSet(charactersIn: "0123456789abcdef")

    static func isSafePath(_ path: String) -> Bool {
        let segments = path.split(separator: "/", omittingEmptySubsequences: false)
        return !path.isEmpty && segments.allSatisfy { seg in
            !seg.isEmpty && seg != "." && seg != ".." &&
                seg.unicodeScalars.allSatisfy { pathChars.contains($0) }
        }
    }

    /// Structural parse only. Never call on bytes whose signature has not been checked.
    static func parseManifest(_ data: Data) -> OtaManifest? {
        guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (o["v"] as? NSNumber)?.intValue == 1,
              let channel = o["channel"] as? String, channel == "production" || channel == "staging",
              let version = (o["bundleVersion"] as? NSNumber)?.int64Value, version > 0,
              let minApi = (o["minNativeApi"] as? NSNumber)?.intValue,
              let files = o["files"] as? [String: String], files["index.html"] != nil,
              files.allSatisfy({ path, hash in
                  isSafePath(path) && path != manifestName && path != signatureName &&
                      hash.count == 64 && hash.unicodeScalars.allSatisfy { hexChars.contains($0) }
              })
        else { return nil }
        return OtaManifest(channel: channel, bundleVersion: version, minNativeApi: minApi, files: files)
    }

    /// True if the signature verifies under ANY pinned key. Empty list = never.
    static func verifySignature(_ data: Data, signatureB64: String, publicKeysSpkiB64: [String]) -> Bool {
        guard let sigDer = Data(base64Encoded: signatureB64.trimmingCharacters(in: .whitespacesAndNewlines),
                                options: .ignoreUnknownCharacters),
              let sig = try? P256.Signing.ECDSASignature(derRepresentation: sigDer)
        else { return false }
        return publicKeysSpkiB64.contains { keyB64 in
            guard !keyB64.isEmpty,
                  let keyDer = Data(base64Encoded: keyB64),
                  let key = try? P256.Signing.PublicKey(derRepresentation: keyDer)
            else { return false }
            return key.isValidSignature(sig, for: data)
        }
    }

    static func readVerifiedManifest(dir: URL, expectedVersion: Int64, channel: String) -> OtaManifest? {
        guard let data = try? Data(contentsOf: dir.appendingPathComponent(manifestName)),
              let sig = try? String(contentsOf: dir.appendingPathComponent(signatureName), encoding: .utf8),
              verifySignature(data, signatureB64: sig, publicKeysSpkiB64: OtaConfig.publicKeysSpkiB64),
              let m = parseManifest(data),
              m.bundleVersion == expectedVersion, m.channel == channel, m.minNativeApi <= OtaConfig.nativeApi
        else { return nil }
        return m
    }

    /// Every manifest file present with a matching sha256, and nothing else in `dir`.
    static func verifyFiles(dir: URL, manifest: OtaManifest) -> Bool {
        let base = dir.resolvingSymlinksInPath().path + "/"
        let keys: [URLResourceKey] = [.isRegularFileKey, .isDirectoryKey]
        guard let walker = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: keys)
        else { return false }
        var onDisk = Set<String>()
        for case let url as URL in walker {
            guard let v = try? url.resourceValues(forKeys: Set(keys)) else { return false }
            if v.isDirectory == true { continue }
            // Symlinks and other special entries are never part of a bundle.
            guard v.isRegularFile == true else { return false }
            let full = url.resolvingSymlinksInPath().path
            guard full.hasPrefix(base) else { return false }
            let rel = String(full.dropFirst(base.count))
            if rel != manifestName && rel != signatureName { onDisk.insert(rel) }
        }
        guard onDisk == Set(manifest.files.keys) else { return false }
        return manifest.files.allSatisfy { path, hash in sha256Hex(dir.appendingPathComponent(path)) == hash }
    }

    static func sha256Hex(_ url: URL) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
            let chunk = handle.readData(ofLength: 64 * 1024)
            if chunk.isEmpty { break }
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    // MARK: launch state machine (tests: OtaBundleVerifierTest.kt)

    static func resolveLaunch(_ s: OtaState, embedded: Int64, isValid: (Int64) -> Bool) -> (Int64, OtaState) {
        var st = s
        if st.pending != 0 {
            if st.pendingBooted || st.pending <= embedded || !isValid(st.pending) {
                st.floor = max(st.floor, st.pending)
                st.pending = 0
                st.pendingBooted = false
            } else {
                st.pendingBooted = true
                return (st.pending, st)
            }
        }
        if st.active != 0 && (st.active <= embedded || !isValid(st.active)) { st.active = 0 }
        return (st.active, st)
    }

    static func canAccept(_ s: OtaState, embedded: Int64, version: Int64) -> Bool {
        version > max(s.floor, s.active, s.pending, embedded)
    }

    static func promote(_ s: OtaState, running: Int64) -> OtaState {
        guard running != 0, running == s.pending else { return s }
        return OtaState(active: s.pending, pending: 0, pendingBooted: false, floor: max(s.floor, s.pending))
    }
}

enum OtaStore {
    static let lock = NSLock()
    /// Bundle version the WebView was booted with this process (0 = embedded).
    static var running: Int64 = 0
    private static let defaults = UserDefaults.standard

    /// Must equal OTA_ROOT on Android: JS writes here via Filesystem Directory.LIBRARY (= Library).
    static let rootName = "VeyrnoxOTA"
    private static var resolved = false
    private static var resolvedDir: URL?

    static var root: URL {
        FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent(rootName, isDirectory: true)
    }

    static func dir(_ v: Int64) -> URL { root.appendingPathComponent(String(v), isDirectory: true) }

    static func load() -> OtaState {
        OtaState(active: (defaults.object(forKey: "veyrnoxOta.active") as? NSNumber)?.int64Value ?? 0,
                 pending: (defaults.object(forKey: "veyrnoxOta.pending") as? NSNumber)?.int64Value ?? 0,
                 pendingBooted: defaults.bool(forKey: "veyrnoxOta.pendingBooted"),
                 floor: (defaults.object(forKey: "veyrnoxOta.floor") as? NSNumber)?.int64Value ?? 0)
    }

    static func save(_ s: OtaState) {
        defaults.set(NSNumber(value: s.active), forKey: "veyrnoxOta.active")
        defaults.set(NSNumber(value: s.pending), forKey: "veyrnoxOta.pending")
        defaults.set(s.pendingBooted, forKey: "veyrnoxOta.pendingBooted")
        defaults.set(NSNumber(value: s.floor), forKey: "veyrnoxOta.floor")
        // Must be on disk before a pending bundle boots, or a crash would not count as a failed boot.
        defaults.synchronize()
    }

    static var embeddedDir: URL? { Bundle.main.resourceURL?.appendingPathComponent("public", isDirectory: true) }

    /// Manifest shipped inside the app binary. Nil disables OTA.
    static func embedded() -> OtaManifest? {
        guard let url = embeddedDir?.appendingPathComponent(OtaVerifier.manifestName),
              let data = try? Data(contentsOf: url) else { return nil }
        return OtaVerifier.parseManifest(data)
    }

    static var enabled: Bool { !OtaConfig.publicKeysSpkiB64.isEmpty && embedded() != nil }

    static func isValid(_ v: Int64, channel: String) -> Bool {
        guard let m = OtaVerifier.readVerifiedManifest(dir: dir(v), expectedVersion: v, channel: channel) else { return false }
        return OtaVerifier.verifyFiles(dir: dir(v), manifest: m)
    }

    /// Directory to serve the web app from, or nil for the embedded bundle.
    static func resolveLaunchDir() -> URL? {
        lock.lock(); defer { lock.unlock() }
        // Once per process, as on Android: re-resolving would count a healthy boot
        // as failed, or swap in a bundle staged this session mid-session.
        if resolved { return resolvedDir }
        resolved = true
        guard !OtaConfig.publicKeysSpkiB64.isEmpty, let emb = embedded() else {
            try? FileManager.default.removeItem(at: root)
            running = 0
            return nil
        }
        let (boot, st) = OtaVerifier.resolveLaunch(load(), embedded: emb.bundleVersion) { isValid($0, channel: emb.channel) }
        save(st)
        let keep: Set<String> = [String(st.active), String(st.pending)]
        for url in (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        where !keep.contains(url.lastPathComponent) {
            try? FileManager.default.removeItem(at: url)
        }
        running = boot
        resolvedDir = boot == 0 ? nil : dir(boot)
        return resolvedDir
    }
}

/// Storyboard root view controller. Swaps the web-asset location for a verified
/// OTA bundle before Capacitor builds the WebView.
class VeyrnoxBridgeViewController: CAPBridgeViewController {
    override func instanceDescriptor() -> InstanceDescriptor {
        // Capacitor's built-in persisted server path is loaded with NO verification,
        // so any script that reaches the WebView plugin could persist code across
        // restarts. We never use it. Clear it BEFORE super reads it.
        KeyValueStore.standard["serverBasePath"] = nil as String?
        let descriptor = super.instanceDescriptor()
        if let dir = OtaStore.resolveLaunchDir() {
            descriptor.appLocation = dir
        }
        return descriptor
    }
}

@objc(VeyrnoxOtaPlugin)
public class VeyrnoxOtaPlugin: CAPPlugin {
    private func version(_ call: CAPPluginCall) -> Int64? {
        guard let n = call.options["version"] as? NSNumber, n.int64Value > 0 else { return nil }
        return n.int64Value
    }

    @objc func status(_ call: CAPPluginCall) {
        let emb = OtaStore.embedded()
        OtaStore.lock.lock(); let st = OtaStore.load(); OtaStore.lock.unlock()
        let embVersion = emb?.bundleVersion ?? 0
        call.resolve([
            "enabled": !OtaConfig.publicKeysSpkiB64.isEmpty && emb != nil,
            "channel": emb?.channel ?? "",
            "nativeApi": OtaConfig.nativeApi,
            "runningVersion": NSNumber(value: OtaStore.running != 0 ? OtaStore.running : embVersion),
            "newestKnownVersion": NSNumber(value: max(st.floor, st.active, st.pending, embVersion)),
        ])
    }

    /// Create an empty staging directory for `version`.
    @objc func begin(_ call: CAPPluginCall) {
        guard let v = version(call) else { return call.reject("OTA_BAD_ARGS") }
        guard OtaStore.enabled, let emb = OtaStore.embedded() else { return call.reject("OTA_DISABLED") }
        OtaStore.lock.lock(); defer { OtaStore.lock.unlock() }
        guard OtaVerifier.canAccept(OtaStore.load(), embedded: emb.bundleVersion, version: v) else {
            return call.reject("OTA_NOT_NEWER")
        }
        let dir = OtaStore.dir(v)
        try? FileManager.default.removeItem(at: dir)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            var root = OtaStore.root
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? root.setResourceValues(values)
        } catch {
            return call.reject("OTA_IO")
        }
        call.resolve(["path": "\(OtaStore.rootName)/\(v)"])
    }

    /// Verify the downloaded manifest signature, pre-fill files we already hold
    /// (same sha256) from the embedded or active bundle, return what is missing.
    @objc func prepare(_ call: CAPPluginCall) {
        guard let v = version(call) else { return call.reject("OTA_BAD_ARGS") }
        guard let emb = OtaStore.embedded(), let embDir = OtaStore.embeddedDir else { return call.reject("OTA_DISABLED") }
        let dir = OtaStore.dir(v)
        guard let m = OtaVerifier.readVerifiedManifest(dir: dir, expectedVersion: v, channel: emb.channel) else {
            return call.reject("OTA_BAD_SIGNATURE")
        }
        OtaStore.lock.lock(); let st = OtaStore.load(); OtaStore.lock.unlock()
        var sources: [String: URL] = [:]
        for (path, hash) in emb.files { sources[hash] = embDir.appendingPathComponent(path) }
        if st.active != 0,
           let data = try? Data(contentsOf: OtaStore.dir(st.active).appendingPathComponent(OtaVerifier.manifestName)),
           let active = OtaVerifier.parseManifest(data) {
            for (path, hash) in active.files { sources[hash] = OtaStore.dir(st.active).appendingPathComponent(path) }
        }
        var missing: [String] = []
        let fm = FileManager.default
        for (path, hash) in m.files {
            let dest = dir.appendingPathComponent(path)
            if let src = sources[hash] {
                do {
                    try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try? fm.removeItem(at: dest)
                    try fm.copyItem(at: src, to: dest)
                    continue
                } catch {}
            }
            missing.append(path)
        }
        call.resolve(["missing": missing])
    }

    /// Full verification of the staging dir; on success it boots on next cold start.
    @objc func stage(_ call: CAPPluginCall) {
        guard let v = version(call) else { return call.reject("OTA_BAD_ARGS") }
        guard let emb = OtaStore.embedded() else { return call.reject("OTA_DISABLED") }
        guard OtaStore.isValid(v, channel: emb.channel) else { return call.reject("OTA_VERIFY_FAILED") }
        OtaStore.lock.lock(); defer { OtaStore.lock.unlock() }
        var st = OtaStore.load()
        guard OtaVerifier.canAccept(st, embedded: emb.bundleVersion, version: v) else { return call.reject("OTA_NOT_NEWER") }
        if st.pending != 0 && st.pending != OtaStore.running { try? FileManager.default.removeItem(at: OtaStore.dir(st.pending)) }
        st.pending = v
        st.pendingBooted = false
        OtaStore.save(st)
        call.resolve()
    }

    /// The running bundle rendered. Promotes a pending bundle to active.
    @objc func notifyReady(_ call: CAPPluginCall) {
        OtaStore.lock.lock()
        OtaStore.save(OtaVerifier.promote(OtaStore.load(), running: OtaStore.running))
        OtaStore.lock.unlock()
        call.resolve()
    }
}
