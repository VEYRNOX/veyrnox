# Veyrnox ProGuard rules — required for Capacitor + native plugins to survive minification.
#
# M16 audit fix: minifyEnabled was false, leaving wallet logic readable in the APK.
# These rules keep the Capacitor bridge and registered plugins while allowing R8 to
# shrink and obfuscate everything else.

# ── Capacitor core bridge ─────────────────────────────────────────────────────
-keep class com.getcapacitor.** { *; }
# Keep class names for @CapacitorPlugin classes so Capacitor's annotation
# processor (compile-time) and runtime class lookup can find them. Drop the
# `{ *; }` that was previously here — that form kept ALL members (including
# private detection methods like detectRoot/checkGadgetThreads) readable in
# the binary. Now R8 is free to rename private/internal members; the
# @PluginMethod keepclassmembers below handles bridge-callable methods, and
# the keepclassmembers below keeps the no-arg constructor for reflection-based
# plugin instantiation.
-keep @com.getcapacitor.annotation.CapacitorPlugin class *
-keepclassmembers @com.getcapacitor.annotation.CapacitorPlugin class * extends com.getcapacitor.Plugin {
    public <init>();
}
-keep @com.getcapacitor.annotation.PluginMethod class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PluginMethod public *;
}

# ── Veyrnox native plugins ────────────────────────────────────────────────────
# Narrowed from `-keep class com.veyrnox.app.** { *; }` (which kept ALL members,
# including private, of every Veyrnox class — reducing R8's ability to obfuscate
# internal details). The annotation-driven rules above (`@CapacitorPlugin` +
# `@PluginMethod public *`) already cover Capacitor plugin dispatch. This rule
# additionally preserves the class *names* so Capacitor's `registerPlugin` call
# (which references them by name) can still resolve them, while allowing R8 to
# obfuscate private fields and internal helpers.
-keepnames class com.veyrnox.app.**
-keepclassmembers class com.veyrnox.app.** {
    public *;
}

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

# G1a — repackage non-kept classes to the root namespace (harder to navigate in jadx)
-repackageclasses ''
# G1a — allow R8 to widen access modifiers for inlining; kept classes are unaffected
-allowaccessmodification

# ── Debugging: preserve line numbers in stack traces ─────────────────────────
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
