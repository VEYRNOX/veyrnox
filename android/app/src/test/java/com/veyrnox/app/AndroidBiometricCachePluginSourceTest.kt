package com.veyrnox.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * H1 (issue #2039 follow-up) — the existing AndroidBiometricCacheConfigTest
 * pins REQUIRES_USER_AUTH_UNAUTH = false, but nothing pins that the plugin
 * actually READS that constant at the call-site that mints the unauth
 * Keystore key. A future edit that hardcodes `requiresAuth = true` at
 * ensureUnauthStorageKey's tryGenerateKey(...) call would leave the constant
 * untouched → the config tripwire stays green while the alias is re-gated.
 *
 * This test scans AndroidBiometricCachePlugin.kt source and asserts:
 *   - ensureUnauthStorageKey() reads REQUIRES_USER_AUTH_UNAUTH.
 *   - Its tryGenerateKey(...) calls DO NOT pass `requiresAuth = true` as a
 *     literal.
 *
 * Source-scan (option a) rather than a Robolectric/reflection runtime test
 * because the ACL flag is a compile-time literal in the Builder call; a
 * regex-level pin is precise enough to catch the exact regression class this
 * finding names, and avoids adding Robolectric to a repo that does not use
 * it.
 *
 * INTERNAL — not device-verified, not independently audited.
 */
class AndroidBiometricCachePluginSourceTest {

    private val src: String by lazy {
        val candidates = listOf(
            File("src/main/java/com/veyrnox/app/AndroidBiometricCachePlugin.kt"),
            File("android/app/src/main/java/com/veyrnox/app/AndroidBiometricCachePlugin.kt"),
        )
        val f = candidates.firstOrNull { it.exists() }
            ?: throw IllegalStateException(
                "AndroidBiometricCachePlugin.kt not found. Tried: ${candidates.joinToString()}",
            )
        f.readText()
    }

    // Extract the body of ensureUnauthStorageKey up to the next top-level
    // function declaration at the same indent. Scoping the body matters: the
    // sibling ensureInvalidationKey / ensureStorageKey correctly do pass
    // literal true / false respectively; we only care about the unauth site.
    private val ensureUnauthBody: String by lazy {
        val re = Regex(
            """private fun ensureUnauthStorageKey\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}(?:private )?fun """,
        )
        val m = re.find(src)
            ?: throw IllegalStateException(
                "Could not locate ensureUnauthStorageKey() body in plugin source",
            )
        m.groupValues[1]
    }

    @Test
    fun `H1 ensureUnauthStorageKey reads REQUIRES_USER_AUTH_UNAUTH from config`() {
        assertTrue(
            "ensureUnauthStorageKey() must read AndroidBiometricCacheConfig.REQUIRES_USER_AUTH_UNAUTH " +
                "so the JVM tripwire (AndroidBiometricCacheConfigTest) actually protects the runtime " +
                "KeyGenParameterSpec built here. A refactor that inlines the value defeats the tripwire.",
            ensureUnauthBody.contains("REQUIRES_USER_AUTH_UNAUTH"),
        )
    }

    @Test
    fun `H1 ensureUnauthStorageKey does not pass requiresAuth = true as a literal`() {
        val badLiteral = Regex("""requiresAuth\s*=\s*true\b""")
        assertFalse(
            "ensureUnauthStorageKey() must NOT hardcode `requiresAuth = true` in its " +
                "tryGenerateKey(...) call — that re-opens issue #2037 (double OS prompt on cold " +
                "unlock) and silently defeats the AndroidBiometricCacheConfigTest tripwire, since " +
                "the config const would stay false while the actual KeyGenParameterSpec has the " +
                "user-auth-required flag flipped on. Bind the flag to the config constant instead.",
            badLiteral.containsMatchIn(ensureUnauthBody),
        )
    }
}
