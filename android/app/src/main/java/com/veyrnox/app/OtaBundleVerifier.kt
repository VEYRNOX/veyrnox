package com.veyrnox.app

// OTA web-bundle verification + launch state machine. See docs/ota-updates.md.
//
// The web bundle holds the whole wallet (derivation, signing, RASP gates), so an
// OTA bundle is code execution on every install. This file is the only thing
// standing between the update host and that code:
//   - the manifest must carry a valid ECDSA P-256 signature from the OFFLINE key
//     pinned below (the key is compiled into the store binary, so an OTA bundle
//     cannot replace it);
//   - every file on disk must match the manifest's sha256, with no extra files;
//   - versions only move forward (floor), and a bundle that never reports ready
//     is rolled back and never retried.
// Any failure boots the store-shipped bundle (I4: fail closed).
//
// Pure JVM (no android.* imports) so OtaBundleVerifierTest runs without
// Robolectric; callers inject the base64 decoder, as PlayIntegrityJwsVerifier does.
//
// STATUS: BUILT, INTERNAL — not device-verified, no key provisioned.

import java.io.File
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import org.json.JSONObject

object OtaConfig {
    /** Must equal NATIVE_API in scripts/ota/manifest.mjs and OtaConfig.nativeApi on iOS. */
    const val NATIVE_API = 1

    /**
     * SPKI DER (base64) of every offline P-256 OTA signing key, one per hardware
     * token. A manifest signed by ANY of them is accepted, so losing one token
     * costs nothing: keep signing with the other and drop the lost key in the next
     * store release. A key on a YubiKey cannot be backed up, which is why this is
     * a list — pin one key per token, never copy a key between tokens.
     *
     * EMPTY = OTA DISABLED: no downloaded bundle is ever loaded.
     * Must equal publicKeysSpkiB64 on iOS, in the same order (pinned by a test).
     */
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
    val PUBLIC_KEYS_SPKI_B64: List<String> = emptyList()
    // OTA_PINNED_KEY Token A — YubiKey 5C NFC serial 39744850, PIV slot 9c, on-token 2026-09-18
    // OTA_PINNED_KEY "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEbJRsfXCSdRweSxBeZ7J4SvKY4zlbMgvZHlvOnt6hbo1ml67IZ19HrMyD2DCrN8iNeqhDJtktwty/CX7acvTT1Q=="
    // OTA_PINNED_KEY Token B — YubiKey 5C NFC serial 39744871, PIV slot 9c, on-token 2026-09-18
    // OTA_PINNED_KEY "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEPXtup2m80bcCIC9ocQ198AFnZKhyxr2zu/a7IDKKn14FRq0BtBshJRGfOPpcCSy1FMmLcqIKw44Zi6MGfkczxA=="
}

data class OtaManifest(
    val channel: String,
    val bundleVersion: Long,
    val minNativeApi: Int,
    val files: Map<String, String>,
)

/** Persisted loader state. A version of 0 means "none" (the embedded bundle). */
data class OtaState(
    val active: Long = 0,
    val pending: Long = 0,
    val pendingBooted: Boolean = false,
    val floor: Long = 0,
)

object OtaBundleVerifier {
    const val MANIFEST_NAME = "ota-manifest.json"
    const val SIGNATURE_NAME = "ota-manifest.sig"

    private val SAFE_PATH = Regex("^[A-Za-z0-9._@-]+(/[A-Za-z0-9._@-]+)*$")
    private val SHA256_HEX = Regex("^[0-9a-f]{64}$")

    fun isSafePath(path: String): Boolean =
        SAFE_PATH.matches(path) && path.split('/').none { it == ".." || it == "." }

