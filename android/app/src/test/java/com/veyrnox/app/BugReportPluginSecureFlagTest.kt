package com.veyrnox.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The disabled bug-report recorder must not leave a native path that can clear
 * FLAG_SECURE. This is a source-level regression guard; device behavior remains
 * covered by the native test program.
 */
class BugReportPluginSecureFlagTest {

    private fun source(path: String): String {
        val file = File(path)
        assertTrue("source not found at ${file.absolutePath}", file.exists())
        return file.readText()
    }

    @Test
    fun `disabled recorder plugin is absent`() {
        val plugin = File("src/main/java/com/veyrnox/app/BugReportPlugin.kt")
        assertFalse("disabled recorder plugin must not be shipped", plugin.exists())
    }

    @Test
    fun `main activity applies FLAG_SECURE`() {
        val activity = source("src/main/java/com/veyrnox/app/MainActivity.java")
        assertTrue("MainActivity must retain screenshot protection", activity.contains("WindowManager.LayoutParams.FLAG_SECURE"))
    }
}
