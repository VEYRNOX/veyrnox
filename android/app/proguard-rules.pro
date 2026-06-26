# Veyrnox ProGuard rules — required for Capacitor + native plugins to survive minification.
#
# M16 audit fix: minifyEnabled was false, leaving wallet logic readable in the APK.
# These rules keep the Capacitor bridge and registered plugins while allowing R8 to
# shrink and obfuscate everything else.

# ── Capacitor core bridge ─────────────────────────────────────────────────────
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.annotation.PluginMethod class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PluginMethod public *;
}

# ── Veyrnox native plugins ────────────────────────────────────────────────────
-keep class com.veyrnox.app.** { *; }

# ── AndroidX / Biometric (used by HardwareKekPlugin) ─────────────────────────
-keep class androidx.biometric.** { *; }

# ── Kotlin reflection used by Capacitor plugin dispatch ──────────────────────
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# ── Coroutines (Kotlin) ───────────────────────────────────────────────────────
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# ── Debugging: preserve line numbers in stack traces ─────────────────────────
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
