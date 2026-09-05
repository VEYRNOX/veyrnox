package com.veyrnox.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * FLAG_SECURE cannot be cleared on demand, and cannot stay cleared.
 *
 * Slice 2b exposed `setSecureFlag(enabled)` as an unconditional Capacitor
 * bridge method. `registerPlugin(BugReportPlugin.class)` is unconditional too,
 * so on every shipped Android build — including ones where
 * VITE_BUG_REPORT_ENABLED is off — any JS in the webview could clear the
 * window's screenshot protection. Nothing restored it: MainActivity.onCreate
 * was the only other writer and there is no re-apply, so a crash between the
 * clear and the terminal state left the wallet capturable until the process
 * restarted. Rated a REGRESSION by the 2026-09-05 security diff (third run).
 *
 * The JS chokepoint in captureBridge was correct and well tested throughout.
 * That is the point: a correct chokepoint is not the control when the
 * capability behind it is independently reachable — K-2 and lib/consent.js
 * reached the same conclusion before this did.
 *
 * SOURCE SCAN, and labelled as one. BugReportPlugin needs an Activity and a
 * Window, so the real behaviour cannot run in a JVM unit test without adding
 * Robolectric to a repo that does not use it. This pins the STRUCTURE of the
 * guard, exactly as AndroidBiometricCachePluginSourceTest does for the
 * Keystore ACL flag. It catches the guard being deleted or bypassed; it does
 * NOT prove FLAG_SECURE behaves correctly on a device — the M13 device
 * verification (Samsung Note 20, 2026-07-14) predates this change and does not
 * cover it.
 *
 * INTERNAL — not device-verified, not independently audited.
 */
class BugReportPluginSecureFlagTest {

    private fun source(): String {
        val f = File("src/main/java/com/veyrnox/app/BugReportPlugin.kt")
        assertTrue("BugReportPlugin.kt not found at ${f.absolutePath}", f.exists())
        val text = f.readText()
        // Guards a vacuous pass: an empty or truncated read would satisfy every
        // `assertFalse(contains(...))` below while proving nothing.
        assertTrue("source implausibly short", text.length > 2000)
        return text
    }

    /** Source with `//` line comments removed. */
    private fun code(): String =
        source().lines().joinToString("\n") { it.replace(Regex("//.*$"), "") }

    @Test
    fun `clearing the flag is gated on an authorisation check`() {
        // The regression: `if (enabled) setFlags else clearFlags` with nothing
        // in front of it. Mutation defence — delete the guard and this reds.
        val src = code()
        assertTrue(
            "setSecureFlag must refuse an unauthorised clear",
            src.contains("!enabled && !clearIsAuthorised()")
        )
        assertTrue(
            "the refusal must reject the call, not fall through",
            Regex("""!clearIsAuthorised\(\)[\s\S]{0,200}?call\.reject""").containsMatchIn(src)
        )
    }

    @Test
    fun `authorisation requires a capture grant or a live recording`() {
        val src = code()
        val fn = Regex("""private fun clearIsAuthorised\(\)[\s\S]*?\n    \}""")
            .find(src)?.value
        assertTrue("clearIsAuthorised() not found", fn != null)
        // A live projection, or a grant that is both present and fresh.
        assertTrue("must allow a live recording", fn!!.contains("projection != null"))
        assertTrue("must require a recorded grant", fn.contains("captureGrantedAtMs"))
        assertTrue("must bound the grant's age", fn.contains("GRANT_VALIDITY_MS"))
        assertTrue("an absent grant must not authorise", fn.contains("== 0L"))
    }

    @Test
    fun `the grant is recorded only after a real OS approval`() {
        val src = code()
        // captureGrantedAtMs must be set in the ActivityResult handler, AFTER
        // its RESULT_OK early-return — not in requestPermission(), where a
        // cancelled dialog would still authorise a clear.
        val handler = Regex("""private fun handlePermissionResult\([\s\S]*?\n    \}""")
            .find(src)?.value
        assertTrue("handlePermissionResult not found", handler != null)
        assertTrue("grant not recorded on approval", handler!!.contains("captureGrantedAtMs ="))

        val request = Regex("""fun requestPermission\([\s\S]*?\n    \}""").find(src)?.value
        assertTrue("requestPermission not found", request != null)
        assertFalse(
            "requestPermission must not authorise a clear on its own",
            request!!.contains("captureGrantedAtMs =")
        )
    }

    @Test
    fun `the flag self-heals on pause, resume and destroy`() {
        // The half that needs no attacker: a crashed or abandoned capture must
        // not leave the window exposed. Pause matters most — it is when the
        // recents thumbnail is taken.
        val src = code()
        for (hook in listOf("handleOnPause", "handleOnResume")) {
            val fn = Regex("""override fun $hook\(\)[\s\S]*?\n    \}""").find(src)?.value
            assertTrue("$hook not overridden", fn != null)
            assertTrue("$hook must heal the flag", fn!!.contains("healSecureFlag()"))
        }
        val destroy = Regex("""override fun handleOnDestroy\(\)[\s\S]*?\n    \}""")
            .find(src)?.value
        assertTrue("handleOnDestroy not overridden", destroy != null)
        assertTrue("destroy must restore", destroy!!.contains("applySecureFlag(true)"))
    }

    @Test
    fun `healing does not black out a recording in progress`() {
        // A restore during a live capture would turn the recording black, which
        // is how a well-meaning fix gets reverted. The guard is as important as
        // the healing itself.
        val src = code()
        val fn = Regex("""private fun healSecureFlag\(\)[\s\S]*?\n    \}""").find(src)?.value
        assertTrue("healSecureFlag not found", fn != null)
        assertTrue("must skip while recording", fn!!.contains("projection != null"))
        assertTrue("must no-op when nothing was cleared", fn.contains("!secureFlagCleared"))
    }

    @Test
    fun `the window flag has a single writer`() {
        // Two writers is how secureFlagCleared drifts out of sync with the real
        // window state, which would silently disable the healing above.
        val src = code()
        val setters = Regex("""window\.setFlags\(""").findAll(src).count()
        val clearers = Regex("""window\.clearFlags\(""").findAll(src).count()
        assertTrue("expected exactly one window.setFlags call, found $setters", setters == 1)
        assertTrue("expected exactly one window.clearFlags call, found $clearers", clearers == 1)
        val applier = Regex("""private fun applySecureFlag\([\s\S]*?\n    \}""").find(src)?.value
        assertTrue("applySecureFlag not found", applier != null)
        assertTrue("setFlags must live in applySecureFlag", applier!!.contains("window.setFlags("))
        assertTrue("clearFlags must live in applySecureFlag", applier.contains("window.clearFlags("))
    }
}
