package com.veyrnox.app

import java.io.File
import java.nio.file.Files
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM tests for the OTA trust decisions. The web bundle is the whole wallet, so
 * every branch here that returns "valid" is a code-execution grant.
 * INTERNAL — not device-verified.
 */
class OtaBundleVerifierTest {

    private val decode: (String) -> ByteArray = { Base64.getMimeDecoder().decode(it) }
    private val keys = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    private val otherKeys = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    private val pub = listOf(Base64.getEncoder().encodeToString(keys.public.encoded))

    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }

    private fun sign(bytes: ByteArray, key: java.security.PrivateKey = keys.private): String =
        Base64.getEncoder().encodeToString(Signature.getInstance("SHA256withECDSA").run { initSign(key); update(bytes); sign() })

    private fun bundle(
        version: Long = 202609141230,
        channel: String = "production",
        minNativeApi: Int = OtaConfig.NATIVE_API,
        files: Map<String, String> = mapOf("index.html" to "<html>", "assets/a.js" to "a()"),
        signer: java.security.PrivateKey = keys.private,
    ): Pair<File, OtaManifest> {
        val dir = Files.createTempDirectory("ota").toFile()
        files.forEach { (p, c) -> File(dir, p).apply { parentFile.mkdirs(); writeText(c) } }
        val filesJson = files.entries.joinToString(",") { (p, c) -> "\"$p\":\"${sha(c.toByteArray())}\"" }
        val manifest = """{"v":1,"channel":"$channel","bundleVersion":$version,"minNativeApi":$minNativeApi,"files":{$filesJson}}""".toByteArray()
        File(dir, OtaBundleVerifier.MANIFEST_NAME).writeBytes(manifest)
        File(dir, OtaBundleVerifier.SIGNATURE_NAME).writeText(sign(manifest, signer))
        return dir to OtaBundleVerifier.parseManifest(manifest)!!
    }

    private fun verified(dir: File, version: Long = 202609141230, channel: String = "production", keys: List<String> = pub) =
        OtaBundleVerifier.readVerifiedManifest(dir, version, channel, keys, decode)

    // ── signature / manifest ────────────────────────────────────────────────

    @Test fun `valid bundle verifies`() {
        val (dir, _) = bundle()
        val m = verified(dir)
        assertNotNull(m)
        assertTrue(OtaBundleVerifier.verifyFiles(dir, m!!))
    }

    @Test fun `empty pinned key list disables OTA`() {
        val (dir, _) = bundle()
        assertNull(verified(dir, keys = emptyList()))
        assertNull(verified(dir, keys = listOf("")))
    }

    // One key per hardware token: a YubiKey key cannot be backed up, so either
    // token's signature must be accepted, and a dropped token's must not be.
    @Test fun `a signature from ANY pinned token verifies`() {
        val tokenB = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val pubB = Base64.getEncoder().encodeToString(tokenB.public.encoded)
        val bothPinned = pub + pubB

        val (dirA, _) = bundle()
        assertNotNull(verified(dirA, keys = bothPinned))
        val (dirB, _) = bundle(signer = tokenB.private)
        assertNotNull(verified(dirB, keys = bothPinned))

        // Unpinned signer stays rejected, and dropping a lost token drops its signatures.
        val (dirOther, _) = bundle(signer = otherKeys.private)
        assertNull(verified(dirOther, keys = bothPinned))
        assertNull(verified(dirA, keys = listOf(pubB)))
    }

    @Test fun `signature from another key is rejected`() {
        val (dir, _) = bundle(signer = otherKeys.private)
        assertNull(verified(dir))
    }

    @Test fun `manifest edited after signing is rejected`() {
        val (dir, _) = bundle()
        val f = File(dir, OtaBundleVerifier.MANIFEST_NAME)
        f.writeText(f.readText().replace("202609141230", "202609141231"))
        assertNull(verified(dir, version = 202609141231))
    }

    @Test fun `version, channel and native api must match`() {
        val (dir, _) = bundle()
        assertNull(verified(dir, version = 202609141231))
        assertNull(verified(dir, channel = "staging"))
        val (newer, _) = bundle(minNativeApi = OtaConfig.NATIVE_API + 1)
        assertNull(verified(newer))
    }

    @Test fun `unsafe paths are rejected even when signed`() {
        for (bad in listOf("../evil.js", "/abs.js", "a/../../b.js", "a\\b.js", "./x.js")) {
            val m = """{"v":1,"channel":"production","bundleVersion":1,"minNativeApi":1,"files":{"index.html":"${"0".repeat(64)}","$bad":"${"0".repeat(64)}"}}"""
            assertNull(bad, OtaBundleVerifier.parseManifest(m.toByteArray()))
        }
    }

    // ── files on disk ───────────────────────────────────────────────────────

    @Test fun `modified file fails`() {
        val (dir, m) = bundle()
        File(dir, "assets/a.js").writeText("steal()")
        assertFalse(OtaBundleVerifier.verifyFiles(dir, m))
    }

    @Test fun `missing file fails`() {
        val (dir, m) = bundle()
        File(dir, "assets/a.js").delete()
        assertFalse(OtaBundleVerifier.verifyFiles(dir, m))
    }

    @Test fun `extra file fails`() {
        val (dir, m) = bundle()
        File(dir, "assets/extra.js").writeText("x")
        assertFalse(OtaBundleVerifier.verifyFiles(dir, m))
    }

    // ── launch state machine ────────────────────────────────────────────────

    private val always: (Long) -> Boolean = { true }

    @Test fun `pending boots once and is marked booted`() {
        val (boot, st) = OtaBundleVerifier.resolveLaunch(OtaState(active = 5, pending = 7), embedded = 3, isValid = always)
        assertEquals(7L, boot)
        assertTrue(st.pendingBooted)
    }

    @Test fun `pending that never reported ready rolls back and is floored`() {
        val (boot, st) = OtaBundleVerifier.resolveLaunch(OtaState(active = 5, pending = 7, pendingBooted = true, floor = 5), 3, always)
        assertEquals(5L, boot)
        assertEquals(OtaState(active = 5, floor = 7), st)
        assertFalse(OtaBundleVerifier.canAccept(st, 3, 7))
    }

    @Test fun `invalid pending and invalid active fall back to embedded`() {
        val (boot, st) = OtaBundleVerifier.resolveLaunch(OtaState(active = 5, pending = 7), 3) { false }
        assertEquals(0L, boot)
        assertEquals(0L, st.active)
        assertEquals(0L, st.pending)
    }

    @Test fun `store binary newer than OTA bundles wins`() {
        val (boot, st) = OtaBundleVerifier.resolveLaunch(OtaState(active = 5, pending = 7), embedded = 9, isValid = always)
        assertEquals(0L, boot)
        assertEquals(0L, st.active)
    }

    @Test fun `downgrades and replays are refused`() {
        val st = OtaState(active = 5, floor = 6)
        assertFalse(OtaBundleVerifier.canAccept(st, 3, 5))
        assertFalse(OtaBundleVerifier.canAccept(st, 3, 6))
        assertFalse(OtaBundleVerifier.canAccept(st, 10, 8))
        assertTrue(OtaBundleVerifier.canAccept(st, 3, 7))
    }

    @Test fun `notifyReady promotes only the running pending bundle`() {
        val s = OtaState(active = 5, pending = 7, pendingBooted = true, floor = 5)
        assertEquals(OtaState(active = 7, floor = 7), OtaBundleVerifier.promote(s, running = 7))
        assertEquals(s, OtaBundleVerifier.promote(s, running = 5))
        assertEquals(s, OtaBundleVerifier.promote(s, running = 0))
    }
}