    /** Structural parse only. Never call on bytes whose signature has not been checked. */
    fun parseManifest(bytes: ByteArray): OtaManifest? = try {
        val o = JSONObject(String(bytes, Charsets.UTF_8))
        val channel = o.getString("channel")
        val version = o.getLong("bundleVersion")
        val filesJson = o.getJSONObject("files")
        val files = LinkedHashMap<String, String>()
        for (key in filesJson.keys()) files[key] = filesJson.getString(key)
        val ok = o.getInt("v") == 1 &&
            (channel == "production" || channel == "staging") &&
            version > 0 &&
            files.containsKey("index.html") &&
            files.all { (p, h) -> isSafePath(p) && SHA256_HEX.matches(h) &&
                p != MANIFEST_NAME && p != SIGNATURE_NAME }
        if (ok) OtaManifest(channel, version, o.getInt("minNativeApi"), files) else null
    } catch (e: Exception) {
        null
    }

    /** True if the signature verifies under ANY pinned key. Empty list = never. */
    fun verifySignature(
        bytes: ByteArray,
        signatureB64: String,
        publicKeysSpkiB64: List<String>,
        b64Decode: (String) -> ByteArray,
    ): Boolean = publicKeysSpkiB64.any { keyB64 ->
        keyB64.isNotEmpty() && try {
            val key = KeyFactory.getInstance("EC")
                .generatePublic(X509EncodedKeySpec(b64Decode(keyB64)))
            Signature.getInstance("SHA256withECDSA").run {
                initVerify(key)
                update(bytes)
                verify(b64Decode(signatureB64.trim()))
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Signature + structure + channel + native compatibility for the manifest in
     * [dir]. Returns the manifest only if all of it holds.
     */
    fun readVerifiedManifest(
        dir: File,
        expectedVersion: Long,
        channel: String,
        publicKeysSpkiB64: List<String>,
        b64Decode: (String) -> ByteArray,
    ): OtaManifest? = try {
        val bytes = File(dir, MANIFEST_NAME).readBytes()
        val sig = File(dir, SIGNATURE_NAME).readText()
        if (!verifySignature(bytes, sig, publicKeysSpkiB64, b64Decode)) {
            null
        } else {
            parseManifest(bytes)?.takeIf {
                it.bundleVersion == expectedVersion &&
                    it.channel == channel &&
                    it.minNativeApi <= OtaConfig.NATIVE_API
            }
        }
    } catch (e: Exception) {
        null
    }

    /** Every manifest file present with a matching sha256, and nothing else in [dir]. */
    fun verifyFiles(dir: File, manifest: OtaManifest): Boolean = try {
        val onDisk = dir.walkTopDown().filter { it.isFile }
            .map { it.relativeTo(dir).invariantSeparatorsPath }
            .filter { it != MANIFEST_NAME && it != SIGNATURE_NAME }
            .toSet()
        onDisk == manifest.files.keys && manifest.files.all { (p, h) -> sha256Hex(File(dir, p)) == h }
    } catch (e: Exception) {
        false
    }

    fun sha256Hex(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    // ── Launch state machine ────────────────────────────────────────────────

    /**
     * Decide which bundle to boot. Returns the version to boot (0 = embedded) and
     * the state to persist BEFORE the WebView loads, so a crash during boot is
     * already recorded.
     */
    fun resolveLaunch(s: OtaState, embedded: Long, isValid: (Long) -> Boolean): Pair<Long, OtaState> {
        var st = s
        if (st.pending != 0L) {
            // Booted once already without notifyReady, superseded by the store
            // binary, or fails verification: discard and never accept it again.
            if (st.pendingBooted || st.pending <= embedded || !isValid(st.pending)) {
                st = st.copy(floor = maxOf(st.floor, st.pending), pending = 0, pendingBooted = false)
            } else {
                return st.pending to st.copy(pendingBooted = true)
            }
        }
        if (st.active != 0L && (st.active <= embedded || !isValid(st.active))) {
            st = st.copy(active = 0)
        }
        return st.active to st
    }

    /** A new download is only allowed if it is newer than anything seen. */
    fun canAccept(s: OtaState, embedded: Long, version: Long): Boolean =
        version > maxOf(s.floor, s.active, s.pending, embedded)

    /** Called when the running bundle reports ready. */
    fun promote(s: OtaState, running: Long): OtaState =
        if (running != 0L && running == s.pending) {
            OtaState(active = s.pending, floor = maxOf(s.floor, s.pending))
        } else {
            s
        }
}
